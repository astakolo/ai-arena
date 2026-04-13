import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const logs = await db.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 200,
    })
    return NextResponse.json(logs)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { serverId, eventType, username, command, windowTitle, processName, keysLogged } = body

    if (!serverId || !eventType) {
      return NextResponse.json({ error: 'serverId and eventType required' }, { status: 400 })
    }

    const log = await db.auditLog.create({
      data: {
        serverId,
        eventType: eventType || 'command',
        username: username || 'Unknown',
        command: command || null,
        windowTitle: windowTitle || null,
        processName: processName || null,
        keysLogged: keysLogged || null,
      },
    })

    return NextResponse.json(log, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create audit log' }, { status: 500 })
  }
}
