'use client';

import { useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import type { MessageResponse, SessionInfo } from '@repo/shared-types';
import { FormAlert } from '@/components/forms/fields';
import { useAuth } from '@/lib/auth/auth-context';
import { formatDate } from '@/lib/format';
import { Panel } from './account-shell';

function deviceName(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const os = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(userAgent)
      ? 'iOS'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

export function SecurityPanel() {
  const { request } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [message, setMessage] = useState('');

  const load = () =>
    request<SessionInfo[]>('/account/sessions')
      .then(setSessions)
      .catch(() => setSessions([]));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOutOthers = async () => {
    const response = await request<MessageResponse>('/account/sessions/sign-out-others', {
      method: 'POST',
    });
    setMessage(response.message);
    await load();
  };

  return (
    <Panel
      title="Signed-in devices"
      description="If you don't recognise a device, sign it out and change your password."
    >
      {message && (
        <div className="mb-4">
          <FormAlert tone="success">{message}</FormAlert>
        </div>
      )}
      {sessions === null ? (
        <p role="status" className="text-sm text-ink-muted">
          Loading…
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((session) => {
            const mobile = /Android|iPhone|iPad/.test(session.userAgent ?? '');
            const Icon = mobile ? Smartphone : Monitor;
            return (
              <li key={session.id} className="flex items-center gap-3 py-3">
                <Icon aria-hidden className="size-5 text-ink-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {deviceName(session.userAgent)}
                    {session.current && (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Signed in {formatDate(session.createdAt)} · last active{' '}
                    {formatDate(session.lastUsedAt)}
                  </p>
                </div>
                {!session.current && (
                  <button
                    type="button"
                    onClick={async () => {
                      await request(`/account/sessions/${session.id}`, { method: 'DELETE' });
                      await load();
                    }}
                    className="text-sm font-semibold text-danger"
                  >
                    Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {sessions && sessions.length > 1 && (
        <button
          type="button"
          onClick={signOutOthers}
          className="mt-4 rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-primary-200"
        >
          Sign out of all other devices
        </button>
      )}
    </Panel>
  );
}
