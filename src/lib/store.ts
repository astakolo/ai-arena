import { create } from 'zustand'

export interface Server {
  id: string
  name: string
  hostname: string
  ip: string
  port: number
  status: string
  licenseKey: string
  os: string | null
  cpu: string | null
  ram: string | null
  country: string | null
  countryCode: string | null
  city: string | null
  region: string | null
  isp: string | null
  latitude: number | null
  longitude: number | null
  lastSeen: string | null
  createdAt: string
  updatedAt: string
}

export interface LicenseKey {
  id: string
  key: string
  serverId: string | null
  isActive: boolean
  createdAt: string
  server?: Server | null
}

export interface ConnectionLog {
  id: string
  serverId: string
  action: string
  details: string | null
  createdAt: string
}

interface AiArenaState {
  servers: Server[]
  selectedServer: Server | null
  isConnected: boolean
  connectionQuality: 'high' | 'medium' | 'low'
  licenseKeys: LicenseKey[]
  connectionLogs: ConnectionLog[]
  activeTab: string
  sidebarOpen: boolean
  terminalLines: string[]

  setServers: (servers: Server[]) => void
  setSelectedServer: (server: Server | null) => void
  setConnected: (connected: boolean) => void
  setConnectionQuality: (quality: 'high' | 'medium' | 'low') => void
  setLicenseKeys: (keys: LicenseKey[]) => void
  setConnectionLogs: (logs: ConnectionLog[]) => void
  setActiveTab: (tab: string) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  addTerminalLine: (line: string) => void
  clearTerminal: () => void
}

export const useAiArenaStore = create<AiArenaState>((set) => ({
  servers: [],
  selectedServer: null,
  isConnected: false,
  connectionQuality: 'high',
  licenseKeys: [],
  connectionLogs: [],
  activeTab: 'dashboard',
  sidebarOpen: false,
  terminalLines: [],

  setServers: (servers) => set({ servers }),
  setSelectedServer: (server) => set({ selectedServer: server }),
  setConnected: (connected) => set({ isConnected: connected }),
  setConnectionQuality: (quality) => set({ connectionQuality: quality }),
  setLicenseKeys: (keys) => set({ licenseKeys: keys }),
  setConnectionLogs: (logs) => set({ connectionLogs: logs }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  addTerminalLine: (line) =>
    set((state) => ({ terminalLines: [...state.terminalLines, line] })),
  clearTerminal: () => set({ terminalLines: [] }),
}))
