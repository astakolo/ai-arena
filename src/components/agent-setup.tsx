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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const agentCode = `/**
 * RemoteHub Agent - Server-side Node.js agent
 * Deploy this on any server you want to manage remotely.
 *
 * Installation:
 *   1. Save this file as 'remotehub-agent.js'
 *   2. Install dependencies: npm install ws node-os-utils
 *   3. Run: node remotehub-agent.js --key=RH-YOUR-LICENSE-KEY
 */

const WebSocket = require('ws');
const os = require('os');
const { exec } = require('child_process');

// ─── Configuration ───────────────────────────────────
const CONFIG = {
  serverUrl: 'wss://your-remotehub-domain.com',
  licenseKey: process.argv.find(a => a.startsWith('--key='))?.split('=')[1],
  heartbeatInterval: 30000,  // 30 seconds
  reconnectDelay: 5000,       // 5 seconds
};

if (!CONFIG.licenseKey) {
  console.error('❌ No license key provided. Use: node agent.js --key=RH-xxx');
  process.exit(1);
}

// ─── System Info Gathering ───────────────────────────
function getSystemInfo() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    osVersion: os.release(),
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    cpuCores: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freememory(),
    uptime: os.uptime(),
    networkInterfaces: os.networkInterfaces(),
  };
}

function formatBytes(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  return \`\${gb.toFixed(1)} GB\`;
}

// ─── WebRTC Screen Capture (Placeholder) ────────────
// In production, use the 'node-webrtc' package for
// actual screen sharing capabilities.
class ScreenCapturer {
  constructor() {
    this.isActive = false;
  }

  start() {
    this.isActive = true;
    console.log('🖥️  Screen capture ready (simulated)');
  }

  stop() {
    this.isActive = false;
  }
}

// ─── Terminal Command Execution ──────────────────────
class TerminalSession {
  constructor() {
    this.history = [];
  }

  async execute(command) {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        const result = {
          command,
          output: stdout || stderr,
          error: error ? error.message : null,
          timestamp: new Date().toISOString(),
        };
        this.history.push(result);
        resolve(result);
      });
    });
  }

  getHistory() {
    return this.history;
  }
}

// ─── WebSocket Connection Manager ────────────────────
class RemoteHubAgent {
  constructor() {
    this.ws = null;
    this.terminal = new TerminalSession();
    this.screen = new ScreenCapturer();
    this.isConnected = false;
    this.reconnectTimer = null;
  }

  connect() {
    console.log(\`🔗 Connecting to RemoteHub...\`);

    this.ws = new WebSocket(CONFIG.serverUrl, {
      headers: {
        'x-license-key': CONFIG.licenseKey,
        'x-agent-version': '1.0.0',
      },
    });

    this.ws.on('open', () => {
      this.isConnected = true;
      console.log('✅ Connected to RemoteHub!');

      // Send initial system info
      this.send({
        type: 'register',
        data: getSystemInfo(),
      });
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      console.log('🔌 Disconnected from RemoteHub');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'ping':
        this.send({ type: 'pong', data: getSystemInfo() });
        break;

      case 'terminal:execute':
        this.terminal.execute(msg.data.command).then(result => {
          this.send({ type: 'terminal:output', data: result });
        });
        break;

      case 'screen:start':
        this.screen.start();
        this.send({ type: 'screen:started' });
        break;

      case 'screen:stop':
        this.screen.stop();
        this.send({ type: 'screen:stopped' });
        break;

      case 'system:info':
        this.send({ type: 'system:info', data: getSystemInfo() });
        break;

      default:
        console.log('Unknown message type:', msg.type);
    }
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('🔄 Reconnecting...');
      this.connect();
    }, CONFIG.reconnectDelay);
  }

  startHeartbeat() {
    setInterval(() => {
      if (this.isConnected) {
        this.send({
          type: 'heartbeat',
          data: {
            uptime: os.uptime(),
            freeMemory: os.freememory(),
            loadAvg: os.loadavg(),
          },
        });
      }
    }, CONFIG.heartbeatInterval);
  }
}

// ─── Start Agent ─────────────────────────────────────
const agent = new RemoteHubAgent();
agent.connect();
agent.startHeartbeat();

console.log('🚀 RemoteHub Agent started');
console.log(\`   Hostname: \${os.hostname()}\`);
console.log(\`   Platform: \${os.platform()} \${os.arch()}\`);
console.log(\`   CPU: \${os.cpus()[0]?.model}\`);
console.log(\`   RAM: \${formatBytes(os.totalmem())}\`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n👋 Shutting down...');
  process.exit(0);
});`

const steps = [
  {
    title: 'Prerequisites',
    description: 'Ensure Node.js 18+ is installed on the target server.',
    icon: Terminal,
    command: 'node --version  # Should be v18+',
  },
  {
    title: 'Create Agent File',
    description: 'Save the agent code to a file on the target server.',
    icon: FileCode,
    command: 'nano remotehub-agent.js',
  },
  {
    title: 'Install Dependencies',
    description: 'Install the required npm packages.',
    icon: Download,
    command: 'npm install ws',
  },
  {
    title: 'Generate License Key',
    description: 'Generate a license key from the License Keys tab in RemoteHub.',
    icon: Shield,
    command: 'Copy the RH-xxx key from RemoteHub',
  },
  {
    title: 'Start the Agent',
    description: 'Run the agent with your license key.',
    icon: Zap,
    command: 'node remotehub-agent.js --key=RH-YOUR-KEY-HERE',
  },
  {
    title: 'Verify Connection',
    description: 'The server should appear as "online" in the Dashboard.',
    icon: Globe,
    command: 'Check RemoteHub Dashboard → Server status: online',
  },
]

export function AgentSetup() {
  const [copied, setCopied] = useState(false)
  const [activeStep, setActiveStep] = useState<number | null>(null)

  const copyCode = () => {
    navigator.clipboard.writeText(agentCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Agent code copied to clipboard')
  }

  return (
    <div className="space-y-6">
      {/* Architecture overview */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-400" />
          Architecture Overview
        </h3>
        <div className="bg-zinc-950 rounded-lg p-4 font-mono text-xs text-zinc-400 leading-relaxed overflow-x-auto">
          <pre className="whitespace-pre">{`
┌─────────────────────────────────────────────────────────┐
│                   RemoteHub Dashboard                    │
│              (Next.js Web Application)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐       │
│  │ Dashboard │  │ Connect  │  │ License Manager  │       │
│  └─────┬─────┘  └────┬─────┘  └────────┬─────────┘       │
│        │             │                 │                  │
│  ┌─────┴─────────────┴─────────────────┴─────────┐       │
│  │            REST API + WebSocket Gateway        │       │
│  └─────────────────────┬─────────────────────────┘       │
│                        │                                   │
│              ┌─────────┴──────────┐                       │
│              │   Firebase/SQLite   │                       │
│              │  Realtime Database  │                       │
│              └─────────┬──────────┘                       │
│                        │                                   │
└────────────────────────┼───────────────────────────────────┘
                         │ WebSocket + WebRTC
                         │
┌────────────────────────┼───────────────────────────────────┐
│                   Remote Servers                           │
│                        │                                   │
│  ┌─────────┐  ┌───────┴──────┐  ┌──────────┐             │
│  │ Server 1 │  │   Server 2   │  │ Server N │             │
│  │ ┌─────┐ │  │  ┌────────┐  │  │ ┌──────┐ │             │
│  │ │Agent│ │  │  │ Agent  │  │  │ │Agent │ │             │
│  │ └─────┘ │  │  └────────┘  │  │ └──────┘ │             │
│  │ WebRTC  │  │  WebRTC     │  │ WebRTC   │             │
│  │ Screen  │  │  Screen     │  │ Screen   │             │
│  │ Webcam  │  │  Webcam     │  │ Webcam   │             │
│  └─────────┘  └─────────────┘  └──────────┘             │
└─────────────────────────────────────────────────────────┘`}</pre>
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <FileCode className="w-4 h-4 text-emerald-400" />
          Setup Instructions
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

      {/* Agent Code */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-white">Agent Source Code</span>
            <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
              remotehub-agent.js
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
            onClick={copyCode}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy Code
              </>
            )}
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <pre className="p-4 text-xs font-mono text-zinc-300 leading-5 bg-zinc-950">
            <code>{agentCode}</code>
          </pre>
        </div>
      </div>

      {/* Quick Start */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-emerald-400 mb-2">💡 Quick Start</h4>
        <p className="text-xs text-zinc-400 leading-relaxed">
          After setting up the agent on your server, it will automatically register with RemoteHub
          using its license key. You&apos;ll see the server appear in the Dashboard as &quot;online&quot; once
          the connection is established. Use the Connect tab to initiate a remote session with screen
          sharing, webcam access, and terminal control.
        </p>
      </div>
    </div>
  )
}
