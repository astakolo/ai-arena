import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateRequest } from '@/lib/api-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  // FIXED: Added authentication check (was missing before!)
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  try {
    const { serverId } = await params
    const logs = await db.auditLog.findMany({
      where: { serverId },
      orderBy: { timestamp: 'desc' },
      take: 100,
    })
    return NextResponse.json(logs)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}
