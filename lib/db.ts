import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The builder, the pricing, the rules and the docket all work without a
 * database. Only saving a design and placing an order need one.
 *
 * So the client is created lazily and the absence of DATABASE_URL is a
 * first-class state rather than a crash on import — a deployment without a
 * database should still let someone design a cake, and say plainly why they
 * cannot order it yet.
 */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_MAX) || 2, connectionTimeoutMillis: 10_000 }) });
}

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

/** Convenience for call sites that have already checked `hasDatabase()`. */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});

export const NO_DATABASE_MESSAGE =
  "This preview isn't connected to a kitchen database yet, so orders can't be "
  + "recorded. Everything else — the design, the price, the docket — is real.";
