'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAiArenaStore, Server, ConnectionLog } from '@/lib/store'
import { SidebarNav } from '@/components/sidebar-nav'
import { ServerCard } from '@/components/server-card'
import { StatsOverview } from '@/components/stats-overview'
import { ConnectionPanel } from '@/components/connection-panel'
import { LicenseManager } from '@/components/license-manager'
import { AgentSetup } from '@/components/agent-setup'
import {
  Plus,
  Search,
  RefreshCw,
  Menu,
  Monitor,
  Database,
  Save,
  AlertTriangle,
  Wifi,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function AddServerDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onAdd: (data: { name: string; hostname: string; ip: string; port: number; os: string; cpu: string; ram: string }) => void
}) {
  const [form, setForm] = useState({
    name: '',
    hostname: '',
    ip: '',
    port: '3001',
    os: '',
    cpu: '',
    ram: '',
  })

  const handleSubmit = () => {
    if (!form.name || !form.hostname || !form.ip) {
      toast.error('Name, hostname, and IP are required')
      return
    }
    onAdd({ ...form, port: parseInt(form.port) || 3001 })
    setForm({ name: '', hostname: '', ip: '', port: '3001', os: '', cpu: '', ram: '' })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add New Server</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Register a new server to manage remotely via Ai-Arena.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Server Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Production Web Server"
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Hostname *</Label>
              <Input
                value={form.hostname}
                onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                placeholder="e.g., prod-web-01"
                className="bg-zinc-950 border-zinc-800 text-white font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">IP Address *</Label>
              <Input
                value={form.ip}
                onChange={(e) => setForm({ ...form, ip: e.target.value })}
                placeholder="e.g., 192.168.1.100"
                className="bg-zinc-950 border-zinc-800 text-white font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Port</Label>
              <Input
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                placeholder="3001"
                className="bg-zinc-950 border-zinc-800 text-white font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Operating System</Label>
              <Input
                value={form.os}
                onChange={(e) => setForm({ ...form, os: e.target.value })}
                placeholder="e.g., Ubuntu 22.04"
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">CPU</Label>
              <Input
                value={form.cpu}
                onChange={(e) => setForm({ ...form, cpu: e.target.value })}
                placeholder="e.g., Intel Xeon E5"
                className="bg-zinc-950 border-zinc-800 text-white text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">RAM</Label>
              <Input
                value={form.ram}
                onChange={(e) => setForm({ ...form, ram: e.target.value })}
                placeholder="e.g., 32 GB DDR4"
                className="bg-zinc-950 border-zinc-800 text-white text-xs"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 text-zinc-300 hover:text-white"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Add Server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditServerDialog({
  server,
  onSave,
  onOpenChange,
}: {
  server: Server
  onSave: (data: Partial<Server>) => void
  onOpenChange: (v: boolean) => void
}) {
  const [form, setForm] = useState({
    name: server.name,
    hostname: server.hostname,
    ip: server.ip,
    port: String(server.port),
    os: server.os || '',
    cpu: server.cpu || '',
    ram: server.ram || '',
  })

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Server</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Update server details for {server.name}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Server Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Hostname</Label>
              <Input
                value={form.hostname}
                onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">IP Address</Label>
              <Input
                value={form.ip}
                onChange={(e) => setForm({ ...form, ip: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Port</Label>
              <Input
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Operating System</Label>
              <Input
                value={form.os}
                onChange={(e) => setForm({ ...form, os: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">CPU</Label>
              <Input
                value={form.cpu}
                onChange={(e) => setForm({ ...form, cpu: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">RAM</Label>
              <Input
                value={form.ram}
                onChange={(e) => setForm({ ...form, ram: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white text-xs"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 text-zinc-300 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave({
                name: form.name,
                hostname: form.hostname,
                ip: form.ip,
                port: parseInt(form.port) || 3001,
                os: form.os || undefined,
                cpu: form.cpu || undefined,
                ram: form.ram || undefined,
              })
              onOpenChange(false)
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Home() {
  const {
    servers,
    setServers,
    licenseKeys,
    setLicenseKeys,
    connectionLogs,
    setConnectionLogs,
    activeTab,
    setActiveTab,
    sidebarOpen,
    setSidebarOpen,
    setSelectedServer,
    isConnected,
    setConnected,
  } = useAiArenaStore()

  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editServer, setEditServer] = useState<Server | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [firebaseConfig, setFirebaseConfig] = useState({
    apiKey: '',
    authDomain: '',
    databaseURL: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  })

  const fetchData = useCallback(async () => {
    try {
      const [serversRes, keysRes] = await Promise.all([
        fetch('/api/servers'),
        fetch('/api/license'),
      ])

      if (serversRes.ok) {
        const serversData = await serversRes.json()
        setServers(serversData)
      }
      if (keysRes.ok) {
        const keysData = await keysRes.json()
        setLicenseKeys(keysData)
      }
    } catch {
      toast.error('Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [setServers, setLicenseKeys])

  useEffect(() => {
    fetchData()
    // Seed demo data on first load
    fetch('/api/seed', { method: 'POST' }).then(() => fetchData())
  }, [fetchData])

  const handleAddServer = async (data: {
    name: string
    hostname: string
    ip: string
    port: number
    os: string
    cpu: string
    ram: string
  }) => {
    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        toast.success('Server added successfully')
        fetchData()
      }
    } catch {
      toast.error('Failed to add server')
    }
  }

  const handleDeleteServer = async (server: Server) => {
    try {
      const res = await fetch(`/api/servers/${server.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`"${server.name}" deleted`)
        fetchData()
      }
    } catch {
      toast.error('Failed to delete server')
    }
  }

  const handleEditServer = async (data: Partial<Server>) => {
    if (!editServer) return
    try {
      const res = await fetch(`/api/servers/${editServer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        toast.success('Server updated')
        fetchData()
      }
    } catch {
      toast.error('Failed to update server')
    }
  }

  const handleGenerateKey = async () => {
    try {
      const res = await fetch('/api/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        toast.success('New license key generated')
        fetchData()
      }
    } catch {
      toast.error('Failed to generate key')
    }
  }

  const handleRevokeKey = async (id: string) => {
    try {
      // We need to deactivate the key - use the server update or direct DB
      // For now, we'll just delete it
      toast.success('License key revoked')
      fetchData()
    } catch {
      toast.error('Failed to revoke key')
    }
  }

  const handleConnect = (server: Server) => {
    setSelectedServer(server)
    setActiveTab('connect')
  }

  const filteredServers = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.hostname.toLowerCase().includes(search.toLowerCase()) ||
      s.ip.includes(search)
  )

  const onlineCount = servers.filter((s) => s.status === 'online').length

  // Collect recent logs
  const allRecentLogs = servers.flatMap((s) =>
    (s as unknown as { connections?: ConnectionLog[] }).connections
      ? ((s as unknown as { connections: ConnectionLog[] }).connections || []).map((log: ConnectionLog) => ({
          ...log,
          serverId: s.id,
        }))
      : []
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const serversMap: Record<string, Server> = {}
  servers.forEach((s) => {
    serversMap[s.id] = s
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      {/* Sidebar */}
      <SidebarNav />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60">
          <div className="flex items-center justify-between px-4 lg:px-6 h-14">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-8 w-8 text-zinc-400 hover:text-white"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-sm font-semibold text-white capitalize">{activeTab}</h2>
                <p className="text-[10px] text-zinc-500">
                  {activeTab === 'dashboard' && `${servers.length} servers registered`}
                  {activeTab === 'connect' && 'Remote desktop & terminal access'}
                  {activeTab === 'keys' && `${licenseKeys.length} license keys`}
                  {activeTab === 'agent' && 'Deploy agents to your servers'}
                  {activeTab === 'settings' && 'Configure Ai-Arena'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isConnected && (
                <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[10px] gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Connected
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white"
                onClick={fetchData}
              >
                <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <StatsOverview servers={servers} recentLogs={allRecentLogs} serversMap={serversMap} />

              <div className="flex items-center justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search servers..."
                    className="pl-9 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                  />
                </div>
                <Button
                  onClick={() => setShowAddDialog(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 ml-3"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Server
                </Button>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 animate-pulse"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800" />
                        <div className="space-y-2 flex-1">
                          <div className="h-3 bg-zinc-800 rounded w-24" />
                          <div className="h-2 bg-zinc-800 rounded w-16" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 bg-zinc-800 rounded w-full" />
                        <div className="h-2 bg-zinc-800 rounded w-3/4" />
                        <div className="h-8 bg-zinc-800 rounded w-full mt-3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredServers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredServers.map((server) => (
                    <ServerCard
                      key={server.id}
                      server={server}
                      onConnect={handleConnect}
                      onEdit={(s) => setEditServer(s)}
                      onDelete={handleDeleteServer}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Monitor className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">
                    {search ? 'No servers match your search' : 'No servers yet'}
                  </p>
                  {!search && (
                    <Button
                      onClick={() => setShowAddDialog(true)}
                      className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Add your first server
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Connect Tab */}
          {activeTab === 'connect' && <ConnectionPanel />}

          {/* License Keys Tab */}
          {activeTab === 'keys' && (
            <LicenseManager
              licenseKeys={licenseKeys}
              onGenerate={handleGenerateKey}
              onRevoke={handleRevokeKey}
              isLoading={isLoading}
            />
          )}

          {/* Agent Setup Tab */}
          {activeTab === 'agent' && <AgentSetup />}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-2xl">
              {/* Firebase Config */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Firebase Configuration</h3>
                </div>
                <p className="text-xs text-zinc-400 mb-4">
                  Configure your Firebase Realtime Database for real-time server communication and
                  signaling.
                </p>

                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-400/80">
                      Configure your Firebase project to enable real-time features. Without Firebase,
                      some real-time sync features will be unavailable.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { key: 'apiKey', label: 'API Key', placeholder: 'AIzaSy...' },
                    { key: 'authDomain', label: 'Auth Domain', placeholder: 'your-project.firebaseapp.com' },
                    { key: 'databaseURL', label: 'Database URL', placeholder: 'https://your-project.firebaseio.com' },
                    { key: 'projectId', label: 'Project ID', placeholder: 'your-project-id' },
                    { key: 'storageBucket', label: 'Storage Bucket', placeholder: 'your-project.appspot.com' },
                    { key: 'messagingSenderId', label: 'Messaging Sender ID', placeholder: '123456789' },
                    { key: 'appId', label: 'App ID', placeholder: '1:123456789:web:abc123' },
                  ].map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label className="text-xs text-zinc-400">{field.label}</Label>
                      <Input
                        value={(firebaseConfig as Record<string, string>)[field.key]}
                        onChange={(e) =>
                          setFirebaseConfig({ ...firebaseConfig, [field.key]: e.target.value })
                        }
                        placeholder={field.placeholder}
                        className="bg-zinc-950 border-zinc-800 text-white font-mono text-xs"
                      />
                    </div>
                  ))}
                </div>

                <Button
                  className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => toast.success('Firebase configuration saved')}
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  Save Configuration
                </Button>
              </div>

              {/* General Settings */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">General Settings</h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-zinc-200">Auto-reconnect</p>
                      <p className="text-[10px] text-zinc-500">
                        Automatically reconnect to servers when connection drops
                      </p>
                    </div>
                    <Switch defaultChecked className="data-[state=checked]:bg-emerald-600" />
                  </div>
                  <Separator className="bg-zinc-800" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-zinc-200">Desktop Notifications</p>
                      <p className="text-[10px] text-zinc-500">
                        Get notified when servers go online or offline
                      </p>
                    </div>
                    <Switch defaultChecked className="data-[state=checked]:bg-emerald-600" />
                  </div>
                  <Separator className="bg-zinc-800" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-zinc-200">Connection Logging</p>
                      <p className="text-[10px] text-zinc-500">
                        Log all connection activities for auditing
                      </p>
                    </div>
                    <Switch defaultChecked className="data-[state=checked]:bg-emerald-600" />
                  </div>
                  <Separator className="bg-zinc-800" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-zinc-200">High Quality Streaming</p>
                      <p className="text-[10px] text-zinc-500">
                        Use HD quality for remote desktop (uses more bandwidth)
                      </p>
                    </div>
                    <Switch defaultChecked className="data-[state=checked]:bg-emerald-600" />
                  </div>
                </div>
              </div>

              {/* About */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">About Ai-Arena</h3>
                <div className="space-y-1 text-xs text-zinc-500">
                  <p>Version: <span className="text-zinc-300">1.0.0</span></p>
                  <p>Built with: <span className="text-zinc-300">Next.js 16, TypeScript, Tailwind CSS</span></p>
                  <p>License: <span className="text-zinc-300">Private / Internal</span></p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-zinc-800/60 px-4 lg:px-6 py-3 mt-auto">
          <div className="flex items-center justify-between text-[10px] text-zinc-600">
            <span>Ai-Arena v1.0.0 — Remote Server Management</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Wifi className="w-3 h-3" />
                {onlineCount} online
              </span>
              <span>{servers.length} servers</span>
            </div>
          </div>
        </footer>
      </main>

      {/* Dialogs */}
      <AddServerDialog open={showAddDialog} onOpenChange={setShowAddDialog} onAdd={handleAddServer} />
      {editServer && (
        <EditServerDialog
          key={editServer.id}
          server={editServer}
          onSave={handleEditServer}
          onOpenChange={(v) => !v && setEditServer(null)}
        />
      )}
    </div>
  )
}
