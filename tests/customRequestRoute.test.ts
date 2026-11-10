import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const createCustomRequest = vi.fn(async () => ({ ref: "CR-ABCDEF" }));
vi.mock("@/lib/customRequests", () => ({ createCustomRequest }));
vi.mock("@/lib/catalogData", () => ({ getCatalogSnapshot: vi.fn(async () => ({})) }));
const serviceable = vi.fn(() => ({ serviceable: true }));
vi.mock("@/lib/delivery", () => ({
  checkDeliveryServiceability: serviceable,
  zoneForPincode: () => ({ slots: ["standard", "pickup"] }),
  resolveSlot: () => ({ effectiveLeadHours: 4 }),
}));
const { POST } = await import("@/app/api/custom-requests/route");

const address = { lat: 17.4, lng: 78.45, address: "Road 1", locality: "Banjara Hills", city: "Hyderabad", state: "Telangana", pincode: "500034", placeId: "p" };
const valid = () => ({ name: "Asha", phone: "9876543210", sizeKg: 1, flavour: "Chocolate", dueAt: new Date(Date.now() + 3 * 86400_000).toISOString(), address, consent: true });
let n = 0;
async function send(data: object, photo: File | null = new File([new Uint8Array(10)], "c.jpg", { type: "image/jpeg" })) {
  const form = new FormData();
  form.set("data", JSON.stringify(data));
  if (photo) form.set("photo", photo);
  // Serialise once so the request carries the content-length a real browser sends.
  const encoded = new Response(form);
  const headers = { "content-type": encoded.headers.get("content-type")!, "x-forwarded-for": `10.0.0.${++n}` };
  const body = await encoded.arrayBuffer();
  return POST(new Request("http://localhost/api/custom-requests", { method: "POST", body, headers: { ...headers, "content-length": String(body.byteLength) } }));
}

describe("POST /api/custom-requests", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "tok"); vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "id"); vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_x"); vi.stubEnv("RAZORPAY_KEY_SECRET", "s");
    serviceable.mockReturnValue({ serviceable: true });
    createCustomRequest.mockClear();
  });
  it("creates a request", async () => {
    const res = await send(valid());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ref: "CR-ABCDEF" });
  });
  it("400 without a photo", async () => expect((await send(valid(), null)).status).toBe(400));
  it("400 without consent", async () => expect((await send({ ...valid(), consent: false })).status).toBe(400));
  it("400 for a 9-digit phone, with a field error", async () => {
    const res = await send({ ...valid(), phone: "987654321" });
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.phone).toBeTruthy();
  });
  it("415 for a non-image", async () => expect((await send(valid(), new File(["x"], "a.pdf", { type: "application/pdf" }))).status).toBe(415));
  it("422 for a pincode we don't serve", async () => {
    serviceable.mockReturnValue({ serviceable: false });
    expect((await send(valid())).status).toBe(422);
  });
  it("422 when the date is inside the lead time", async () => expect((await send({ ...valid(), dueAt: new Date(Date.now() + 3600_000).toISOString() })).status).toBe(422));
  it("413 when content-length is over the limit or missing", async () => {
    const big = new Request("http://localhost/api/custom-requests", { method: "POST", body: "x", headers: { "content-length": String(10 * 1024 * 1024), "x-forwarded-for": "10.9.9.1" } });
    expect((await POST(big)).status).toBe(413);
    const none = new Request("http://localhost/api/custom-requests", { method: "POST", headers: { "x-forwarded-for": "10.9.9.2" } });
    expect((await POST(none)).status).toBe(413);
  });
  it("503 when WhatsApp is off", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    expect((await send(valid())).status).toBe(503);
    expect(createCustomRequest).not.toHaveBeenCalled();
  });
  it("503 when online payment is off, so no one is quoted a cake they cannot pay for", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "");
    expect((await send(valid())).status).toBe(503);
    expect(createCustomRequest).not.toHaveBeenCalled();
  });
});
