import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, hashPassword, verifyPassword } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    if (username.length > 100 || password.length > 200) {
      return NextResponse.json(
        { error: 'Invalid input' },
        { status: 400 }
      )
    }

    // Check if this is first run (no users exist) — auto-create admin
    const userCount = await db.user.count()
    if (userCount === 0) {
      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters for admin account' },
          { status: 400 }
        )
      }

      const passwordHash = await hashPassword(password)
      const user = await db.user.create({
        data: {
          username: username.trim().toLowerCase(),
          passwordHash,
          role: 'admin',
        },
      })

      const session = await getSession()
      session.isLoggedIn = true
      session.userId = user.id
      session.username = user.username
      session.role = user.role
      await session.save()

      return NextResponse.json({
        success: true,
        user: { id: user.id, username: user.username, role: user.role },
        isFirstRun: true,
      })
    }

    // Normal login
    const user = await db.user.findUnique({
      where: { username: username.trim().toLowerCase() },
    })

    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const session = await getSession()
    session.isLoggedIn = true
    session.userId = user.id
    session.username = user.username
    session.role = user.role
    await session.save()

    return NextResponse.json({
      success: true,
      user: { id: user.id, username: user.username, role: user.role },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const userCount = await db.user.count()
    return NextResponse.json({ hasUsers: userCount > 0 })
  } catch (error) {
    console.error('Check setup error:', error)
    return NextResponse.json({ error: 'Failed to check setup status' }, { status: 500 })
  }
}
