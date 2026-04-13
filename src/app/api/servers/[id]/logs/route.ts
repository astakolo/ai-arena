import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const logs = await db.connectionLog.findMany({
      where: { serverId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json(logs)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }
}
