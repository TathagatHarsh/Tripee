import { describe, expect, it } from "vitest";
import { decodeRefs, encodeRefs } from "@/lib/guestOrders";

/**
 * The cookie that lets a guest back into their own order, and nobody else's.
 *
 * This is the whole of the guest authorisation, so it is tested the way an
 * attacker would reach it: not "does the happy path work" but "what does a
 * forged, edited, truncated or borrowed cookie get you". Every case below that
 * returned a reference would be somebody reading a stranger's name, phone
 * number and delivery window.
 *
 * The cookie-jar half — `readGuestOrderRefs`, `rememberGuestOrders` — needs a
 * request scope and belongs to e2e. What is here is the part that decides.
 */

const KEY = "test-secret-not-a-real-key";
const OTHER = "a-different-deployment-secret";

const MINE = "MC-8B3JQK";
const THEIRS = "MC-P4RT2M";

describe("the guest order cookie", () => {
  it("gives back exactly the references it was given", () => {
    expect(decodeRefs(encodeRefs([MINE], KEY), KEY)).toEqual([MINE]);
    expect(decodeRefs(encodeRefs([MINE, THEIRS], KEY), KEY)).toEqual([MINE, THEIRS]);
  });

  it("survives being put in a Set-Cookie header unescaped", () => {
    // A comma or a semicolon in a cookie value ends the value. Neither the
    // separator nor base64url can produce one.
    expect(encodeRefs([MINE, THEIRS], KEY)).not.toMatch(/[,;\s"\\]/);
  });

  it("is empty when there is no cookie at all", () => {
    expect(decodeRefs(undefined, KEY)).toEqual([]);
    expect(decodeRefs("", KEY)).toEqual([]);
  });
});

describe("what a forged cookie gets you", () => {
  it("nothing, when the references were simply typed in", () => {
    // The attack this whole file exists to stop: paste a reference read off a
    // docket into your own cookie jar and open the tracking page.
    expect(decodeRefs(THEIRS, KEY)).toEqual([]);
    expect(decodeRefs(`${THEIRS}.`, KEY)).toEqual([]);
    expect(decodeRefs(`${THEIRS}.notasignature`, KEY)).toEqual([]);
  });

  it("nothing, when a reference is appended to a genuine cookie", () => {
    const genuine = encodeRefs([MINE], KEY);
    const cut = genuine.lastIndexOf(".");
    const payload = genuine.slice(0, cut);
    const signature = genuine.slice(cut + 1);

    expect(decodeRefs(`${payload}~${THEIRS}.${signature}`, KEY)).toEqual([]);
  });

  it("nothing, when a reference is swapped inside a genuine cookie", () => {
    expect(decodeRefs(encodeRefs([MINE], KEY).replace(MINE, THEIRS), KEY)).toEqual([]);
  });

  it("nothing, when the signature came from a different deployment", () => {
    expect(decodeRefs(encodeRefs([MINE], OTHER), KEY)).toEqual([]);
  });

  it("nothing, when the signature is truncated or padded", () => {
    const genuine = encodeRefs([MINE], KEY);
    // timingSafeEqual throws on a length mismatch; the length check in front of
    // it is what turns that into a refusal rather than a 500.
    expect(() => decodeRefs(genuine.slice(0, -4), KEY)).not.toThrow();
    expect(decodeRefs(genuine.slice(0, -4), KEY)).toEqual([]);
    expect(decodeRefs(genuine + "AAAA", KEY)).toEqual([]);
  });

  it("nothing, from any of the shapes that are not a cookie", () => {
    for (const junk of [".", "..", "~", `.${MINE}`, "null", "[]", "%2e", "MC-8B3JQK~"]) {
      expect(decodeRefs(junk, KEY), JSON.stringify(junk)).toEqual([]);
    }
  });
});

describe("what survives the signature check", () => {
  it("drops anything not shaped like a reference we minted", () => {
    /*
     * Signed by us, so in principle trusted — and filtered anyway, because the
     * result goes straight into a database query and "we signed it" is how the
     * next bug gets in. The lowercase and the SQL-ish entries are the ones that
     * matter.
     */
    const signed = encodeRefs(
      [MINE, "mc-8b3jqk", "MC-TOOLONG1", "MC-ABC", "' OR 1=1 --", "", THEIRS],
      KEY,
    );
    expect(decodeRefs(signed, KEY)).toEqual([MINE, THEIRS]);
  });

  it("caps how many references one browser can carry", () => {
    const many = Array.from({ length: 50 }, (_, i) => `MC-AAA${i % 10}BC`);
    expect(decodeRefs(encodeRefs(many, KEY), KEY).length).toBeLessThanOrEqual(20);
  });
});
