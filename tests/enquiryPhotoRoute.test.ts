import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({ put: vi.fn(async (path: string) => ({ url: `https://blob.test/${path}` })) }));
const { POST } = await import("@/app/api/enquiry-photo/route");

let n = 0;
async function send(photo: Blob | null, headers: Record<string, string> = {}) {
  const form = new FormData();
  if (photo) form.set("photo", photo, "photo.jpg");
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  return POST(new Request("http://localhost/api/enquiry-photo", {
    method: "POST", body,
    headers: { "content-type": encoded.headers.get("content-type")!, "content-length": String(body.byteLength), "x-forwarded-for": `10.1.0.${++n}`, ...headers },
  }));
}
const jpeg = async () => new Blob([new Uint8Array(await sharp({ create: { width: 30, height: 40, channels: 3, background: "#f0c" } }).jpeg().toBuffer())], { type: "image/jpeg" });

beforeEach(() => vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob"));

it("stores a real photo and returns its URL", async () => {
  const res = await send(await jpeg());
  expect(res.status).toBe(201);
  expect((await res.json()).url).toBe("https://blob.test/catalog/enquiry/photo.webp");
});
it("refuses a file that isn't an image", async () => expect((await send(new Blob(["<svg onload=alert(1)>"], { type: "image/jpeg" }))).status).toBe(415));
it("400 without a photo", async () => expect((await send(null)).status).toBe(400));
it("403 from another site", async () => expect((await send(await jpeg(), { origin: "https://evil.example" })).status).toBe(403));
it("503 when no photo store is set up", async () => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  expect((await send(await jpeg())).status).toBe(503);
});
