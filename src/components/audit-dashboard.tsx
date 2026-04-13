'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Shield,
  Eye,
  Keyboard,
  Terminal,
  Monitor,
  User,
  Search,
  Filter,
  Clock,
  AlertTriangle,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
  Clipboard,
  LogIn,
  Activity,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface AuditEntry {
  id: string
  serverId: string
  eventType: string
  username: string
  command: string | null
  windowTitle: string | null
  processName: string | null
  keysLogged: string | null
  timestamp: string
}

const eventTypeConfig: Record<string, { icon: typeof Keyboard; label: string; color: string; bg: string }> = {
  command: { icon: Terminal, label: 'Command', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  keystroke: { icon: Keyboard, label: 'Keystrokes', color: 'text-yellow-400', bg: 'bg-yellow-500/15' },
  login: { icon: LogIn, label: 'Login', color: 'text-blue-400', bg: 'bg-blue-500/15' },
  process: { icon: Activity, label: 'Process', color: 'text-purple-400', bg: 'bg-purple-500/15' },
  window_change: { icon: Monitor, label: 'Window', color: 'text-orange-400', bg: 'bg-orange-500/15' },
  file_access: { icon: FileText, label: 'File Access', color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
  clipboard: { icon: Clipboard, label: 'Clipboard', color: 'text-pink-400', bg: 'bg-pink-500/15' },
}

// Demo audit entries for when no real data exists
const demoEntries: AuditEntry[] = [
  {
    id: '1', serverId: 'demo1', eventType: 'login', username: 'TECH-Ade',
    command: null, windowTitle: 'Windows Logon', processName: 'logonui.exe', keysLogged: null,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '2', serverId: 'demo1', eventType: 'command', username: 'TECH-Ade',
    command: 'systeminfo', windowTitle: 'Command Prompt', processName: 'cmd.exe', keysLogged: null,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 30000).toISOString(),
  },
  {
    id: '3', serverId: 'demo1', eventType: 'command', username: 'TECH-Ade',
    command: 'net user', windowTitle: 'Command Prompt', processName: 'cmd.exe', keysLogged: null,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 60000).toISOString(),
  },
  {
    id: '4', serverId: 'demo1', eventType: 'keystroke', username: 'TECH-Ade',
    command: null, windowTitle: 'Run Dialog', processName: 'explorer.exe', keysLogged: 'regedit',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 90000).toISOString(),
  },
  {
    id: '5', serverId: 'demo1', eventType: 'process', username: 'TECH-Ade',
    command: 'regedit.exe started', windowTitle: 'Registry Editor', processName: 'regedit.exe', keysLogged: null,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 120000).toISOString(),
  },
  {
    id: '6', serverId: 'demo1', eventType: 'file_access', username: 'TECH-Ade',
    command: 'C:\\Windows\\System32\\config\\SAM accessed', windowTitle: 'Registry Editor', processName: 'regedit.exe', keysLogged: null,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 150000).toISOString(),
  },
  {
    id: '7', serverId: 'demo2', eventType: 'login', username: 'TECH-Chidi',
    command: null, windowTitle: 'Windows Logon', processName: 'logonui.exe', keysLogged: null,
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '8', serverId: 'demo2', eventType: 'command', username: 'TECH-Chidi',
    command: 'ipconfig /all', windowTitle: 'PowerShell', processName: 'powershell.exe', keysLogged: null,
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000 + 45000).toISOString(),
  },
  {
    id: '9', serverId: 'demo2', eventType: 'clipboard', username: 'TECH-Chidi',
    command: null, windowTitle: 'Chrome', processName: 'chrome.exe', keysLogged: 'password copied to clipboard',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000 + 90000).toISOString(),
  },
  {
    id: '10', serverId: 'demo3', eventType: 'command', username: 'ADMIN',
    command: 'dir C:\\Users\\Admin\\Documents', windowTitle: 'Command Prompt', processName: 'cmd.exe', keysLogged: null,
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '11', serverId: 'demo1', eventType: 'window_change', username: 'TECH-Ade',
    command: null, windowTitle: 'Chrome → Settings', processName: 'chrome.exe', keysLogged: null,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 180000).toISOString(),
  },
  {
    id: '12', serverId: 'demo1', eventType: 'keystroke', username: 'TECH-Ade',
    command: null, windowTitle: 'Chrome Address Bar', processName: 'chrome.exe', keysLogged: 'facebook.com/login',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 200000).toISOString(),
  },
]

export function AuditDashboard() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterUser, setFilterUser] = useState<string>('all')
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Try fetching real data, fall back to demo
    fetch('/api/audit')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setLogs(data)
        } else {
          setLogs(demoEntries)
        }
      })
      .catch(() => setLogs(demoEntries))
      .finally(() => setIsLoading(false))
  }, [])

  // Derive unique users
  const users = [...new Set(logs.map(l => l.username))]

  const filteredLogs = logs.filter(log => {
    const matchesSearch = !search ||
      (log.command || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.windowTitle || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.username || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.keysLogged || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.processName || '').toLowerCase().includes(search.toLowerCase())
    const matchesType = filterType === 'all' || log.eventType === filterType
    const matchesUser = filterUser === 'all' || log.username === filterUser
    return matchesSearch && matchesType && matchesUser
  })

  const highRiskCount = logs.filter(l =>
    (l.eventType === 'file_access' && (l.command || '').includes('config')) ||
    (l.eventType === 'process' && (l.command || '').includes('regedit')) ||
    (l.eventType === 'keystroke' && (l.keysLogged || '').includes('password')) ||
    (l.eventType === 'clipboard' && (l.keysLogged || '').includes('password')) ||
    (l.eventType === 'file_access' && (l.command || '').includes('SAM'))
  ).length

  const commandCount = logs.filter(l => l.eventType === 'command').length
  const loginCount = logs.filter(l => l.eventType === 'login').length
  const keystrokeCount = logs.filter(l => l.eventType === 'keystroke').length

  const handleRefresh = () => {
    setIsLoading(true)
    fetch('/api/audit')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d) && d.length > 0) setLogs(d) })
      .catch(() => {})
      .finally(() => setIsLoading(false))
    toast.info('Audit logs refreshed')
  }

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center">
            <Shield className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-300">Security Audit Trail</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Monitor all activity on your servers. Every command, keystroke, login, file access, and clipboard copy is logged and sent to your dashboard in real-time via Firebase.
            </p>
          </div>
          {highRiskCount > 0 && (
            <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs">
              {highRiskCount} high risk
            </Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-zinc-400" />
            <span className="text-xs text-zinc-500">Total Events</span>
          </div>
          <div className="text-xl font-bold text-white">{logs.length}</div>
        </div>
        <div className="bg-zinc-900/80 border border-emerald-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-zinc-500">Commands</span>
          </div>
          <div className="text-xl font-bold text-emerald-400">{commandCount}</div>
        </div>
        <div className="bg-zinc-900/80 border border-blue-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <LogIn className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-zinc-500">Logins</span>
          </div>
          <div className="text-xl font-bold text-blue-400">{loginCount}</div>
        </div>
        <div className="bg-zinc-900/80 border border-yellow-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Keyboard className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-zinc-500">Keystrokes</span>
          </div>
          <div className="text-xl font-bold text-yellow-400">{keystrokeCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search commands, users, windows..."
              className="pl-9 bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-600"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-40 bg-zinc-950 border-zinc-800 text-white">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="command">Commands</SelectItem>
              <SelectItem value="keystroke">Keystrokes</SelectItem>
              <SelectItem value="login">Logins</SelectItem>
              <SelectItem value="process">Processes</SelectItem>
              <SelectItem value="file_access">File Access</SelectItem>
              <SelectItem value="clipboard">Clipboard</SelectItem>
              <SelectItem value="window_change">Windows</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-full sm:w-40 bg-zinc-950 border-zinc-800 text-white">
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all">All Users</SelectItem>
              {users.map(u => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Audit Log Timeline */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-white">Activity Timeline</span>
            <Badge className="text-[10px] bg-zinc-800 text-zinc-400 border-0">
              {filteredLogs.length} events
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-zinc-400 hover:text-white"
            onClick={handleRefresh}
          >
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        <div className="max-h-[500px] overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 text-zinc-600 animate-spin mx-auto mb-2" />
              <p className="text-xs text-zinc-500">Loading audit logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-8 text-center">
              <Shield className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">
                {search || filterType !== 'all' || filterUser !== 'all'
                  ? 'No events match your filters'
                  : 'No audit events yet'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {filteredLogs.map((entry) => {
                const config = eventTypeConfig[entry.eventType] || eventTypeConfig.command
                const Icon = config.icon
                const isExpanded = expandedLog === entry.id
                const isHighRisk =
                  (entry.eventType === 'file_access' && (entry.command || '').includes('config')) ||
                  (entry.eventType === 'process' && (entry.command || '').includes('regedit')) ||
                  (entry.eventType === 'keystroke' && (entry.keysLogged || '').includes('password')) ||
                  (entry.eventType === 'clipboard' && (entry.keysLogged || '').includes('password')) ||
                  (entry.eventType === 'file_access' && (entry.command || '').includes('SAM'))

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-zinc-800/30',
                      isHighRisk && 'bg-red-500/5 hover:bg-red-500/10',
                      isExpanded && 'bg-zinc-800/20'
                    )}
                    onClick={() => setExpandedLog(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-start gap-3 px-4 py-3">
                      {/* Timeline dot */}
                      <div className="flex flex-col items-center pt-1">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', config.bg)}>
                          <Icon className={cn('w-4 h-4', config.color)} />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge className={cn('text-[9px] border-0 px-1.5 py-0', config.bg, config.color)}>
                            {config.label}
                          </Badge>
                          <span className="text-xs font-medium text-zinc-300">{entry.username}</span>
                          {isHighRisk && (
                            <Badge className="text-[8px] bg-red-500/20 text-red-400 border-0 px-1">
                              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                              HIGH RISK
                            </Badge>
                          )}
                        </div>

                        {/* Main event description */}
                        <p className="text-xs text-zinc-400 truncate">
                          {entry.eventType === 'command' && (
                            <span>
                              <code className="text-emerald-400 bg-zinc-900 px-1 rounded text-[11px]">
                                {entry.command}
                              </code>
                              <span className="text-zinc-600 mx-1">in</span>
                              <span>{entry.processName}</span>
                            </span>
                          )}
                          {entry.eventType === 'keystroke' && (
                            <span>
                              Typed: <code className="text-yellow-400 bg-zinc-900 px-1 rounded text-[11px]">
                                {entry.keysLogged}
                              </code>
                              <span className="text-zinc-600 mx-1">in</span>
                              <span>{entry.windowTitle}</span>
                            </span>
                          )}
                          {entry.eventType === 'login' && (
                            <span>User logged in via {entry.processName}</span>
                          )}
                          {entry.eventType === 'process' && (
                            <span>
                              {entry.command}
                            </span>
                          )}
                          {entry.eventType === 'file_access' && (
                            <span>
                              Accessed: <code className="text-cyan-400 bg-zinc-900 px-1 rounded text-[11px]">
                                {entry.command}
                              </code>
                            </span>
                          )}
                          {entry.eventType === 'clipboard' && (
                            <span>
                              Clipboard: <code className="text-pink-400 bg-zinc-900 px-1 rounded text-[11px]">
                                {entry.keysLogged}
                              </code>
                              <span className="text-zinc-600 mx-1">from</span>
                              <span>{entry.processName}</span>
                            </span>
                          )}
                          {entry.eventType === 'window_change' && (
                            <span>
                              Switched to: <span className="text-orange-400">{entry.windowTitle}</span>
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Time + expand */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-zinc-600" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-3 ml-11">
                        <div className="bg-zinc-950 rounded-lg p-3 space-y-1.5 text-[10px] font-mono">
                          <div className="flex gap-4">
                            <span className="text-zinc-600">User:</span>
                            <span className="text-zinc-300">{entry.username}</span>
                          </div>
                          <div className="flex gap-4">
                            <span className="text-zinc-600">Process:</span>
                            <span className="text-zinc-300">{entry.processName || 'N/A'}</span>
                          </div>
                          <div className="flex gap-4">
                            <span className="text-zinc-600">Window:</span>
                            <span className="text-zinc-300">{entry.windowTitle || 'N/A'}</span>
                          </div>
                          {entry.command && (
                            <div className="flex gap-4">
                              <span className="text-zinc-600">Command:</span>
                              <span className="text-emerald-400">{entry.command}</span>
                            </div>
                          )}
                          {entry.keysLogged && (
                            <div className="flex gap-4">
                              <span className="text-zinc-600">Keys:</span>
                              <span className="text-yellow-400">{entry.keysLogged}</span>
                            </div>
                          )}
                          <div className="flex gap-4">
                            <span className="text-zinc-600">Time:</span>
                            <span className="text-zinc-300">{new Date(entry.timestamp).toLocaleString()}</span>
                          </div>
                          <div className="flex gap-4">
                            <span className="text-zinc-600">Server:</span>
                            <span className="text-zinc-300">{entry.serverId}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          How the Audit System Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-zinc-400">
          <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
            <div className="flex items-center gap-2 mb-1.5">
              <Keyboard className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-[10px] font-medium text-zinc-300">1. Agent Captures</span>
            </div>
            <p className="text-[10px]">The Ai-Arena agent running on each server monitors PowerShell transcription logging, Windows Event Logs (Event 4688), clipboard changes, and process creation events.</p>
          </div>
          <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
            <div className="flex items-center gap-2 mb-1.5">
              <Monitor className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-medium text-zinc-300">2. Sends to Firebase</span>
            </div>
            <p className="text-[10px]">All captured events are sent to your Firebase Realtime Database in real-time. No direct connection to your server is needed — Firebase handles everything.</p>
          </div>
          <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
            <div className="flex items-center gap-2 mb-1.5">
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] font-medium text-zinc-300">3. You Review</span>
            </div>
            <p className="text-[10px]">Review everything from this dashboard. High-risk events (registry access, password keystrokes, SAM file access) are automatically flagged in red for your attention.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
