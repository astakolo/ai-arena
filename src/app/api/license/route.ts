import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'

export async function GET() {
  try {
    const keys = await db.licenseKey.findMany({
      orderBy: { createdAt: 'desc' },
      include: { server: true },
    })
    return NextResponse.json(keys)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch license keys' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { serverId } = body

    const key = `RH-${uuidv4()}`

    const licenseKey = await db.licenseKey.create({
      data: {
        key,
        serverId: serverId || null,
        isActive: true,
      },
    })

    if (serverId) {
      await db.server.update({
        where: { id: serverId },
        data: { licenseKey: key },
      })
    }

    return NextResponse.json(licenseKey, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create license key' }, { status: 500 })
  }
}
