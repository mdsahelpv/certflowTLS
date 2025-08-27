import { PrismaClient } from '@prisma/client'
import { getPrismaLogLevels } from '@/lib/logger'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: getPrismaLogLevels(),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db