import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { key } = body

    if (!key) {
      return NextResponse.json({ error: 'License key is required' }, { status: 400 })
    }

    const licenseKey = await db.licenseKey.findUnique({
      where: { key },
      include: { server: true },
    })

    if (!licenseKey) {
      return NextResponse.json({ error: 'Invalid license key' }, { status: 404 })
    }

    if (!licenseKey.isActive) {
      return NextResponse.json({ error: 'License key has been revoked' }, { status: 403 })
    }

    return NextResponse.json({
      valid: true,
      key: licenseKey.key,
      server: licenseKey.server,
      isActive: licenseKey.isActive,
      createdAt: licenseKey.createdAt,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to verify license key' }, { status: 500 })
  }
}
