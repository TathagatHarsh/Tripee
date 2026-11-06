import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Every sign-in and sign-up a visitor sees is ours (/sign-in, /sign-up), never
 * Clerk's hosted Account Portal. Clerk falls back to the portal wherever it is
 * not told otherwise, so both places that tell it are held here.
 */
describe('sign-in stays on our own pages', () => {
  it.each(['proxy.ts', 'app/layout.tsx'])('%s points Clerk at /sign-in and /sign-up', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).toMatch(/signInUrl[=:]\s*"\/sign-in"/);
    expect(src).toMatch(/signUpUrl[=:]\s*"\/sign-up"/);
  });
});
