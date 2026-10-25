import { create } from 'zustand';
import { appUrl, supabase } from './supabase';

export type OAuthProvider = 'google' | 'github';

export interface Account {
  readonly id: string;
  readonly email: string;
}

interface AuthState {
  /** False until the saved session has been checked. */
  ready: boolean;
  account: Account | null;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string): Promise<{ error: string | null; confirm: boolean }>;
  sendMagicLink(email: string): Promise<string | null>;
  /** Redirects to the provider and back (the session is picked up on return). */
  signInWith(provider: OAuthProvider): Promise<string | null>;
  signOut(): Promise<void>;
}

/** The signed-in account (null when signed out or when there is no backend). */
export const useAuth = create<AuthState>()((set) => ({
  ready: !supabase,
  account: null,
  async signIn(email, password) {
    if (!supabase) return 'No backend configured';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  },
  async signUp(email, password) {
    if (!supabase) return { error: 'No backend configured', confirm: false };
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } });
    return { error: error?.message ?? null, confirm: !error && !data.session };
  },
  async sendMagicLink(email) {
    if (!supabase) return 'No backend configured';
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: appUrl() } });
    return error?.message ?? null;
  },
  async signInWith(provider) {
    if (!supabase) return 'No backend configured';
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: appUrl() } });
    return error?.message ?? null;
  },
  async signOut() {
    await supabase?.auth.signOut();
    set({ account: null });
  },
}));

// keep the store in step with the backend session (initial load, sign-in, sign-out, token refresh)
if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    const u = session?.user;
    useAuth.setState({ ready: true, account: u ? { id: u.id, email: u.email ?? '' } : null });
  });
}
