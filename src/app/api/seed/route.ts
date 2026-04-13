import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST() {
  try {
    // Clear existing data for fresh seed
    await db.connectionLog.deleteMany({})
    await db.licenseKey.deleteMany({})
    await db.server.deleteMany({})

    const demoServers = [
      {
        name: 'Client HQ — Main POS',
        hostname: 'CLIENT-HQ-POS01',
        ip: '41.58.230.12',
        port: 3001,
        status: 'online',
        licenseKey: 'AI-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        os: 'Windows 11 Pro',
        cpu: 'Intel Core i5-13400 (8 cores)',
        ram: '16 GB DDR5',
        country: 'Nigeria',
        countryCode: 'NG',
        city: 'Lagos',
        region: 'Lagos',
        isp: 'MTN Nigeria',
        latitude: 6.5244,
        longitude: 3.3792,
        lastSeen: new Date(),
      },
      {
        name: 'Client Warehouse PC',
        hostname: 'WH-PC-01',
        ip: '102.89.44.78',
        port: 3001,
        status: 'online',
        licenseKey: 'AI-b2c3d4e5-f6a7-8901-bcde-f12345678901',
        os: 'Windows 10 Pro',
        cpu: 'Intel Core i3-12100 (4 cores)',
        ram: '8 GB DDR4',
        country: 'Nigeria',
        countryCode: 'NG',
        city: 'Abuja',
        region: 'FCT',
        isp: 'Airtel Nigeria',
        latitude: 9.0579,
        longitude: 7.4951,
        lastSeen: new Date(),
      },
      {
        name: 'Remote Office Desktop',
        hostname: 'REMOTE-OFF-01',
        ip: '5.188.210.101',
        port: 3002,
        status: 'offline',
        licenseKey: 'AI-c3d4e5f6-a7b8-9012-cdef-123456789012',
        os: 'Windows 11 Enterprise',
        cpu: 'AMD Ryzen 5 5600G (6 cores)',
        ram: '32 GB DDR4',
        country: 'Germany',
        countryCode: 'DE',
        city: 'Frankfurt',
        region: 'Hesse',
        isp: 'Hetzner Online',
        latitude: 50.1109,
        longitude: 8.6821,
        lastSeen: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        name: 'Production Web Server',
        hostname: 'prod-web-01',
        ip: '185.199.108.153',
        port: 3003,
        status: 'online',
        licenseKey: 'AI-d4e5f6a7-b8c9-0123-defa-234567890123',
        os: 'Ubuntu 22.04 LTS',
        cpu: 'Intel Xeon E5-2680 v4 (8 cores)',
        ram: '32 GB DDR4',
        country: 'United States',
        countryCode: 'US',
        city: 'San Francisco',
        region: 'California',
        isp: 'GitHub Inc.',
        latitude: 37.7749,
        longitude: -122.4194,
        lastSeen: new Date(),
      },
      {
        name: 'Client Store Terminal',
        hostname: 'STORE-REG-03',
        ip: '102.156.88.45',
        port: 3001,
        status: 'connecting',
        licenseKey: 'AI-e5f6a7b8-c9d0-1234-efab-345678901234',
        os: 'Windows 10 IoT Enterprise',
        cpu: 'Intel Celeron J4125 (4 cores)',
        ram: '8 GB DDR4',
        country: 'South Africa',
        countryCode: 'ZA',
        city: 'Johannesburg',
        region: 'Gauteng',
        isp: 'Vodacom',
        latitude: -26.2041,
        longitude: 28.0473,
        lastSeen: new Date(Date.now() - 30 * 60 * 1000),
      },
    ]

    for (const serverData of demoServers) {
      const server = await db.server.create({ data: serverData })

      await db.licenseKey.create({
        data: {
          key: serverData.licenseKey,
          serverId: server.id,
          isActive: true,
        },
      })

      const actions = ['connect', 'disconnect', 'webcam', 'terminal', 'files', 'mic', 'screen']
      const details = [
        'Connected via Ai-Arena dashboard',
        'Session ended by user',
        'Webcam stream started',
        'Terminal session opened',
        'Browsed files in C:\\Users\\Admin',
        'Microphone stream started',
        'Screen sharing started',
      ]

      for (let i = 0; i < 3; i++) {
        const actionIdx = Math.floor(Math.random() * actions.length)
        await db.connectionLog.create({
          data: {
            serverId: server.id,
            action: actions[actionIdx],
            details: details[actionIdx],
            createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          },
        })
      }
    }

    return NextResponse.json({ message: 'Demo data seeded successfully', serverCount: demoServers.length })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to seed data' }, { status: 500 })
  }
}
