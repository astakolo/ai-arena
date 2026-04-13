import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const server = await db.server.findUnique({ where: { id } })

    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    await db.server.update({
      where: { id },
      data: { status: 'connecting', lastSeen: new Date() },
    })

    await db.connectionLog.create({
      data: {
        serverId: id,
        action: 'connect',
        details: 'Connection initiated from RemoteHub dashboard',
      },
    })

    return NextResponse.json({
      success: true,
      signaling: {
        serverId: server.id,
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        endpoint: `/api/webrtc/${server.id}`,
      },
      message: 'Connection initiated. Waiting for agent response...',
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to connect' }, { status: 500 })
  }
}
