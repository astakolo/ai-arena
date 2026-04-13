'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Camera,
  CameraOff,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Move,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface WebcamViewProps {
  isConnected: boolean
  serverName?: string
}

export function WebcamView({ isConnected, serverName }: WebcamViewProps) {
  const [isPiP, setIsPiP] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [position, setPosition] = useState({ x: 16, y: 16 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isPiP) return
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
    setIsPiP(false)
  }

  const webcamContent = (
    <div
      className={cn(
        'bg-zinc-950 rounded-xl overflow-hidden border transition-all duration-200',
        isConnected ? 'border-emerald-500/30' : 'border-zinc-800',
        isPiP ? 'w-72 shadow-2xl shadow-black/50' : 'w-full',
        isDragging && 'cursor-grabbing'
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={isPiP ? { position: 'relative' } : undefined}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-1.5">
          {isPiP && <Move className="w-3 h-3 text-zinc-500 cursor-grab" />}
          <Camera className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-[10px] font-medium text-zinc-400">Webcam</span>
          {isConnected && (
            <Badge className="text-[8px] bg-red-500/15 text-red-400 border-0 px-1">
              REC
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-zinc-500 hover:text-white"
            onClick={() => setCameraEnabled(!cameraEnabled)}
          >
            {cameraEnabled ? (
              <Camera className="w-3 h-3" />
            ) : (
              <CameraOff className="w-3 h-3 text-red-400" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-zinc-500 hover:text-white"
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? (
              <VolumeX className="w-3 h-3 text-red-400" />
            ) : (
              <Volume2 className="w-3 h-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-zinc-500 hover:text-white"
            onClick={() => setIsPiP(!isPiP)}
          >
            <PictureInPicture2 className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-zinc-500 hover:text-white"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Video area */}
      <div
        className={cn(
          'relative bg-zinc-950 flex items-center justify-center',
          isPiP ? 'aspect-video' : isFullscreen ? 'aspect-video min-h-[400px]' : 'aspect-video'
        )}
      >
        {isConnected && cameraEnabled ? (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-zinc-950">
            {/* Simulated webcam feed */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                {/* Person silhouette */}
                <div className="w-24 h-24 rounded-full bg-zinc-800/80 border-2 border-zinc-700 flex items-center justify-center">
                  <Camera className="w-10 h-10 text-zinc-600" />
                </div>
                {/* Noise effect */}
                <div className="absolute inset-0 rounded-full opacity-20 bg-gradient-to-t from-transparent to-zinc-400" />
              </div>
            </div>

            {/* Scan lines effect */}
            <div
              className="absolute inset-0 opacity-5 pointer-events-none"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
              }}
            />

            {/* Server name overlay */}
            {serverName && (
              <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-0.5 rounded">
                <span className="text-[9px] text-zinc-300 font-mono">{serverName}</span>
              </div>
            )}

            {/* Resolution indicator */}
            <div className="absolute top-2 right-2 bg-black/50 px-1.5 py-0.5 rounded">
              <span className="text-[8px] text-zinc-400 font-mono">720p</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <CameraOff className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-[10px] text-zinc-600">
              {!isConnected ? 'Not connected' : 'Camera disabled'}
            </p>
          </div>
        )}
      </div>
    </div>
  )

  return webcamContent
}
