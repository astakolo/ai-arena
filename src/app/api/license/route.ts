import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateApiKey, checkRateLimit } from '@/lib/api-auth'
import { createLicenseSchema } from '@/lib/validators'
import { v4 as uuidv4 } from 'uuid'

export async function GET(request: NextRequest) {
  const auth = validateApiKey(request)
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
  const auth = validateApiKey(request)
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
