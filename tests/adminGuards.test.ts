import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * app/admin/layout.tsx is not an authorisation boundary. On a client-side
 * navigation Next.js renders only the segments below the one the browser says it
 * already has (the unsigned Next-Router-State-Tree header), so a layout's
 * requireAdmin() can be skipped while the page under it still renders and reads
 * the database. Every admin page therefore checks for itself, first thing.
 */
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === 'page.tsx' ? [path] : [];
  });
}

describe('admin pages', () => {
  const files = pages('app/admin');
  it('finds the admin pages', () => expect(files.length).toBeGreaterThan(15));
  it.each(files)('%s calls requireAdmin() before anything else', (file) => {
    const body = /export default async function \w*\([\s\S]*?\)(?::[^{]+)?\s*\{\s*([^\n]*)/.exec(readFileSync(file, 'utf8'));
    expect(body?.[1]).toBe('await requireAdmin();');
  });
});
