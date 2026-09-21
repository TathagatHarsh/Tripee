import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const rows = await db.order.findMany({
  where: { customerName: { in: ["Aryu", "E2E Duplicate Check", "Cookie Probe"] } },
  orderBy: { createdAt: "desc" },
  select: { ref: true, customerName: true, status: true, totalPaise: true, createdAt: true, userId: true },
  take: 60,
});
console.log(`matching test-named rows: ${rows.length}`);
for (const r of rows) {
  console.log(`${r.ref}  ${(r.customerName ?? "").padEnd(20)}  ${r.status.padEnd(10)}  ${r.createdAt.toISOString()}  user=${r.userId ?? "guest"}`);
}
console.log(`total orders in table: ${await db.order.count()}`);
await db.$disconnect();
