import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

/**
 * Ai-Arena API Authentication Middleware
 * All API routes require an active browser session (iron-session cookie).
 */

export async function validateRequest(
  request: NextRequest
): Promise<{ valid: boolean; session?: Awaited<ReturnType<typeof requireAuth>>; error?: NextResponse }> {
  const session = await requireAuth()

  if (!session) {
    return {
      valid: false,
      error: NextResponse.json(
        { error: 'Authentication required. Please log in.' },
        { status: 401 }
      ),
    }
  }

  return { valid: true, session }
}

/**
 * Rate limiter — in-memory per IP.
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 100

export function checkRateLimit(request: NextRequest): { allowed: boolean; error?: NextResponse } {
  const url = request.nextUrl.pathname
  if (url.startsWith('/api/auth/login') || url.startsWith('/api/auth/session')) {
    return { allowed: true }
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const now = Date.now()

  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return { allowed: true }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
    return {
      allowed: false,
      error: NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      ),
    }
  }

  entry.count++
  return { allowed: true }
}

// Cleanup every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitMap) {
    if (now > value.resetTime) rateLimitMap.delete(key)
  }
}, 300_000)
