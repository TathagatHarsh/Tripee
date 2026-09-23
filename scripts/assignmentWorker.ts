import "dotenv/config";
// Calls the authenticated worker endpoint; no framework imports in this CLI.
const base = process.env.ASSIGNMENT_APP_URL ?? "http://localhost:3000";
const secret = process.env.ASSIGNMENT_WORKER_SECRET;
if (!secret) throw new Error("Set ASSIGNMENT_WORKER_SECRET");
async function tick() {
  const response = await fetch(`${base}/api/internal/assignments`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Worker returned ${response.status}`);
  console.log(await response.json());
}
async function main() {
  do {
    await tick().catch((error) => console.error(error.message));
    if (!process.argv.includes("--watch")) break;
    await new Promise((resolve) => setTimeout(resolve, 15000));
  } while (true);
}
void main();
