'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { aBtn } from '@/components/admin/ui';

export function ResumeButton({ vendorId, id }: { vendorId: string; id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <button type="button" disabled={pending} className={aBtn('secondary', 'md', 'min-h-11')} onClick={async () => {
        setPending(true); setError(false);
        try {
          const res = await fetch('/api/inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vendorId, resume: { ids: [id] } }) });
          if (!res.ok) throw new Error();
          router.refresh();
        } catch { setError(true); setPending(false); }
      }}>{pending ? 'Resuming…' : 'Resume'}</button>
      {error && <span role="alert" className="text-a-meta text-a-bad-ink">Try again</span>}
    </>
  );
}
