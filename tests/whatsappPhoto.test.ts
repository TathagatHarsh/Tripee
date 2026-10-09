import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { order: { findUnique } } }));

import { GET } from "@/app/api/whatsapp/photo/[orderId]/route";
import { photoSignature } from "@/lib/whatsapp";

const fetchMock = vi.fn();
let webp: ArrayBuffer;

const call = (orderId: string, s: string) =>
  GET(new Request(`https://x/api/whatsapp/photo/${orderId}?s=${s}`), { params: Promise.resolve({ orderId }) });
const isJpeg = async (res: Response) => {
  const b = new Uint8Array(await res.arrayBuffer());
  return b[0] === 0xff && b[1] === 0xd8;
};
const expectJpeg200 = async (res: Response) => {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/jpeg");
  expect(await isJpeg(res)).toBe(true);
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("WHATSAPP_APP_SECRET", "secret");
  vi.stubGlobal("fetch", fetchMock);
  const buf = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#a0522d" } }).webp().toBuffer();
  webp = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
});

describe("GET /api/whatsapp/photo/[orderId]", () => {
  it("404s a bad signature without reading the database", async () => {
    expect((await call("ord1", "nope")).status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("404s without reading the database when the secret is empty", async () => {
    const s = photoSignature("ord1");
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    expect((await call("ord1", s)).status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("converts the first cake photo to JPEG", async () => {
    findUnique.mockResolvedValue({
      cakeName: null,
      cakeImageUrl: null,
      cakes: [{ cakeName: "A", cakeImageUrl: null }, { cakeName: "B", cakeImageUrl: "https://abc.public.blob.vercel-storage.com/b.webp" }],
    });
    fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => webp });
    const res = await call("ord1", photoSignature("ord1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(fetchMock.mock.calls[0][0].toString()).toBe("https://abc.public.blob.vercel-storage.com/b.webp");
    expect(await isJpeg(res)).toBe(true);
  });

  it("resolves a site-relative photo against the site URL", async () => {
    findUnique.mockResolvedValue({ cakeName: "X", cakeImageUrl: "/uploads/x.webp", cakes: [] });
    fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => webp });
    await expectJpeg200(await call("ord1", photoSignature("ord1")));
    expect(fetchMock.mock.calls[0][0].toString()).toMatch(/\/uploads\/x\.webp$/);
  });

  it("falls back to a name card when there is no photo", async () => {
    findUnique.mockResolvedValue({ cakeName: "Choco", cakeImageUrl: null, cakes: [] });
    const res = await call("ord1", photoSignature("ord1"));
    await expectJpeg200(res);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch a photo from a host the site does not serve, and does not cache the fallback", async () => {
    for (const cakeImageUrl of ["https://evil.test/x.webp", "//evil.test/x.webp", "http://abc.public.blob.vercel-storage.com/x.webp"]) {
      findUnique.mockResolvedValue({ cakeName: "Choco", cakeImageUrl, cakes: [] });
      const res = await call("ord1", photoSignature("ord1"));
      await expectJpeg200(res);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves a plain JPEG when the name card cannot be drawn, and never caches it", async () => {
    const svgSpy = vi.spyOn(sharp.prototype, "jpeg").mockImplementationOnce(() => { throw new Error("no fonts"); });
    findUnique.mockResolvedValue({ cakeName: "Choco\u0001", cakeImageUrl: null, cakes: [] });
    const res = await call("ord1", photoSignature("ord1"));
    svgSpy.mockRestore();
    await expectJpeg200(res);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("falls back to a name card when the fetch fails", async () => {
    findUnique.mockResolvedValue({ cakeName: "Choco", cakeImageUrl: "https://abc.public.blob.vercel-storage.com/c.webp", cakes: [] });
    fetchMock.mockRejectedValue(new Error("boom"));
    await expectJpeg200(await call("ord1", photoSignature("ord1")));
    fetchMock.mockResolvedValue({ ok: false });
    const res = await call("ord1", photoSignature("ord1"));
    await expectJpeg200(res);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("falls back to a name card when the bytes are not an image", async () => {
    findUnique.mockResolvedValue({ cakeName: "Choco", cakeImageUrl: "https://abc.public.blob.vercel-storage.com/c.webp", cakes: [] });
    fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => new TextEncoder().encode("not an image").buffer });
    await expectJpeg200(await call("ord1", photoSignature("ord1")));
  });

  it("escapes awkward cake names", async () => {
    findUnique.mockResolvedValue({ cakeName: '<b>&"Cake', cakeImageUrl: null, cakes: [] });
    await expectJpeg200(await call("ord1", photoSignature("ord1")));
  });

  it("404s an unknown order", async () => {
    findUnique.mockResolvedValue(null);
    expect((await call("ord1", photoSignature("ord1"))).status).toBe(404);
  });
});
