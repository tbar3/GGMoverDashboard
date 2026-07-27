'use client';

import { useState, useTransition } from 'react';

type Result = { ok: boolean; message: string };

export function EmailReport({
  action,
  defaultTo,
}: {
  action: (to: string) => Promise<Result>;
  defaultTo?: string;
}) {
  const [to, setTo] = useState(defaultTo ?? '');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const send = () => {
    if (!to.trim()) {
      setMsg('Enter a recipient email.');
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const r = await action(to.trim());
      setMsg(r.message);
    });
  };

  return (
    <div className="gg-surface mb-5 flex flex-wrap items-end gap-2 p-3">
      <label className="block min-w-[200px] flex-1">
        <span className="gg-eyebrow mb-1 block">Email this report to</span>
        <input
          type="email"
          className="gg-input w-full"
          placeholder="name@goodguysserve.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      <button onClick={send} disabled={pending} className="gg-btn-primary">
        {pending ? 'Sending…' : 'Email Report'}
      </button>
      {msg && <span className="w-full font-ui text-sm font-semibold text-navy-600">{msg}</span>}
    </div>
  );
}
