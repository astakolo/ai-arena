'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Server as ServerType, useRemoteHubStore } from '@/lib/store'
import {
  Plug,
  Unplug,
  ChevronDown,
  KeyRound,
  Loader2,
  CheckCircle2,
  XCircle,
  Monitor,
  Webcam,
  Terminal,
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
import { toast } from 'sonner'

export function ConnectionPanel() {
  const { servers, selectedServer, setSelectedServer, isConnected, setConnected, setConnectionQuality } =
    useRemoteHubStore()
  const [licenseInput, setLicenseInput] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [showWebcam, setShowWebcam] = useState(true)
  const [showTerminal, setShowTerminal] = useState(true)
  const [activeTool, setActiveTool] = useState<'desktop' | 'webcam' | 'terminal'>('desktop')

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

      await fetch(`/api/servers/${selectedServer.id}/logs`, {
        method: 'POST', // This won't work but we'll handle it gracefully
      }).catch(() => {})
    } catch {
      // ignore
    }

    setConnected(false)
    setSelectedServer(null)
    setLicenseInput('')
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
                  placeholder="RH-xxxx-xxxx-xxxx-..."
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

          {/* Tool tabs */}
          <div className="flex gap-1 mt-3 bg-zinc-950 rounded-lg p-1">
            {[
              { id: 'desktop' as const, label: 'Desktop', icon: Monitor },
              { id: 'webcam' as const, label: 'Webcam', icon: Webcam },
              { id: 'terminal' as const, label: 'Terminal', icon: Terminal },
            ].map((tool) => {
              const Icon = tool.icon
              return (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all',
                    activeTool === tool.id
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tool.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Connected Views */}
      {isConnected && (
        <div className="space-y-4">
          {/* Desktop view (always visible) */}
          {activeTool === 'desktop' && (
            <RemoteDesktop
              isConnected={isConnected}
              serverName={selectedServer?.name}
              onToggleConnection={handleDisconnect}
              onQualityChange={setConnectionQuality}
            />
          )}

          {/* Webcam view */}
          {activeTool === 'webcam' && (
            <WebcamView isConnected={isConnected} serverName={selectedServer?.name} />
          )}

          {/* Terminal view */}
          {activeTool === 'terminal' && (
            <TerminalEmulator isConnected={isConnected} serverName={selectedServer?.hostname} />
          )}
        </div>
      )}
    </div>
  )
}
