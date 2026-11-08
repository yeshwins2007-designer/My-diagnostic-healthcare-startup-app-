import { PrismaClient } from '@prisma/client';

// Next.js hot-reloads modules in development, which would otherwise open a new
// connection pool on every save until SQLite runs out of handles.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
