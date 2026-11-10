import "dotenv/config";
const base = process.env.PAYMENT_APP_URL ?? "http://localhost:3000";
const secret = process.env.PAYMENT_WORKER_SECRET;
if (!secret) throw new Error("Set PAYMENT_WORKER_SECRET");
async function tick() {
  const response = await fetch(`${base}/api/internal/payments`, {
    method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(65_000),
  });
  if (!response.ok) throw new Error(`Payment worker returned ${response.status}`);
  console.log(await response.json());
}
async function main() {
  do {
    try { await tick(); }
    catch (error) { console.error(String(error)); if (!process.argv.includes("--watch")) { process.exitCode = 1; return; } }
    if (!process.argv.includes("--watch")) break;
    await new Promise(resolve => setTimeout(resolve, 60_000));
  } while (true);
}
void main();
