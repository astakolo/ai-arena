import { NextRequest, NextResponse } from 'next/server'

/**
 * Ai-Arena API Authentication Middleware
 * 
 * All API routes require an API key passed via:
 * - Header: X-API-Key or Authorization: Bearer <key>
 * - Query param: ?apiKey=<key>
 * 
 * The API key is set via the AI_ARENA_API_KEY environment variable.
 * This protects all endpoints from unauthorized access.
 */

export function validateApiKey(request: NextRequest): { valid: boolean; error?: NextResponse } {
  const apiKey = process.env.AI_ARENA_API_KEY

  // In development, allow if no API key is configured (convenience)
  if (!apiKey && process.env.NODE_ENV === 'development') {
    return { valid: true }
  }

  if (!apiKey) {
    return {
      valid: false,
      error: NextResponse.json(
        { error: 'Server not configured. Set AI_ARENA_API_KEY environment variable.' },
        { status: 500 }
      ),
    }
  }

  // Extract API key from request
  const authHeader = request.headers.get('authorization')
  const xApiKey = request.headers.get('x-api-key')
  const queryKey = request.nextUrl.searchParams.get('apiKey')

  const providedKey = 
    xApiKey || 
    (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null) || 
    queryKey

  if (!providedKey) {
    return {
      valid: false,
      error: NextResponse.json(
        { error: 'API key required. Pass via X-API-Key header or Authorization: Bearer <key>' },
        { status: 401 }
      ),
    }
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(providedKey, apiKey)) {
    return {
      valid: false,
      error: NextResponse.json(
        { error: 'Invalid API key' },
        { status: 403 }
      ),
    }
  }

  return { valid: true }
}

/**
 * Simple timing-safe string comparison.
 * Prevents timing attacks when comparing API keys.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Rate limiter — simple in-memory rate limiting per IP
 * For production, use Redis or similar
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 100 // requests per window

export function checkRateLimit(request: NextRequest): { allowed: boolean; error?: NextResponse } {
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
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        }
      ),
    }
  }

  entry.count++
  return { allowed: true }
}

// Cleanup rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitMap) {
    if (now > value.resetTime) rateLimitMap.delete(key)
  }
}, 300_000)
