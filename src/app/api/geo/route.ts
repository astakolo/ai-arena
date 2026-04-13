import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { ip } = await request.json()
    if (!ip) {
      return NextResponse.json({ error: 'IP address is required' }, { status: 400 })
    }
    
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
        query: ip 
      })
    }
    
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,isp,query`)
    const data = await res.json()
    
    if (data.status === 'fail') {
      return NextResponse.json({ error: data.message || 'Geolocation failed' }, { status: 400 })
    }
    
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Geolocation lookup failed' }, { status: 500 })
  }
}
