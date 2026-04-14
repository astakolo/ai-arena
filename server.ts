/**
 * Ai-Arena — Custom Server (Development + Production)
 *
 * In development: runs Next.js dev server + Socket.io with turbopack
 * In production: runs Next.js production server + Socket.io
 *
 * Socket.io is exposed on /api/v1/events (looks like a REST endpoint).
 * All messages encrypted with AES-256-GCM via crypto.ts.
 */

import { createServer } from 'http'
import { parse } from 'url'

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

async function start() {
  let requestHandler: (req: import('http').IncomingMessage, res: import('http').ServerResponse, parsedUrl: ReturnType<typeof parse>) => Promise<void>

  if (dev) {
    // ─── Development: next() with turbopack + hot reload ─────
    const next = (await import('next')).default
    const app = next({ dev: true, hostname, port })
    await app.prepare()
    const handle = app.getRequestHandler()
    requestHandler = async (req, res, parsedUrl) => {
      await handle(req, res, parsedUrl)
    }
  } else {
    // ─── Production: use Next.js built-in request handler ────
    const next = (await import('next')).default
    const app = next({ dev: false, hostname, port, dir: __dirname })
    await app.prepare()
    const handle = app.getRequestHandler()
    requestHandler = async (req, res, parsedUrl) => {
      await handle(req, res, parsedUrl)
    }
  }

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

  server.on('request', async (req, res) => {
    try {
      const parsedUrl = parse(req.url || '/', true)
      await requestHandler(req, res, parsedUrl)
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
