import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateRequest, checkRateLimit } from '@/lib/api-auth'
import { createServerSchema } from '@/lib/validators'
import { v4 as uuidv4 } from 'uuid'

export async function GET(request: NextRequest) {
  // Auth check
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  // Rate limit
  const rate = checkRateLimit(request)
  if (!rate.allowed) return rate.error!

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
  } catch {
    return NextResponse.json({ error: 'Failed to fetch servers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  const rate = checkRateLimit(request)
  if (!rate.allowed) return rate.error!

  try {
    const body = await request.json()
    const parsed = createServerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { name, hostname, ip, port, os, cpu, ram } = parsed.data
    const licenseKey = `AI-${uuidv4()}`

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

    // Fetch geolocation in the background (don't block the response)
    const apiBaseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    fetch(`${apiBaseUrl}/api/geo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': request.headers.get('cookie') || '' },
      body: JSON.stringify({ ip }),
    })
      .then((res) => res.json())
      .then(async (geoData) => {
        if (geoData && geoData.country) {
          await db.server.update({
            where: { id: server.id },
            data: {
              country: geoData.country || null,
              countryCode: geoData.countryCode || null,
              city: geoData.city || null,
              region: geoData.regionName || geoData.region || null,
              isp: geoData.isp || null,
              latitude: geoData.lat ?? null,
              longitude: geoData.lon ?? null,
            },
          })
        }
      })
      .catch(() => {
        // Silently ignore geo lookup failures
      })

    return NextResponse.json(server, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create server' }, { status: 500 })
  }
}
