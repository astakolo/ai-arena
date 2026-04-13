'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  Maximize2,
  Minimize2,
  Monitor,
  Wifi,
  WifiOff,
  Settings,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface RemoteDesktopProps {
  isConnected: boolean
  serverName?: string
  onToggleConnection?: () => void
  quality?: 'high' | 'medium' | 'low'
  onQualityChange?: (quality: 'high' | 'medium' | 'low') => void
}

export function RemoteDesktop({
  isConnected,
  serverName,
  onToggleConnection,
  quality = 'high',
  onQualityChange,
}: RemoteDesktopProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!isConnected || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = 960
    canvas.height = 540

    let animFrame: number
    let time = 0

    const drawDesktop = () => {
      time += 0.02
      ctx.fillStyle = '#1a1b2e'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Desktop wallpaper pattern
      for (let i = 0; i < 20; i++) {
        const x = (Math.sin(time + i * 0.5) * 0.5 + 0.5) * canvas.width
        const y = (Math.cos(time + i * 0.3) * 0.5 + 0.5) * canvas.height
        const radius = 30 + Math.sin(time + i) * 10
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.06)')
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Taskbar
      ctx.fillStyle = '#111827'
      ctx.fillRect(0, canvas.height - 36, canvas.width, 36)
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(0, canvas.height - 37, canvas.width, 1)

      // Start button
      ctx.fillStyle = '#10b981'
      ctx.fillRect(8, canvas.height - 30, 28, 22)
      ctx.fillStyle = '#ffffff'
      ctx.font = '10px sans-serif'
      ctx.fillText('⬡', 16, canvas.height - 15)

      // Taskbar windows
      const windows = ['Terminal', 'Browser', 'Files', 'Monitor']
      windows.forEach((win, i) => {
        const wx = 50 + i * 80
        ctx.fillStyle = i === 0 ? '#374151' : '#1f2937'
        ctx.fillRect(wx, canvas.height - 30, 70, 22)
        ctx.fillStyle = '#9ca3af'
        ctx.font = '8px sans-serif'
        ctx.fillText(win, wx + 8, canvas.height - 16)
      })

      // Clock
      const now = new Date()
      ctx.fillStyle = '#9ca3af'
      ctx.font = '9px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        canvas.width - 10,
        canvas.height - 15
      )
      ctx.textAlign = 'left'

      // Simulated window - Terminal
      const winW = 500
      const winH = 300
      const winX = 80
      const winY = 50

      // Window shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.fillRect(winX + 4, winY + 4, winW, winH)

      // Window background
      ctx.fillStyle = '#0d1117'
      ctx.fillRect(winX, winY, winW, winH)

      // Title bar
      ctx.fillStyle = '#161b22'
      ctx.fillRect(winX, winY, winW, 28)

      // Traffic lights
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(winX + 14, winY + 14, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#eab308'
      ctx.beginPath()
      ctx.arc(winX + 30, winY + 14, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#22c55e'
      ctx.beginPath()
      ctx.arc(winX + 46, winY + 14, 5, 0, Math.PI * 2)
      ctx.fill()

      // Title
      ctx.fillStyle = '#8b949e'
      ctx.font = '11px monospace'
      ctx.fillText('user@server: ~', winX + 60, winY + 18)

      // Terminal content
      ctx.font = '11px monospace'
      const lines = [
        '$ ssh admin@192.168.1.100',
        'Connected to Production Web Server',
        '$ docker ps',
        'CONTAINER ID  IMAGE           STATUS    PORTS',
        'a1b2c3d4      nginx:latest    Up 3d    0.0.0.0:80->80',
        'e5f6g7h8      redis:7         Up 3d    6379/tcp',
        'i9j0k1l2      postgres:15     Up 3d    5432/tcp',
        '',
        `$ uptime`,
        `14:23:01 up 47 days, 3:12, load avg: 0.15, 0.10, 0.09`,
        '',
        '$ _',
      ]

      lines.forEach((line, i) => {
        ctx.fillStyle = line.startsWith('$') ? '#10b981' : '#c9d1d9'
        ctx.fillText(line, winX + 10, winY + 46 + i * 17)
      })

      // Cursor blink
      if (Math.floor(time * 3) % 2 === 0) {
        ctx.fillStyle = '#10b981'
        ctx.fillRect(winX + 18, winY + 46 + (lines.length - 1) * 17 + 2, 8, 13)
      }

      // Simulated window - System Monitor
      const monW = 300
      const monH = 200
      const monX = 620
      const monY = 80

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.fillRect(monX + 4, monY + 4, monW, monH)
      ctx.fillStyle = '#1e1e2e'
      ctx.fillRect(monX, monY, monW, monH)
      ctx.fillStyle = '#2a2a3e'
      ctx.fillRect(monX, monY, monW, 28)
      ctx.fillStyle = '#a0a0b0'
      ctx.font = '11px sans-serif'
      ctx.fillText('System Monitor', monX + 12, monY + 18)

      // CPU graph
      ctx.fillStyle = '#374151'
      ctx.fillRect(monX + 10, monY + 40, monW - 20, 60)
      ctx.strokeStyle = '#10b981'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < monW - 20; i++) {
        const val = Math.sin(time * 2 + i * 0.05) * 15 + 25
        const y = monY + 100 - val
        if (i === 0) ctx.moveTo(monX + 10 + i, y)
        else ctx.lineTo(monX + 10 + i, y)
      }
      ctx.stroke()

      // CPU label
      ctx.fillStyle = '#6b7280'
      ctx.font = '9px sans-serif'
      ctx.fillText('CPU Usage: 23%', monX + 10, monY + 120)

      // RAM bar
      ctx.fillStyle = '#374151'
      ctx.fillRect(monX + 10, monY + 135, monW - 20, 12)
      ctx.fillStyle = '#6366f1'
      ctx.fillRect(monX + 10, monY + 135, (monW - 20) * 0.48, 12)
      ctx.fillStyle = '#9ca3af'
      ctx.font = '8px sans-serif'
      ctx.fillText('RAM: 15.4 / 32 GB', monX + 10, monY + 163)

      animFrame = requestAnimationFrame(drawDesktop)
    }

    drawDesktop()

    return () => cancelAnimationFrame(animFrame)
  }, [isConnected])

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const qualityLabels = { high: 'HD (1080p)', medium: 'SD (720p)', low: 'LD (480p)' }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative bg-zinc-950 rounded-xl overflow-hidden border',
        isConnected ? 'border-emerald-500/30' : 'border-zinc-800'
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-300">Remote Desktop</span>
          {serverName && (
            <span className="text-xs text-zinc-600 font-mono">— {serverName}</span>
          )}
          {isConnected ? (
            <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-0 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
              Live
            </Badge>
          ) : (
            <Badge className="text-[10px] bg-zinc-800 text-zinc-500 border-0 ml-1">Disconnected</Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isConnected && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-400 hover:text-white"
                onClick={() => setShowQualityMenu(!showQualityMenu)}
              >
                <Settings className="w-3.5 h-3.5" />
              </Button>
              {showQualityMenu && (
                <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg p-2 shadow-xl z-10 w-40">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 px-1">
                    Quality
                  </p>
                  {(['high', 'medium', 'low'] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        onQualityChange?.(q)
                        setShowQualityMenu(false)
                      }}
                      className={cn(
                        'w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors',
                        quality === q
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'text-zinc-400 hover:bg-zinc-800'
                      )}
                    >
                      {qualityLabels[q]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-white"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="relative aspect-video">
        {isConnected ? (
          <canvas ref={canvasRef} className="w-full h-full" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
              <WifiOff className="w-7 h-7 text-zinc-600" />
            </div>
            <h3 className="text-sm font-medium text-zinc-400">No Active Connection</h3>
            <p className="text-xs text-zinc-600 mt-1 max-w-xs text-center">
              Select a server and connect to view its remote desktop
            </p>
            {onToggleConnection && (
              <Button
                size="sm"
                className="mt-4 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onToggleConnection}
              >
                <Plug className="w-3.5 h-3.5 mr-1.5" />
                Connect to Server
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Bottom quality indicator */}
      {isConnected && (
        <div className="px-3 py-1.5 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 font-mono">
              {quality === 'high' ? '1920x1080' : quality === 'medium' ? '1280x720' : '854x480'}
            </span>
            <span className="text-[10px] text-zinc-500">30 FPS</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-emerald-500">Streaming</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Plug(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a6 6 0 0 1-6 6v0a6 6 0 0 1-6-6V8z" />
    </svg>
  )
}
