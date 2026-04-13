import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '@/lib/api-auth'
import { randomBytes } from 'crypto'

export async function POST(request: NextRequest) {
  const auth = await validateRequest(request)
  if (!auth.valid) return auth.error!

  const key = randomBytes(32).toString('hex')
  return NextResponse.json({ key })
}
