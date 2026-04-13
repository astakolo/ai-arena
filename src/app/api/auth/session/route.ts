import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (session.isLoggedIn && session.userId) {
      return NextResponse.json({
        isLoggedIn: true,
        username: session.username,
        role: session.role,
      })
    }
    return NextResponse.json({ isLoggedIn: false })
  } catch {
    return NextResponse.json({ isLoggedIn: false })
  }
}
