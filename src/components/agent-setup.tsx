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
  Apple,
  Wifi,
  WifiOff,
  Moon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// ─── Cross-Platform Agent (Windows + macOS) ──────
const agentCode = `/**
 * Ai-Arena Agent v3.0 — Cross-Platform (Windows + macOS)
 *
 * KEY BEHAVIORS:
 * 1. LIES DORMANT: Uses Firebase server-push (onChildAdded). The agent does NOT poll.
 *    Firebase pushes commands instantly when they arrive. Between commands, the agent
 *    only sends a tiny heartbeat every 30s (~200 bytes). This saves bandwidth.
 *
 * 2. ONLINE/OFFLINE TRACKING: Uses Firebase onDisconnect() so if the computer crashes,
 *    loses internet, or loses power, Firebase AUTOMATICALLY marks the agent as "offline"
 *    within ~30 seconds. No polling needed.
 *
 * 3. CROSS-PLATFORM: Auto-detects Windows vs macOS and uses the right shell commands.
 *
 * Usage:
 *   node ai-arena-agent.js --key=AI-YOUR-LICENSE-KEY
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

// ─── Detect Platform ──────────────────────────────
const IS_WIN = os.platform() === 'win32';
const IS_MAC = os.platform() === 'darwin';
const IS_LINUX = os.platform() === 'linux';
const PLATFORM = IS_WIN ? 'Windows' : IS_MAC ? 'macOS' : IS_LINUX ? 'Linux' : os.platform();

// ─── Configuration ─────────────────────────────────
const CONFIG = {
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
  heartbeatInterval: 30000,  // 30s heartbeat (~200 bytes, very minimal)
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

// ─── System Info (Cross-Platform) ───────────────────
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
    platformLabel: PLATFORM,
  };
}

function formatBytes(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return bytes + ' bytes';
}

// ─── Platform-Specific Command Runner ────────────────
function runCommand(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    const shell = IS_WIN ? 'cmd.exe' : '/bin/bash';
    exec(cmd, { timeout: 10000, shell, ...options },
      (error, stdout, stderr) => {
        if (error && !stdout) reject(error);
        else resolve(stdout.trim());
      });
  });
}

async function getPlatformInfo() {
  if (IS_WIN) {
    try {
      const runPS = (c) => runCommand(\`powershell -NoProfile -Command "\${c}"\`);
      const [winVersion, drives, services] = await Promise.allSettled([
        runPS('(Get-CimInstance Win32_OperatingSystem).Caption'),
        runPS('Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root'),
        runPS('(Get-Service | Where-Object {$_.Status -eq "Running"}).Count'),
      ]);
      return {
        platformLabel: 'Windows',
        windowsVersion: winVersion.status === 'fulfilled' ? winVersion.value : 'Windows',
        drives: drives.status === 'fulfilled' ? drives.value.split('\\n').filter(Boolean) : ['C:'],
        runningServices: services.status === 'fulfilled' ? parseInt(services.value) || 0 : 0,
      };
    } catch {
      return { platformLabel: 'Windows', windowsVersion: 'Windows', drives: ['C:'], runningServices: 0 };
    }
  } else if (IS_MAC) {
    try {
      const [macVersion, diskInfo] = await Promise.allSettled([
        runCommand('sw_vers -productVersion'),
        runCommand('df -h / | tail -1'),
      ]);
      return {
        platformLabel: 'macOS',
        macVersion: macVersion.status === 'fulfilled' ? macVersion.value : 'macOS',
        diskInfo: diskInfo.status === 'fulfilled' ? diskInfo.value : '',
      };
    } catch {
      return { platformLabel: 'macOS', macVersion: 'macOS', diskInfo: '' };
    }
  }
  return { platformLabel: PLATFORM };
}

// ─── Screen Capture ────────────────────────────────
class ScreenCapturer {
  constructor() { this.isActive = false; this.interval = null; }
  start() { this.isActive = true; log('INFO', 'Screen capture ready'); }
  stop() { this.isActive = false; if (this.interval) clearInterval(this.interval); log('INFO', 'Screen capture stopped'); }
}

// ─── Microphone Capture ────────────────────────────
class MicrophoneCapturer {
  constructor() { this.isActive = false; }
  start() { this.isActive = true; log('INFO', 'Microphone capture started'); }
  stop() { this.isActive = false; log('INFO', 'Microphone capture stopped'); }
}

// ─── Keystroke Capture (Cross-Platform) ──────────
class KeystrokeCapturer {
  constructor() {
    this.isActive = false;
    this.buffer = [];
    this.flushTimer = null;
    this.firebaseDb = null;
    this.licenseKey = null;
    this.maxBufferSize = 200;
  }

  start(firebaseDb, licenseKey) {
    this.firebaseDb = firebaseDb;
    this.licenseKey = licenseKey;
    this.isActive = true;
    this.buffer = [];
    log('INFO', 'Keystroke capture started');

    // Windows: Monitor PowerShell command history and clipboard
    if (IS_WIN) {
      this.startWindowsCapture();
    }
    // macOS/Linux: Monitor bash history and active processes
    if (IS_MAC || !IS_WIN) {
      this.startUnixCapture();
    }

    // Flush captured keystrokes to Firebase every 10 seconds
    this.flushTimer = setInterval(() => this.flush(), 10000);
  }

  startWindowsCapture() {
    // Monitor PowerShell ReadLine history (captures typed commands)
    setInterval(() => {
      try {
        const psCmd = 'powershell -NoProfile -Command "try { Get-Content (Join-Path $env:APPDATA Microsoft\\\\Windows\\\\PowerShell\\\\PSReadLine\\\\ConsoleHost_history.txt) -Tail 5 -ErrorAction SilentlyContinue } catch {}"';
        exec(psCmd, { timeout: 5000 }, (err, stdout) => {
          if (!err && stdout && stdout.trim()) {
            stdout.trim().split('\\n').forEach(line => {
              if (line.trim()) {
                this.capture(line.trim(), 'PowerShell', 'powershell.exe');
              }
            });
          }
        });
      } catch (e) { /* ignore */ }
    }, 8000);

    // Monitor cmd.exe DosKey history
    setInterval(() => {
      try {
        exec('doskey /history', { timeout: 3000, shell: 'cmd.exe' }, (err, stdout) => {
          if (!err && stdout) {
            const lines = stdout.trim().split('\\n').filter(l => l.trim().length > 2);
            const recent = lines.slice(-3);
            recent.forEach(line => {
              if (line.trim()) {
                this.capture(line.trim(), 'Command Prompt', 'cmd.exe');
              }
            });
          }
        });
      } catch (e) { /* ignore */ }
    }, 12000);
  }

  startUnixCapture() {
    // Monitor bash/zsh history
    const historyFiles = [
      path.join(os.homedir(), '.bash_history'),
      path.join(os.homedir(), '.zsh_history'),
    ];
    const lastSizes = {};
    historyFiles.forEach(f => { lastSizes[f] = 0; });

    setInterval(() => {
      historyFiles.forEach(hFile => {
        try {
          if (!fs.existsSync(hFile)) return;
          const stat = fs.statSync(hFile);
          if (stat.size > lastSizes[hFile]) {
            const content = fs.readFileSync(hFile, 'utf-8');
            const lines = content.split('\\n').filter(l => l.trim());
            const newLines = lines.slice(Math.max(0, lines.length - 5));
            newLines.forEach(line => {
              // zsh history format: : timestamp:0;command
              const cleaned = line.replace(/^:\\s*\\d+:\\d;/, '').trim();
              if (cleaned && cleaned.length > 1) {
                this.capture(cleaned, 'Terminal', IS_MAC ? 'zsh' : 'bash');
              }
            });
            lastSizes[hFile] = stat.size;
          }
        } catch (e) { /* ignore */ }
      });
    }, 10000);
  }

  capture(text, windowTitle, processName) {
    if (!this.isActive) return;
    // Skip duplicates and very short entries
    if (text.length < 2) return;
    const lastEntry = this.buffer[this.buffer.length - 1];
    if (lastEntry && lastEntry.text === text) return;

    this.buffer.push({
      text,
      windowTitle,
      processName,
      username: process.env.USERNAME || process.env.USER || os.userInfo().username || 'Unknown',
      hostname: os.hostname(),
      eventType: 'command',
      timestamp: new Date().toISOString(),
    });

    if (this.buffer.length > this.maxBufferSize) {
      this.buffer = this.buffer.slice(-Math.floor(this.maxBufferSize / 2));
    }
  }

  async flush() {
    if (this.buffer.length === 0 || !this.firebaseDb) return;
    const entries = [...this.buffer];
    this.buffer = [];
    try {
      const { ref, set } = require('firebase/database');
      for (const entry of entries) {
        const key = 'keys_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        await set(ref(this.firebaseDb, 'keystrokes/' + this.licenseKey + '/' + key), entry);
      }
      log('INFO', 'Flushed ' + entries.length + ' keystroke entries to Firebase');
    } catch (e) {
      this.buffer = [...entries, ...this.buffer];
      log('WARN', 'Keystroke flush failed: ' + e.message);
    }
  }

  async getCaptured() {
    const result = [...this.buffer];
    this.buffer = [];
    return result;
  }

  stop() {
    this.isActive = false;
    if (this.flushTimer) clearInterval(this.flushTimer);
    // Final flush
    if (this.buffer.length > 0 && this.firebaseDb) {
      this.flush().then(() => log('INFO', 'Keystroke capture stopped, final flush done'));
    } else {
      log('INFO', 'Keystroke capture stopped');
    }
  }
}

// ─── File Browser API (Cross-Platform) ────────────
class FileBrowserAPI {
  static listDir(dirPath) {
    try {
      const normalized = path.resolve(dirPath);
      if (!fs.existsSync(normalized)) return { error: 'Directory not found: ' + dirPath };
      const entries = fs.readdirSync(normalized, { withFileTypes: true });
      const items = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'folder' : 'file',
        size: entry.isFile() ? fs.statSync(path.join(normalized, entry.name)).size : 0,
        modified: fs.statSync(path.join(normalized, entry.name)).mtime.toISOString(),
        ext: entry.isFile() ? path.extname(entry.name) : undefined,
      }));
      return { items };
    } catch (err) { return { error: err.message }; }
  }

  static readFile(filePath) {
    try {
      const normalized = path.resolve(filePath);
      if (!fs.existsSync(normalized)) return { error: 'File not found' };
      const stat = fs.statSync(normalized);
      // For text files under 1MB, return content as string
      if (stat.size < 1048576) {
        return { content: fs.readFileSync(normalized, 'utf-8'), size: stat.size };
      }
      // For larger files, return as base64
      return { content: fs.readFileSync(normalized).toString('base64'), size: stat.size, encoding: 'base64' };
    } catch (err) { return { error: err.message }; }
  }

  static writeFile(filePath, content, encoding = 'utf-8') {
    try {
      const normalized = path.resolve(filePath);
      const dir = path.dirname(normalized);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (encoding === 'base64') {
        fs.writeFileSync(normalized, Buffer.from(content, 'base64'));
      } else {
        fs.writeFileSync(normalized, content, 'utf-8');
      }
      return { success: true, path: normalized, size: fs.statSync(normalized).size };
    } catch (err) { return { error: err.message }; }
  }

  static deleteItem(itemPath) {
    try {
      const normalized = path.resolve(itemPath);
      if (!fs.existsSync(normalized)) return { error: 'Path not found: ' + itemPath };
      const stat = fs.statSync(normalized);
      if (stat.isDirectory()) {
        fs.rmSync(normalized, { recursive: true, force: true });
      } else {
        fs.unlinkSync(normalized);
      }
      return { success: true, deleted: normalized };
    } catch (err) { return { error: err.message }; }
  }

  static createFolder(folderPath) {
    try {
      const normalized = path.resolve(folderPath);
      if (!fs.existsSync(normalized)) {
        fs.mkdirSync(normalized, { recursive: true });
        return { success: true, path: normalized };
      }
      return { error: 'Folder already exists' };
    } catch (err) { return { error: err.message }; }
  }
}

// ─── Terminal Session (Cross-Platform) ────────────
class TerminalSession {
  constructor() {
    this.history = [];
    this.cwd = process.cwd();
    this.shell = IS_WIN ? 'cmd.exe' : '/bin/bash';
  }

  async execute(command) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Handle cd command
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
        } catch (e) { /* fallthrough */ }
      }

      // Handle dir listing
      if (command.trim() === 'dir' || command.trim() === 'ls') {
        try {
          const entries = fs.readdirSync(this.cwd, { withFileTypes: true });
          let output = ' Directory of ' + this.cwd + '\\n\\n';
          entries.forEach(entry => {
            const stat = fs.statSync(path.join(this.cwd, entry.name));
            const size = formatBytes(stat.size).padStart(12);
            const type = entry.isDirectory() ? '<DIR>' : '     ';
            output += stat.mtime.toISOString() + '  ' + type + '  ' + (entry.isDirectory() ? '' : size) + '  ' + entry.name + '\\n';
          });
          resolve({ command, output, error: null, cwd: this.cwd,
            timestamp: new Date().toISOString(), duration: Date.now() - startTime });
          return;
        } catch (e) { /* fallthrough */ }
      }

      exec(command, { cwd: this.cwd, timeout: 30000, shell: this.shell },
        (error, stdout, stderr) => {
          const result = {
            command, output: stdout || stderr,
            error: error ? error.message : null, cwd: this.cwd,
            timestamp: new Date().toISOString(), duration: Date.now() - startTime,
          };
          this.history.push(result);
          resolve(result);
        });
    });
  }
}

// ─── Activity Audit System ────────────────────────────
class ActivityAudit {
  constructor() {
    this.buffer = [];
    this.flushInterval = 15000;
    this.firebaseDb = null;
    this.licenseKey = null;
  }

  log(eventType, data) {
    this.buffer.push({
      eventType,
      username: process.env.USERNAME || process.env.USER || os.userInfo().username || 'Unknown',
      hostname: os.hostname(),
      command: data.command || null,
      windowTitle: data.windowTitle || null,
      processName: data.processName || null,
      keysLogged: data.keysLogged || null,
      timestamp: new Date().toISOString(),
    });
    if (this.buffer.length > 500) this.buffer = this.buffer.slice(-250);
  }

  // Windows: Enable PowerShell Script Block Logging
  enablePSEventLogging() {
    if (!IS_WIN) return;
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

  // Windows: Monitor logon events
  startLogonMonitor() {
    if (!IS_WIN) return;
    setInterval(() => {
      exec('powershell -NoProfile -Command "try { Get-WinEvent -FilterHashtable @{LogName=\\\"Security\\\";Id=4624,4634} -MaxEvents 5 -ErrorAction SilentlyContinue | ForEach-Object { $x=[xml]$_.ToXml(); $u=$x.Event.EventData.Data | Where-Object {$_.Name -eq \\"TargetUserName\\"} | Select -ExpandProperty #text; $l=$x.Event.EventData.Data | Where-Object {$_.Name -eq \\"LogonType\\"} | Select -ExpandProperty #text; Write-Output \\\"$($_.Id)|$u|$l|$($_.TimeCreated)\\\" } } catch {}"',
        { timeout: 15000 }, (err, stdout) => {
          if (!err && stdout && stdout.trim()) {
            stdout.trim().split('\\n').forEach(line => {
              const parts = line.split('|');
              if (parts[0] === '4624' && parts[1] && parts[1] !== '-') {
                this.log('login', { command: 'Logon Type ' + (parts[2] || 'unknown'), windowTitle: 'Windows Logon', processName: 'logonui.exe' });
                log('INFO', 'User login detected: ' + parts[1]);
              }
            });
          }
        });
    }, 45000);
  }

  // macOS: Monitor login events via last/log
  startMacLoginMonitor() {
    if (!IS_MAC) return;
    setInterval(() => {
      exec('last -10 2>/dev/null', { timeout: 10000 }, (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.trim().split('\\n');
          if (lines.length > 0) {
            this.log('login', { command: 'macOS login check', windowTitle: 'macOS Login', processName: 'loginwindow' });
          }
        }
      });
    }, 60000);
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
    if (IS_WIN) {
      this.enablePSEventLogging();
      this.startLogonMonitor();
    } else if (IS_MAC) {
      this.startMacLoginMonitor();
    }
    setInterval(() => this.flush(), this.flushInterval);
    log('INFO', 'Activity audit system started (' + PLATFORM + ')');
  }
}

// ─── Firebase Connection Manager (Firebase-First) ────────────
class AiArenaAgent {
  constructor() {
    this.terminal = new TerminalSession();
    this.screen = new ScreenCapturer();
    this.microphone = new MicrophoneCapturer();
    this.keystrokes = new KeystrokeCapturer();
    this.audit = new ActivityAudit();
    this.isConnected = false;
    this.agentRef = null;
    this.commandsRef = null;
    this.heartbeatTimer = null;
    this.reconnectAttempt = 0;
  }

  async connect() {
    log('INFO', 'Initializing Firebase connection...');
    log('INFO', 'Platform: ' + PLATFORM + ' (' + os.arch() + ')');
    log('INFO', 'Firebase Project: ' + (CONFIG.firebaseConfig.projectId || 'Not configured'));

    try {
      const { initializeApp } = require('firebase/app');
      const { getDatabase, ref, set, onValue, push, off, update, onChildAdded, onDisconnect, remove, serverTimestamp } = require('firebase/database');

      const app = initializeApp(CONFIG.firebaseConfig);
      const database = getDatabase(app);

      this.agentRef = ref(database, 'agents/' + CONFIG.licenseKey);
      this.agentDb = database;

      // ═══════════════════════════════════════════════════════
      // ON-LINE STATUS: Register agent as online
      // ═══════════════════════════════════════════════════════
      await set(this.agentRef, {
        status: 'online',
        systemInfo: getSystemInfo(),
        connectedAt: new Date().toISOString(),
        licenseKey: CONFIG.licenseKey,
        platform: PLATFORM,
      });

      // ═══════════════════════════════════════════════════════
      // OFF-LINE TRACKING: onDisconnect — THIS IS THE MAGIC
      // If the computer crashes, loses power, or internet drops,
      // Firebase automatically sets status to "offline" within ~30s.
      // No polling needed. The dashboard can listen to this change.
      // ═══════════════════════════════════════════════════════
      const statusRef = ref(database, 'agents/' + CONFIG.licenseKey + '/status');
      await onDisconnect(statusRef).set('offline');
      log('INFO', 'onDisconnect handler set — Firebase will auto-mark offline if connection drops');

      // Also set lastHeartbeat on disconnect so dashboard knows when it went offline
      const hbRef = ref(database, 'agents/' + CONFIG.licenseKey + '/lastHeartbeat');
      await onDisconnect(hbRef).set(serverTimestamp());
      const disconnAtRef = ref(database, 'agents/' + CONFIG.licenseKey + '/disconnectedAt');
      await onDisconnect(disconnAtRef).set(serverTimestamp());

      // Send platform-specific info
      const platformInfo = await getPlatformInfo();
      await update(this.agentRef, { platformInfo });

      this.isConnected = true;
      this.reconnectAttempt = 0;
      log('INFO', 'Connected to Firebase! Agent is ONLINE and dormant.');

      // ═══════════════════════════════════════════════════════
      // DORMANT MODE: Listen for commands via server-push
      // Firebase uses persistent WebSocket + server-push.
      // The agent does NOT poll. It sleeps until Firebase pushes
      // a new command. This saves bandwidth — only the heartbeat
      // (~200 bytes every 30s) is sent when idle.
      // ═══════════════════════════════════════════════════════
      this.listenForCommands();

      // Start heartbeat (tiny payload, 30s interval)
      this.startHeartbeat();

      // Start activity audit
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
        log('INFO', 'Command received (waking up): ' + command.type);
        await this.handleCommand(command);
        await remove(snapshot.ref);
        log('INFO', 'Command processed, returning to dormant state');
      }
    });
  }

  async handleCommand(command) {
    const { ref, set } = require('firebase/database');
    const resultRef = ref(this.agentDb, 'agents/' + CONFIG.licenseKey + '/results/' + Date.now());

    switch (command.type) {
      case 'terminal:execute':
        log('INFO', 'Executing: ' + (command.data.command || '').substring(0, 80));
        this.audit.log('command', {
          command: command.data.command,
          windowTitle: 'Remote Terminal (Ai-Arena)',
          processName: IS_WIN ? 'cmd.exe' : '/bin/bash',
        });
        const result = await this.terminal.execute(command.data.command);
        await set(resultRef, { type: 'terminal:output', data: result });
        break;

      case 'files:list':
        await set(resultRef, { type: 'files:list:response', data: FileBrowserAPI.listDir(command.data.path), requestId: command.requestId });
        break;

      case 'files:read':
        await set(resultRef, { type: 'files:read:response', data: FileBrowserAPI.readFile(command.data.path), requestId: command.requestId });
        break;

      case 'screen:start':
        this.screen.start();
        await set(resultRef, { type: 'screen:started' });
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
        await set(resultRef, { type: 'system:info', data: { ...getSystemInfo(), ...(await getPlatformInfo()) } });
        break;

      case 'system:restart':
        log('WARN', 'Remote restart requested');
        if (IS_WIN) exec('shutdown /r /t 5 /c "Ai-Arena: Restart requested by admin"');
        else if (IS_MAC) exec('sudo shutdown -r +1 "Ai-Arena: Restart requested by admin"');
        else exec('sudo reboot');
        break;

      case 'system:shutdown':
        log('WARN', 'Remote shutdown requested');
        if (IS_WIN) exec('shutdown /s /t 5 /c "Ai-Arena: Shutdown requested by admin"');
        else if (IS_MAC) exec('sudo shutdown -h +1 "Ai-Arena: Shutdown requested by admin"');
        else exec('sudo shutdown -h now');
        break;

      case 'keys:start':
        this.keystrokes.start(this.agentDb, CONFIG.licenseKey);
        await set(resultRef, { type: 'keys:started' });
        break;

      case 'keys:stop':
        await this.keystrokes.stop();
        await set(resultRef, { type: 'keys:stopped' });
        break;

      case 'keys:flush':
        const captured = await this.keystrokes.getCaptured();
        await set(resultRef, { type: 'keys:flush:response', data: { entries: captured } });
        break;

      case 'files:upload':
        const uploadResult = FileBrowserAPI.writeFile(
          command.data.path,
          command.data.content,
          command.data.encoding || 'utf-8'
        );
        this.audit.log('file_upload', { command: 'Upload to ' + command.data.path, windowTitle: 'Ai-Arena File Browser', processName: 'ai-arena-agent' });
        await set(resultRef, { type: 'files:upload:response', data: uploadResult });
        break;

      case 'files:download':
        const dlResult = FileBrowserAPI.readFile(command.data.path);
        this.audit.log('file_download', { command: 'Download from ' + command.data.path, windowTitle: 'Ai-Arena File Browser', processName: 'ai-arena-agent' });
        await set(resultRef, { type: 'files:download:response', data: dlResult });
        break;

      case 'files:delete':
        const delResult = FileBrowserAPI.deleteItem(command.data.path);
        this.audit.log('file_delete', { command: 'Delete ' + command.data.path, windowTitle: 'Ai-Arena File Browser', processName: 'ai-arena-agent' });
        await set(resultRef, { type: 'files:delete:response', data: delResult });
        break;

      case 'files:mkdir':
        const mkdirResult = FileBrowserAPI.createFolder(command.data.path);
        await set(resultRef, { type: 'files:mkdir:response', data: mkdirResult });
        break;
    }
  }

  scheduleReconnect() {
    this.reconnectAttempt++;
    const delay = Math.min(CONFIG.reconnectDelay * Math.pow(1.5, this.reconnectAttempt - 1), CONFIG.maxReconnectDelay);
    log('INFO', 'Reconnecting in ' + (delay / 1000) + 's (attempt ' + this.reconnectAttempt + ')...');
    setTimeout(() => this.connect(), delay);
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
log('INFO', '=== Ai-Arena Agent v3.0 (' + PLATFORM + ') Starting ===');
log('INFO', 'Hostname: ' + os.hostname());
log('INFO', 'Platform: ' + PLATFORM + ' ' + os.arch());
log('INFO', 'CPU: ' + (os.cpus()[0]?.model || 'Unknown') + ' x' + os.cpus().length);
log('INFO', 'RAM: ' + formatBytes(os.totalmem()) + ' total');
log('INFO', 'Node.js: ' + process.version);
log('INFO', 'Mode: Dormant (server-push via Firebase, wakes on command)');

const agent = new AiArenaAgent();
agent.connect();

process.on('SIGINT', () => { log('INFO', 'Shutting down (SIGINT)...'); process.exit(0); });
process.on('SIGTERM', () => { log('INFO', 'Shutting down (SIGTERM)...'); process.exit(0); });
process.on('uncaughtException', (err) => { log('ERROR', 'Uncaught exception: ' + err.message); });
process.on('unhandledRejection', (reason) => { log('ERROR', 'Unhandled rejection: ' + reason); });`

// ─── Windows .bat Installer ──────────────────────────
const batInstaller = `@echo off
:: ═══════════════════════════════════════════════════════
:: Ai-Arena Agent v3.0 — Windows Self-Installing Agent
:: Cross-platform: Also works with macOS (.sh script)
:: Firebase-first: all communication via trusted Firebase
:: Dormant: agent sleeps until command, onDisconnect tracks online status
:: ═══════════════════════════════════════════════════════

:: ─── Self-Elevation ──
>nul 2>&1 "%SYSTEMROOT%\\system32\\cacls.exe" "%SYSTEMROOT%\\system32\\config\\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [OK] Running with administrator privileges.
setlocal EnableDelayedExpansion

:: Configuration
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
set "AUTO_START_OK=0"

echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║    Ai-Arena Agent v3.0 — Windows Installer     ║
echo  ╚═══════════════════════════════════════════════╝
echo.

:: ─── Step 1: Check Node.js ──────────────────────────
echo [1/6] Checking Node.js installation...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo  Node.js not found! Downloading and installing...
    curl -o "%TEMP%\\node-installer.msi" https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
    if %errorLevel% neq 0 (
        echo  [ERROR] Failed to download Node.js.
        pause
        exit /b 1
    )
    msiexec /i "%TEMP%\\node-installer.msi" /qn /norestart
    if %errorLevel% neq 0 (
        echo  [ERROR] Node.js installation failed.
        pause
        exit /b 1
    )
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

:: ─── Step 3: Setup Agent ────────────────────────────
echo [3/6] Setting up agent...
cd /d "%INSTALL_DIR%"
if not exist "package.json" (
    echo {"name":"ai-arena-agent","version":"3.0.0","private":true,"scripts":{"start":"node ai-arena-agent.js"}} > package.json
)
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
echo   "heartbeatInterval": 30000
echo }
) > "%INSTALL_DIR%\\config\\settings.json"
echo  Configuration saved.
echo.

:: ─── Step 5: Auto-Start (3 fallback methods) ──────
echo [5/6] Setting up auto-start on boot...

schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
schtasks /create /tn "%TASK_NAME%" /tr "cmd /c cd /d %INSTALL_DIR% && node ai-arena-agent.js --key=%LICENSE_KEY%" /sc onstart /ru SYSTEM /rl HIGHEST /f >nul 2>&1
if %errorLevel% equ 0 (
    echo  [OK] Task Scheduler: Agent starts on boot as SYSTEM
    set "AUTO_START_OK=1"
) else (
    reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "AiArenaAgent" /t REG_SZ /d "cmd /c cd /d %INSTALL_DIR% && node ai-arena-agent.js --key=%LICENSE_KEY%" /f >nul 2>&1
    if %errorLevel% equ 0 (
        echo  [OK] Registry Run key: Agent starts when user logs in
        set "AUTO_START_OK=2"
    ) else (
        mkdir "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup" >nul 2>&1
        echo cmd /c cd /d %INSTALL_DIR% ^&^& node ai-arena-agent.js --key=%LICENSE_KEY% > "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\ai-arena-agent.bat"
        set "AUTO_START_OK=3"
        echo  [OK] Startup folder: Agent starts when user logs in
    )
)
echo.

:: ─── Step 6: Firewall ──────────────────────────────
echo [6/6] Configuring Windows Firewall...
netsh advfirewall firewall add rule name="Ai-Arena Agent" dir=out action=allow program="C:\\Program Files\\nodejs\\node.exe" enable=yes >nul 2>&1
echo  Firewall rules added.
echo.

echo  ═══════════════════════════════════════════════
echo   Installation Complete!
echo  ═══════════════════════════════════════════════
echo.
echo   Install dir:   %INSTALL_DIR%
echo   License key:   %LICENSE_KEY%
echo   Firebase:      %FIREBASE_PROJECT_ID%
echo   Agent mode:    Dormant (wakes on command, ~200B heartbeat/30s)
echo   Offline track: Firebase onDisconnect (auto-marks offline)
echo.
echo   IMPORTANT: Place ai-arena-agent.js in:
echo   %INSTALL_DIR%\\ai-arena-agent.js
echo.

:: Start the agent
echo Starting agent now...
start /b cmd /c "cd /d %INSTALL_DIR% && node ai-arena-agent.js --key=%LICENSE_KEY%"
timeout /t 3 >nul
echo Agent is running! Check Dashboard for online status.
echo.
pause`

// ─── macOS .sh Installer ──────────────────────────
const shInstaller = `#!/bin/bash
# ═══════════════════════════════════════════════════════
# Ai-Arena Agent v3.0 — macOS Self-Installing Agent
# Firebase-first: all communication via trusted Firebase
# Dormant: agent sleeps until command, onDisconnect tracks online status
# Auto-start via launchd (survives reboots, runs on boot)
# ═══════════════════════════════════════════════════════

set -e

# ─── Configuration ───────────────────────────────────
LICENSE_KEY="AI-REPLACE-WITH-YOUR-LICENSE-KEY"
FIREBASE_API_KEY="your-firebase-api-key"
FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
FIREBASE_DATABASE_URL="https://your-project-default-rtdb.firebaseio.com"
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
FIREBASE_APP_ID="your-app-id"
INSTALL_DIR="/usr/local/ai-arena"
LAUNCHD_LABEL="com.aiarena.agent"
LOG_DIR="/Library/Logs/Ai-Arena"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║    Ai-Arena Agent v3.0 — macOS Installer      ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Check for Node.js ──────────────────────
echo "[1/6] Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "  Node.js not found! Installing via Homebrew..."
    if ! command -v brew &> /dev/null; then
        echo "  Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install node
    echo "  Node.js installed successfully."
else
    NODE_VER=$(node -v)
    echo "  Node.js found: $NODE_VER"
fi
echo ""

# ─── Step 2: Create Installation Directory ──────────
echo "[2/6] Creating installation directory..."
sudo mkdir -p "$INSTALL_DIR/logs"
sudo mkdir -p "$INSTALL_DIR/config"
echo "  Install dir: $INSTALL_DIR"
echo ""

# ─── Step 3: Setup Agent ────────────────────────────
echo "[3/6] Setting up agent..."
cd "$INSTALL_DIR"

if [ ! -f "package.json" ]; then
    echo '{"name":"ai-arena-agent","version":"3.0.0","private":true,"scripts":{"start":"node ai-arena-agent.js --key='"$LICENSE_KEY"'"}}' | sudo tee package.json > /dev/null
fi

echo "  Installing dependencies..."
sudo npm install firebase --production --no-audit --no-fund 2>/dev/null
echo "  Dependencies installed."
echo ""

# ─── Step 4: Create Agent Config ─────────────────────
echo "[4/6] Creating configuration..."
sudo tee "$INSTALL_DIR/config/settings.json" > /dev/null << EOF
{
  "firebaseConfig": {
    "apiKey": "$FIREBASE_API_KEY",
    "authDomain": "$FIREBASE_AUTH_DOMAIN",
    "databaseURL": "$FIREBASE_DATABASE_URL",
    "projectId": "$FIREBASE_PROJECT_ID",
    "storageBucket": "$FIREBASE_STORAGE_BUCKET",
    "messagingSenderId": "$FIREBASE_MESSAGING_SENDER_ID",
    "appId": "$FIREBASE_APP_ID"
  },
  "licenseKey": "$LICENSE_KEY",
  "logLevel": "info",
  "heartbeatInterval": 30000
}
EOF
echo "  Configuration saved."
echo ""

# ─── Step 5: Auto-Start via launchd ─────────────────
echo "[5/6] Setting up auto-start via launchd..."

# Create the launchd plist
sudo tee "/Library/LaunchDaemons/$LAUNCHD_LABEL.plist" > /dev/null << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LAUNCHD_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>$INSTALL_DIR/ai-arena-agent.js</string>
        <string>--key=$LICENSE_KEY</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/agent-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/agent-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>FIREBASE_API_KEY</key>
        <string>$FIREBASE_API_KEY</string>
        <key>FIREBASE_AUTH_DOMAIN</key>
        <string>$FIREBASE_AUTH_DOMAIN</string>
        <key>FIREBASE_DATABASE_URL</key>
        <string>$FIREBASE_DATABASE_URL</string>
        <key>FIREBASE_PROJECT_ID</key>
        <string>$FIREBASE_PROJECT_ID</string>
        <key>FIREBASE_STORAGE_BUCKET</key>
        <string>$FIREBASE_STORAGE_BUCKET</string>
        <key>FIREBASE_MESSAGING_SENDER_ID</key>
        <string>$FIREBASE_MESSAGING_SENDER_ID</string>
        <key>FIREBASE_APP_ID</key>
        <string>$FIREBASE_APP_ID</string>
    </dict>
</dict>
</plist>
EOF

# Create log directory
sudo mkdir -p "$LOG_DIR"

# Load the launchd service
sudo launchctl unload "/Library/LaunchDaemons/$LAUNCHD_LABEL.plist" 2>/dev/null || true
sudo launchctl load "/Library/LaunchDaemons/$LAUNCHD_LABEL.plist"

echo "  [OK] launchd service installed and started."
echo "  Agent will auto-start on boot (KeepAlive = auto-restart on crash)."
echo ""

# ─── Step 6: Permissions ─────────────────────────────
echo "[6/6] Setting permissions..."
sudo chown -R root:wheel "$INSTALL_DIR"
sudo chmod -R 755 "$INSTALL_DIR"
sudo chmod 644 "/Library/LaunchDaemons/$LAUNCHD_LABEL.plist"
echo "  Permissions set."
echo ""

echo "  ═══════════════════════════════════════════════"
echo "   Installation Complete!"
echo "  ═══════════════════════════════════════════════"
echo ""
echo "   Install dir:   $INSTALL_DIR"
echo "   License key:   $LICENSE_KEY"
echo "   Firebase:      $FIREBASE_PROJECT_ID"
echo "   Agent mode:    Dormant (wakes on command)"
echo "   Offline track: Firebase onDisconnect"
echo "   Auto-start:    launchd (KeepAlive + RunAtLoad)"
echo "   Logs:          $LOG_DIR/"
echo ""
echo "   IMPORTANT: Place ai-arena-agent.js in:"
echo "   $INSTALL_DIR/ai-arena-agent.js"
echo ""
echo "   To check status:"
echo "   sudo launchctl list | grep aiarena"
echo ""
echo "   To stop:"
echo "   sudo launchctl unload /Library/LaunchDaemons/$LAUNCHD_LABEL.plist"
echo ""
echo "   To restart:"
echo "   sudo launchctl unload /Library/LaunchDaemons/$LAUNCHD_LABEL.plist"
echo "   sudo launchctl load /Library/LaunchDaemons/$LAUNCHD_LABEL.plist"
echo ""
echo "   To remove completely:"
echo "   sudo launchctl unload /Library/LaunchDaemons/$LAUNCHD_LABEL.plist"
echo "   sudo rm /Library/LaunchDaemons/$LAUNCHD_LABEL.plist"
echo "   sudo rm -rf $INSTALL_DIR"
echo "   sudo rm -rf $LOG_DIR"
echo ""
echo "  NOTE: After power outage or reboot, the agent auto-starts"
echo "  via launchd with KeepAlive. No one needs to be on-site."
echo ""`

// ─── Windows Non-Admin .bat Installer (User-Level) ──
const batUserInstaller = `@echo off
:: ═══════════════════════════════════════════════════════
:: Ai-Arena Agent v3.0 — Windows USER-LEVEL Installer
:: NO admin required. Installs to user's AppData.
:: Auto-starts when user logs in (Registry Run key).
:: ═══════════════════════════════════════════════════════

echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║  Ai-Arena Agent v3.0 — User-Level Installer   ║
echo  ║  (No admin privileges required)                ║
echo  ╚═══════════════════════════════════════════════╝
echo.

setlocal EnableDelayedExpansion

:: Configuration
set "LICENSE_KEY=AI-REPLACE-WITH-YOUR-LICENSE-KEY"
set "FIREBASE_API_KEY=your-firebase-api-key"
set "FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com"
set "FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com"
set "FIREBASE_PROJECT_ID=your-project-id"
set "FIREBASE_STORAGE_BUCKET=your-project.appspot.com"
set "FIREBASE_MESSAGING_SENDER_ID=your-sender-id"
set "FIREBASE_APP_ID=your-app-id"
set "INSTALL_DIR=%APPDATA%\\\\Ai-Arena"

echo [1/5] Checking Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo  Node.js not found. Downloading...
    curl -o "%TEMP%\\\\node-installer.msi" https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
    if %errorLevel% neq 0 (
        echo  [ERROR] Failed to download Node.js.
        echo  Please install Node.js manually from https://nodejs.org
        pause
        exit /b 1
    )
    msiexec /i "%TEMP%\\\\node-installer.msi" /qn /norestart
    set "PATH=%PATH%;C:\\\\Program Files\\\\nodejs"
    del "%TEMP%\\\\node-installer.msi" >nul 2>&1
    echo  Node.js installed.
) else (
    for /f "tokens=*" %%v in ('node -v') do echo  Node.js found: %%v
)

echo [2/5] Creating installation directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\\\\logs" mkdir "%INSTALL_DIR%\\\\logs"
if not exist "%INSTALL_DIR%\\\\config" mkdir "%INSTALL_DIR%\\\\config"
echo  Install dir: %INSTALL_DIR%

echo [3/5] Setting up agent...
cd /d "%INSTALL_DIR%"
if not exist "package.json" (
    echo {"name":"ai-arena-agent","version":"3.0.0","private":true} > package.json
)
call npm install firebase --production --no-audit --no-fund >nul 2>&1
echo  Dependencies installed.

echo [4/5] Creating configuration...
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
echo   "heartbeatInterval": 30000
echo }
) > "%INSTALL_DIR%\\\\config\\\\settings.json"
echo  Configuration saved.

echo [5/5] Setting up auto-start (user login)...
reg add "HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run" /v "AiArenaAgent" /t REG_SZ /d "cmd /c cd /d %INSTALL_DIR% && node ai-arena-agent.js --key=%LICENSE_KEY%" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo  [OK] Registry Run key set. Agent auto-starts on login.
) else (
    mkdir "%APPDATA%\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs\\\\Startup" >nul 2>&1
    echo cmd /c cd /d %INSTALL_DIR% ^&^& node ai-arena-agent.js --key=%LICENSE_KEY% > "%APPDATA%\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs\\\\Startup\\\\ai-arena-agent.bat"
    echo  [OK] Startup folder fallback set.
)

echo.
echo  ═══════════════════════════════════════════════
echo   Installation Complete!
echo  ═══════════════════════════════════════════════
echo.
echo   Install dir:  %INSTALL_DIR%
echo   Auto-start:   On user login
echo   NOTE: Agent only runs when user is logged in.
echo   For always-on (SYSTEM-level), use the admin installer.
echo.
echo   IMPORTANT: Place ai-arena-agent.js in:
echo   %INSTALL_DIR%\\\\ai-arena-agent.js
echo.

start /b cmd /c "cd /d %INSTALL_DIR% && node ai-arena-agent.js --key=%LICENSE_KEY%"
timeout /t 3 >nul
echo Agent is running!
echo.
pause`

// ─── Linux/Ubuntu .sh Installer ────────────────────
const linuxInstaller = `#!/bin/bash
# ═══════════════════════════════════════════════════════
# Ai-Arena Agent v3.0 — Linux/Ubuntu Self-Installing Agent
# Firebase-first: all communication via trusted Firebase
# Dormant: agent sleeps until command, onDisconnect tracks online status
# Auto-start via systemd (survives reboots, runs on boot)
# ═══════════════════════════════════════════════════════

set -e

# ─── Configuration ───────────────────────────────────
LICENSE_KEY="AI-REPLACE-WITH-YOUR-LICENSE-KEY"
FIREBASE_API_KEY="your-firebase-api-key"
FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
FIREBASE_DATABASE_URL="https://your-project-default-rtdb.firebaseio.com"
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
FIREBASE_APP_ID="your-app-id"
INSTALL_DIR="/opt/ai-arena"
SERVICE_NAME="ai-arena-agent"
LOG_DIR="/var/log/ai-arena"
USER_NAME="ai-arena"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║    Ai-Arena Agent v3.0 — Linux Installer      ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# Check root
if [ "$(id -u)" -ne 0 ]; then
    echo "  [ERROR] This installer requires root privileges."
    echo "  Run: sudo ./install-ai-arena-linux.sh"
    exit 1
fi

# ─── Step 1: Check Node.js ──────────────────────────
echo "[1/6] Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    echo "  Node.js found: $NODE_VER"
else
    echo "  Installing Node.js 20.x LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    echo "  Node.js $(node -v) installed"
fi
echo ""

# ─── Step 2: Create User & Directories ──────────────
echo "[2/6] Creating system user and directories..."
if ! id "$USER_NAME" &>/dev/null; then
    useradd -r -s /bin/false -d "$INSTALL_DIR" "$USER_NAME" 2>/dev/null || true
    echo "  Created system user: $USER_NAME"
fi
mkdir -p "$INSTALL_DIR/logs"
mkdir -p "$INSTALL_DIR/config"
mkdir -p "$LOG_DIR"
chown -R "$USER_NAME:$USER_NAME" "$INSTALL_DIR"
chown -R "$USER_NAME:$USER_NAME" "$LOG_DIR"
echo "  Install dir: $INSTALL_DIR"
echo ""

# ─── Step 3: Setup Agent ────────────────────────────
echo "[3/6] Setting up agent..."
cd "$INSTALL_DIR"

if [ ! -f "package.json" ]; then
    echo '{"name":"ai-arena-agent","version":"3.0.0","private":true,"scripts":{"start":"node ai-arena-agent.js"}}' | tee package.json > /dev/null
fi

echo "  Installing dependencies..."
npm install firebase --production --no-audit --no-fund 2>/dev/null
echo "  Dependencies installed."
echo ""

# ─── Step 4: Create Config ──────────────────────────
echo "[4/6] Creating configuration..."
cat > "$INSTALL_DIR/config/settings.json" << CONFEOF
{
  "firebaseConfig": {
    "apiKey": "$FIREBASE_API_KEY",
    "authDomain": "$FIREBASE_AUTH_DOMAIN",
    "databaseURL": "$FIREBASE_DATABASE_URL",
    "projectId": "$FIREBASE_PROJECT_ID",
    "storageBucket": "$FIREBASE_STORAGE_BUCKET",
    "messagingSenderId": "$FIREBASE_MESSAGING_SENDER_ID",
    "appId": "$FIREBASE_APP_ID"
  },
  "licenseKey": "$LICENSE_KEY",
  "logLevel": "info",
  "heartbeatInterval": 30000
}
CONFEOF
chown "$USER_NAME:$USER_NAME" "$INSTALL_DIR/config/settings.json"
echo "  Configuration saved."
echo ""

# ─── Step 5: systemd Service ────────────────────────
echo "[5/6] Setting up systemd service..."
cat > "/etc/systemd/system/$SERVICE_NAME.service" << SVCEOF
[Unit]
Description=Ai-Arena Agent v3.0
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/ai-arena-agent.js --key=$LICENSE_KEY
Restart=always
RestartSec=5
StandardOutput=append:$LOG_DIR/agent-stdout.log
StandardError=append:$LOG_DIR/agent-stderr.log

# Firebase environment variables
Environment=FIREBASE_API_KEY=$FIREBASE_API_KEY
Environment=FIREBASE_AUTH_DOMAIN=$FIREBASE_AUTH_DOMAIN
Environment=FIREBASE_DATABASE_URL=$FIREBASE_DATABASE_URL
Environment=FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID
Environment=FIREBASE_STORAGE_BUCKET=$FIREBASE_STORAGE_BUCKET
Environment=FIREBASE_MESSAGING_SENDER_ID=$FIREBASE_MESSAGING_SENDER_ID
Environment=FIREBASE_APP_ID=$FIREBASE_APP_ID

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$INSTALL_DIR $LOG_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
systemctl restart "$SERVICE_NAME" > /dev/null 2>&1
echo "  [OK] systemd service installed and started."
echo "  Agent will auto-start on boot."
echo ""

# ─── Step 6: Permissions ────────────────────────────
echo "[6/6] Setting permissions..."
chown -R "$USER_NAME:$USER_NAME" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
chmod 640 "$INSTALL_DIR/config/settings.json"
echo "  Permissions set."
echo ""

echo "  ═══════════════════════════════════════════════"
echo "   Installation Complete!"
echo "  ═══════════════════════════════════════════════"
echo ""
echo "   Install dir:   $INSTALL_DIR"
echo "   Service:       $SERVICE_NAME (systemd)"
echo "   Logs:          $LOG_DIR/"
echo "   Auto-start:    Yes (systemd, boot + crash recovery)"
echo ""
echo "   IMPORTANT: Place ai-arena-agent.js in:"
echo "   $INSTALL_DIR/ai-arena-agent.js"
echo ""
echo "   Useful commands:"
echo "   sudo systemctl status $SERVICE_NAME"
echo "   sudo systemctl restart $SERVICE_NAME"
echo "   sudo systemctl stop $SERVICE_NAME"
echo "   sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "   To remove:"
echo "   sudo systemctl stop $SERVICE_NAME"
echo "   sudo systemctl disable $SERVICE_NAME"
echo "   rm /etc/systemd/system/$SERVICE_NAME.service"
echo "   userdel $USER_NAME"
echo "   rm -rf $INSTALL_DIR $LOG_DIR"
echo ""
`

const windowsSteps = [
  {
    title: 'Download the .bat Installer',
    description: 'Download install-ai-arena.bat. Handles Node.js install, Firebase setup, auto-start, firewall rules.',
    icon: FileDown,
    command: 'See "Windows Installer (.bat)" section below',
  },
  {
    title: 'Edit the .bat File',
    description: 'Open in Notepad. Change LICENSE_KEY and Firebase config values at the top.',
    icon: FileCode,
    command: 'set "LICENSE_KEY=AI-your-actual-key-here"',
  },
  {
    title: 'Double-Click to Install',
    description: 'Just double-click! It auto-requests admin via UAC. Falls back to user-level if no admin available.',
    icon: Shield,
    command: 'Double-click install-ai-arena.bat',
  },
  {
    title: 'Place the Agent Script',
    description: 'Copy the agent code and save as ai-arena-agent.js in C:\\Ai-Arena\\.',
    icon: FolderTree,
    command: 'Save as: C:\\Ai-Arena\\ai-arena-agent.js',
  },
  {
    title: 'Verify Unattended Access',
    description: 'Restart the computer. After boot, check Dashboard — server shows "online" automatically.',
    icon: MonitorUp,
    command: 'shutdown /r /t 0  # Test reboot',
  },
  {
    title: 'Power Outage Recovery',
    description: 'Windows boots, Task Scheduler fires agent as SYSTEM before login. Auto-reconnects to Firebase.',
    icon: Power,
    command: 'No action needed — fully automatic',
  },
]

const macSteps = [
  {
    title: 'Download the .sh Installer',
    description: 'Download install-ai-arena.sh. Handles Node.js (via Homebrew), Firebase setup, launchd auto-start.',
    icon: FileDown,
    command: 'See "macOS Installer (.sh)" section below',
  },
  {
    title: 'Edit the .sh File',
    description: 'Open in any text editor. Change LICENSE_KEY and Firebase config values at the top.',
    icon: FileCode,
    command: 'LICENSE_KEY="AI-your-actual-key-here"',
  },
  {
    title: 'Run the Installer',
    description: 'Open Terminal, navigate to the file, make executable, and run. Needs sudo for launchd setup.',
    icon: Terminal,
    command: 'chmod +x install-ai-arena.sh && sudo ./install-ai-arena.sh',
  },
  {
    title: 'Place the Agent Script',
    description: 'Copy the agent code and save as ai-arena-agent.js in /usr/local/ai-arena/.',
    icon: FolderTree,
    command: 'Save as: /usr/local/ai-arena/ai-arena-agent.js',
  },
  {
    title: 'Verify Auto-Start',
    description: 'Reboot the Mac. After boot, check Dashboard — server shows "online". launchd KeepAlive auto-restarts on crash.',
    icon: MonitorUp,
    command: 'sudo reboot  # Test reboot',
  },
  {
    title: 'Power Outage Recovery',
    description: 'Mac boots, launchd fires agent automatically. KeepAlive ensures it restarts if it crashes.',
    icon: Power,
    command: 'No action needed — fully automatic',
  },
]

export function AgentSetup() {
  const [copied, setCopied] = useState(false)
  const [copiedBat, setCopiedBat] = useState(false)
  const [copiedSh, setCopiedSh] = useState(false)
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [activeMacStep, setActiveMacStep] = useState<number | null>(null)
  const [platformTab, setPlatformTab] = useState<'windows' | 'mac'>('windows')

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
    toast.success('Windows installer copied')
  }

  const copySh = () => {
    navigator.clipboard.writeText(shInstaller)
    setCopiedSh(true)
    setTimeout(() => setCopiedSh(false), 2000)
    toast.success('macOS installer copied')
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

  const downloadSh = () => {
    const blob = new Blob([shInstaller], { type: 'text/x-shellscript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'install-ai-arena.sh'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('install-ai-arena.sh downloaded!')
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
      {/* Dormant Mode + Online/Offline Explanation */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <Moon className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-300">Dormant Mode + Smart Online/Offline</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Agent sleeps until commands arrive. Firebase onDisconnect auto-tracks online/offline status.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-zinc-950 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Moon className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-medium text-zinc-200">Dormant / Sleep Mode</span>
            </div>
            <ul className="text-[10px] text-zinc-500 space-y-1">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">&#x2713;</span>
                <span>Firebase uses <strong className="text-zinc-300">server-push</strong> (onChildAdded) — agent does NOT poll</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">&#x2713;</span>
                <span>Agent sleeps until Firebase pushes a command — zero bandwidth when idle</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">&#x2713;</span>
                <span>Heartbeat: only <strong className="text-zinc-300">~200 bytes every 30s</strong> (timestamp + RAM + CPU)</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">&#x2713;</span>
                <span>Exponential backoff reconnect (5s → 60s max) after network drops</span>
              </li>
            </ul>
          </div>
          <div className="bg-zinc-950 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-zinc-200">Online/Offline Tracking</span>
            </div>
            <ul className="text-[10px] text-zinc-500 space-y-1">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">&#x2713;</span>
                <span>Firebase <strong className="text-zinc-300">onDisconnect()</strong> — if computer crashes/loses power, Firebase auto-marks it &quot;offline&quot; within ~30s</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">&#x2713;</span>
                <span>No polling needed — Firebase handles disconnect detection server-side</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">&#x2713;</span>
                <span>Records <strong className="text-zinc-300">disconnectedAt</strong> timestamp when connection drops</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">&#x2713;</span>
                <span>Dashboard shows real green/red status — you always know who&apos;s up</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Platform Tabs */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Cross-Platform Deployment</h3>
        </div>

        <div className="flex gap-1 bg-zinc-950 rounded-lg p-1 mb-4">
          <button
            onClick={() => setPlatformTab('windows')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-medium transition-all',
              platformTab === 'windows' ? 'bg-blue-500/15 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Monitor className="w-4 h-4" />
            Windows
          </button>
          <button
            onClick={() => setPlatformTab('mac')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-medium transition-all',
              platformTab === 'mac' ? 'bg-blue-500/15 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Apple className="w-4 h-4" />
            macOS
          </button>
        </div>

        {platformTab === 'windows' && (
          <div className="space-y-4">
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-blue-300">Windows Edition</span>
                <Badge className="bg-blue-500/15 text-blue-400 border-0 text-[10px]">.bat installer</Badge>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Auto-start via Task Scheduler (SYSTEM account). Self-elevates to admin. Survives power outages. PowerShell audit logging.
              </p>
            </div>

            {/* Windows Steps */}
            <div className="space-y-2">
              {windowsSteps.map((step, i) => {
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
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                        isOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                      )}>{i + 1}</div>
                      <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                      <div className="flex-1">
                        <span className="text-xs font-medium text-zinc-200">{step.title}</span>
                        <p className="text-[10px] text-zinc-500 hidden sm:block">{step.description}</p>
                      </div>
                      <ChevronRight className={cn('w-4 h-4 text-zinc-500 transition-transform', isOpen && 'rotate-90')} />
                    </div>
                    {isOpen && (
                      <div className="px-4 pb-3">
                        <p className="text-xs text-zinc-400 mb-2">{step.description}</p>
                        <code className="block bg-zinc-950 text-emerald-400 text-xs p-3 rounded-md font-mono">{step.command}</code>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {platformTab === 'mac' && (
          <div className="space-y-4">
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Apple className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-blue-300">macOS Edition</span>
                <Badge className="bg-blue-500/15 text-blue-400 border-0 text-[10px]">.sh installer</Badge>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Auto-start via launchd (RunAtLoad + KeepAlive). Auto-restarts on crash. Logs login events via last/log. Survives reboots.
              </p>
            </div>

            {/* macOS Steps */}
            <div className="space-y-2">
              {macSteps.map((step, i) => {
                const Icon = step.icon
                const isOpen = activeMacStep === i
                return (
                  <div
                    key={i}
                    className={cn(
                      'border rounded-lg transition-all duration-200 cursor-pointer',
                      isOpen ? 'border-emerald-500/30 bg-zinc-950/50' : 'border-zinc-800 hover:border-zinc-700'
                    )}
                    onClick={() => setActiveMacStep(isOpen ? null : i)}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                        isOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                      )}>{i + 1}</div>
                      <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                      <div className="flex-1">
                        <span className="text-xs font-medium text-zinc-200">{step.title}</span>
                        <p className="text-[10px] text-zinc-500 hidden sm:block">{step.description}</p>
                      </div>
                      <ChevronRight className={cn('w-4 h-4 text-zinc-500 transition-transform', isOpen && 'rotate-90')} />
                    </div>
                    {isOpen && (
                      <div className="px-4 pb-3">
                        <p className="text-xs text-zinc-400 mb-2">{step.description}</p>
                        <code className="block bg-zinc-950 text-emerald-400 text-xs p-3 rounded-md font-mono">{step.command}</code>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Agent Code (Shared — works on both platforms) */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FileCode className="w-4 h-4 text-emerald-400" />
            Agent Script (Cross-Platform — Windows + macOS)
          </h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={copyCode}
              className="h-7 text-[10px] border-zinc-700 text-zinc-400 hover:text-white"
            >
              {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={downloadAgent}
              className="h-7 text-[10px] border-zinc-700 text-zinc-400 hover:text-white"
            >
              <Download className="w-3 h-3 mr-1" />
              Download .js
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-zinc-500 mb-3">
          One agent file works on both Windows and macOS. Auto-detects platform at startup.
          Uses <code className="text-emerald-400 bg-zinc-900 px-1 rounded">onDisconnect()</code> for automatic offline detection.
        </p>
        <div className="bg-zinc-950 rounded-lg p-3 font-mono text-[10px] text-zinc-500 max-h-48 overflow-y-auto">
          <pre className="whitespace-pre">{agentCode.split('\n').slice(0, 30).join('\n')}...</pre>
          <p className="text-zinc-600 mt-1">({agentCode.split('\n').length} lines total — click Download for full file)</p>
        </div>
      </div>

      {/* Windows .bat Installer */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-blue-400" />
            Windows Installer (.bat)
          </h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={copyBat}
              className="h-7 text-[10px] border-zinc-700 text-zinc-400 hover:text-white"
            >
              {copiedBat ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copiedBat ? 'Copied' : 'Copy'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={downloadBat}
              className="h-7 text-[10px] border-zinc-700 text-zinc-400 hover:text-white"
            >
              <Download className="w-3 h-3 mr-1" />
              Download .bat
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-zinc-500 mb-3">
          Self-elevating .bat installer. Auto-requests admin via UAC. Sets up Task Scheduler for boot auto-start.
          Falls back to Registry Run key and Startup folder if admin unavailable.
        </p>
        <div className="bg-zinc-950 rounded-lg p-3 font-mono text-[10px] text-zinc-500 max-h-48 overflow-y-auto">
          <pre className="whitespace-pre">{batInstaller.split('\n').slice(0, 20).join('\n')}...</pre>
          <p className="text-zinc-600 mt-1">({batInstaller.split('\n').length} lines total — click Download for full file)</p>
        </div>
      </div>

      {/* macOS .sh Installer */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Apple className="w-4 h-4 text-blue-400" />
            macOS Installer (.sh)
          </h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={copySh}
              className="h-7 text-[10px] border-zinc-700 text-zinc-400 hover:text-white"
            >
              {copiedSh ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copiedSh ? 'Copied' : 'Copy'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={downloadSh}
              className="h-7 text-[10px] border-zinc-700 text-zinc-400 hover:text-white"
            >
              <Download className="w-3 h-3 mr-1" />
              Download .sh
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-zinc-500 mb-3">
          Shell script installer for macOS. Installs Node.js via Homebrew if missing.
          Sets up <code className="text-emerald-400 bg-zinc-900 px-1 rounded">launchd</code> with RunAtLoad + KeepAlive for boot auto-start and crash recovery.
          Installs to <code className="text-emerald-400 bg-zinc-900 px-1 rounded">/usr/local/ai-arena/</code> (needs sudo).
        </p>
        <div className="bg-zinc-950 rounded-lg p-3 font-mono text-[10px] text-zinc-500 max-h-48 overflow-y-auto">
          <pre className="whitespace-pre">{shInstaller.split('\n').slice(0, 20).join('\n')}...</pre>
          <p className="text-zinc-600 mt-1">({shInstaller.split('\n').length} lines total — click Download for full file)</p>
        </div>
      </div>

      {/* Architecture Overview */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-400" />
          Architecture — Cross-Platform v3.0
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
│  │              REST API + Firebase Client             │ │
│  └──────────────────────┬────────────────────────────┘ │
│                         │                              │
│  ┌──────────────────────┴────────────────────────────┐ │
│  │       Firebase Realtime Database (PRIMARY)        │ │
│  │       Trusted domains — no antivirus flagging     │ │
│  │                                                    │ │
│  │  /agents/{key}/status        = online/offline     │ │
│  │  /agents/{key}/lastHeartbeat = 30s heartbeat      │ │
│  │  /agents/{key}/disconnectedAt = auto on drop      │ │
│  │  /agents/{key}/commands       = dashboard -> agent│ │
│  │  /agents/{key}/results        = agent -> dashboard │ │
│  │  /audit/{key}                 = activity logs      │ │
│  │                                                    │ │
│  │  onDisconnect: auto-marks "offline" if crash/pwr  │ │
│  └──────────────────────┬────────────────────────────┘ │
│                         │                              │
│         ┌───────────────┼───────────────┐              │
│         │               │               │              │
│  ┌──────┴──────┐ ┌─────┴──────┐ ┌──────┴──────┐       │
│  │  Windows 1  │ │  macOS 1   │ │  Windows 2  │       │
│  │ ┌────────┐  │ │ ┌────────┐ │ │ ┌────────┐  │       │
│  │ │ Agent  │  │ │ │ Agent  │ │ │ │ Agent  │  │       │
│  │ │ v3.0   │  │ │ │ v3.0   │ │ │ │ v3.0   │  │       │
│  │ │dormant │  │ │ │dormant │ │ │ │dormant │  │       │
│  │ └────────┘  │ │ └────────┘ │ │ └────────┘  │       │
│  │ TaskSched.  │ │  launchd   │ │ TaskSched.  │       │
│  │ KeepAlive   │ │ KeepAlive  │ │ KeepAlive   │       │
│  │ onDisconnect│ │onDisconnect│ │ onDisconnect│       │
│  └─────────────┘ └────────────┘ └─────────────┘       │
└─────────────────────────────────────────────────────────┘`}</pre>
        </div>
      </div>

      {/* Bandwidth Usage */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          Bandwidth Usage (Per Agent)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-zinc-950 rounded-lg p-3 text-center">
            <p className="text-[10px] text-zinc-500 mb-1">Idle (Dormant)</p>
            <p className="text-lg font-bold text-emerald-400">~200 B</p>
            <p className="text-[10px] text-zinc-600">every 30 seconds</p>
            <p className="text-[10px] text-zinc-600 mt-1">~576 KB / month</p>
          </div>
          <div className="bg-zinc-950 rounded-lg p-3 text-center">
            <p className="text-[10px] text-zinc-500 mb-1">Command + Response</p>
            <p className="text-lg font-bold text-blue-400">~1-10 KB</p>
            <p className="text-[10px] text-zinc-600">per command cycle</p>
            <p className="text-[10px] text-zinc-600 mt-1">depends on output size</p>
          </div>
          <div className="bg-zinc-950 rounded-lg p-3 text-center">
            <p className="text-[10px] text-zinc-500 mb-1">Reconnect (after outage)</p>
            <p className="text-lg font-bold text-yellow-400">~2 KB</p>
            <p className="text-[10px] text-zinc-600">one-time on reconnect</p>
            <p className="text-[10px] text-zinc-600 mt-1">system info + status</p>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 mt-3 text-center">
          10 dormant agents = ~5.7 MB/month total. Firebase free tier allows 10 GB/month.
        </p>
      </div>
    </div>
  )
}
