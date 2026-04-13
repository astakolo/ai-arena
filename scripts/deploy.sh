#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Ai-Arena — Hardened Ubuntu VPS Deployment Script
# Platform: Next.js + Socket.io + SQLite
#
# Sections:
#   1.  Pre-flight checks
#   2.  System hardening & package installation
#   3.  SSH hardening
#   4.  Firewall (UFW)
#   5.  Fail2ban
#   6.  Kernel hardening (sysctl)
#   7.  Nginx reverse proxy
#   8.  SSL/TLS (Let's Encrypt)
#   9.  Ai-Arena application deployment
#  10.  Log rotation
#  11.  Final summary
#
# Usage:
#   chmod +x deploy.sh
#   sudo ./deploy.sh [domain]
#
# Optional arguments:
#   domain    — Your domain for Let's Encrypt SSL (e.g. arena.example.com)
#
# Example:
#   sudo ./deploy.sh arena.yourdomain.com
#
# Idempotent: Safe to run multiple times.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────────────
DOMAIN="${1:-}"
APP_NAME="ai-arena"
APP_DIR="/opt/${APP_NAME}"
REPO_URL="https://github.com/astakolo/ai-arena.git"
BRANCH="main"
NODE_VERSION="20"
PM2_PROCESS_NAME="${APP_NAME}"
APP_PORT="3000"
SSH_KEY_FILE=""                               # Set to path of public key to install
INFO_FILE="/root/arena-deploy-info.txt"
LOG_DIR="/var/log/${APP_NAME}"

# ─── Color helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "  ${BLUE}[INFO]${NC}  $1"; }
log_ok()      { echo -e "  ${GREEN}[ OK ]${NC}  $1"; }
log_warn()    { echo -e "  ${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "  ${RED}[FAIL]${NC}  $1"; }

log_section() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  ${BOLD}$1${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

log_step() {
    echo -e "\n  ${CYAN}--- $1 ---${NC}\n"
}

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1: PRE-FLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 1/11: PRE-FLIGHT CHECKS"

# Check root
if [[ "$(id -u)" -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)."
    exit 1
fi
log_ok "Running as root"

# Check Ubuntu
if [[ ! -f /etc/os-release ]]; then
    log_error "Cannot detect OS. /etc/os-release not found."
    exit 1
fi

. /etc/os-release
OS_ID="${ID:-unknown}"
OS_VERSION="${VERSION_ID:-unknown}"

if [[ "$OS_ID" != "ubuntu" ]]; then
    log_error "This script is designed for Ubuntu. Detected: $OS_ID"
    log_error "Continuing is NOT recommended. Aborting."
    exit 1
fi

# Validate Ubuntu version
case "$OS_VERSION" in
    20.04|22.04|24.04)
        log_ok "Ubuntu ${OS_VERSION} detected (supported)"
        ;;
    *)
        log_warn "Ubuntu ${OS_VERSION} detected (not officially tested; proceeding anyway)"
        ;;
esac

# Check RAM (minimum 1 GB)
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
if [[ "$TOTAL_RAM_MB" -lt 1024 ]]; then
    log_warn "Only ${TOTAL_RAM_MB} MB RAM detected. Minimum recommended: 1024 MB."
    log_warn "The application may run slowly or fail under load."
else
    log_ok "RAM: ${TOTAL_RAM_MB} MB"
fi

# Check disk space (minimum 5 GB free on /)
FREE_DISK_KB=$(df --output=avail / | tail -1 | tr -d ' ')
FREE_DISK_GB=$((FREE_DISK_KB / 1024 / 1024))
if [[ "$FREE_DISK_GB" -lt 5 ]]; then
    log_error "Only ${FREE_DISK_GB} GB free disk space. Minimum required: 5 GB."
    exit 1
fi
log_ok "Free disk space: ${FREE_DISK_GB} GB"

# Check architecture
ARCH=$(uname -m)
if [[ "$ARCH" != "x86_64" && "$ARCH" != "aarch64" ]]; then
    log_warn "Architecture ${ARCH} may not be supported by all packages."
else
    log_ok "Architecture: ${ARCH}"
fi

log_ok "All pre-flight checks passed"

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2: SYSTEM HARDENING & PACKAGE INSTALLATION
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 2/11: SYSTEM HARDENING & PACKAGE INSTALLATION"

# ── 2a: Update all packages ──────────────────────────────────────────────
log_step "2a: Updating all system packages"
log_info "Running apt-get update..."
apt-get update -qq

log_info "Running apt-get upgrade..."
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq > /dev/null 2>&1
log_ok "All packages updated to latest versions"

# ── 2b: Set hostname ────────────────────────────────────────────────────
log_step "2b: Setting hostname"
DESIRED_HOSTNAME="arena-server"
CURRENT_HOSTNAME=$(hostname)
if [[ "$CURRENT_HOSTNAME" != "$DESIRED_HOSTNAME" ]]; then
    log_info "Setting hostname to ${DESIRED_HOSTNAME}..."
    hostnamectl set-hostname "$DESIRED_HOSTNAME"
    # Ensure /etc/hosts has the hostname
    if ! grep -q "$DESIRED_HOSTNAME" /etc/hosts; then
        echo "127.0.1.1       $DESIRED_HOSTNAME" >> /etc/hosts
    fi
    log_ok "Hostname set to ${DESIRED_HOSTNAME}"
else
    log_ok "Hostname already set to ${DESIRED_HOSTNAME}"
fi

# ── 2c: Install required packages ───────────────────────────────────────
log_step "2c: Installing required packages"

REQUIRED_PACKAGES=(
    curl
    git
    ufw
    fail2ban
    unattended-upgrades
    nginx
    python3-certbot-nginx
)

# Check and install each package
for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if dpkg -s "$pkg" &>/dev/null; then
        log_ok "${pkg} already installed"
    else
        log_info "Installing ${pkg}..."
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$pkg" > /dev/null 2>&1
        log_ok "${pkg} installed"
    fi
done

# ── 2d: Install Node.js 20 LTS via NodeSource ───────────────────────────
log_step "2d: Installing Node.js ${NODE_VERSION}.x LTS"

if command -v node &>/dev/null; then
    NODE_VER=$(node -v)
    NODE_MAJOR=$(echo "$NODE_VER" | sed 's/^v//' | cut -d. -f1)
    if [[ "$NODE_MAJOR" -ge "$NODE_VERSION" ]]; then
        log_ok "Node.js ${NODE_VER} already installed (meets requirement: v${NODE_VERSION}+)"
    else
        log_warn "Node.js ${NODE_VER} found but v${NODE_VERSION}+ required. Reinstalling..."
        DEBIAN_FRONTEND=noninteractive apt-get remove -y -qq nodejs > /dev/null 2>&1 || true
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - > /dev/null 2>&1
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs > /dev/null 2>&1
        log_ok "Node.js $(node -v) installed"
    fi
else
    log_info "Installing Node.js ${NODE_VERSION}.x..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - > /dev/null 2>&1
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs > /dev/null 2>&1
    log_ok "Node.js $(node -v) installed"
fi

# ── 2e: Install PM2 globally ────────────────────────────────────────────
log_step "2e: Installing PM2 process manager"

if command -v pm2 &>/dev/null; then
    log_ok "PM2 already installed: $(pm2 -v)"
else
    log_info "Installing PM2 globally..."
    npm install -g pm2 > /dev/null 2>&1
    log_ok "PM2 $(pm2 -v) installed"
fi

# ── 2f: Configure automatic security updates ─────────────────────────────
log_step "2f: Configuring automatic security updates"

cat > /etc/apt/apt.conf.d/20auto-upgrades << 'AUTOUPGRADE'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Verbose "0";
AUTOUPGRADE

# Configure which packages to auto-upgrade
cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'UNATTENDED'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Mail "false";
UNATTENDED

# Enable the unattended-upgrades service
if systemctl list-unit-files | grep -q unattended-upgrades; then
    systemctl enable unattended-upgrades > /dev/null 2>&1
    systemctl start unattended-upgrades > /dev/null 2>&1 || true
fi
log_ok "Automatic security updates configured"

log_ok "System hardening complete"

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3: SSH HARDENING
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 3/11: SSH HARDENING"

SSHD_CONFIG="/etc/ssh/sshd_config"
SSHD_CONFIG_D="/etc/ssh/sshd_config.d"

# Ensure config drop-in directory exists
mkdir -p "$SSHD_CONFIG_D"

# ── 3a: Generate random SSH port ─────────────────────────────────────────
log_step "3a: Changing SSH port"

SSH_HARDENED_FILE="/etc/ssh/sshd_config.d/99-arena-hardened.conf"

# Read existing port if this has been run before, otherwise generate a new one
if [[ -f "$SSH_HARDENED_FILE" ]]; then
    EXISTING_PORT=$(grep "^Port " "$SSH_HARDENED_FILE" | awk '{print $2}' || true)
    if [[ -n "$EXISTING_PORT" && "$EXISTING_PORT" =~ ^[0-9]+$ ]]; then
        SSH_PORT="$EXISTING_PORT"
        log_ok "Existing custom SSH port found: ${SSH_PORT} (reusing)"
    else
        SSH_PORT=$((RANDOM % 16383 + 49152))
        log_ok "Generated new random SSH port: ${SSH_PORT}"
    fi
else
    SSH_PORT=$((RANDOM % 16383 + 49152))
    log_ok "Generated random SSH port: ${SSH_PORT}"
fi

# ── 3b: Check for existing SSH keys before disabling password auth ───────
log_step "3b: Checking SSH key status"

SSH_KEY_FOUND=false

# Check for authorized keys in common locations
for key_dir in /root/.ssh /home/*/.ssh; do
    if [[ -d "$key_dir" ]]; then
        AUTH_KEYS="${key_dir}/authorized_keys"
        if [[ -f "$AUTH_KEYS" ]] && [[ -s "$AUTH_KEYS" ]]; then
            SSH_KEY_FOUND=true
            log_ok "SSH key(s) found in ${AUTH_KEYS}"
        fi
    fi
done

if [[ -n "$SSH_KEY_FILE" ]] && [[ -f "$SSH_KEY_FILE" ]]; then
    SSH_KEY_FOUND=true
    log_ok "SSH key file provided: ${SSH_KEY_FILE}"
fi

if [[ "$SSH_KEY_FOUND" == false ]]; then
    log_warn "No SSH authorized keys detected anywhere on the system."
    log_warn "Password authentication will remain ENABLED for safety."
    log_warn "To fully harden SSH, add your public key first, then re-run."
    DISABLE_PASSWORD_AUTH="no"
else
    DISABLE_PASSWORD_AUTH="yes"
    log_ok "SSH key(s) present — password authentication will be DISABLED"
fi

# ── 3c: Install SSH key if provided ──────────────────────────────────────
if [[ -n "$SSH_KEY_FILE" ]] && [[ -f "$SSH_KEY_FILE" ]]; then
    log_info "Installing SSH public key from ${SSH_KEY_FILE}..."
    mkdir -p /root/.ssh
    chmod 700 /root/.ssh

    KEY_CONTENT=$(cat "$SSH_KEY_FILE")
    AUTH_FILE="/root/.ssh/authorized_keys"

    if [[ -f "$AUTH_FILE" ]] && grep -qF "$KEY_CONTENT" "$AUTH_FILE"; then
        log_ok "SSH key already present in authorized_keys"
    else
        echo "$KEY_CONTENT" >> "$AUTH_FILE"
        chmod 600 "$AUTH_FILE"
        log_ok "SSH key installed to ${AUTH_FILE}"
    fi
fi

# ── 3d: Write hardened SSH config ────────────────────────────────────────
log_step "3d: Writing hardened SSH configuration"

cat > "$SSH_HARDENED_FILE" << EOF
# ── Ai-Arena Hardened SSH Configuration ──
# Generated by deploy.sh — $(date -u +%Y-%m-%dT%H:%M:%SZ)

Port ${SSH_PORT}
PermitRootLogin no
PasswordAuthentication ${DISABLE_PASSWORD_AUTH}
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys

# Disable unused authentication methods
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
UsePAM no

# Security hardening
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
PermitEmptyPasswords no
HostbasedAuthentication no

# Logging
LogLevel VERBOSE

# Restrict to SSH protocol 2 (implicit in modern OpenSSH, but explicit)
Protocol 2
EOF

chmod 644 "$SSH_HARDENED_FILE"
log_ok "Hardened SSH config written to ${SSH_HARDENED_FILE}"

# ── 3e: Validate and restart SSH ─────────────────────────────────────────
log_info "Validating SSH configuration..."
if sshd -t 2>/dev/null; then
    log_ok "SSH configuration is valid"
    systemctl restart sshd || systemctl restart ssh || true
    log_ok "SSH service restarted on port ${SSH_PORT}"
else
    log_error "SSH configuration validation FAILED. Rolling back..."
    rm -f "$SSH_HARDENED_FILE"
    log_error "Removed ${SSH_HARDENED_FILE}. SSH unchanged."
    log_error "Fix the config manually in /etc/ssh/sshd_config.d/"
    exit 1
fi

log_warn "IMPORTANT: SSH is now on port ${SSH_PORT}. Do NOT close this session"
log_warn "until you verify you can connect on the new port in a new terminal."

log_ok "SSH hardening complete"

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4: FIREWALL (UFW)
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 4/11: FIREWALL (UFW)"

# Reset UFW to clean state (idempotent)
log_info "Resetting UFW to known state..."
ufw --force reset > /dev/null 2>&1 || true

# Default policies
log_info "Setting default policies: deny incoming, allow outgoing..."
ufw default deny incoming > /dev/null 2>&1
ufw default allow outgoing > /dev/null 2>&1

# Allow SSH on custom port
log_info "Allowing SSH on port ${SSH_PORT}/tcp..."
ufw allow "${SSH_PORT}/tcp" comment 'SSH (hardened)' > /dev/null 2>&1

# Allow HTTP
log_info "Allowing HTTP (80/tcp)..."
ufw allow 80/tcp comment 'HTTP' > /dev/null 2>&1

# Allow HTTPS
log_info "Allowing HTTPS (443/tcp)..."
ufw allow 443/tcp comment 'HTTPS' > /dev/null 2>&1

# Enable UFW (non-interactive)
log_info "Enabling UFW..."
ufw --force enable > /dev/null 2>&1

log_ok "UFW firewall active"
log_ok "  Allowed: SSH (${SSH_PORT}), HTTP (80), HTTPS (443)"
log_ok "  Default: deny incoming, allow outgoing"

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 5: FAIL2BAN
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 5/11: FAIL2BAN"

# ── 5a: Ensure fail2ban is running ───────────────────────────────────────
log_step "5a: Ensuring fail2ban service is active"
systemctl enable fail2ban > /dev/null 2>&1
systemctl restart fail2ban > /dev/null 2>&1
log_ok "fail2ban service active"

# ── 5b: Custom SSH jail ─────────────────────────────────────────────────
log_step "5b: Configuring aggressive SSH jail"

cat > /etc/fail2ban/jail.d/arena-ssh.conf << 'EOF'
[arena-ssh]
enabled  = true
port     = CHANGEME_SSH_PORT
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
findtime = 600
bantime  = 3600
action   = iptables-multiport[name=SSH, port="CHANGEME_SSH_PORT", protocol=tcp]
EOF

# Replace placeholder with actual SSH port
sed -i "s/CHANGEME_SSH_PORT/${SSH_PORT}/g" /etc/fail2ban/jail.d/arena-ssh.conf
log_ok "SSH jail configured (maxretry=3, bantime=3600s, findtime=600s)"

# ── 5c: Custom Ai-Arena WebSocket/agent auth jail ────────────────────────
log_step "5c: Configuring Ai-Arena agent auth brute-force jail"

# Custom filter for Ai-Arena agent authentication failures
cat > /etc/fail2ban/filter.d/arena-agent-auth.conf << 'EOF'
# Fail2Ban filter for Ai-Arena agent authentication failures
# Matches failed agent auth attempts on the Next.js API

[Definition]
failregex = ^.*POST /api/v1/events.*401.*$
            ^.*POST /api/v1/events.*403.*$
            ^.*POST /api/agents/auth.*401.*$
            ^.*POST /api/agents/auth.*403.*$
            ^.*<ip> -.*"POST /api/v1/events.*" 401.*$
            ^.*<ip> -.*"POST /api/v1/events.*" 403.*$
ignoreregex =
EOF

cat > /etc/fail2ban/jail.d/arena-agent.conf << 'EOF'
[arena-agent]
enabled  = true
port     = http,https
filter   = arena-agent-auth
logpath  = /var/log/nginx/arena.access.log
           /var/log/nginx/access.log
maxretry = 5
findtime = 300
bantime  = 1800
action   = iptables-multiport[name=arena-agent, port="http,https", protocol=tcp]
EOF

log_ok "Ai-Arena agent auth jail configured (maxretry=5, bantime=1800s, findtime=300s)"

# ── 5d: Restart fail2ban to apply ────────────────────────────────────────
log_info "Restarting fail2ban to apply all jails..."
systemctl restart fail2ban > /dev/null 2>&1
sleep 2

if fail2ban-client status arena-ssh &>/dev/null; then
    log_ok "fail2ban SSH jail is active"
else
    log_warn "fail2ban SSH jail may not be active yet (logs may not exist yet — this is OK on first run)"
fi

log_ok "Fail2ban configuration complete"

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 6: KERNEL HARDENING (sysctl)
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 6/11: KERNEL HARDENING (sysctl)"

log_step "Writing hardened sysctl configuration"

cat > /etc/sysctl.d/99-arena-hardened.conf << 'EOF'
# ═══════════════════════════════════════════════════════════════
# Ai-Arena Hardened Kernel Parameters
# Generated by deploy.sh
# ═══════════════════════════════════════════════════════════════

# Disable IP forwarding (not a router)
net.ipv4.ip_forward = 0

# Enable SYN cookies (SYN flood protection)
net.ipv4.tcp_syncookies = 1

# Disable ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Disable ICMP redirect sending
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Enable reverse path filtering (anti-spoofing)
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Disable source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Log martian packets (spoofed source addresses)
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# Disable IPv6 if not explicitly needed
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.ipv6.conf.lo.disable_ipv6 = 1

# Connection tracking
net.netfilter.nf_conntrack_max = 65536
net.netfilter.nf_conntrack_tcp_timeout_established = 7200

# TCP hardening
net.ipv4.tcp_rfc1337 = 1
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 3

# Disable ICMP broadcast ping
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Ignore bogus ICMP errors
net.ipv4.icmp_ignore_bogus_error_responses = 1

# Reduce swappiness (prefer keeping app in memory)
vm.swappiness = 10

# Protect against kernel memory exploitation
kernel.kexec_load_disabled = 1
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2

# Restrict core dumps
fs.suid_dumpable = 0
EOF

log_info "Applying sysctl settings..."
sysctl -p /etc/sysctl.d/99-arena-hardened.conf > /dev/null 2>&1 || true
log_ok "Kernel hardening applied"

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 7: NGINX REVERSE PROXY
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 7/11: NGINX REVERSE PROXY"

# ── 7a: Remove default Nginx site ────────────────────────────────────────
log_step "7a: Configuring Nginx"
rm -f /etc/nginx/sites-enabled/default

# ── 7b: Security headers map ─────────────────────────────────────────────
log_info "Setting up security headers..."

# ── 7c: Write main Nginx config ──────────────────────────────────────────
# Get server IP for display purposes
SERVER_IP=$(curl -s4 ifconfig.me 2>/dev/null || curl -s4 icanhazip.com 2>/dev/null || echo "YOUR_SERVER_IP")

if [[ -n "$DOMAIN" ]]; then
    SERVER_NAME="$DOMAIN"
else
    SERVER_NAME="_"
    log_warn "No domain provided — Nginx will listen on all interfaces"
fi

cat > /etc/nginx/sites-available/${APP_NAME} << EOF
# ═══════════════════════════════════════════════════════════════
# Ai-Arena Nginx Reverse Proxy
# Generated by deploy.sh — $(date -u +%Y-%m-%dT%H:%M:%SZ)
# ═══════════════════════════════════════════════════════════════

# Rate limiting zone: 10 requests/second per IP
limit_req_zone \$binary_remote_addr zone=arena_limit:10m rate=10r/s;

# Upstream for Next.js application
upstream arena_backend {
    server 127.0.0.1:${APP_PORT};
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    # Redirect all HTTP to HTTPS (if domain provided — certbot will add this)
    # For now we serve on HTTP; certbot will modify this in Section 8
    ${DOMAIN:+# HTTPS redirect will be added by certbot in Section 8}

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' wss: ws:;" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Hide Nginx version
    server_tokens off;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/rss+xml
        image/svg+xml
        application/x-javascript
        application/xml+rss;

    # Logging
    access_log /var/log/nginx/arena.access.log;
    error_log  /var/log/nginx/arena.error.log;

    # Block direct HTTP access to WebSocket endpoint (only allow upgrade)
    location = /api/v1/events {
        # Block non-WebSocket requests to the events endpoint
        if (\$http_upgrade != "websocket") {
            return 403;
        }

        limit_req zone=arena_limit burst=20 nodelay;

        proxy_pass http://arena_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Block direct HTTP access to any /api/agents/auth endpoint
    location /api/agents/auth {
        limit_req zone=arena_limit burst=5 nodelay;

        proxy_pass http://arena_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # General API routes — rate limited
    location /api/ {
        limit_req zone=arena_limit burst=20 nodelay;

        proxy_pass http://arena_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Next.js static files & internals
    location /_next/ {
        proxy_pass http://arena_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Cache static assets aggressively
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    # Everything else → Next.js
    location / {
        limit_req zone=arena_limit burst=30 nodelay;

        proxy_pass http://arena_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# ── 7d: Connection upgrade map ───────────────────────────────────────────
# Ensure the upgrade map exists (needed for WebSocket in the default location)
if ! grep -q 'map \$http_upgrade' /etc/nginx/nginx.conf; then
    # Insert the map block at the top of the http block
    sed -i '/http {/a\\n    map $http_upgrade $connection_upgrade {\n        default upgrade;\n        '\'''\''      close;\n    }' /etc/nginx/nginx.conf
fi

# ── 7e: Enable the site ──────────────────────────────────────────────────
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}

# ── 7f: Validate and restart Nginx ───────────────────────────────────────
log_info "Validating Nginx configuration..."
if nginx -t 2>&1; then
    log_ok "Nginx configuration is valid"
    systemctl enable nginx > /dev/null 2>&1
    systemctl restart nginx > /dev/null 2>&1
    log_ok "Nginx started"
else
    log_error "Nginx configuration FAILED validation."
    exit 1
fi

log_ok "Nginx reverse proxy configured"
log_ok "  WebSocket support on /api/v1/events (upgrade only)"
log_ok "  Rate limiting: 10 req/s per IP"
log_ok "  Security headers applied"
log_ok "  Gzip compression enabled"

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 8: SSL/TLS (LET'S ENCRYPT)
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 8/11: SSL/TLS (LET'S ENCRYPT)"

if [[ -n "$DOMAIN" ]]; then
    log_info "Domain provided: ${DOMAIN}"
    log_info "Obtaining SSL certificate via Let's Encrypt..."

    # Obtain certificate and let certbot modify Nginx config
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect 2>&1; then
        log_ok "SSL certificate obtained and installed for ${DOMAIN}"
        HAS_SSL=true

        # ── 8a: Harden SSL/TLS settings ───────────────────────────────────
        log_step "8a: Hardening TLS configuration"

        # Extract the certbot-managed server block and inject strong TLS settings
        # Certbot adds its own server block for SSL — we add hardening directives
        SSL_CONF="/etc/nginx/sites-available/${APP_NAME}"

        # Add strong SSL parameters before the first server block
        if ! grep -q 'ssl_protocols' "$SSL_CONF"; then
            # Insert at the top of the file, before the first server block
            TEMP_SSL=$(mktemp)
            cat > "$TEMP_SSL" << 'SSLEOF'
# Strong SSL/TLS configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
ssl_session_timeout 1d;
ssl_session_cache shared:MozSSL:10m;
ssl_session_tickets off;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;

# HSTS header (1 year, include subdomains, preload)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

SSLEOF
            cat "$TEMP_SSL" > "$SSL_CONF".new
            cat "$SSL_CONF" >> "$SSL_CONF".new
            mv "$SSL_CONF".new "$SSL_CONF"
            rm -f "$TEMP_SSL"

            # Re-validate and reload Nginx
            if nginx -t 2>&1; then
                systemctl reload nginx > /dev/null 2>&1
                log_ok "Strong TLS settings applied (TLS 1.2+, modern ciphers, HSTS)"
            else
                log_warn "TLS hardening caused a config error — certbot's config still active"
                log_warn "Manual review of ${SSL_CONF} needed"
            fi
        else
            log_ok "TLS hardening already present"
        fi

    else
        log_warn "Certbot failed to obtain SSL certificate."
        log_warn "Make sure DNS for ${DOMAIN} points to this server: ${SERVER_IP}"
        log_warn "You can retry manually: certbot --nginx -d ${DOMAIN}"
        HAS_SSL=false
    fi
else
    log_warn "No domain provided — skipping SSL/TLS setup."
    log_warn "To enable HTTPS, run: sudo ./deploy.sh your-domain.com"
    HAS_SSL=false
fi

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 9: AI-ARENA APPLICATION DEPLOYMENT
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 9/11: AI-ARENA APPLICATION DEPLOYMENT"

# ── 9a: Clone or update repository ───────────────────────────────────────
log_step "9a: Setting up application source"

if [[ -d "${APP_DIR}/.git" ]]; then
    log_info "Application directory exists. Pulling latest changes..."
    cd "$APP_DIR"
    git fetch origin "$BRANCH" 2>/dev/null
    git reset --hard "origin/${BRANCH}" 2>/dev/null
    log_ok "Application updated to latest on branch '${BRANCH}'"
else
    log_info "Cloning repository from GitHub..."
    if [[ -d "$APP_DIR" ]]; then
        rm -rf "$APP_DIR"
    fi
    git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR" 2>/dev/null
    log_ok "Repository cloned to ${APP_DIR}"
fi

cd "$APP_DIR"

# ── 9b: Install bun if not present ───────────────────────────────────────
log_step "9b: Installing bun (if needed)"

if command -v bun &>/dev/null; then
    log_ok "bun already installed: $(bun --version)"
else
    log_info "Installing bun..."
    curl -fsSL https://bun.sh/install | bash > /dev/null 2>&1
    # Source bun into this shell
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    if command -v bun &>/dev/null; then
        log_ok "bun $(bun --version) installed"
    else
        log_warn "bun installation may have failed — falling back to npm"
        USE_NPM=true
    fi
fi

# ── 9c: Install dependencies ─────────────────────────────────────────────
log_step "9c: Installing application dependencies"

if [[ "${USE_NPM:-false}" == true ]] || ! command -v bun &>/dev/null; then
    log_info "Installing with npm..."
    npm install 2>/dev/null
else
    log_info "Installing with bun..."
    bun install 2>/dev/null
fi
log_ok "Dependencies installed"

# ── 9d: Generate and save secrets to .env ────────────────────────────────
log_step "9d: Configuring environment secrets"

# Generate ARENA_ENC_KEY if not already set
if [[ -f "${APP_DIR}/.env" ]] && grep -q 'ARENA_ENC_KEY=' "${APP_DIR}/.env"; then
    ARENA_ENC_KEY=$(grep '^ARENA_ENC_KEY=' "${APP_DIR}/.env" | cut -d= -f2)
    log_ok "ARENA_ENC_KEY already exists in .env (reusing)"
else
    ARENA_ENC_KEY=$(openssl rand -hex 32)
    log_ok "ARENA_ENC_KEY generated"
fi

# Generate ARENA_API_KEY if not already set
if [[ -f "${APP_DIR}/.env" ]] && grep -q 'ARENA_API_KEY=' "${APP_DIR}/.env"; then
    ARENA_API_KEY=$(grep '^ARENA_API_KEY=' "${APP_DIR}/.env" | cut -d= -f2)
    log_ok "ARENA_API_KEY already exists in .env (reusing)"
else
    ARENA_API_KEY=$(openssl rand -hex 32)
    log_ok "ARENA_API_KEY generated"
fi

# Write/update .env file
cat > "${APP_DIR}/.env" << EOF
# ═══════════════════════════════════════════════════
# Ai-Arena Environment Configuration
# Generated by deploy.sh — $(date -u +%Y-%m-%dT%H:%M:%SZ)
# ═══════════════════════════════════════════════════

# Encryption key for sensitive data
ARENA_ENC_KEY=${ARENA_ENC_KEY}

# API key for agent authentication
ARENA_API_KEY=${ARENA_API_KEY}

# Application
NODE_ENV=production
PORT=${APP_PORT}

# Database (SQLite — file-based, no external DB needed)
DATABASE_URL="file:./db/custom.db"
EOF

chmod 600 "${APP_DIR}/.env"
log_ok ".env file written to ${APP_DIR}/.env (permissions: 600)"

# ── 9e: Initialize database with Prisma ──────────────────────────────────
log_step "9e: Initializing database (Prisma)"

log_info "Running prisma db push..."
npx prisma db push --skip-generate 2>/dev/null
log_info "Generating Prisma client..."
npx prisma generate 2>/dev/null
log_ok "Database schema applied and Prisma client generated"

# ── 9f: Build the Next.js application ────────────────────────────────────
log_step "9f: Building Next.js application (production)"

log_info "Running npm run build — this may take a few minutes..."
NODE_ENV=production npm run build 2>&1 | tail -20
log_ok "Next.js production build complete"

# ── 9g: Configure PM2 ecosystem ─────────────────────────────────────────
log_step "9g: Configuring PM2 process manager"

# Create log directory
mkdir -p "$LOG_DIR"
chown -R root:root "$LOG_DIR"
chmod 755 "$LOG_DIR"

# Stop existing process if running (idempotent)
pm2 delete "$PM2_PROCESS_NAME" 2>/dev/null || true

# Create PM2 ecosystem file
cat > "${APP_DIR}/ecosystem.config.cjs" << EOF
module.exports = {
  apps: [{
    name: "${PM2_PROCESS_NAME}",
    script: "node_modules/.bin/next",
    args: "start",
    cwd: "${APP_DIR}",
    env: {
      NODE_ENV: "production",
      PORT: ${APP_PORT},
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "512M",
    kill_timeout: 5000,
    wait_ready: false,
    listen_timeout: 10000,
    error_file: "${LOG_DIR}/error.log",
    out_file: "${LOG_DIR}/out.log",
    time: true,
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
  }]
};
EOF

log_ok "PM2 ecosystem file created at ${APP_DIR}/ecosystem.config.cjs"

# ── 9h: Start application with PM2 ──────────────────────────────────────
log_step "9h: Starting application with PM2"

pm2 start "${APP_DIR}/ecosystem.config.cjs" 2>/dev/null
pm2 save 2>/dev/null

# Wait and verify
sleep 5
if pm2 pid "$PM2_PROCESS_NAME" &>/dev/null; then
    APP_PID=$(pm2 pid "$PM2_PROCESS_NAME")
    log_ok "Ai-Arena is running (PID: ${APP_PID})"
else
    log_error "Failed to start Ai-Arena. Check logs:"
    log_error "  pm2 logs ${PM2_PROCESS_NAME} --lines 50"
    log_error "  tail -100 ${LOG_DIR}/error.log"
    exit 1
fi

# ── 9i: Configure PM2 startup service ───────────────────────────────────
log_info "Configuring PM2 startup service..."
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash 2>/dev/null || true
pm2 save 2>/dev/null
log_ok "PM2 startup service configured (auto-start on boot)"

log_ok "Ai-Arena deployment complete"

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 10: LOG ROTATION
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 10/11: LOG ROTATION"

# ── 10a: PM2 log rotation ────────────────────────────────────────────────
log_step "10a: Configuring PM2 log rotation"

cat > /etc/logrotate.d/${APP_NAME}-pm2 << EOF
${LOG_DIR}/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    maxsize 100M
    dateext
    dateformat -%Y%m%d
    postrotate
        [ -e /run/systemd/system ] && systemctl reload pm2-root.service 2>/dev/null || true
    endscript
}
EOF

log_ok "PM2 log rotation configured (daily, keep 30 days, max 100MB)"

# ── 10b: Nginx log rotation ──────────────────────────────────────────────
log_step "10b: Configuring Nginx log rotation"

cat > /etc/logrotate.d/${APP_NAME}-nginx << EOF
/var/log/nginx/arena.*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    sharedscripts
    maxsize 200M
    dateext
    dateformat -%Y%m%d
    postrotate
        [ -e /run/systemd/system ] && systemctl reload nginx 2>/dev/null || true
    endscript
}
EOF

log_ok "Nginx log rotation configured (daily, keep 30 days, max 200MB)"

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 11: FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
log_section "SECTION 11/11: FINAL SUMMARY & DEPLOYMENT INFO"

# Determine display URL
if [[ "$HAS_SSL" == true && -n "$DOMAIN" ]]; then
    APP_URL="https://${DOMAIN}"
else
    APP_URL="http://${SERVER_IP}"
fi

echo -e "\n  ${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}║${NC}  ${GREEN}AI-ARENA DEPLOYMENT COMPLETE${NC}"
echo -e "  ${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Application${NC}"
echo -e "    URL:              ${CYAN}${APP_URL}${NC}"
echo -e "    Directory:        ${APP_DIR}"
echo -e "    Process:          ${PM2_PROCESS_NAME} (PM2, PID: $(pm2 pid "$PM2_PROCESS_NAME" 2>/dev/null || echo 'N/A'))"
echo -e "    Internal Port:    ${APP_PORT}"
echo ""
echo -e "  ${BOLD}Security${NC}"
echo -e "    SSH Port:         ${YELLOW}${SSH_PORT}${NC}"
echo -e "    SSH Password Auth: ${DISABLE_PASSWORD_AUTH}"
echo -e "    Firewall:         UFW (deny incoming, allow outgoing)"
echo -e "    Fail2ban:         SSH + Ai-Arena agent jails active"
echo -e "    Kernel:           Hardened (sysctl)"
echo -e "    SSL/TLS:          ${HAS_SSL:+Yes}${HAS_SSL:-No}${HAS_SSL:+ (TLS 1.2+)}"
echo ""
echo -e "  ${BOLD}Credentials (SAVE THESE!)${NC}"
echo -e "    ARENA_ENC_KEY:    ${RED}${ARENA_ENC_KEY}${NC}"
echo -e "    ARENA_API_KEY:    ${RED}${ARENA_API_KEY}${NC}"
echo ""
echo -e "  ${BOLD}Useful Commands${NC}"
echo ""
echo "    View app logs:       pm2 logs ${PM2_PROCESS_NAME}"
echo "    Restart app:         pm2 restart ${PM2_PROCESS_NAME}"
echo "    Stop app:            pm2 stop ${PM2_PROCESS_NAME}"
echo "    App status:          pm2 status"
echo "    Nginx logs:          tail -f /var/log/nginx/arena.error.log"
echo "    Fail2ban status:     fail2ban-client status"
echo "    Firewall status:     ufw status verbose"
echo ""
echo -e "  ${BOLD}Update Commands${NC}"
echo ""
echo "    Update app:          cd ${APP_DIR} && git pull && bun install && npm run build && pm2 restart ${PM2_PROCESS_NAME}"
echo "    Renew SSL:           certbot renew && systemctl reload nginx"
echo ""

# ── 11a: Write summary file ──────────────────────────────────────────────
cat > "$INFO_FILE" << EOF
╔═══════════════════════════════════════════════════════════════════════════╗
║                  AI-ARENA DEPLOYMENT INFORMATION                         ║
║                  Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)                    ║
╚═══════════════════════════════════════════════════════════════════════════╝

APPLICATION
─────────────────────────────────────────────────────────────────────────────
  URL:                ${APP_URL}
  Directory:          ${APP_DIR}
  Git Repository:     ${REPO_URL}
  Git Branch:         ${BRANCH}
  Process Name:       ${PM2_PROCESS_NAME}
  Internal Port:      ${APP_PORT}
  PM2 Ecosystem:      ${APP_DIR}/ecosystem.config.cjs

CREDENTIALS (KEEP SECRET!)
─────────────────────────────────────────────────────────────────────────────
  ARENA_ENC_KEY:      ${ARENA_ENC_KEY}
  ARENA_API_KEY:      ${ARENA_API_KEY}
  .env file:          ${APP_DIR}/.env

NETWORK
─────────────────────────────────────────────────────────────────────────────
  Server IP:          ${SERVER_IP}
  Domain:             ${DOMAIN:-(none)}
  SSH Port:           ${SSH_PORT}
  HTTP Port:          80
  HTTPS Port:         443
  SSL/TLS:            ${HAS_SSL:+Enabled}${HAS_SSL:-Disabled}

SECURITY
─────────────────────────────────────────────────────────────────────────────
  Firewall:           UFW (deny incoming, allow outgoing)
  SSH Root Login:     Disabled
  SSH Password Auth:  ${DISABLE_PASSWORD_AUTH}
  Fail2ban:           Active (SSH jail + Ai-Arena agent jail)
  Kernel Hardening:   Enabled (sysctl)
  Auto Updates:       Enabled (unattended-upgrades)
  Security Headers:   X-Frame-Options, X-Content-Type-Options,
                      X-XSS-Protection, Referrer-Policy, CSP
  Rate Limiting:      10 req/s per IP (Nginx)

LOGS
─────────────────────────────────────────────────────────────────────────────
  PM2 Out:            ${LOG_DIR}/out.log
  PM2 Error:          ${LOG_DIR}/error.log
  Nginx Access:       /var/log/nginx/arena.access.log
  Nginx Error:        /var/log/nginx/arena.error.log
  Auth Log:           /var/log/auth.log

USEFUL COMMANDS
─────────────────────────────────────────────────────────────────────────────
  View app logs:      pm2 logs ${PM2_PROCESS_NAME}
  Restart app:        pm2 restart ${PM2_PROCESS_NAME}
  Stop app:           pm2 stop ${PM2_PROCESS_NAME}
  App status:         pm2 status
  Nginx logs:         tail -f /var/log/nginx/arena.error.log
  Fail2ban status:    fail2ban-client status
  Firewall status:    ufw status verbose
  SSH jail status:    fail2ban-client status arena-ssh

UPDATE PROCEDURE
─────────────────────────────────────────────────────────────────────────────
  cd ${APP_DIR}
  git pull origin ${BRANCH}
  bun install
  npm run build
  pm2 restart ${PM2_PROCESS_NAME}

SSL RENEWAL
─────────────────────────────────────────────────────────────────────────────
  Certbot auto-renews via systemd timer. To manually renew:
  certbot renew --dry-run
  systemctl reload nginx

NEXT STEPS
─────────────────────────────────────────────────────────────────────────────
  1. Test SSH on new port:  ssh -p ${SSH_PORT} root@${SERVER_IP}
  2. Open app in browser:   ${APP_URL}
  3. Create your admin account (first-time setup)
  4. Configure agents using the ARENA_API_KEY above
  5. Delete this file when done:  rm -f ${INFO_FILE}
EOF

chmod 600 "$INFO_FILE"

echo -e "  ${GREEN}Deployment info saved to: ${INFO_FILE}${NC}"
echo -e "  ${YELLOW}(File permissions: 600 — root only. Delete after saving credentials!)${NC}"
echo ""
echo -e "  ${BOLD}${RED}!!! BEFORE DISCONNECTING: Open a new terminal and verify SSH on port ${SSH_PORT} !!!${NC}"
echo ""
echo -e "  ${GREEN}Ai-Arena is live and hardened. Have a great deployment!${NC}"
echo ""
