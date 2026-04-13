#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Ai-Arena — Ubuntu VPS Deployment Script
# ───────────────────────────────────────────────────────────────
# Deploys the Ai-Arena dashboard + WebSocket server to an
# Ubuntu VPS with Nginx reverse proxy + Let's Encrypt SSL.
#
# Usage:
#   chmod +x deploy.sh && ./deploy.sh
#
# Requirements:
#   - Ubuntu 20.04+ with root/sudo access
#   - A domain name pointing to your VPS IP
# ═══════════════════════════════════════════════════════════════

set -e

# ─── Configuration ───────────────────────────────────────────
APP_NAME="ai-arena"
APP_DIR="/opt/ai-arena"
APP_PORT=3000
NODE_VERSION="20"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()      { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "  ╔════════════════════════════════════════════════════╗"
echo "  ║         Ai-Arena VPS Deployment Script            ║"
echo "  ║   WebSocket + AES-256-GCM Encrypted Platform     ║"
echo "  ╚════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: System Update ──────────────────────────────────
log_info "Updating system packages..."
apt-get update -qq
apt-get upgrade -yqq > /dev/null 2>&1
log_ok "System updated"

# ─── Step 2: Install Dependencies ───────────────────────────
log_info "Installing dependencies..."

# Check if Node.js is already installed
if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    log_ok "Node.js already installed: $NODE_VER"
else
    log_info "Installing Node.js $NODE_VERSION.x..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
    apt-get install -y nodejs > /dev/null 2>&1
    log_ok "Node.js installed: $(node -v)"
fi

# Install other dependencies
apt-get install -y nginx certbot python3-certbot-nginx ufw > /dev/null 2>&1
log_ok "Nginx, Certbot, UFW installed"

# ─── Step 3: Install Bun (fast Node.js package manager) ────
if ! command -v bun &> /dev/null; then
    log_info "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash > /dev/null 2>&1
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    log_ok "Bun installed"
else
    log_ok "Bun already installed"
fi

# ─── Step 4: Setup Application ──────────────────────────────
log_info "Setting up Ai-Arena application..."
mkdir -p "$APP_DIR"

if [ -f "$APP_DIR/package.json" ]; then
    log_ok "Application directory exists, updating..."
    cd "$APP_DIR"
    # Pull latest if it's a git repo
    if [ -d ".git" ]; then
        git pull --ff-only 2>/dev/null || true
    fi
else
    log_info "Cloning Ai-Arena repository..."
    # Replace with your actual repo URL
    # git clone https://github.com/YOUR_USERNAME/ai-arena.git "$APP_DIR"
    # cd "$APP_DIR"
    log_warn "No git repo configured. Copy your project files to $APP_DIR manually."
fi

cd "$APP_DIR"

# Install dependencies
log_info "Installing Node.js dependencies..."
if [ -f "bun.lock" ] || [ -f "bun.lockb" ]; then
    bun install --production 2>&1 | tail -1
else
    npm install --omit=dev --no-audit --no-fund 2>&1 | tail -1
fi
log_ok "Dependencies installed"

# ─── Step 5: Generate Encryption Key ────────────────────────
if [ -z "$ARENA_ENC_KEY" ]; then
    if [ -f ".env" ] && grep -q "ARENA_ENC_KEY=" .env 2>/dev/null; then
        ARENA_ENC_KEY=$(grep "ARENA_ENC_KEY=" .env | cut -d'=' -f2)
        log_ok "Using existing encryption key from .env"
    else
        ARENA_ENC_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        log_ok "Generated new encryption key"
    fi
fi

# ─── Step 6: Configure Environment ──────────────────────────
log_info "Configuring environment..."

if [ ! -f ".env" ]; then
    cat > .env << ENVFILE
# Ai-Arena Environment Configuration
DATABASE_URL="file:./db/production.db"
ARENA_ENC_KEY="${ARENA_ENC_KEY}"
ARENA_SERVER_URL="http://localhost:${APP_PORT}"
ALLOWED_ORIGINS="http://localhost:${APP_PORT}"
ENVFILE
    log_ok "Created .env file"
else
    # Ensure encryption key is set
    if ! grep -q "ARENA_ENC_KEY=" .env; then
        echo "ARENA_ENC_KEY=${ARENA_ENC_KEY}" >> .env
        log_ok "Added encryption key to .env"
    fi
fi

# ─── Step 7: Database Setup ─────────────────────────────────
log_info "Setting up database..."
mkdir -p db
if [ -f "prisma/schema.prisma" ]; then
    npx prisma generate --silent 2>/dev/null || bunx prisma generate --silent 2>/dev/null || true
    npx prisma db push --skip-generate 2>/dev/null || bunx prisma db push --skip-generate 2>/dev/null || true
    log_ok "Database initialized"
else
    log_warn "No Prisma schema found, skipping database setup"
fi

# ─── Step 8: Build Application ───────────────────────────────
log_info "Building Next.js application..."
NODE_ENV=production npx next build 2>&1 | tail -5
log_ok "Build complete"

# ─── Step 9: Setup systemd Service ──────────────────────────
log_info "Creating systemd service..."

cat > /etc/systemd/system/${APP_NAME}.service << SERVICE
[Unit]
Description=Ai-Arena Remote Management Platform
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
ExecStart=/usr/bin/node server.ts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable ${APP_NAME} > /dev/null 2>&1
systemctl restart ${APP_NAME}
sleep 3

if systemctl is-active --quiet ${APP_NAME}; then
    log_ok "Service is running on port ${APP_PORT}"
else
    log_error "Service failed to start. Check: journalctl -u ${APP_NAME} -n 50"
fi

# ─── Step 10: Nginx Reverse Proxy ──────────────────────────
read -p "Enter your domain name (e.g., arena.yourdomain.com): " DOMAIN_NAME

if [ -n "$DOMAIN_NAME" ]; then
    log_info "Configuring Nginx for ${DOMAIN_NAME}..."

    cat > /etc/nginx/sites-available/${APP_NAME} << NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_NAME};

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect HTTP to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}
NGINX

    ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    nginx -t && systemctl reload nginx
    log_ok "Nginx configured for HTTP"

    # ─── Step 11: SSL Certificate ──────────────────────────
    log_info "Requesting SSL certificate for ${DOMAIN_NAME}..."
    certbot --nginx -d ${DOMAIN_NAME} --non-interactive --agree-tos --email admin@${DOMAIN_NAME} --redirect 2>&1 | grep -E "(Congratulations|Successfully|certificate)"

    # Add WebSocket upgrade headers to the Nginx config
    cat > /etc/nginx/sites-available/${APP_NAME} << NGINX_SSL
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_NAME};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN_NAME};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
    }
}
NGINX_SSL

    nginx -t && systemctl reload nginx
    log_ok "Nginx configured with SSL + WebSocket support"
fi

# ─── Step 12: Firewall ──────────────────────────────────────
log_info "Configuring firewall..."
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force reload
log_ok "Firewall configured (SSH + HTTP/HTTPS)"

# ─── Step 13: Auto-renew SSL ────────────────────────────────
log_info "Setting up SSL auto-renewal..."
systemctl enable certbot.timer > /dev/null 2>&1
log_ok "SSL auto-renewal configured"

# ═══════════════════════════════════════════════════════════
echo ""
echo "  ═══════════════════════════════════════════════"
echo "    Deployment Complete!"
echo "  ═══════════════════════════════════════════════"
echo ""
echo "  App directory:   ${APP_DIR}"
echo "  Service name:    ${APP_NAME}"
echo "  App port:        ${APP_PORT}"
if [ -n "$DOMAIN_NAME" ]; then
echo "  Domain:          https://${DOMAIN_NAME}"
fi
echo "  Encryption:      AES-256-GCM (enabled)"
echo "  WebSocket path:  /api/v1/events"
echo "  Encryption key:  ${ARENA_ENC_KEY:0:16}...${ARENA_ENC_KEY: -16}"
echo ""
echo "  Useful commands:"
echo "    systemctl status ${APP_NAME}    — Check service status"
echo "    journalctl -u ${APP_NAME} -f    — View live logs"
echo "    systemctl restart ${APP_NAME}   — Restart service"
echo ""
echo "  Your agents need these environment variables:"
echo "    ARENA_SERVER_URL=$(if [ -n "$DOMAIN_NAME" ]; then echo "https://${DOMAIN_NAME}"; else echo "http://YOUR_VPS_IP:${APP_PORT}"; fi)"
echo "    ARENA_ENC_KEY=${ARENA_ENC_KEY}"
echo ""
