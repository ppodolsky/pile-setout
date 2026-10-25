import { useEffect, useState } from 'react';
import type { OAuthProvider } from './auth';

/** OAuth providers enabled on the backend (from its public settings), so we only show working buttons. */
export function useProviders(): OAuthProvider[] {
  const [on, setOn] = useState<OAuthProvider[]>([]);
  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json() as Promise<{ external?: Record<string, boolean> }>)
      .then((s) => setOn((['google', 'github'] as const).filter((p) => s.external?.[p])))
      .catch(() => setOn([]));
  }, []);
  return on;
}
