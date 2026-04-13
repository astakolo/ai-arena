'use client'

import {
  Monitor,
  Server,
  KeyRound,
  Terminal,
  Settings,
  LayoutDashboard,
  Plug,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAiArenaStore } from '@/lib/store'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'connect', label: 'Connect', icon: Plug },
  { id: 'keys', label: 'License Keys', icon: KeyRound },
  { id: 'audit', label: 'Audit Trail', icon: Eye },
  { id: 'agent', label: 'Agent Setup', icon: Server },
  { id: 'settings', label: 'Settings', icon: Settings },
]

interface SidebarNavProps {
  className?: string
}

export function SidebarNav({ className }: SidebarNavProps) {
  const { activeTab, setActiveTab, sidebarOpen, setSidebarOpen, servers } = useAiArenaStore()

  const onlineCount = servers.filter((s) => s.status === 'online').length
  const totalCount = servers.length

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col transition-transform duration-300',
          'lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          className
        )}
      >
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide">Ai-Arena</h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Remote Management</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id)
                  setSidebarOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
                {item.id === 'dashboard' && totalCount > 0 && (
                  <span className="ml-auto text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full">
                    {totalCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {onlineCount}/{totalCount} servers online
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
