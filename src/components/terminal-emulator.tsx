'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Terminal as TerminalIcon, X, Minus, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TerminalEmulatorProps {
  isConnected: boolean
  serverName?: string
}

const commandResponses: Record<string, string[]> = {
  help: [
    'Available commands:',
    '  help          - Show this help message',
    '  status        - Show system status',
    '  ls            - List files',
    '  whoami        - Show current user',
    '  hostname      - Show hostname',
    '  uptime        - Show system uptime',
    '  df            - Show disk usage',
    '  free          - Show memory usage',
    '  top           - Show running processes',
    '  ping <host>   - Ping a host',
    '  docker ps     - Show Docker containers',
    '  clear         - Clear terminal',
    '  neofetch      - Show system info',
  ],
  status: [
    '╔══════════════════════════════════════╗',
    '║       SYSTEM STATUS REPORT           ║',
    '╠══════════════════════════════════════╣',
    '║  OS:        Ubuntu 22.04 LTS         ║',
    '║  Kernel:    5.15.0-91-generic        ║',
    '║  Uptime:    47 days, 3:12            ║',
    '║  Load Avg:  0.15, 0.10, 0.09        ║',
    '║  CPU:       Intel Xeon E5-2680       ║',
    '║  Cores:     8 @ 2.40 GHz             ║',
    '║  RAM:       15.4 / 32 GB             ║',
    '║  Swap:      0 / 8 GB                 ║',
    '║  Disk:      234 / 500 GB (47%)       ║',
    '║  Network:   eth0: 192.168.1.100      ║',
    '╚══════════════════════════════════════╝',
  ],
  ls: [
    '<span class="text-blue-400">bin</span>   <span class="text-blue-400">boot</span>   <span class="text-blue-400">dev</span>   <span class="text-blue-400">etc</span>   <span class="text-blue-400">home</span>   <span class="text-blue-400">lib</span>   <span class="text-blue-400">opt</span>   <span class="text-blue-400">proc</span>   <span class="text-blue-400">root</span>   <span class="text-blue-400">run</span>   <span class="text-blue-400">srv</span>   <span class="text-blue-400">sys</span>   <span class="text-blue-400">tmp</span>   <span class="text-blue-400">usr</span>   <span class="text-blue-400">var</span>',
    '<span class="text-yellow-400">docker-compose.yml</span>  <span class="text-green-400">start.sh</span>  <span class="text-white">README.md</span>',
  ],
  whoami: ['admin'],
  hostname: ['prod-web-01'],
  uptime: [' 14:23:01 up 47 days,  3:12,  1 user,  load average: 0.15, 0.10, 0.09'],
  df: [
    'Filesystem      Size  Used Avail Use% Mounted on',
    '/dev/sda1       500G  234G  266G  47% /',
    'tmpfs            16G     0   16G   0% /dev/shm',
    '/dev/sda2       100G   45G   55G  45% /home',
  ],
  free: [
    '              total        used        free      shared  buff/cache   available',
    'Mem:          32768       15872        4096         256       12800       16384',
    'Swap:          8192           0        8192',
  ],
  top: [
    'PID    USER     PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND',
    '1234   admin    20   0  4096.0  512.0   64.0 S   2.3   1.6   0:45.23 nginx',
    '2345   admin    20   0  2048.0  256.0   32.0 S   1.1   0.8   0:23.45 node',
    '3456   admin    20   0  1024.0  128.0   16.0 S   0.7   0.4   0:12.67 redis-server',
    '4567   postgres  20   0  4096.0 1024.0  128.0 S   0.5   3.1   1:23.45 postgres',
    '5678   admin    20   0   512.0   64.0    8.0 S   0.1   0.2   0:02.34 sshd',
  ],
  'docker ps': [
    'CONTAINER ID   IMAGE              STATUS       PORTS                    NAMES',
    'a1b2c3d4e5f6   nginx:latest       Up 3 days    0.0.0.0:80->80/tcp       web-server',
    'e5f6g7h8i9j0   redis:7-alpine     Up 3 days    6379/tcp                 cache',
    'i9j0k1l2m3n4   postgres:15        Up 3 days    5432/tcp                 database',
  ],
  neofetch: [
    '        ████████████████        <span class="text-emerald-400">admin</span>@<span class="text-emerald-400">prod-web-01</span>',
    '     ██████████████████████     ───────────────────────',
    '   ██████████████████████████   <span class="text-emerald-400">OS:</span> Ubuntu 22.04 LTS',
    '  ████████            ████████  <span class="text-emerald-400">Kernel:</span> 5.15.0-91-generic',
    '  ████████  ████████  ████████  <span class="text-emerald-400">Uptime:</span> 47 days, 3 hours',
    '  ████████  ████████  ████████  <span class="text-emerald-400">Packages:</span> 847 (apt)',
    '   ██████████████████████████   <span class="text-emerald-400">Shell:</span> bash 5.1.16',
    '     ██████████████████████     <span class="text-emerald-400">CPU:</span> Intel Xeon E5-2680 v4 (8)',
    '        ████████████████        <span class="text-emerald-400">Memory:</span> 15872MiB / 32768MiB',
    '                              <span class="text-emerald-400">Disk:</span> 234G / 500G (47%)',
  ],
  clear: ['__CLEAR__'],
}

export function TerminalEmulator({ isConnected, serverName }: TerminalEmulatorProps) {
  const [lines, setLines] = useState<Array<{ text: string; isHtml?: boolean }>>([
    { text: 'Ai-Arena Terminal v1.0.0', isHtml: false },
    { text: 'Type "help" for available commands.', isHtml: false },
    { text: '', isHtml: false },
  ])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [isMinimized, setIsMinimized] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  const processCommand = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim().toLowerCase()
      const parts = trimmed.split(' ')
      const baseCmd = parts[0]

      const newLines: Array<{ text: string; isHtml?: boolean }> = [
        ...lines,
        { text: `$ ${cmd}`, isHtml: false },
      ]

      if (baseCmd === 'clear') {
        setLines([])
        return
      }

      if (baseCmd === 'ping' && parts[1]) {
        newLines.push({
          text: `PING ${parts[1]} (192.168.1.1): 56 data bytes`,
          isHtml: false,
        })
        for (let i = 0; i < 4; i++) {
          const time = (Math.random() * 5 + 0.5).toFixed(1)
          newLines.push({
            text: `64 bytes from 192.168.1.1: icmp_seq=${i} ttl=64 time=${time} ms`,
            isHtml: false,
          })
        }
        newLines.push({
          text: `\n--- ${parts[1]} ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss`,
          isHtml: false,
        })
      } else if (commandResponses[baseCmd]) {
        commandResponses[baseCmd].forEach((line) => {
          newLines.push({ text: line, isHtml: line.includes('<span') })
        })
      } else if (trimmed === '') {
        // empty
      } else {
        newLines.push({
          text: `bash: ${baseCmd}: command not found`,
          isHtml: false,
        })
      }

      newLines.push({ text: '', isHtml: false })
      setLines(newLines)
      setHistory([...history, cmd])
      setHistoryIdx(-1)
    },
    [lines, history]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      processCommand(input)
      setInput('')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length > 0) {
        const newIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1)
        setHistoryIdx(newIdx)
        setInput(history[newIdx])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx !== -1) {
        const newIdx = historyIdx + 1
        if (newIdx >= history.length) {
          setHistoryIdx(-1)
          setInput('')
        } else {
          setHistoryIdx(newIdx)
          setInput(history[newIdx])
        }
      }
    }
  }

  return (
    <div
      className={cn(
        'bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 transition-all duration-200',
        isConnected && 'border-emerald-500/30'
      )}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-zinc-300">Terminal</span>
          {serverName && (
            <span className="text-[10px] text-zinc-600 font-mono">{serverName}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-zinc-500 hover:text-white"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            <Minus className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-zinc-500 hover:text-white"
            onClick={() => setLines([])}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Terminal content */}
      {!isMinimized && (
        <div
          ref={scrollRef}
          className="p-3 h-64 overflow-y-auto font-mono text-xs leading-5 cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                'whitespace-pre-wrap break-all',
                line.text.startsWith('$ ') ? 'text-emerald-400' : 'text-zinc-300'
              )}
              dangerouslySetInnerHTML={line.isHtml ? { __html: line.text } : undefined}
            >
              {!line.isHtml && line.text}
            </div>
          ))}

          {/* Input line */}
          <div className="flex items-center">
            <span className="text-emerald-400">$ </span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent outline-none text-zinc-200 caret-emerald-400 font-mono text-xs ml-1"
              spellCheck={false}
              disabled={!isConnected}
              placeholder={!isConnected ? 'Not connected...' : ''}
            />
          </div>
        </div>
      )}
    </div>
  )
}
