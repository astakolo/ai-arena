import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateApiKey, checkRateLimit } from '@/lib/api-auth'
import { verifyLicenseSchema } from '@/lib/validators'

export async function POST(request: NextRequest) {
  const auth = validateApiKey(request)
  if (!auth.valid) return auth.error!

  const rate = checkRateLimit(request)
  if (!rate.allowed) return rate.error!

  try {
    const body = await request.json()
    const parsed = verifyLicenseSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { key } = parsed.data

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
  } catch {
    return NextResponse.json({ error: 'Failed to verify license key' }, { status: 500 })
  }
}
