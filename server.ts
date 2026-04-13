/**
 * Ai-Arena — Custom Server (Next.js + Socket.io)
 *
 * Runs both the Next.js app and the Socket.io WebSocket server.
 * Socket.io is exposed on a custom path (/api/v1/events) for obfuscation.
 */

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { setupSocketHandler } from './src/lib/socket-handler'

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  const server = createServer(app.getRequestHandler())

  // ─── Socket.io Server (Obfuscated Path) ──────────────
  const io = new SocketIOServer(server, {
    path: '/api/v1/events',        // Looks like a REST API endpoint
    addTrailingSlash: false,
    serveClient: false,
    // Only allow WebSocket transport (no polling = less visible)
    transports: ['websocket'],
    // Reject unauthenticated connections quickly
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    },
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
      methods: ['GET', 'POST'],
    },
  })

  // Initialize socket handler with the io instance
  setupSocketHandler(io)

  server.on('request', async (req, res) => {
    try {
      const parsedUrl = parse(req.url || '/', true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error handling request:', err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  server.listen(port, hostname, () => {
    console.log(`\n  ╔═══════════════════════════════════════════════╗`)
    console.log(`  ║     Ai-Arena Server Running                  ║`)
    console.log(`  ╠═══════════════════════════════════════════════╣`)
    console.log(`  ║  Dashboard:  http://${hostname}:${port}            ║`)
    console.log(`  ║  WebSocket:  /api/v1/events                   ║`)
    console.log(`  ║  Transport:  WebSocket-only (encrypted)       ║`)
    console.log(`  ║  Encryption: AES-256-GCM                      ║`)
    console.log(`  ╚═══════════════════════════════════════════════╝\n`)
  })
})
