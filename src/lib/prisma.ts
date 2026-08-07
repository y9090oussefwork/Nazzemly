import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

let prisma: PrismaClient;
let pool: pg.Pool;

declare global {
  // eslint-disable-next-line no-var
  var __globalPrisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __globalPool: pg.Pool | undefined;
}

if (process.env.NODE_ENV === 'production') {
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
} else {
  if (!globalThis.__globalPool) {
    globalThis.__globalPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  pool = globalThis.__globalPool;
  
  if (!globalThis.__globalPrisma) {
    const adapter = new PrismaPg(pool);
    globalThis.__globalPrisma = new PrismaClient({ adapter });
  }
  prisma = globalThis.__globalPrisma;
}

export { prisma, pool };
