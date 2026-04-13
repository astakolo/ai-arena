import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkRateLimit } from '@/lib/api-auth'
import { geoLookupSchema } from '@/lib/validators'

export async function POST(request: NextRequest) {
  const auth = validateApiKey(request)
  if (!auth.valid) return auth.error!

  const rate = checkRateLimit(request)
  if (!rate.allowed) return rate.error!

  try {
    const body = await request.json()
    const parsed = geoLookupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { ip } = parsed.data

    // Skip private/internal IPs
    if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.') || ip === '127.0.0.1') {
      return NextResponse.json({
        country: 'Local Network',
        countryCode: 'LN',
        city: 'Internal',
        region: 'LAN',
        isp: 'Private Network',
        lat: 0,
        lon: 0,
        query: ip,
      })
    }

    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,isp,query`,
      { signal: AbortSignal.timeout(5000) }
    )
    const data = await res.json()

    if (data.status === 'fail') {
      return NextResponse.json({ error: data.message || 'Geolocation failed' }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Geolocation lookup failed' }, { status: 500 })
  }
}
