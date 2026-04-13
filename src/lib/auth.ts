import { getIronSession, IronSession } from 'iron-session'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

declare module 'iron-session' {
  interface IronSessionData {
    userId?: string
    username?: string
    role?: string
    isLoggedIn?: boolean
  }
}

const sessionOptions = {
  password: process.env.AI_ARENA_SESSION_SECRET || 'ai-arena-default-secret-change-in-production-min-32-chars!!',
  cookieName: 'ai-arena-session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  },
}

/**
 * Get the current session from cookies.
 * Works in both Route Handlers and Server Components.
 */
export async function getSession(): Promise<IronSession<IronSessionData>> {
  const cookieStore = await cookies()
  return getIronSession(cookieStore, sessionOptions)
}

/**
 * Check if the current user is authenticated.
 * Returns the session if valid, null otherwise.
 */
export async function requireAuth(): Promise<IronSession<IronSessionData> | null> {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) {
    return null
  }
  return session
}

/**
 * Hash a password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs')
  return bcrypt.hash(password, 12)
}

/**
 * Verify a password against a hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs')
  return bcrypt.compare(password, hash)
}
