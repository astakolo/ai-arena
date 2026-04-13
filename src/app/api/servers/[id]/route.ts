import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const server = await db.server.findUnique({
      where: { id },
      include: {
        connections: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        license: true,
      },
    })
    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }
    return NextResponse.json(server)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch server' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, hostname, ip, port, os, cpu, ram, status } = body

    const server = await db.server.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(hostname && { hostname }),
        ...(ip && { ip }),
        ...(port !== undefined && { port }),
        ...(os !== undefined && { os }),
        ...(cpu !== undefined && { cpu }),
        ...(ram !== undefined && { ram }),
        ...(status && { status }),
      },
    })
    return NextResponse.json(server)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update server' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await db.connectionLog.deleteMany({ where: { serverId: id } })
    await db.licenseKey.deleteMany({ where: { serverId: id } })
    await db.server.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete server' }, { status: 500 })
  }
}
