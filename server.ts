/**
 * Ai-Arena — Custom Server (Development + Production)
 *
 * Dev: Next.js + turbopack + hot reload + Socket.io
 * Prod: Next.js production handler + Socket.io
 *
 * Socket.io on /api/v1/events (looks like REST API).
 * All messages encrypted AES-256-GCM.
 */

import { createServer } from 'http'
import { parse } from 'url'
import type { IncomingMessage, ServerResponse } from 'http'

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

async function start() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handle: any

  const next = (await import('next')).default
  const app = next({ dev, hostname, port })
  await app.prepare()
  handle = app.getRequestHandler()

  const server = createServer()

  // ─── Socket.io Server (Obfuscated Path) ──────────────
  const { Server: SocketIOServer } = await import('socket.io')
  const { setupSocketHandler } = await import('./src/lib/socket-handler')

  const io = new SocketIOServer(server, {
    path: '/api/v1/events',
    addTrailingSlash: false,
    serveClient: false,
    transports: ['websocket'],
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
    },
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
      methods: ['GET', 'POST'],
    },
  })

  setupSocketHandler(io)

  server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
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
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
