'use client'

import { Server } from '@/lib/store'
import {
  Server as ServerIcon,
  Wifi,
  WifiOff,
  Loader2,
  Activity,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface StatsOverviewProps {
  servers: Server[]
  recentLogs?: Array<{ action: string; details: string | null; createdAt: string; serverId: string }>
  serversMap?: Record<string, Server>
}

export function StatsOverview({ servers, recentLogs, serversMap }: StatsOverviewProps) {
  const onlineCount = servers.filter((s) => s.status === 'online').length
  const offlineCount = servers.filter((s) => s.status === 'offline').length
  const connectingCount = servers.filter((s) => s.status === 'connecting').length
  const totalCount = servers.length

  const stats = [
    {
      label: 'Total Servers',
      value: totalCount,
      icon: ServerIcon,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      label: 'Online',
      value: onlineCount,
      icon: Wifi,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      label: 'Offline',
      value: offlineCount,
      icon: WifiOff,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
    },
    {
      label: 'Connecting',
      value: connectingCount,
      icon: Loader2,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className={cn(
                'bg-zinc-900/80 border rounded-xl p-4 transition-all duration-200 hover:scale-[1.02]',
                stat.border
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', stat.bg)}>
                  <Icon className={cn('w-4 h-4', stat.color)} />
                </div>
              </div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{stat.label}</div>
            </div>
          )
        })}
      </div>

      {recentLogs && recentLogs.length > 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {recentLogs.slice(0, 8).map((log, i) => {
              const server = serversMap?.[log.serverId]
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 text-xs py-1.5 border-b border-zinc-800/50 last:border-0"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-zinc-300 truncate flex-1">{log.details || log.action}</span>
                  {server && (
                    <span className="text-zinc-600 shrink-0 font-mono">{server.name}</span>
                  )}
                  <span className="text-zinc-600 shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {totalCount === 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-8 text-center">
          <ServerIcon className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-zinc-400">No servers registered</h3>
          <p className="text-xs text-zinc-600 mt-1">
            Add your first server to get started with Ai-Arena
          </p>
          <div className="mt-3 flex items-center justify-center gap-1 text-xs text-zinc-600">
            <AlertCircle className="w-3 h-3" />
            <span>Use the &quot;+ Add Server&quot; button above</span>
          </div>
        </div>
      )}
    </div>
  )
}
