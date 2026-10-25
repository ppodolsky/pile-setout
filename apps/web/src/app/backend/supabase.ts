import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * The backend client, or null when the build has no backend configured (accounts are then hidden
 * and everything stays on the device). The anon key is public by design; data is protected by
 * row-level security in the database (see supabase/migrations).
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }) : null;

/** Where email links (confirmation, magic link) send people back to. */
export const appUrl = (): string => `${window.location.origin}${import.meta.env.BASE_URL}`;
