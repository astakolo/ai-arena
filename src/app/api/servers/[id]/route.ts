import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateRequest, checkRateLimit } from '@/lib/api-auth'
import { updateServerSchema } from '@/lib/validators'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

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
  } catch {
    return NextResponse.json({ error: 'Failed to fetch server' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  const rate = checkRateLimit(request)
  if (!rate.allowed) return rate.error!

  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateServerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const server = await db.server.update({
      where: { id },
      data: parsed.data,
    })
    return NextResponse.json(server)
  } catch {
    return NextResponse.json({ error: 'Failed to update server' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  const rate = checkRateLimit(request)
  if (!rate.allowed) return rate.error!

  try {
    const { id } = await params
    await db.connectionLog.deleteMany({ where: { serverId: id } })
    await db.licenseKey.deleteMany({ where: { serverId: id } })
    await db.auditLog.deleteMany({ where: { serverId: id } })
    await db.server.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete server' }, { status: 500 })
  }
}
