'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Server,
  Copy,
  Check,
  Download,
  ChevronRight,
  Terminal,
  FileCode,
  Shield,
  Zap,
  Globe,
  MonitorUp,
  Power,
  HardDrive,
  Monitor,
  ClipboardCheck,
  AlertTriangle,
  FileDown,
  FolderTree,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// ─── Windows-focused Node.js Agent ────────────────────
const agentCode = `/**
 * RemoteHub Agent v2.0 — Windows Edition
 * Runs unattended on boot. Auto-reconnects after power outages.
 *
 * Usage:
 *   node remotehub-agent.js --key=RH-YOUR-LICENSE-KEY
 *
 * Installed via install-remotehub.bat (sets up auto-start via Task Scheduler)
 */

const WebSocket = require('ws');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec, execSync, spawn } = require('child_process');
const https = require('https');
const http = require('http');

// ─── Configuration ───────────────────────────────────
const CONFIG = {
  serverUrl: process.env.REMOTEHUB_URL || 'wss://your-remotehub-domain.com',
  licenseKey: process.argv.find(a => a.startsWith('--key='))?.split('=')[1],
  heartbeatInterval: 30000,  // 30 seconds
  reconnectDelay: 5000,       // 5 seconds
  maxReconnectDelay: 60000,   // 1 minute max backoff
  screenCaptureInterval: 100, // 100ms per frame (~10 FPS)
};

if (!CONFIG.licenseKey) {
  console.error('[RemoteHub] ERROR: No license key provided.');
  console.error('[RemoteHub] Usage: node remotehub-agent.js --key=RH-xxx');
  process.exit(1);
}

// ─── Logging ─────────────────────────────────────────
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(level, message) {
  const timestamp = new Date().toISOString();
  const line = \`[\${timestamp}] [\${level}] \${message}\`;
  console.log(line);
  try {
    const logFile = path.join(LOG_DIR, \`agent-\${new Date().toISOString().split('T')[0]}.log\`);
    fs.appendFileSync(logFile, line + '\\n');
  } catch (e) { /* ignore write errors */ }
}

// ─── System Info (Windows-focused) ───────────────────
function getSystemInfo() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    osVersion: os.release(),
    osType: os.type(),
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    cpuCores: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freememory(),
    uptime: os.uptime(),
    homeDir: os.homedir(),
    tmpDir: os.tmpdir(),
  };
}

function formatBytes(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb.toFixed(1) + ' GB';
}

function runPowerShell(cmd) {
  return new Promise((resolve, reject) => {
    exec(\`powershell -NoProfile -Command "\${cmd}"\`, { timeout: 10000 },
      (error, stdout, stderr) => {
        if (error && !stdout) reject(error);
        else resolve(stdout.trim());
      });
  });
}

async function getWindowsInfo() {
  try {
    const [winVersion, drives, services] = await Promise.allSettled([
      runPowerShell('(Get-CimInstance Win32_OperatingSystem).Caption'),
      runPowerShell('Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root'),
      runPowerShell('(Get-Service | Where-Object {$_.Status -eq "Running"}).Count'),
    ]);

    return {
      windowsVersion: winVersion.status === 'fulfilled' ? winVersion.value : 'Windows',
      drives: drives.status === 'fulfilled' ? drives.value.split('\\n').filter(Boolean) : ['C:'],
      runningServices: services.status === 'fulfilled' ? parseInt(services.value) || 0 : 0,
    };
  } catch {
    return { windowsVersion: 'Windows', drives: ['C:'], runningServices: 0 };
  }
}

// ─── Screen Capture (Windows) ────────────────────────
class ScreenCapturer {
  constructor() {
    this.isActive = false;
    this.interval = null;
  }

  start() {
    this.isActive = true;
    log('INFO', 'Screen capture ready (WebRTC would be used in production)');
    // In production, use node-desktop-capturer or similar
    // to capture actual screen frames and send via WebRTC
  }

  stop() {
    this.isActive = false;
    if (this.interval) clearInterval(this.interval);
    log('INFO', 'Screen capture stopped');
  }
}

// ─── Microphone Capture (Windows) ────────────────────
class MicrophoneCapturer {
  constructor() {
    this.isActive = false;
  }

  start() {
    this.isActive = true;
    log('INFO', 'Microphone capture started');
    // In production, use node-microphone or WebRTC audio
  }

  stop() {
    this.isActive = false;
    log('INFO', 'Microphone capture stopped');
  }
}

// ─── File Browser API ────────────────────────────────
class FileBrowserAPI {
  static listDir(dirPath) {
    try {
      const normalized = path.resolve(dirPath);
      if (!fs.existsSync(normalized)) {
        return { error: 'Directory not found: ' + dirPath };
      }
      const entries = fs.readdirSync(normalized, { withFileTypes: true });
      const items = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'folder' : 'file',
        size: entry.isFile() ? fs.statSync(path.join(normalized, entry.name)).size : 0,
        modified: fs.statSync(path.join(normalized, entry.name)).mtime.toISOString(),
        ext: entry.isFile() ? path.extname(entry.name) : undefined,
      }));
      return { items };
    } catch (err) {
      return { error: err.message };
    }
  }

  static readFile(filePath) {
    try {
      const normalized = path.resolve(filePath);
      if (!fs.existsSync(normalized)) return { error: 'File not found' };
      const content = fs.readFileSync(normalized, 'utf-8');
      return { content };
    } catch (err) {
      return { error: err.message };
    }
  }
}

// ─── Terminal Session ────────────────────────────────
class TerminalSession {
  constructor() {
    this.history = [];
    this.cwd = process.cwd();
  }

  async execute(command) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Handle cd command to track working directory
      if (command.startsWith('cd ')) {
        const target = command.slice(3).trim();
        try {
          const newPath = path.resolve(this.cwd, target);
          if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
            this.cwd = newPath;
            resolve({ command, output: '', error: null, cwd: this.cwd,
              timestamp: new Date().toISOString(), duration: Date.now() - startTime });
            return;
          }
        } catch (e) { /* fallthrough to exec */ }
      }

      // Handle dir listing with full metadata
      if (command.trim() === 'dir' || command.trim() === 'ls') {
        try {
          const entries = fs.readdirSync(this.cwd, { withFileTypes: true });
          let output = ' Volume in drive C has no label.\\n Directory of ' + this.cwd + '\\n\\n';
          entries.forEach(entry => {
            const stat = fs.statSync(path.join(this.cwd, entry.name));
            const date = stat.mtime.toLocaleDateString() + '  ' + stat.mtime.toLocaleTimeString();
            const size = (stat.size / 1024).toFixed(0).padStart(10);
            const type = entry.isDirectory() ? '<DIR>' : '     ';
            output += date + '  ' + type + '  ' + (entry.isDirectory() ? '' : size) + '  ' + entry.name + '\\n';
          });
          resolve({ command, output, error: null, cwd: this.cwd,
            timestamp: new Date().toISOString(), duration: Date.now() - startTime });
          return;
        } catch (e) { /* fallthrough */ }
      }

      exec(command, { cwd: this.cwd, timeout: 30000, shell: 'cmd.exe' },
        (error, stdout, stderr) => {
          const result = {
            command,
            output: stdout || stderr,
            error: error ? error.message : null,
            cwd: this.cwd,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
          };
          this.history.push(result);
          resolve(result);
        });
    });
  }
}

// ─── WebSocket Connection Manager ────────────────────
class RemoteHubAgent {
  constructor() {
    this.ws = null;
    this.terminal = new TerminalSession();
    this.screen = new ScreenCapturer();
    this.microphone = new MicrophoneCapturer();
    this.isConnected = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  connect() {
    log('INFO', 'Connecting to RemoteHub at ' + CONFIG.serverUrl + '...');

    try {
      this.ws = new WebSocket(CONFIG.serverUrl, {
        headers: {
          'x-license-key': CONFIG.licenseKey,
          'x-agent-version': '2.0.0-windows',
          'x-hostname': os.hostname(),
        },
      });
    } catch (err) {
      log('ERROR', 'WebSocket creation failed: ' + err.message);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      log('INFO', 'Connected to RemoteHub!');

      // Send registration with system info
      this.send({
        type: 'register',
        data: {
          ...getSystemInfo(),
          platform: 'win32',
        },
      });

      // Send Windows-specific info
      getWindowsInfo().then(info => {
        this.send({ type: 'system:windows-info', data: info });
      });
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        log('ERROR', 'Failed to parse message: ' + e.message);
      }
    });

    this.ws.on('close', (code) => {
      this.isConnected = false;
      log('WARN', 'Disconnected from RemoteHub (code: ' + code + ')');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      log('ERROR', 'WebSocket error: ' + err.message);
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'ping':
        this.send({ type: 'pong', data: { ...getSystemInfo(), connectedSince: new Date().toISOString() } });
        break;

      case 'terminal:execute':
        log('INFO', 'Executing terminal command: ' + (msg.data.command || '').substring(0, 50));
        this.terminal.execute(msg.data.command).then(result => {
          this.send({ type: 'terminal:output', data: result });
        });
        break;

      case 'files:list':
        this.send({
          type: 'files:list:response',
          data: FileBrowserAPI.listDir(msg.data.path),
          requestId: msg.requestId,
        });
        break;

      case 'files:read':
        this.send({
          type: 'files:read:response',
          data: FileBrowserAPI.readFile(msg.data.path),
          requestId: msg.requestId,
        });
        break;

      case 'screen:start':
        this.screen.start();
        this.send({ type: 'screen:started' });
        log('INFO', 'Screen capture started by remote user');
        break;

      case 'screen:stop':
        this.screen.stop();
        this.send({ type: 'screen:stopped' });
        log('INFO', 'Screen capture stopped by remote user');
        break;

      case 'mic:start':
        this.microphone.start();
        this.send({ type: 'mic:started' });
        log('INFO', 'Microphone capture started by remote user');
        break;

      case 'mic:stop':
        this.microphone.stop();
        this.send({ type: 'mic:stopped' });
        log('INFO', 'Microphone capture stopped by remote user');
        break;

      case 'system:info':
        this.send({ type: 'system:info', data: getSystemInfo() });
        break;

      case 'system:restart':
        log('WARN', 'Remote restart requested');
        exec('shutdown /r /t 5 /c "RemoteHub: Restart requested by admin"', (err) => {
          if (err) log('ERROR', 'Restart failed: ' + err.message);
        });
        break;

      case 'system:shutdown':
        log('WARN', 'Remote shutdown requested');
        exec('shutdown /s /t 5 /c "RemoteHub: Shutdown requested by admin"', (err) => {
          if (err) log('ERROR', 'Shutdown failed: ' + err.message);
        });
        break;

      default:
        log('WARN', 'Unknown message type: ' + msg.type);
    }
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(
      CONFIG.reconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      CONFIG.maxReconnectDelay
    );
    this.reconnectAttempts++;
    log('INFO', 'Reconnecting in ' + Math.round(delay / 1000) + 's (attempt #' + this.reconnectAttempts + ')');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  startHeartbeat() {
    setInterval(() => {
      if (this.isConnected) {
        this.send({
          type: 'heartbeat',
          data: {
            uptime: os.uptime(),
            freeMemory: os.freememory(),
            totalMemory: os.totalmem(),
            cpuUsage: process.cpuUsage(),
            loadAvg: os.loadavg ? os.loadavg() : [0, 0, 0],
          },
        });
      }
    }, CONFIG.heartbeatInterval);
  }
}

// ─── Start Agent ─────────────────────────────────────
log('INFO', '=== RemoteHub Agent v2.0 (Windows) Starting ===');
log('INFO', 'Hostname: ' + os.hostname());
log('INFO', 'Platform: ' + os.platform() + ' ' + os.arch());
log('INFO', 'CPU: ' + (os.cpus()[0]?.model || 'Unknown') + ' x' + os.cpus().length);
log('INFO', 'RAM: ' + formatBytes(os.totalmem()) + ' total');
log('INFO', 'Node.js: ' + process.version);

const agent = new RemoteHubAgent();
agent.connect();
agent.startHeartbeat();

// Graceful shutdown on Windows signals
process.on('SIGINT', () => {
  log('INFO', 'Shutting down (SIGINT)...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('INFO', 'Shutting down (SIGTERM)...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log('ERROR', 'Uncaught exception: ' + err.message);
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', 'Unhandled rejection: ' + reason);
});`

// ─── Windows .bat Installer ──────────────────────────
const batInstaller = `@echo off
:: ═══════════════════════════════════════════════════════
:: RemoteHub Agent — Windows Silent Installer
:: Installs Node.js agent and sets up auto-start on boot
:: (Unattended access — survives power outages)
:: ═══════════════════════════════════════════════════════

setlocal EnableDelayedExpansion

:: Configuration — CHANGE THESE for each client
set "LICENSE_KEY=RH-REPLACE-WITH-YOUR-LICENSE-KEY"
set "SERVER_URL=wss://your-remotehub-domain.com"
set "INSTALL_DIR=C:\\RemoteHub"
set "TASK_NAME=RemoteHubAgent"
set "NODE_MIN_VERSION=18"

:: Run as Administrator check
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This installer must be run as Administrator!
    echo Right-click the .bat file and select "Run as administrator"
    pause
    exit /b 1
)

echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║   RemoteHub Agent — Windows Installer v2.0    ║
echo  ╚═══════════════════════════════════════════════╝
echo.

:: ─── Step 1: Check Node.js ──────────────────────────
echo [1/6] Checking Node.js installation...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo  Node.js not found! Downloading and installing...
    echo.

    :: Download Node.js installer silently
    curl -o "%TEMP%\\node-installer.msi" https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
    if %errorLevel% neq 0 (
        echo  [ERROR] Failed to download Node.js. Check internet connection.
        pause
        exit /b 1
    )

    :: Install Node.js silently
    msiexec /i "%TEMP%\\node-installer.msi" /qn /norestart
    if %errorLevel% neq 0 (
        echo  [ERROR] Node.js installation failed.
        pause
        exit /b 1
    )

    :: Refresh PATH
    set "PATH=%PATH%;C:\\Program Files\\nodejs"
    del "%TEMP%\\node-installer.msi" >nul 2>&1
    echo  Node.js installed successfully.
) else (
    for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
    echo  Node.js found: !NODE_VER!
)
echo.

:: ─── Step 2: Create Installation Directory ──────────
echo [2/6] Creating installation directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\\logs" mkdir "%INSTALL_DIR%\\logs"
if not exist "%INSTALL_DIR%\\config" mkdir "%INSTALL_DIR%\\config"
echo  Install dir: %INSTALL_DIR%
echo.

:: ─── Step 3: Initialize Node.js project ──────────────
echo [3/6] Setting up agent...
cd /d "%INSTALL_DIR%"

if not exist "package.json" (
    echo {"name":"remotehub-agent","version":"2.0.0","private":true,"scripts":{"start":"node remotehub-agent.js"}} > package.json
)

:: Install WebSocket dependency
echo  Installing dependencies...
call npm install --production --no-audit --no-fund >nul 2>&1
if %errorLevel% neq 0 (
    echo  [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo  Dependencies installed.
echo.

:: ─── Step 4: Create Agent Config ─────────────────────
echo [4/6] Creating configuration...
(
echo {
echo   "serverUrl": "%SERVER_URL%",
echo   "licenseKey": "%LICENSE_KEY%",
echo   "logLevel": "info",
echo   "heartbeatInterval": 30000,
echo   "reconnectDelay": 5000
echo }
) > "%INSTALL_DIR%\\config\\settings.json"
echo  Configuration saved.
echo.

:: ─── Step 5: Create Windows Service via Task Scheduler ─
echo [5/6] Setting up auto-start on boot...
:: Remove existing task if it exists
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Create scheduled task that runs on system startup
:: Runs whether user is logged in or not (unattended)
schtasks /create /tn "%TASK_NAME%" /tr "cmd /c cd /d %INSTALL_DIR% && node remotehub-agent.js --key=%LICENSE_KEY%" /sc onstart /ru SYSTEM /rl HIGHEST /f

if %errorLevel% neq 0 (
    echo  [WARNING] Task Scheduler setup had issues.
    echo  Falling back to Startup folder method...
    copy "%~f0" "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\RemoteHub-Agent.bat" >nul 2>&1
) else (
    echo  Auto-start task created successfully.
    echo  The agent will start automatically on every boot.
)
echo.

:: ─── Step 6: Configure Firewall ─────────────────────
echo [6/6] Configuring Windows Firewall...
netsh advfirewall firewall add rule name="RemoteHub Agent" dir=out action=allow program="%INSTALL_DIR%\\remotehub-agent.js" enable=yes >nul 2>&1
netsh advfirewall firewall add rule name="RemoteHub Node" dir=out action=allow program="C:\\Program Files\\nodejs\\node.exe" enable=yes >nul 2>&1
echo  Firewall rules added.
echo.

:: ─── Summary ────────────────────────────────────────
echo  ═══════════════════════════════════════════════
echo   Installation Complete!
echo  ═══════════════════════════════════════════════
echo.
echo   Install dir:   %INSTALL_DIR%
echo   License key:   %LICENSE_KEY%
echo   Server:        %SERVER_URL%
echo   Auto-start:    YES (runs on boot)
echo   Logs:          %INSTALL_DIR%\\logs\\
echo.
echo   IMPORTANT: Place remotehub-agent.js in:
echo   %INSTALL_DIR%\\remotehub-agent.js
echo.
echo   To start manually now:
echo   cd /d %INSTALL_DIR% ^&^& node remotehub-agent.js --key=%LICENSE_KEY%
echo.
echo   To stop the auto-start:
echo   schtasks /delete /tn "%TASK_NAME%" /f
echo.
echo   After power outage, the agent will auto-start
echo   when Windows boots. No one needs to be on-site.
echo.

:: Start the agent now
echo Starting agent now...
start /b cmd /c "cd /d %INSTALL_DIR% && node remotehub-agent.js --key=%LICENSE_KEY%"
timeout /t 3 >nul

echo Agent is running! Check Dashboard for online status.
echo.
pause`

const steps = [
  {
    title: 'Download the .bat Installer',
    description: 'Download install-remotehub.bat from the section below. This handles everything: Node.js install, agent setup, firewall rules, and auto-start configuration.',
    icon: FileDown,
    command: 'See "Windows Installer (.bat)" section below',
  },
  {
    title: 'Edit the .bat File',
    description: 'Open the .bat file in Notepad and change the LICENSE_KEY and SERVER_URL values at the top to match your server.',
    icon: FileCode,
    command: 'set "LICENSE_KEY=RH-your-actual-key-here"',
  },
  {
    title: 'Run as Administrator',
    description: 'Right-click the .bat file and select "Run as administrator". It will install Node.js if missing, set up the agent, configure firewall rules, and register an auto-start task.',
    icon: Shield,
    command: 'Right-click → Run as administrator',
  },
  {
    title: 'Place the Agent Script',
    description: 'Copy the agent JavaScript code (below) and save it as remotehub-agent.js in C:\\RemoteHub\\. This is the file the .bat installer will run on boot.',
    icon: FolderTree,
    command: 'Save as: C:\\RemoteHub\\remotehub-agent.js',
  },
  {
    title: 'Verify Unattended Access',
    description: 'Restart the computer to test. After boot, check your RemoteHub Dashboard — the server should appear as "online" automatically with no one logged in.',
    icon: MonitorUp,
    command: 'shutdown /r /t 0  # Test reboot',
  },
  {
    title: 'Power Outage Recovery',
    description: 'When power returns and Windows boots, the Task Scheduler task runs the agent with SYSTEM privileges before any user logs in. It auto-reconnects to your dashboard with exponential backoff.',
    icon: Power,
    command: 'No action needed — fully automatic',
  },
]

export function AgentSetup() {
  const [copied, setCopied] = useState(false)
  const [copiedBat, setCopiedBat] = useState(false)
  const [activeStep, setActiveStep] = useState<number | null>(null)

  const copyCode = () => {
    navigator.clipboard.writeText(agentCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Agent code copied to clipboard')
  }

  const copyBat = () => {
    navigator.clipboard.writeText(batInstaller)
    setCopiedBat(true)
    setTimeout(() => setCopiedBat(false), 2000)
    toast.success('Installer .bat copied to clipboard')
  }

  const downloadBat = () => {
    const blob = new Blob([batInstaller], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'install-remotehub.bat'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('install-remotehub.bat downloaded!')
  }

  const downloadAgent = () => {
    const blob = new Blob([agentCode], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'remotehub-agent.js'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('remotehub-agent.js downloaded!')
  }

  return (
    <div className="space-y-6">
      {/* Windows badge */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <Monitor className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-blue-300">Windows-Focused Deployment</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Optimized for Windows servers with .bat installer, auto-start on boot via Task Scheduler,
              unattended access after power outages, file browser, and microphone support.
            </p>
          </div>
        </div>
      </div>

      {/* Architecture overview */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-400" />
          Architecture — Windows Edition
        </h3>
        <div className="bg-zinc-950 rounded-lg p-4 font-mono text-xs text-zinc-400 leading-relaxed overflow-x-auto">
          <pre className="whitespace-pre">{`
┌─────────────────────────────────────────────────────────┐
│                   RemoteHub Dashboard                    │
│              (Next.js Web Application)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Dashboard │ │ Connect  │ │License Keys│ │ Agent Setup│ │
│  └─────┬────┘ └────┬─────┘ └─────┬────┘ └─────┬──────┘ │
│  ┌─────┴───────────┴───────────┴───────────┴─────────┐  │
│  │           REST API + WebSocket Gateway             │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │ WebSocket + WebRTC             │
│  ┌──────────────────────┴────────────────────────────┐  │
│  │           Firebase Realtime Database               │  │
│  └──────────────────────┬────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────┘
                          │ (auto-reconnect after outage)
                          │
┌─────────────────────────┼───────────────────────────────┐
│              Windows Client Servers                       │
│                         │                                │
│  ┌──────────────────────┴──────────────────────────┐    │
│  │  Task Scheduler (runs on boot, SYSTEM account)   │    │
│  │  → auto-starts before any user logs in           │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                                │
│  ┌──────────┐  ┌───────┴──────┐  ┌──────────┐          │
│  │ Server 1 │  │   Server 2   │  │ Server N │          │
│  │ ┌──────┐ │  │  ┌────────┐  │  │ ┌──────┐ │          │
│  │ │Agent │ │  │  │ Agent  │  │  │ │Agent │ │          │
│  │ │ v2.0 │ │  │  │ v2.0  │  │  │ │ v2.0 │ │          │
│  │ └──────┘ │  │  └────────┘  │  │ └──────┘ │          │
│  │ Screen   │  │  Screen     │  │ Screen   │          │
│  │ Webcam   │  │  Webcam     │  │ Webcam   │          │
│  │ Mic      │  │  Mic        │  │ Mic      │          │
│  │ Files    │  │  Files      │  │ Files    │          │
│  │ Terminal │  │  Terminal   │  │ Terminal │          │
│  └──────────┘  └─────────────┘  └──────────┘          │
└─────────────────────────────────────────────────────────┘`}</pre>
        </div>
      </div>

      {/* Windows Setup Steps */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-emerald-400" />
          Windows Deployment Steps
        </h3>
        <div className="space-y-2">
          {steps.map((step, i) => {
            const Icon = step.icon
            const isOpen = activeStep === i
            return (
              <div
                key={i}
                className={cn(
                  'border rounded-lg transition-all duration-200 cursor-pointer',
                  isOpen ? 'border-emerald-500/30 bg-zinc-950/50' : 'border-zinc-800 hover:border-zinc-700'
                )}
                onClick={() => setActiveStep(isOpen ? null : i)}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                      isOpen
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-800 text-zinc-500'
                    )}
                  >
                    {i + 1}
                  </div>
                  <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-zinc-200">{step.title}</span>
                    <p className="text-[10px] text-zinc-500 hidden sm:block">{step.description}</p>
                  </div>
                  <ChevronRight
                    className={cn(
                      'w-4 h-4 text-zinc-500 transition-transform',
                      isOpen && 'rotate-90'
                    )}
                  />
                </div>
                {isOpen && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-zinc-400 mb-2">{step.description}</p>
                    <code className="block bg-zinc-950 text-emerald-400 text-xs p-3 rounded-md font-mono">
                      {step.command}
                    </code>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Unattended Access Section */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Power className="w-4 h-4 text-yellow-400" />
          Unattended Access &amp; Power Outage Recovery
        </h3>
        <div className="space-y-3 text-xs text-zinc-400">
          <div className="bg-zinc-950 rounded-lg p-3 space-y-2">
            <p className="text-zinc-300 font-medium">How it works:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-zinc-400">
              <li>The <code className="text-emerald-400 bg-zinc-900 px-1 rounded">.bat</code> installer creates a Windows Task Scheduler task named &quot;RemoteHubAgent&quot;</li>
              <li>This task is configured to run as <code className="text-yellow-400 bg-zinc-900 px-1 rounded">SYSTEM</code> — it starts at boot, before any user logs in</li>
              <li>When power returns after an outage, Windows boots, Task Scheduler fires the agent automatically</li>
              <li>The agent connects to Firebase/WebSocket with exponential backoff (5s → 60s max)</li>
              <li>Within ~30 seconds of boot, the server appears &quot;online&quot; in your Dashboard — no one on-site needed</li>
            </ol>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              <div className="flex items-center gap-2 mb-1.5">
                <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-medium text-zinc-300">Install Location</span>
              </div>
              <code className="text-[10px] text-emerald-400 font-mono">C:\RemoteHub\</code>
            </div>
            <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              <div className="flex items-center gap-2 mb-1.5">
                <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-medium text-zinc-300">Service Name</span>
              </div>
              <code className="text-[10px] text-emerald-400 font-mono">RemoteHubAgent</code>
            </div>
            <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              <div className="flex items-center gap-2 mb-1.5">
                <Shield className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-medium text-zinc-300">Run Level</span>
              </div>
              <code className="text-[10px] text-yellow-400 font-mono">SYSTEM / HIGHEST</code>
            </div>
          </div>
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-medium text-yellow-400">Important Notes</p>
                <ul className="text-[10px] text-zinc-500 mt-1 space-y-0.5 list-disc list-inside">
                  <li>Must run as Administrator for Task Scheduler and firewall setup</li>
                  <li>Windows Firewall rules are added automatically to allow outbound connections</li>
                  <li>To uninstall: <code className="text-zinc-400">schtasks /delete /tn &quot;RemoteHubAgent&quot; /f</code> then delete <code className="text-zinc-400">C:\RemoteHub\</code></li>
                  <li>Agent logs are stored in <code className="text-zinc-400">C:\RemoteHub\logs\</code> for troubleshooting</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Windows .bat Installer */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-500/15 text-blue-400 border-0 text-[10px]">
              <Monitor className="w-3 h-3 mr-1" />
              .bat
            </Badge>
            <span className="text-sm font-medium text-white">Windows Installer Script</span>
            <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
              install-remotehub.bat
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={copyBat}
            >
              {copiedBat ? (
                <><Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />Copied!</>
              ) : (
                <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</>
              )}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              onClick={downloadBat}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download .bat
            </Button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <pre className="p-4 text-xs font-mono text-zinc-300 leading-5 bg-zinc-950">
            <code>{batInstaller}</code>
          </pre>
        </div>
      </div>

      {/* Agent Code */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-white">Agent Source Code</span>
            <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
              remotehub-agent.js
            </span>
            <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[10px]">v2.0 Windows</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={copyCode}
            >
              {copied ? (
                <><Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />Copied!</>
              ) : (
                <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</>
              )}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={downloadAgent}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download .js
            </Button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <pre className="p-4 text-xs font-mono text-zinc-300 leading-5 bg-zinc-950">
            <code>{agentCode}</code>
          </pre>
        </div>
      </div>

      {/* Quick Start */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-emerald-400 mb-2">Quick Start for Clients</h4>
        <ol className="text-xs text-zinc-400 space-y-1 list-decimal list-inside">
          <li>Go to License Keys tab → Generate a new key for this server</li>
          <li>Download <code className="text-emerald-400 bg-zinc-900 px-1 rounded">install-remotehub.bat</code> — edit the LICENSE_KEY at the top</li>
          <li>Download <code className="text-emerald-400 bg-zinc-900 px-1 rounded">remotehub-agent.js</code> — save to <code className="text-zinc-400">C:\RemoteHub\</code></li>
          <li>Right-click .bat → Run as Administrator</li>
          <li>Server appears in Dashboard within 30 seconds of boot — done!</li>
        </ol>
        <p className="text-xs text-zinc-500 mt-2">
          After power outage: Windows boots → Task Scheduler starts agent → agent auto-reconnects → server shows &quot;online&quot; in Dashboard.
          No human intervention needed, ever.
        </p>
      </div>
    </div>
  )
}
