import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaSchemaVersion: string | undefined
}

// Force re-creation if schema changed (bust the cache on hot reload)
const SCHEMA_VERSION = 'v2-user'

const db =
  globalForPrisma.prisma && globalForPrisma.prismaSchemaVersion === SCHEMA_VERSION
    ? globalForPrisma.prisma
    : new PrismaClient({
        // Only log queries in development — not in production
        log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
      })

globalForPrisma.prisma = db
globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION

export { db }
