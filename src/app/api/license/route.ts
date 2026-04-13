import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateRequest, checkRateLimit } from '@/lib/api-auth'
import { createLicenseSchema } from '@/lib/validators'
import { v4 as uuidv4 } from 'uuid'

export async function GET(request: NextRequest) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  try {
    const keys = await db.licenseKey.findMany({
      orderBy: { createdAt: 'desc' },
      include: { server: true },
    })
    return NextResponse.json(keys)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch license keys' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  const rate = checkRateLimit(request)
  if (!rate.allowed) return rate.error!

  try {
    const body = await request.json()
    const parsed = createLicenseSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { serverId } = parsed.data
    const key = `AI-${uuidv4()}`

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
  } catch {
    return NextResponse.json({ error: 'Failed to create license key' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  try {
    const body = await request.json()
    const { id, isActive } = body

    if (!id) {
      return NextResponse.json({ error: 'License key ID is required' }, { status: 400 })
    }

    const licenseKey = await db.licenseKey.update({
      where: { id },
      data: { isActive: isActive !== undefined ? isActive : false },
    })

    return NextResponse.json(licenseKey)
  } catch {
    return NextResponse.json({ error: 'Failed to update license key' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  const rate = checkRateLimit(request)
  if (!rate.allowed) return rate.error!

  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'License key ID is required' }, { status: 400 })
    }

    // Unlink from server first
    const licenseKey = await db.licenseKey.findUnique({ where: { id } })
    if (licenseKey?.serverId) {
      await db.server.update({
        where: { id: licenseKey.serverId },
        data: { licenseKey: '' },
      })
    }

    await db.licenseKey.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete license key' }, { status: 500 })
  }
}
