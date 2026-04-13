'use client'

import { Server as ServerType } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  Monitor,
  Cpu,
  MemoryStick,
  Globe,
  Clock,
  MoreVertical,
  Plug,
  Pencil,
  Trash2,
  Copy,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useState } from 'react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface ServerCardProps {
  server: ServerType
  onConnect: (server: ServerType) => void
  onEdit: (server: ServerType) => void
  onDelete: (server: ServerType) => void
}

export function ServerCard({ server, onConnect, onEdit, onDelete }: ServerCardProps) {
  const [showDelete, setShowDelete] = useState(false)
  const isOnline = server.status === 'online'
  const isConnecting = server.status === 'connecting'

  const copyKey = () => {
    navigator.clipboard.writeText(server.licenseKey)
    toast.success('License key copied to clipboard')
  }

  return (
    <>
      <div
        className={cn(
          'group relative bg-zinc-900/80 border rounded-xl p-4 transition-all duration-300 hover:border-zinc-600',
          isOnline ? 'border-emerald-500/30 hover:border-emerald-500/50' : 'border-zinc-800',
          isConnecting && 'border-yellow-500/30 animate-pulse'
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                isOnline
                  ? 'bg-emerald-500/15'
                  : isConnecting
                    ? 'bg-yellow-500/15'
                    : 'bg-zinc-800'
              )}
            >
              <Monitor
                className={cn(
                  'w-5 h-5',
                  isOnline ? 'text-emerald-400' : isConnecting ? 'text-yellow-400' : 'text-zinc-600'
                )}
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">{server.name}</h3>
              <p className="text-xs text-zinc-500 font-mono">{server.hostname}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] uppercase tracking-wider border-0',
                isOnline && 'bg-emerald-500/15 text-emerald-400',
                isConnecting && 'bg-yellow-500/15 text-yellow-400',
                !isOnline && !isConnecting && 'bg-zinc-800 text-zinc-500'
              )}
            >
              {isOnline && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
              )}
              {server.status}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-white">
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                <DropdownMenuItem onClick={() => onConnect(server)}>
                  <Plug className="w-4 h-4 mr-2" />
                  Connect
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(server)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyKey}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy License Key
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDelete(true)}
                  className="text-red-400 focus:text-red-400"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="flex items-center gap-2 text-zinc-400">
            <Globe className="w-3.5 h-3.5 text-zinc-600" />
            <span className="font-mono">{server.ip}:{server.port}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Cpu className="w-3.5 h-3.5 text-zinc-600" />
            <span className="truncate">{server.cpu || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <MemoryStick className="w-3.5 h-3.5 text-zinc-600" />
            <span>{server.ram || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Clock className="w-3.5 h-3.5 text-zinc-600" />
            <span>
              {server.lastSeen
                ? formatDistanceToNow(new Date(server.lastSeen), { addSuffix: true })
                : 'Never'}
            </span>
          </div>
        </div>

        {server.os && (
          <div className="mb-3">
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md font-mono">
              {server.os}
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            className={cn(
              'flex-1 h-8 text-xs',
              isOnline
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            )}
            onClick={() => onConnect(server)}
          >
            <Plug className="w-3.5 h-3.5 mr-1.5" />
            Connect
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
            onClick={copyKey}
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Server</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete &quot;{server.name}&quot;? This action cannot be undone. All
              connection logs and license keys will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => onDelete(server)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
