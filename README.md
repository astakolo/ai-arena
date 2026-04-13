# Ai-Arena — Remote Server Management Platform

Enterprise-grade web-based remote server management platform. Monitor, control, and audit all your servers from a single dashboard.

![Ai-Arena](public/logo.png)

## Features

- **Remote Dashboard** — Real-time server monitoring with online/offline status, IP geolocation (country flag + city), system stats
- **Remote Desktop** — Screen sharing and remote control via WebRTC signaling through Firebase
- **Terminal Access** — Full remote terminal emulator (cmd.exe on Windows, bash on macOS)
- **Webcam & Microphone** — Remote webcam viewing and microphone listening
- **File Browser** — Browse, read, and manage files on remote servers
- **License Key Security** — AI-xxxx format license keys, per-server authentication, revocation support
- **Activity Audit Trail** — Full logging of commands, logins, keystrokes, file access, clipboard, process creation
- **Firebase-First Architecture** — All agent communication through Firebase Realtime Database (no direct IP/domain exposure, avoids antivirus flagging)
- **Dormant Mode** — Agent sleeps until commands arrive, ~200 bytes heartbeat every 30s (~576 KB/month per agent)
- **Auto Online/Offline** — Firebase `onDisconnect()` automatically marks agents offline on crash, power loss, or internet drop
- **Cross-Platform Agents** — Single agent code works on Windows and macOS
- **Unattended Access** — Auto-starts on boot via Task Scheduler (Windows) or launchd (macOS). Survives power outages.
- **API Security** — All API endpoints protected by API key authentication + rate limiting + Zod validation

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Ai-Arena Dashboard                  │
│           (Next.js 16 Web Application)           │
│                                                 │
│  Dashboard │ Connect │ Keys │ Audit │ Agent Setup│
│                                                 │
│  REST API + Firebase Client                     │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │    Firebase Realtime Database (PRIMARY)   │  │
│  │    Trusted domains — no AV flagging       │  │
│  │                                           │  │
│  │    /agents/{key}/status        online/off  │  │
│  │    /agents/{key}/lastHeartbeat  30s ping  │  │
│  │    /agents/{key}/commands       → agent   │  │
│  │    /agents/{key}/results        ← agent   │  │
│  │    /audit/{key}                 activity   │  │
│  │                                           │  │
│  │    onDisconnect → auto-marks offline      │  │
│  └────────────────────┬──────────────────────┘  │
│                       │                          │
└───────────────────────┼──────────────────────────┘
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
┌───┴────┐    ┌────────┴─────┐    ┌───────┴───┐
│Windows │    │    macOS     │    │  Windows  │
│Agent   │    │   Agent      │    │  Agent    │
│v3.0    │    │   v3.0       │    │  v3.0     │
│dormant │    │   dormant    │    │  dormant  │
│TaskSch.│    │   launchd    │    │  TaskSch. │
└────────┘    └──────────────┘    └───────────┘
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| UI Components | shadcn/ui, Radix UI, Lucide Icons |
| State Management | Zustand |
| Backend API | Next.js API Routes (serverless) |
| Database | SQLite via Prisma ORM |
| Real-time Communication | Firebase Realtime Database |
| Agent Runtime | Node.js 18+ (runs on client servers) |
| Validation | Zod |
| Date Handling | date-fns |

## Prerequisites

- Node.js 18+ (or Bun)
- A Firebase project with Realtime Database enabled
- A VPS or server to host the dashboard

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/astakolo/ai-arena.git
cd ai-arena
npm install
# or: bun install
```

### 2. Set Up Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and set your API key:

```env
AI_ARENA_API_KEY=AI-ARENA-your-random-key-here
NEXT_PUBLIC_API_KEY=AI-ARENA-your-random-key-here
DATABASE_URL="file:./db/dev.db"
```

Generate a strong API key:
```bash
node -e "console.log('AI-ARENA-' + require('crypto').randomUUID())"
```

### 3. Set Up Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Start Development

```bash
npm run dev
# or: bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Configure Firebase

Go to **Settings** in the dashboard and enter your Firebase configuration. This is needed for the agent communication layer.

## Deploying to Production

### Build

```bash
npm run build
```

This creates a standalone output in `.next/standalone/`.

### Run on VPS

```bash
# Copy the standalone build to your VPS
scp -r .next/standalone/ user@your-vps:/opt/ai-arena/

# SSH into your VPS
ssh user@your-vps

# Install dependencies and start
cd /opt/ai-arena
npm install --production
NODE_ENV=production AI_ARENA_API_KEY=your-key node server.js
```

### With PM2 (recommended)

```bash
npm install -g pm2
pm2 start server.js --name ai-arena --env AI_ARENA_API_KEY=your-key
pm2 save
pm2 startup
```

### With Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["node", "server.js"]
```

```bash
docker build -t ai-arena .
docker run -d -p 3000:3000 --env AI_ARENA_API_KEY=your-key ai-arena
```

## Agent Deployment

### Windows

1. Go to **Agent Setup** tab in the dashboard
2. Download `install-ai-arena.bat`
3. Edit the `.bat` file — set your `LICENSE_KEY` and Firebase config
4. Double-click the `.bat` to install (auto-requests admin)
5. Place `ai-arena-agent.js` in `C:\Ai-Arena\`

The agent auto-starts on boot via Windows Task Scheduler.

### macOS

1. Go to **Agent Setup** tab, switch to macOS
2. Download `install-ai-arena.sh`
3. Edit the `.sh` file — set your `LICENSE_KEY` and Firebase config
4. Run: `chmod +x install-ai-arena.sh && sudo ./install-ai-arena.sh`
5. Place `ai-arena-agent.js` in `/usr/local/ai-arena/`

The agent auto-starts on boot via launchd with KeepAlive.

## Security

### API Authentication
All API endpoints require an `AI_ARENA_API_KEY` header:

```bash
curl -H "X-API-Key: AI-ARENA-your-key" http://your-server/api/servers
```

### Input Validation
All API inputs are validated with Zod schemas. Invalid data returns 400 with detailed field errors.

### Rate Limiting
API endpoints are rate-limited to 100 requests/minute per IP address.

### Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Powered-By: Next.js` header removed

### Firebase Security
- All agent communication goes through Firebase (no direct server IP exposure)
- Firebase domains are trusted by antivirus software
- `onDisconnect()` ensures offline detection even after crashes

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers` | List all servers |
| POST | `/api/servers` | Create a server |
| GET | `/api/servers/:id` | Get server details |
| PUT | `/api/servers/:id` | Update server |
| DELETE | `/api/servers/:id` | Delete server |
| POST | `/api/servers/:id/connect` | Initiate connection |
| GET | `/api/servers/:id/logs` | Get connection logs |
| GET | `/api/license` | List license keys |
| POST | `/api/license` | Generate new key |
| POST | `/api/license/verify` | Verify a license key |
| GET | `/api/audit` | Get audit logs |
| POST | `/api/audit` | Create audit log entry |
| POST | `/api/geo` | IP geolocation lookup |
| POST | `/api/seed` | Seed demo data |

## Project Structure

```
ai-arena/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── servers/          # Server CRUD + connect/logs
│   │   │   ├── license/          # License key management
│   │   │   ├── audit/            # Audit trail
│   │   │   ├── geo/              # IP geolocation
│   │   │   ├── seed/             # Demo data seeding
│   │   │   └── route.ts
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Main dashboard
│   │   └── globals.css
│   ├── components/
│   │   ├── agent-setup.tsx       # Agent installer generator (Win + Mac)
│   │   ├── audit-dashboard.tsx   # Security audit trail
│   │   ├── connection-panel.tsx  # Remote session controls
│   │   ├── file-browser.tsx      # Remote file browser
│   │   ├── license-manager.tsx   # License key management UI
│   │   ├── microphone-view.tsx   # Microphone streaming
│   │   ├── remote-desktop.tsx    # Screen sharing
│   │   ├── server-card.tsx       # Server card with geo
│   │   ├── sidebar-nav.tsx       # Navigation sidebar
│   │   ├── stats-overview.tsx    # Dashboard stats
│   │   ├── terminal-emulator.tsx # Terminal session
│   │   ├── webcam-view.tsx       # Webcam streaming
│   │   └── ui/                   # shadcn/ui components
│   └── lib/
│       ├── api-auth.ts           # API key auth + rate limiting
│       ├── db.ts                 # Prisma client
│       ├── store.ts              # Zustand state
│       ├── utils.ts              # Utility functions
│       └── validators.ts         # Zod schemas
├── prisma/
│   └── schema.prisma             # Database schema
├── public/
│   ├── favicon.ico
│   └── logo.png
├── .env.example                  # Environment template
└── package.json
```

## License

Private / Internal Use Only. All rights reserved.
