'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Radio,
  Activity,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface MicrophoneViewProps {
  isConnected: boolean
  serverName?: string
}

export function MicrophoneView({ isConnected, serverName }: MicrophoneViewProps) {
  const [isListening, setIsListening] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [audioHistory, setAudioHistory] = useState<number[]>(new Array(60).fill(0))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number>(0)

  // Simulated audio level visualization
  useEffect(() => {
    if (!isListening || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // Generate new volume level
      const newLevel = isMuted ? 0 : Math.random() * 0.6 + Math.sin(Date.now() / 500) * 0.15 + 0.1
      const clampedLevel = Math.max(0, Math.min(1, newLevel))
      setVolumeLevel(clampedLevel)

      setAudioHistory((prev) => {
        const newHistory = [...prev.slice(1), clampedLevel]
        return newHistory
      })

      // Draw waveform
      const barCount = audioHistory.length
      const barWidth = w / barCount - 1

      for (let i = 0; i < barCount; i++) {
        const value = audioHistory[i]
        const barHeight = value * h * 0.8
        const x = i * (barWidth + 1)
        const y = (h - barHeight) / 2

        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight)
        gradient.addColorStop(0, `rgba(16, 185, 129, ${0.3 + value * 0.7})`)
        gradient.addColorStop(0.5, `rgba(52, 211, 153, ${0.5 + value * 0.5})`)
        gradient.addColorStop(1, `rgba(16, 185, 129, ${0.3 + value * 0.7})`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, 2)
        ctx.fill()
      }

      // Center line
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()

      animFrameRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isListening, isMuted, audioHistory])

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

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

  const getVolumeLabel = () => {
    if (isMuted) return 'Muted'
    if (volumeLevel < 0.2) return 'Quiet'
    if (volumeLevel < 0.5) return 'Normal'
    if (volumeLevel < 0.75) return 'Loud'
    return 'Very Loud'
  }

  if (!isConnected) {
    return (
      <div className="bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-900 border-b border-zinc-800">
          <Mic className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-300">Microphone</span>
        </div>
        <div className="flex flex-col items-center justify-center py-16 bg-zinc-950">
          <MicOff className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-xs text-zinc-500">Connect to a server to access microphone</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'bg-zinc-950 rounded-xl overflow-hidden border transition-all duration-200',
        isListening ? 'border-emerald-500/30' : 'border-zinc-800'
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          {isListening ? (
            <Radio className="w-4 h-4 text-red-400 animate-pulse" />
          ) : (
            <Mic className="w-4 h-4 text-zinc-400" />
          )}
          <span className="text-xs font-medium text-zinc-300">Microphone</span>
          {serverName && (
            <span className="text-[10px] text-zinc-600 font-mono">— {serverName}</span>
          )}
          {isListening && (
            <Badge className={cn(
              'text-[8px] border-0 px-1',
              isMuted ? 'bg-zinc-700 text-zinc-400' : 'bg-red-500/15 text-red-400'
            )}>
              {isMuted ? 'PAUSED' : 'LIVE'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Volume indicator */}
          {isListening && (
            <div className="flex items-center gap-1.5 mr-2 px-2 py-1 bg-zinc-950 rounded-md">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-zinc-400 font-mono">{getVolumeLabel()}</span>
              <div className="flex items-end gap-px h-3">
                {[0.3, 0.6, 1, 0.8, 0.4].map((h, i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-1 rounded-sm transition-all',
                      isMuted ? 'bg-zinc-700' : 'bg-emerald-400',
                    )}
                    style={{ height: `${h * 12}px`, opacity: isMuted ? 0.3 : 0.5 + Math.random() * 0.5 }}
                  />
                ))}
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-white"
            onClick={() => {
              if (!isListening) {
                setIsListening(true)
                toast.success('Microphone stream started')
              } else {
                setIsListening(false)
                toast.info('Microphone stream stopped')
              }
            }}
          >
            {isListening ? (
              <MicOff className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
          </Button>
          {isListening && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-white"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Waveform visualization */}
      <div className="relative" style={{ height: isFullscreen ? '300px' : '200px' }}>
        {!isListening ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950">
            <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
              <Mic className="w-7 h-7 text-zinc-600" />
            </div>
            <h3 className="text-sm font-medium text-zinc-400">Microphone Inactive</h3>
            <p className="text-xs text-zinc-600 mt-1 max-w-xs text-center">
              Click the microphone button to start listening to this server&apos;s audio input
            </p>
            <Button
              size="sm"
              className="mt-4 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setIsListening(true)
                toast.success('Microphone stream started')
              }}
            >
              <Mic className="w-3.5 h-3.5 mr-1.5" />
              Start Listening
            </Button>
          </div>
        ) : (
          <div className="absolute inset-0 bg-zinc-950 p-4">
            <canvas ref={canvasRef} className="w-full h-full" />
            {isMuted && (
              <div className="absolute inset-0 bg-zinc-950/60 flex items-center justify-center backdrop-blur-sm">
                <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <VolumeX className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-zinc-300">Audio Paused</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom info bar */}
      {isListening && (
        <div className="px-3 py-1.5 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 font-mono">44.1 kHz</span>
            <span className="text-[10px] text-zinc-500">16-bit</span>
            <span className="text-[10px] text-zinc-500">Mono</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              isMuted ? 'bg-zinc-600' : 'bg-emerald-500 animate-pulse'
            )} />
            <span className={cn(
              'text-[10px]',
              isMuted ? 'text-zinc-600' : 'text-emerald-500'
            )}>
              {isMuted ? 'Paused' : 'Streaming'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
