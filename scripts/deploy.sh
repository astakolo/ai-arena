#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Ai-Arena — Ubuntu VPS Deploy Script
# Compatible: Ubuntu 20.04, 22.04, 24.04
#
# This script deploys the Ai-Arena dashboard on a fresh Ubuntu VPS.
# It handles: Node.js, PM2, Caddy (reverse proxy + auto HTTPS),
# firewall, database, and production build.
#
# Usage:
#   chmod +x deploy.sh
#   sudo ./deploy.sh [domain]
#
# Example:
#   sudo ./deploy.sh arena.yourdomain.com
#
# If no domain is provided, Caddy will use the server IP.
# ═══════════════════════════════════════════════════════════════

set -e

# ─── Configuration ───────────────────────────────────────────
DOMAIN="${1:-}"
APP_NAME="ai-arena"
APP_DIR="/opt/ai-arena"
REPO_URL="https://github.com/astakolo/ai-arena.git"
BRANCH="main"
NODE_VERSION="20"
PM2_PROCESS_NAME="ai-arena"
PORT="3000"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()      { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${GREEN}══════════════════════════════════════════════════${NC}"; echo -e "${GREEN}  $1${NC}"; echo -e "${GREEN}══════════════════════════════════════════════════${NC}\n"; }

# ─── Pre-flight Checks ───────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
    log_error "This script must be run as root (use sudo)."
    exit 1
fi

log_section "Ai-Arena VPS Deployment"

log_info "Detected OS: $(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2)"
log_info "Kernel: $(uname -r)"
log_info "Architecture: $(uname -m)"
log_info "Domain: ${DOMAIN:-'(will use IP address)'}"
log_info "App directory: $APP_DIR"
echo ""

# ─── Step 1: Update System ──────────────────────────────────
log_section "Step 1/8: Updating System Packages"

log_info "Updating package lists..."
apt-get update -qq

log_info "Upgrading existing packages..."
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq > /dev/null 2>&1

log_ok "System packages updated"

# ─── Step 2: Install Dependencies ───────────────────────────
log_section "Step 2/8: Installing Dependencies"

# Install essential tools
log_info "Installing essential tools..."
apt-get install -y -qq curl wget git unzip build-essential > /dev/null 2>&1

# Install Node.js via NodeSource
if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    log_ok "Node.js already installed: $NODE_VER"
else
    log_info "Installing Node.js $NODE_VERSION.x LTS..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    log_ok "Node.js $(node -v) installed"
fi

# Install PM2 globally
if command -v pm2 &> /dev/null; then
    log_ok "PM2 already installed: $(pm2 -v)"
else
    log_info "Installing PM2 globally..."
    npm install -g pm2 > /dev/null 2>&1
    log_ok "PM2 installed"
fi

# Configure PM2 startup
log_info "Configuring PM2 startup service..."
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash > /dev/null 2>&1 || true
log_ok "PM2 startup configured"

# ─── Step 3: Clone / Update Repository ─────────────────────
log_section "Step 3/8: Setting Up Application"

if [ -d "$APP_DIR" ]; then
    log_info "Application directory exists. Pulling latest changes..."
    cd "$APP_DIR"
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
    log_ok "Application updated to latest"
else
    log_info "Cloning repository from GitHub..."
    git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR" > /dev/null 2>&1
    log_ok "Repository cloned to $APP_DIR"
fi

cd "$APP_DIR"

# ─── Step 4: Install Application Dependencies ──────────────
log_section "Step 4/8: Installing Application Dependencies"

log_info "Installing npm packages..."
npm install --production=false > /dev/null 2>&1

log_info "Generating Prisma client..."
npx prisma generate > /dev/null 2>&1

log_info "Pushing database schema..."
npx prisma db push > /dev/null 2>&1
log_ok "Dependencies installed and database initialized"

# ─── Step 5: Build Application ──────────────────────────────
log_section "Step 5/8: Building Application"

log_info "Running Next.js production build..."
NODE_ENV=production npx next build > /dev/null 2>&1

log_info "Preparing standalone output..."
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/ 2>/dev/null || true

log_ok "Build complete"

# ─── Step 6: Configure PM2 ──────────────────────────────────
log_section "Step 6/8: Configuring PM2 Process Manager"

# Stop existing process if running
pm2 delete "$PM2_PROCESS_NAME" 2>/dev/null || true

# Create PM2 ecosystem config
cat > "$APP_DIR/ecosystem.config.cjs" << EOF
module.exports = {
  apps: [{
    name: "${PM2_PROCESS_NAME}",
    script: ".next/standalone/server.js",
    cwd: "${APP_DIR}",
    env: {
      NODE_ENV: "production",
      PORT: ${PORT},
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "512M",
    error_file: "/var/log/ai-arena/error.log",
    out_file: "/var/log/ai-arena/out.log",
    time: true,
    merge_logs: true,
  }]
};
EOF

# Create log directory
mkdir -p /var/log/ai-arena

# Start the application
log_info "Starting Ai-Arena with PM2..."
pm2 start ecosystem.config.cjs > /dev/null 2>&1
pm2 save > /dev/null 2>&1

# Verify it's running
sleep 3
if pm2 pid "$PM2_PROCESS_NAME" > /dev/null 2>&1; then
    log_ok "Ai-Arena is running (PID: $(pm2 pid "$PM2_PROCESS_NAME"))"
else
    log_error "Failed to start Ai-Arena. Check logs:"
    echo "  pm2 logs $PM2_PROCESS_NAME --lines 50"
    exit 1
fi

# ─── Step 7: Install & Configure Caddy ──────────────────────
log_section "Step 7/8: Configuring Reverse Proxy (Caddy)"

# Install Caddy
if command -v caddy &> /dev/null; then
    CADDY_VER=$(caddy version | head -1)
    log_ok "Caddy already installed: $CADDY_VER"
else
    log_info "Installing Caddy..."
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl > /dev/null 2>&1
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg > /dev/null 2>&1
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null 2>&1
    apt-get update -qq
    apt-get install -y -qq caddy > /dev/null 2>&1
    log_ok "Caddy installed"
fi

# Get server IP for fallback
SERVER_IP=$(curl -s4 ifconfig.me 2>/dev/null || curl -s4 icanhazip.com 2>/dev/null || echo "YOUR_SERVER_IP")

# Configure Caddy
if [ -n "$DOMAIN" ]; then
    log_info "Configuring Caddy for HTTPS on $DOMAIN"
    cat > /etc/caddy/Caddyfile << EOF
$DOMAIN {
    reverse_proxy localhost:${PORT} {
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }

    # Security headers
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
}
EOF
else
    log_info "Configuring Caddy for HTTP on $SERVER_IP (no domain provided)"
    cat > /etc/caddy/Caddyfile << EOF
:$SERVER_IP {
    reverse_proxy localhost:${PORT} {
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
        -Server
    }
}
EOF
    log_warn "No domain provided. Caddy will use HTTP only."
    log_warn "For HTTPS, re-run with: sudo ./deploy.sh your-domain.com"
fi

# Restart Caddy
log_info "Restarting Caddy..."
systemctl restart caddy
systemctl enable caddy > /dev/null 2>&1

# Verify Caddy is running
if systemctl is-active --quiet caddy; then
    log_ok "Caddy is running"
else
    log_error "Caddy failed to start. Check: journalctl -u caddy -n 50"
fi

# ─── Step 8: Configure Firewall ─────────────────────────────
log_section "Step 8/8: Configuring Firewall"

if command -v ufw &> /dev/null; then
    log_info "Configuring UFW firewall..."
    ufw --force enable > /dev/null 2>&1
    ufw allow OpenSSH > /dev/null 2>&1
    ufw allow 80/tcp > /dev/null 2>&1
    ufw allow 443/tcp > /dev/null 2>&1
    log_ok "Firewall configured (SSH, HTTP, HTTPS allowed)"
else
    log_warn "UFW not found. Skipping firewall configuration."
    log_warn "Install with: apt-get install ufw"
fi

# ─── Deployment Summary ──────────────────────────────────────
log_section "Deployment Complete!"

echo ""
echo "  App URL:      ${DOMAIN:+https://}$DOMAIN${DOMAIN:-http://$SERVER_IP}"
echo "  App Dir:      $APP_DIR"
echo "  Process:      $PM2_PROCESS_NAME (PM2)"
echo "  Port:         $PORT (internal)"
echo "  Reverse Proxy: Caddy${DOMAIN:+ (auto-HTTPS)}"
echo ""
echo "  ─── Useful Commands ───────────────────────────────"
echo ""
echo "  View logs:       pm2 logs $PM2_PROCESS_NAME"
echo "  Restart app:     pm2 restart $PM2_PROCESS_NAME"
echo "  Stop app:        pm2 stop $PM2_PROCESS_NAME"
echo "  App status:      pm2 status"
echo "  Update app:      cd $APP_DIR && git pull && npm install && npm run build && pm2 restart $PM2_PROCESS_NAME"
echo "  Caddy logs:      journalctl -u caddy -f"
echo "  Caddy reload:    systemctl reload caddy"
echo ""
echo "  ─── First Login ──────────────────────────────────"
echo ""
echo "  1. Open the URL in your browser"
echo "  2. Create your admin account (first-time setup)"
echo "  3. Configure Firebase in Settings > Firebase Configuration"
echo "  4. Generate license keys in License Keys tab"
echo "  5. Download agent installers from Agent Setup tab"
echo ""
echo -e "  ${GREEN}Ai-Arena is live and ready!${NC}"
echo ""
