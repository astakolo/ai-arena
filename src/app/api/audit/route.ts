import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateRequest, checkRateLimit } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

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
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  const rate = checkRateLimit(request)
  if (!rate.allowed) return rate.error!

  try {
    const body = await request.json()
    const { serverId, eventType, username, command, windowTitle, processName, keysLogged } = body

    if (!serverId || !eventType) {
      return NextResponse.json({ error: 'serverId and eventType required' }, { status: 400 })
    }

    const log = await db.auditLog.create({
      data: {
        serverId: String(serverId).slice(0, 100),
        eventType: String(eventType).slice(0, 50),
        username: String(username || 'Unknown').slice(0, 100),
        command: command ? String(command).slice(0, 10000) : null,
        windowTitle: windowTitle ? String(windowTitle).slice(0, 500) : null,
        processName: processName ? String(processName).slice(0, 255) : null,
        keysLogged: keysLogged ? String(keysLogged).slice(0, 10000) : null,
      },
    })

    return NextResponse.json(log, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create audit log' }, { status: 500 })
  }
}
