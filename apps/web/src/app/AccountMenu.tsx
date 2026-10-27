import { CloudCheck, LogIn, LogOut, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, type OAuthProvider } from './backend/auth';
import { useProviders } from './backend/providers';
import { supabase } from './backend/supabase';

const PROVIDER_NAME: Record<OAuthProvider, string> = { google: 'Google', github: 'GitHub' };

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6c-.3 1.4-1 2.5-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8C3.9 20.5 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.7 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9l3.6-2.8z" />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1l3.6 2.8C6.6 7.3 9.1 5.4 12 5.4z"
      />
    </svg>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.6 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.3-5.3 5.6.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

/** Sign in / create an account: Google, GitHub (when enabled), email + password, or an email link. */
function SignInDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation('project');
  const { signIn, signUp, sendMagicLink, signInWith } = useAuth();
  const providers = useProviders();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (f: () => Promise<{ ok: boolean; text: string } | null>) => {
    setBusy(true);
    setNote(null);
    const r = await f();
    setBusy(false);
    if (r) setNote(r);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (mode === 'in') {
        const err = await signIn(email, password);
        if (err) return { ok: false, text: err };
        onOpenChange(false);
        return null;
      }
      const r = await signUp(email, password);
      if (r.error) return { ok: false, text: r.error };
      if (r.confirm) return { ok: true, text: t('account.checkEmail', { email }) };
      onOpenChange(false);
      return null;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'in' ? t('account.signIn') : t('account.createAccountTitle')}</DialogTitle>
          <DialogDescription>{t('account.description')}</DialogDescription>
        </DialogHeader>
        {providers.length > 0 && (
          <div className="grid gap-2">
            {providers.map((p) => (
              <Button
                key={p}
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const err = await signInWith(p);
                    return err ? { ok: false, text: err } : null;
                  })
                }
              >
                {p === 'google' ? <GoogleMark /> : <GithubMark />} {t('account.continueWith', { provider: PROVIDER_NAME[p] })}
              </Button>
            ))}
            <div className="my-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> {t('account.orWithEmail')} <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label htmlFor="auth-email">{t('account.email')}</Label>
            <Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="auth-password">{t('account.password')}</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {mode === 'in' ? t('account.signIn') : t('account.createAccount')}
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button className="text-primary hover:underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? t('account.switchToSignUp') : t('account.switchToSignIn')}
          </button>
          <button
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={busy || !email}
            onClick={() =>
              void run(async () => {
                const err = await sendMagicLink(email);
                return err ? { ok: false, text: err } : { ok: true, text: t('account.linkSent', { email }) };
              })
            }
          >
            <Mail className="size-3.5" /> {t('account.emailLink')}
          </button>
        </div>
        {note && <p className={note.ok ? 'text-sm text-ok' : 'text-sm text-destructive'}>{note.text}</p>}
      </DialogContent>
    </Dialog>
  );
}

/** Top-bar account control; absent when the build has no backend. */
export function AccountMenu() {
  const { t } = useTranslation('project');
  const { ready, account, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  if (!supabase || !ready) return null;
  if (!account)
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <LogIn /> <span className="hidden sm:inline">{t('account.signIn')}</span>
        </Button>
        <SignInDialog open={open} onOpenChange={setOpen} />
      </>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('account.label')} className="rounded-full">
          <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground uppercase">
            {account.email.slice(0, 1) || '?'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate font-normal">{account.email}</DropdownMenuLabel>
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <CloudCheck className="size-3.5" /> {t('account.syncing')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> {t('account.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
