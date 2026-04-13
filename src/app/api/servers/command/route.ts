import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '@/lib/api-auth'
import { sendCommandToAgent } from '@/lib/socket-handler'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * POST /api/servers/command
 *
 * Sends a command from the dashboard to a connected agent via WebSocket.
 * The command is forwarded to the agent through the Socket.io server.
 */
export async function POST(request: NextRequest) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  try {
    const body = await request.json()
    const { licenseKey, type, data, requestId } = body

    if (!licenseKey || !type) {
      return NextResponse.json(
        { error: 'licenseKey and type are required' },
        { status: 400 }
      )
    }

    // Verify the license key exists in our database
    const license = await prisma.licenseKey.findUnique({
      where: { key: licenseKey },
    })

    if (!license) {
      return NextResponse.json(
        { error: 'Invalid license key' },
        { status: 404 }
      )
    }

    if (!license.isActive) {
      return NextResponse.json(
        { error: 'License key has been revoked' },
        { status: 403 }
      )
    }

    // Send command to agent via WebSocket
    const command = { type, data, requestId, licenseKey }
    const result = await sendCommandToAgent(licenseKey, command)

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 502 } // Bad Gateway — agent unreachable
    )
  }
}
