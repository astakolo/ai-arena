'use client'

/**
 * Ai-Arena — Socket.io Client Hook
 *
 * Provides a shared Socket.io connection for the dashboard.
 * Used by the dashboard to send commands and receive real-time data from agents.
 * All communication is encrypted with AES-256-GCM.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseSocketReturn {
  isConnected: boolean
  socket: Socket | null
  sendCommand: (licenseKey: string, command: Record<string, unknown>) => Promise<unknown>
  sendCommandToServer: (command: Record<string, unknown>) => void
  onAgentEvent: (event: string, callback: (data: unknown) => void) => void
  offAgentEvent: (event: string, callback: (data: unknown) => void) => void
}

// Singleton socket instance
let socketInstance: Socket | null = null
let listeners: Record<string, Set<(data: unknown) => void>> = {}
let isConnectedGlobal = false

function getSocket(): Socket | null {
  return socketInstance
}

function getInitialConnectedState(): boolean {
  return isConnectedGlobal
}

export function useSocket(): UseSocketReturn {
  const [connected, setConnected] = useState(getInitialConnectedState)

  useEffect(() => {
    if (socketInstance) {
      return
    }

    // Connect to the WebSocket server
    const url = window.location.origin
    socketInstance = io(url, {
      path: '/api/v1/events',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      timeout: 10000,
    })

    socketInstance.on('connect', () => {
      console.log('[Socket] Dashboard connected')
      isConnectedGlobal = true
      setConnected(true)
    })

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] Dashboard disconnected:', reason)
      isConnectedGlobal = false
      setConnected(false)
    })

    socketInstance.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message)
      isConnectedGlobal = false
      setConnected(false)
    })

    // Handle encrypted data from server
    socketInstance.on('data', (raw: string) => {
      try {
        const data = JSON.parse(raw)
        if (data.agentLicenseKey) {
          const handlers = listeners[data.type] || new Set()
          for (const handler of handlers) {
            handler(data)
          }
        }
      } catch {
        // Encrypted data or parse error — ignore
      }
    })

    return () => {
      // Don't disconnect on unmount — singleton
    }
  }, [])

  const sendCommand = useCallback(async (
    licenseKey: string,
    command: Record<string, unknown>
  ): Promise<unknown> => {
    const res = await fetch('/api/servers/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, ...command }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to send command')
    }
    return res.json()
  }, [])

  const sendCommandToServer = useCallback((command: Record<string, unknown>) => {
    if (socketInstance && socketInstance.connected) {
      socketInstance.emit('data', JSON.stringify(command))
    }
  }, [])

  const onAgentEvent = useCallback((event: string, callback: (data: unknown) => void) => {
    if (!listeners[event]) listeners[event] = new Set()
    listeners[event].add(callback)
  }, [])

  const offAgentEvent = useCallback((event: string, callback: (data: unknown) => void) => {
    listeners[event]?.delete(callback)
  }, [])

  return {
    isConnected: connected,
    socket: getSocket(),
    sendCommand,
    sendCommandToServer,
    onAgentEvent,
    offAgentEvent,
  }
}
