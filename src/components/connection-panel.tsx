'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAiArenaStore } from '@/lib/store'
import {
  Plug,
  Unplug,
  KeyRound,
  Loader2,
  CheckCircle2,
  Monitor,
  Webcam,
  Terminal,
  FolderOpen,
  Mic,
  MapPin,
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
import { RemoteDesktop } from '@/components/remote-desktop'
import { WebcamView } from '@/components/webcam-view'
import { TerminalEmulator } from '@/components/terminal-emulator'
import { FileBrowser } from '@/components/file-browser'
import { MicrophoneView } from '@/components/microphone-view'
import { toast } from 'sonner'

type ToolTab = 'desktop' | 'webcam' | 'terminal' | 'files' | 'mic'

const toolTabs: { id: ToolTab; label: string; icon: typeof Monitor }[] = [
  { id: 'desktop', label: 'Desktop', icon: Monitor },
  { id: 'webcam', label: 'Webcam', icon: Webcam },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'mic', label: 'Microphone', icon: Mic },
]

export function ConnectionPanel() {
  const { servers, selectedServer, setSelectedServer, isConnected, setConnected, setConnectionQuality } =
    useAiArenaStore()
  const [licenseInput, setLicenseInput] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [activeTool, setActiveTool] = useState<ToolTab>('desktop')

  const handleSelectServer = (serverId: string) => {
    const server = servers.find((s) => s.id === serverId)
    if (server) {
      setSelectedServer(server)
      setLicenseInput('')
    }
  }

  const handleVerifyAndConnect = async () => {
    if (!selectedServer) {
      toast.error('Please select a server first')
      return
    }

    if (!licenseInput.trim()) {
      toast.error('Please enter a license key')
      return
    }

    setIsVerifying(true)

    try {
      const res = await fetch('/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: licenseInput.trim() }),
      })

      const data = await res.json()

      if (data.valid && data.server?.id === selectedServer.id) {
        toast.success('License key verified. Connecting...')

        // Initiate connection
        const connectRes = await fetch(`/api/servers/${selectedServer.id}/connect`, {
          method: 'POST',
        })
        const connectData = await connectRes.json()

        if (connectData.success) {
          setConnected(true)
          toast.success(`Connected to ${selectedServer.name}`)
        }
      } else {
        toast.error(data.error || 'Invalid license key for this server')
      }
    } catch {
      toast.error('Connection failed. Please try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleDisconnect = async () => {
    if (!selectedServer) return

    try {
      await fetch(`/api/servers/${selectedServer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'online' }),
      })
    } catch {
      // ignore
    }

    setConnected(false)
    setSelectedServer(null)
    setLicenseInput('')
    setActiveTool('desktop')
    toast.info('Disconnected from server')
  }

  return (
    <div className="space-y-4">
      {/* Connection Controls */}
      {!isConnected ? (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Plug className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Connect to Server</h3>
          </div>

          {/* Unattended access notice */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-medium text-emerald-400">Unattended Access Ready</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Servers with the agent installed via the .bat installer will auto-start on boot after power outages. No one needs to be on-site.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Server</label>
              <Select onValueChange={handleSelectServer}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue placeholder="Select a server..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {servers.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full',
                            server.status === 'online'
                              ? 'bg-emerald-400'
                              : server.status === 'connecting'
                                ? 'bg-yellow-400'
                                : 'bg-zinc-600'
                          )}
                        />
                        <span>{server.name}</span>
                        <span className="text-zinc-500 text-xs font-mono">
                          {server.hostname}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">License Key</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value)}
                  placeholder="AI-xxxx-xxxx-xxxx-..."
                  className="pl-9 bg-zinc-950 border-zinc-800 text-white font-mono text-sm placeholder:text-zinc-600"
                />
              </div>
              {selectedServer && (
                <p className="text-[10px] text-zinc-600">
                  Expected key for {selectedServer.name}: {selectedServer.licenseKey.slice(0, 12)}...
                </p>
              )}
            </div>

            <Button
              onClick={handleVerifyAndConnect}
              disabled={isVerifying || !selectedServer}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-10"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Plug className="w-4 h-4 mr-2" />
                  Connect
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900/80 border border-emerald-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {selectedServer?.name || 'Connected'}
                </h3>
                <p className="text-xs text-zinc-500">
                  {selectedServer?.hostname} ({selectedServer?.ip})
                </p>
                {selectedServer?.country && (
                  <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />
                    {selectedServer.countryCode ? String.fromCodePoint(...[...selectedServer.countryCode.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : ''}
                    {' '}{selectedServer.city}{selectedServer.city && selectedServer.country ? ', ' : ''}{selectedServer.country}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleDisconnect}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 h-8 text-xs"
            >
              <Unplug className="w-3.5 h-3.5 mr-1.5" />
              Disconnect
            </Button>
          </div>

          {/* Tool tabs - scrollable on mobile */}
          <div className="flex gap-1 mt-3 bg-zinc-950 rounded-lg p-1 overflow-x-auto">
            {toolTabs.map((tool) => {
              const Icon = tool.icon
              return (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-all whitespace-nowrap shrink-0',
                    activeTool === tool.id
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'text-zinc-500 hover:text-zinc-300',
                    // Desktop & webcam share space, terminal/files/mic fill
                    tool.id === 'terminal' || tool.id === 'files' || tool.id === 'mic' ? 'flex-1 min-w-0' : 'flex-1 min-w-0'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tool.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Connected Views */}
      {isConnected && (
        <div className="space-y-4">
          {activeTool === 'desktop' && (
            <RemoteDesktop
              isConnected={isConnected}
              serverName={selectedServer?.name}
              onToggleConnection={handleDisconnect}
              onQualityChange={setConnectionQuality}
            />
          )}

          {activeTool === 'webcam' && (
            <WebcamView isConnected={isConnected} serverName={selectedServer?.name} />
          )}

          {activeTool === 'terminal' && (
            <TerminalEmulator isConnected={isConnected} serverName={selectedServer?.hostname} />
          )}

          {activeTool === 'files' && (
            <FileBrowser isConnected={isConnected} serverName={selectedServer?.name} />
          )}

          {activeTool === 'mic' && (
            <MicrophoneView isConnected={isConnected} serverName={selectedServer?.name} />
          )}
        </div>
      )}
    </div>
  )
}
