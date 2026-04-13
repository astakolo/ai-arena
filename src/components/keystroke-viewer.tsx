'use client'

import { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Keyboard,
  KeyboardOff,
  Search,
  Filter,
  Download,
  Trash2,
  Pause,
  Play,
  AlertTriangle,
  Clock,
  Monitor,
  FileText,
  ChevronDown,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface KeystrokeViewerProps {
  isConnected: boolean
  serverName?: string
}

interface KeystrokeEntry {
  id: string
  timestamp: string
  text: string
  windowTitle: string
  processName: string
  eventType: 'keypress' | 'copy' | 'paste' | 'delete' | 'login' | 'command'
  username: string
  hostname: string
}

// Simulated keystroke data for demo mode
function generateDemoKeystrokes(): KeystrokeEntry[] {
  const now = Date.now()
  const entries: KeystrokeEntry[] = []

  const sampleEntries = [
    { text: 'netstat -ano | findstr ESTABLISHED', windowTitle: 'cmd.exe', processName: 'cmd.exe', eventType: 'command' as const },
    { text: 'ssh admin@192.168.1.50', windowTitle: 'Windows Terminal', processName: 'powershell.exe', eventType: 'keypress' as const },
    { text: 'password123', windowTitle: 'PuTTY', processName: 'putty.exe', eventType: 'keypress' as const },
    { text: 'sudo apt update && sudo apt upgrade -y', windowTitle: 'Terminal', processName: 'bash', eventType: 'command' as const },
    { text: 'SELECT * FROM users WHERE active = 1;', windowTitle: 'MySQL Workbench', processName: 'mysql-workbench', eventType: 'keypress' as const },
    { text: 'https://internal-dashboard.company.com', windowTitle: 'Google Chrome', processName: 'chrome.exe', eventType: 'keypress' as const },
    { text: 'C:\\\\Users\\\\Admin\\\\Documents\\\\credentials.json', windowTitle: 'File Explorer', processName: 'explorer.exe', eventType: 'keypress' as const },
    { text: 'systemctl restart nginx', windowTitle: 'SSH Terminal', processName: 'ssh', eventType: 'command' as const },
    { text: 'docker-compose up -d --build', windowTitle: 'Visual Studio Code', processName: 'code.exe', eventType: 'command' as const },
    { text: 'Logon Type 10 - RemoteInteractive', windowTitle: 'Windows Logon', processName: 'logonui.exe', eventType: 'login' as const },
    { text: 'scp backup.tar.gz root@10.0.0.5:/backup/', windowTitle: 'cmd.exe', processName: 'cmd.exe', eventType: 'command' as const },
    { text: 'crontab -e', windowTitle: 'SSH Terminal', processName: 'bash', eventType: 'command' as const },
    { text: 'chmod 600 /etc/ssh/sshd_config', windowTitle: 'Terminal', processName: 'bash', eventType: 'command' as const },
    { text: 'pip install requests flask pymongo', windowTitle: 'cmd.exe', processName: 'cmd.exe', eventType: 'command' as const },
    { text: 'User login: technician01', windowTitle: 'Windows Security', processName: 'LogonUI.exe', eventType: 'login' as const },
    { text: 'openssl rand -hex 32', windowTitle: 'Windows Terminal', processName: 'powershell.exe', eventType: 'command' as const },
    { text: 'curl -X GET http://localhost:8080/health', windowTitle: 'Terminal', processName: 'bash', eventType: 'command' as const },
    { text: 'aws s3 ls s3://company-backups/', windowTitle: 'AWS CLI', processName: 'aws.exe', eventType: 'command' as const },
  ]

  sampleEntries.forEach((entry, i) => {
    entries.push({
      id: `demo-${i}`,
      timestamp: new Date(now - (sampleEntries.length - i) * 45000 + Math.random() * 20000).toISOString(),
      text: entry.text,
      windowTitle: entry.windowTitle,
      processName: entry.processName,
      eventType: entry.eventType,
      username: 'admin',
      hostname: serverName || 'PROD-WEB-01',
    })
  })

  return entries
}

function getEventTypeBadge(eventType: string) {
  switch (eventType) {
    case 'command':
      return <Badge className="text-[8px] bg-blue-500/15 text-blue-400 border-0">CMD</Badge>
    case 'login':
      return <Badge className="text-[8px] bg-yellow-500/15 text-yellow-400 border-0">LOGIN</Badge>
    case 'copy':
      return <Badge className="text-[8px] bg-purple-500/15 text-purple-400 border-0">COPY</Badge>
    case 'paste':
      return <Badge className="text-[8px] bg-orange-500/15 text-orange-400 border-0">PASTE</Badge>
    case 'delete':
      return <Badge className="text-[8px] bg-red-500/15 text-red-400 border-0">DEL</Badge>
    default:
      return <Badge className="text-[8px] bg-zinc-700 text-zinc-400 border-0">KEY</Badge>
  }
}

function formatTimestamp(ts: string) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function maskSensitiveText(text: string): string {
  const sensitivePatterns = [
    /password[\s]*[=:]\s*\S+/gi,
    /--password\s+\S+/gi,
    /-p\s+\S+/gi,
    /secret[\s]*[=:]\s*\S+/gi,
    /token[\s]*[=:]\s*\S+/gi,
    /api[_-]?key[\s]*[=:]\s*\S+/gi,
  ]
  let masked = text
  for (const pattern of sensitivePatterns) {
    masked = masked.replace(pattern, (match) => {
      const parts = match.split(/\s*[=:]\s*/)
      return parts[0] + (match.includes('=') || match.includes(':') ? ' = ********' : ' ********')
    })
  }
  return masked
}

export function KeystrokeViewer({ isConnected, serverName }: KeystrokeViewerProps) {
  const [keystrokes, setKeystrokes] = useState<KeystrokeEntry[]>(() => {
    const demo = generateDemoKeystrokes()
    return demo
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [isCapturing, setIsCapturing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [keystrokes, autoScroll])

  const filteredKeystrokes = keystrokes.filter((entry) => {
    const matchesSearch = !searchQuery ||
      entry.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.windowTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.processName.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = filterType === 'all' || entry.eventType === filterType
    return matchesSearch && matchesType
  })

  const handleToggleCapture = () => {
    if (!isCapturing) {
      setIsCapturing(true)
      setIsPaused(false)
      toast.success('Keystroke capture started on remote agent')
      // Simulate new entries arriving
      const interval = setInterval(() => {
        if (Math.random() > 0.3) {
          const sampleCommands = [
            'ls -la /var/log/',
            'cat /etc/passwd',
            'ping google.com',
            'whoami',
            'df -h',
            'top -bn1',
            'netstat -tulpn',
            'ps aux',
          ]
          const newEntry: KeystrokeEntry = {
            id: `live-${Date.now()}`,
            timestamp: new Date().toISOString(),
            text: sampleCommands[Math.floor(Math.random() * sampleCommands.length)],
            windowTitle: ['Terminal', 'SSH Session', 'bash', 'cmd.exe'][Math.floor(Math.random() * 4)],
            processName: ['bash', 'ssh', 'cmd.exe', 'powershell.exe'][Math.floor(Math.random() * 4)],
            eventType: Math.random() > 0.8 ? 'login' : 'command',
            username: 'admin',
            hostname: serverName || 'PROD-WEB-01',
          }
          setKeystrokes((prev) => [...prev.slice(-200), newEntry])
        }
      }, 3000)
      // Store interval for cleanup
      ;(window as unknown as Record<string, number>).__keystrokeInterval = interval
    } else {
      setIsCapturing(false)
      setIsPaused(false)
      clearInterval((window as unknown as Record<string, number>).__keystrokeInterval)
      toast.info('Keystroke capture stopped')
    }
  }

  const handleExport = () => {
    const dataToExport = filteredKeystrokes.map((entry) => ({
      timestamp: entry.timestamp,
      text: entry.text,
      window: entry.windowTitle,
      process: entry.processName,
      type: entry.eventType,
      user: entry.username,
      host: entry.hostname,
    }))
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `keystroke-log-${serverName || 'server'}-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${filteredKeystrokes.length} entries`)
  }

  const handleClear = () => {
    setKeystrokes([])
    toast.info('Keystroke log cleared')
  }

  const uniqueTypes = [...new Set(keystrokes.map((k) => k.eventType))]

  if (!isConnected) {
    return (
      <div className="bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-900 border-b border-zinc-800">
          <Keyboard className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-300">Keystroke Logger</span>
        </div>
        <div className="flex flex-col items-center justify-center py-16 bg-zinc-950">
          <KeyboardOff className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-xs text-zinc-500">Connect to a server to view keystroke logs</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-zinc-950 rounded-xl overflow-hidden border border-emerald-500/30">
      {/* Toolbar */}
      <div className="px-3 py-2 bg-zinc-900 border-b border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-zinc-300">Keystroke Logger</span>
            {serverName && (
              <span className="text-[10px] text-zinc-600 font-mono">{serverName}</span>
            )}
            {isCapturing && (
              <Badge className={cn(
                'text-[8px] border-0 px-1',
                isPaused ? 'bg-yellow-500/15 text-yellow-400' : 'bg-red-500/15 text-red-400'
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full mr-1', isPaused ? 'bg-yellow-400' : 'bg-red-400 animate-pulse')} />
                {isPaused ? 'PAUSED' : 'RECORDING'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7',
                isCapturing
                  ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                  : 'text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10'
              )}
              onClick={handleToggleCapture}
            >
              {isCapturing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </Button>
            {isCapturing && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-400 hover:text-white"
                onClick={() => setIsPaused(!isPaused)}
              >
                {isPaused ? <Play className="w-3.5 h-3.5 text-yellow-400" /> : <Pause className="w-3.5 h-3.5" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white"
              onClick={handleExport}
              disabled={filteredKeystrokes.length === 0}
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-red-400"
              onClick={handleClear}
              disabled={keystrokes.length === 0}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keystrokes, windows, processes..."
              className="h-6 pl-6 pr-3 bg-zinc-950 border-zinc-800 text-xs font-mono text-zinc-300"
            />
          </div>
        </div>

        {showFilters && (
          <div className="flex items-center gap-1.5 pb-1">
            <span className="text-[10px] text-zinc-500 mr-1">Filter:</span>
            <button
              onClick={() => setFilterType('all')}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] transition-colors',
                filterType === 'all' ? 'bg-emerald-500/15 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              )}
            >
              All ({keystrokes.length})
            </button>
            {uniqueTypes.map((type) => {
              const count = keystrokes.filter((k) => k.eventType === type).length
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(filterType === type ? 'all' : type)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] transition-colors',
                    filterType === type ? 'bg-emerald-500/15 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  )}
                >
                  {type.toUpperCase()} ({count})
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Warning Banner */}
      <div className="px-3 py-1.5 bg-yellow-500/5 border-b border-yellow-500/10 flex items-center gap-2">
        <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
        <p className="text-[10px] text-yellow-400/70">
          Keystroke logging captures all keyboard input on the remote machine. Use responsibly and in compliance with local regulations.
        </p>
      </div>

      {/* Keystroke Log */}
      <div
        ref={scrollRef}
        className="max-h-[420px] overflow-y-auto font-mono"
        onScroll={(e) => {
          const el = e.currentTarget
          const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
          setAutoScroll(isAtBottom)
        }}
      >
        {filteredKeystrokes.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-zinc-500 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
                <th className="text-left px-3 py-2 font-medium w-16">Time</th>
                <th className="text-left px-3 py-2 font-medium w-14">Type</th>
                <th className="text-left px-3 py-2 font-medium">Content</th>
                <th className="text-left px-3 py-2 font-medium w-36">Window</th>
                <th className="text-left px-3 py-2 font-medium w-28">Process</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeystrokes.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-zinc-900/50 hover:bg-zinc-900/60 transition-colors"
                >
                  <td className="px-3 py-1.5 text-[10px] text-zinc-600 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatTimestamp(entry.timestamp)}
                    </div>
                    <div className="text-[8px] text-zinc-700 mt-0.5">{formatDate(entry.timestamp)}</div>
                  </td>
                  <td className="px-3 py-1.5">
                    {getEventTypeBadge(entry.eventType)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-zinc-300 max-w-md truncate">
                    {entry.eventType === 'login' ? (
                      <span className="text-yellow-400/80">{entry.text}</span>
                    ) : (
                      <span className={entry.eventType === 'command' ? 'text-blue-300/90' : 'text-zinc-300'}>
                        {maskSensitiveText(entry.text)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-[10px] text-zinc-500 truncate" title={entry.windowTitle}>
                    <div className="flex items-center gap-1">
                      <Monitor className="w-2.5 h-2.5 shrink-0" />
                      {entry.windowTitle}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-[10px] text-zinc-600 truncate" title={entry.processName}>
                    <div className="flex items-center gap-1">
                      <FileText className="w-2.5 h-2.5 shrink-0" />
                      {entry.processName}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <Keyboard className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-600">
              {searchQuery || filterType !== 'all'
                ? 'No keystrokes match your filters'
                : keystrokes.length === 0
                  ? 'No keystroke data yet. Start capture to begin recording.'
                  : 'No entries to display'}
            </p>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1.5 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-600">
        <div className="flex items-center gap-3">
          <span>{filteredKeystrokes.length} entries</span>
          {keystrokes.length !== filteredKeystrokes.length && (
            <span className="text-zinc-500">(filtered from {keystrokes.length})</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Keyboard className="w-2.5 h-2.5" />
            {isCapturing ? (isPaused ? 'Paused' : 'Recording') : 'Inactive'}
          </span>
          <button
            onClick={() => setAutoScroll(true)}
            className={cn(
              'flex items-center gap-1 transition-colors',
              autoScroll ? 'text-emerald-500' : 'text-zinc-600 hover:text-zinc-400'
            )}
          >
            <ChevronDown className="w-2.5 h-2.5" />
            {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          </button>
        </div>
      </div>
    </div>
  )
}
