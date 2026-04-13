import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST() {
  try {
    const existing = await db.server.count()
    if (existing > 0) {
      return NextResponse.json({ message: 'Database already has data', count: existing })
    }

    const demoServers = [
      {
        name: 'Production Web Server',
        hostname: 'prod-web-01',
        ip: '192.168.1.100',
        port: 3001,
        status: 'online',
        licenseKey: 'RH-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        os: 'Ubuntu 22.04 LTS',
        cpu: 'Intel Xeon E5-2680 v4 (8 cores)',
        ram: '32 GB DDR4',
        lastSeen: new Date(),
      },
      {
        name: 'Database Server',
        hostname: 'db-master-01',
        ip: '192.168.1.101',
        port: 3001,
        status: 'online',
        licenseKey: 'RH-b2c3d4e5-f6a7-8901-bcde-f12345678901',
        os: 'CentOS 8 Stream',
        cpu: 'AMD EPYC 7543 (16 cores)',
        ram: '64 GB DDR4 ECC',
        lastSeen: new Date(),
      },
      {
        name: 'Development Server',
        hostname: 'dev-node-01',
        ip: '192.168.1.50',
        port: 3002,
        status: 'offline',
        licenseKey: 'RH-c3d4e5f6-a7b8-9012-cdef-123456789012',
        os: 'Debian 12 Bookworm',
        cpu: 'Intel Core i7-13700K',
        ram: '16 GB DDR5',
        lastSeen: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        name: 'CI/CD Runner',
        hostname: 'ci-runner-01',
        ip: '192.168.1.60',
        port: 3003,
        status: 'online',
        licenseKey: 'RH-d4e5f6a7-b8c9-0123-defa-234567890123',
        os: 'Arch Linux',
        cpu: 'AMD Ryzen 9 7950X (16 cores)',
        ram: '128 GB DDR5',
        lastSeen: new Date(),
      },
      {
        name: 'Staging Environment',
        hostname: 'staging-01',
        ip: '10.0.0.100',
        port: 3001,
        status: 'connecting',
        licenseKey: 'RH-e5f6a7b8-c9d0-1234-efab-345678901234',
        os: 'Ubuntu 24.04 LTS',
        cpu: 'ARM Neoverse N2 (4 cores)',
        ram: '8 GB LPDDR5',
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

      const actions = ['connect', 'disconnect', 'webcam', 'terminal']
      const details = [
        'Connected via RemoteHub dashboard',
        'Session ended by user',
        'Webcam stream started',
        'Terminal session opened',
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
