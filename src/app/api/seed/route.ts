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
        ip: '10.0.1.100',
        port: 3001,
        status: 'online',
        licenseKey: 'RH-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        os: 'Windows 11 Pro',
        cpu: 'Intel Core i5-13400 (8 cores)',
        ram: '16 GB DDR5',
        lastSeen: new Date(),
      },
      {
        name: 'Client Warehouse PC',
        hostname: 'WH-PC-01',
        ip: '10.0.2.50',
        port: 3001,
        status: 'online',
        licenseKey: 'RH-b2c3d4e5-f6a7-8901-bcde-f12345678901',
        os: 'Windows 10 Pro',
        cpu: 'Intel Core i3-12100 (4 cores)',
        ram: '8 GB DDR4',
        lastSeen: new Date(),
      },
      {
        name: 'Remote Office Desktop',
        hostname: 'REMOTE-OFF-01',
        ip: '192.168.5.20',
        port: 3002,
        status: 'offline',
        licenseKey: 'RH-c3d4e5f6-a7b8-9012-cdef-123456789012',
        os: 'Windows 11 Enterprise',
        cpu: 'AMD Ryzen 5 5600G (6 cores)',
        ram: '32 GB DDR4',
        lastSeen: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        name: 'Production Web Server',
        hostname: 'prod-web-01',
        ip: '192.168.1.100',
        port: 3003,
        status: 'online',
        licenseKey: 'RH-d4e5f6a7-b8c9-0123-defa-234567890123',
        os: 'Ubuntu 22.04 LTS',
        cpu: 'Intel Xeon E5-2680 v4 (8 cores)',
        ram: '32 GB DDR4',
        lastSeen: new Date(),
      },
      {
        name: 'Client Store Terminal',
        hostname: 'STORE-REG-03',
        ip: '10.0.3.15',
        port: 3001,
        status: 'connecting',
        licenseKey: 'RH-e5f6a7b8-c9d0-1234-efab-345678901234',
        os: 'Windows 10 IoT Enterprise',
        cpu: 'Intel Celeron J4125 (4 cores)',
        ram: '8 GB DDR4',
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
        'Connected via RemoteHub dashboard',
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
