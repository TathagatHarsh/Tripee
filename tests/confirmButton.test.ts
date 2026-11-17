import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../app/admin/actions', () => ({ advanceOrderStatus: vi.fn() }));
vi.mock('../components/admin/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ConfirmButton } from '../app/admin/ConfirmButton';

describe('ConfirmButton', () => {
  it('posts ref and to=confirmed', () => {
    const html = renderToStaticMarkup(createElement(ConfirmButton, { orderRef: 'MMC-1' }));
    expect(html).toMatch(/name="ref"[^>]*value="MMC-1"|value="MMC-1"[^>]*name="ref"/);
    expect(html).toMatch(/name="to"[^>]*value="confirmed"|value="confirmed"[^>]*name="to"/);
    expect(html).toContain('Confirm');
  });
  // No jsdom here: the failure toast (useEffect on the action result) is checked in the Task 6 browser pass.
});
