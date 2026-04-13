import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'

export async function GET() {
  try {
    const servers = await db.server.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        connections: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    })
    return NextResponse.json(servers)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch servers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, hostname, ip, port, os, cpu, ram } = body

    if (!name || !hostname || !ip) {
      return NextResponse.json({ error: 'Name, hostname, and IP are required' }, { status: 400 })
    }

    const licenseKey = `RH-${uuidv4()}`

    const server = await db.server.create({
      data: {
        name,
        hostname,
        ip,
        port: port || 3001,
        licenseKey,
        os: os || null,
        cpu: cpu || null,
        ram: ram || null,
      },
    })

    await db.licenseKey.create({
      data: {
        key: licenseKey,
        serverId: server.id,
        isActive: true,
      },
    })

    return NextResponse.json(server, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create server' }, { status: 500 })
  }
}
