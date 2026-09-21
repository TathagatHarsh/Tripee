type Level = "info" | "warn" | "error";

export function log(
  level: Level,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.info(record);
}

export function requestId(req: Request): string {
  return req.headers.get("x-request-id")
    ?? req.headers.get("x-vercel-id")
    ?? crypto.randomUUID();
}

