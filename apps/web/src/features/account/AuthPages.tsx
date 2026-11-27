import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { orpc } from '../../lib/orpc';
import { cx } from '../board/lib';
import u from '../board/ui.module.css';
import s from './Auth.module.css';
import { authClient, authError, inviteCookie, setInviteCookie } from './auth-client';

export function Shell({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className={s.page}>
      <div className={s.card}>
        <p className={s.brand}>HeroArc</p>
        <h1 className={s.title}>{title}</h1>
        {lede && <p className={s.lede}>{lede}</p>}
        {children}
      </div>
    </main>
  );
}

export function Field({
  label,
  ...input
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={u.field}>
      <span className={u.fieldLabel}>{label}</span>
      <input className={u.input} {...input} />
    </label>
  );
}

function GoogleButton({ label }: { label: string }) {
  const opts = useQuery({
    ...orpc.account.authOptions.queryOptions(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!opts.data?.google) return null;
  return (
    <>
      <div className={s.or}>or</div>
      <button
        type="button"
        className={cx(u.btn, s.full)}
        onClick={() =>
          void authClient.signIn.social({
            provider: 'google',
            callbackURL: '/',
            newUserCallbackURL: '/onboarding',
            errorCallbackURL: '/sign-in',
          })
        }
      >
        {label}
      </button>
    </>
  );
}

/** Email or username + password. */
/** Why a redirect brought you back here (?error= from Google, an app's sign-in, or an old link). */
function redirectError(code: string | undefined, description?: string): string {
  if (!code) return '';
  if (/unable_to_create_user|signup_disabled/i.test(code))
    return "Google sign-in didn't work. New here? HeroArc is invite-only: open your invite link first.";
  if (/expired|invalid_token/i.test(code))
    return 'That link has expired. Sign in, or ask for a new one.';
  return `That didn't work (${description || code.replace(/_/g, ' ')}). If you were connecting an app, start again from the app.`;
}

export function SignInPage({
  error: fromRedirect,
  description,
}: {
  error?: string;
  description?: string;
} = {}) {
  const [who, setWho] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => redirectError(fromRedirect, description));
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const id = who.trim();
    const r = id.includes('@')
      ? await authClient.signIn.email({ email: id, password })
      : await authClient.signIn.username({ username: id, password });
    setBusy(false);
    if (r.error) {
      setError(
        r.error.status === 403
          ? 'Confirm your email first: check your inbox for the link.'
          : authError(r.error, "That didn't work. Check your details and try again."),
      );
      return;
    }
    // Signing in for an app (OAuth): Better Auth's client follows the redirect back into the flow.
    const d = r.data as { redirect?: boolean; url?: string } | null;
    if (d?.redirect && d.url) return;
    // Otherwise a full load, so every part of the app starts with the new session.
    window.location.assign('/');
  };

  return (
    <Shell title="Sign in">
      <form className={s.form} onSubmit={(e) => void submit(e)}>
        <Field
          label="Email or username"
          autoComplete="username"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          required
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={cx(u.primary, s.full)} disabled={busy}>
          Sign in
        </button>
      </form>
      <GoogleButton label="Sign in with Google" />
      <div className={s.links}>
        <Link to="/reset-password">Forgot password?</Link>
        <span className={u.muted}>Invite-only</span>
      </div>
    </Shell>
  );
}

/** /invite/{code}: check it, remember it, go to sign-up. */
export function InvitePage({ code }: { code: string }) {
  const nav = useNavigate();
  const check = useQuery({
    ...orpc.account.checkInvite.queryOptions({ input: { code } }),
    retry: false,
  });
  useEffect(() => {
    if (check.data?.valid) {
      setInviteCookie(code);
      void nav({ to: '/sign-up' });
    }
  }, [check.data, code, nav]);
  if (check.isPending) return <Shell title="Checking your invite…">{null}</Shell>;
  return (
    <Shell
      title="This invite doesn't work"
      lede="It may have expired or been used already. Ask whoever invited you for a new link."
    >
      <Link to="/sign-in">Sign in instead</Link>
    </Shell>
  );
}

/** Create an account (needs the invite cookie). */
export function SignUpPage() {
  const nav = useNavigate();
  const [code] = useState(() => (typeof document === 'undefined' ? undefined : inviteCookie()));
  const check = useQuery({
    ...orpc.account.checkInvite.queryOptions({ input: { code: code ?? '' } }),
    enabled: !!code,
    retry: false,
  });
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (check.data?.email) setForm((f) => ({ ...f, email: check.data?.email ?? f.email }));
  }, [check.data]);

  if (!code || check.data?.valid === false)
    return (
      <Shell
        title="HeroArc is invite-only"
        lede="Open the invite link you were sent to create an account."
      >
        <Link to="/sign-in">I already have an account</Link>
      </Shell>
    );

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await authClient.signUp.email({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      username: form.username.trim(),
      callbackURL: '/onboarding',
    });
    setBusy(false);
    if (r.error) {
      setError(authError(r.error, "Couldn't create the account. Try again."));
      return;
    }
    void nav({ to: '/verify', search: { email: form.email.trim() } });
  };

  return (
    <Shell title="Join HeroArc" lede="You've been invited. Create your account.">
      <form className={s.form} onSubmit={(e) => void submit(e)}>
        <Field
          label="Your name"
          autoComplete="name"
          value={form.name}
          onChange={upd('name')}
          required
        />
        <Field
          label="Username"
          autoComplete="username"
          pattern="[A-Za-z0-9_.]{3,30}"
          title="3 to 30 letters, numbers, dots or underscores"
          value={form.username}
          onChange={upd('username')}
          required
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={upd('email')}
          readOnly={!!check.data?.email}
          required
        />
        <Field
          label="Password (10+ characters)"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={form.password}
          onChange={upd('password')}
          required
        />
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={cx(u.primary, s.full)} disabled={busy}>
          Create account
        </button>
      </form>
      <GoogleButton label="Join with Google" />
    </Shell>
  );
}

/** After sign-up: check your email (with resend). */
export function VerifyPage({ email }: { email?: string }) {
  const [sent, setSent] = useState(false);
  return (
    <Shell
      title="Check your email"
      lede={`We sent a link to ${email || 'your email'}. Open it to confirm your address and finish setting up.`}
    >
      {email && (
        <button
          type="button"
          className={cx(u.btn, s.full)}
          disabled={sent}
          onClick={async () => {
            await authClient.sendVerificationEmail({ email, callbackURL: '/onboarding' });
            setSent(true);
          }}
        >
          {sent ? 'Sent again' : 'Send it again'}
        </button>
      )}
      <Link to="/sign-in">Back to sign in</Link>
    </Shell>
  );
}

/** Ask for a reset link, or (with ?token=) choose a new password. */
export function ResetPasswordPage({ token }: { token?: string }) {
  const nav = useNavigate();
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (token) {
      const r = await authClient.resetPassword({ newPassword: value, token });
      setBusy(false);
      if (r.error)
        setMsg({
          ok: false,
          text: authError(r.error, 'That link has expired. Ask for a new one.'),
        });
      else void nav({ to: '/sign-in' });
      return;
    }
    await authClient.requestPasswordReset({ email: value.trim(), redirectTo: '/reset-password' });
    setBusy(false);
    setMsg({ ok: true, text: 'If that email has an account, a reset link is on its way.' });
  };
  return (
    <Shell title={token ? 'Choose a new password' : 'Reset your password'}>
      <form className={s.form} onSubmit={(e) => void submit(e)}>
        {token ? (
          <Field
            label="New password (10+ characters)"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        ) : (
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        )}
        {msg && (
          <p className={msg.ok ? s.ok : s.error} role="status">
            {msg.text}
          </p>
        )}
        <button type="submit" className={cx(u.primary, s.full)} disabled={busy}>
          {token ? 'Save password' : 'Send reset link'}
        </button>
      </form>
      <Link to="/sign-in">Back to sign in</Link>
    </Shell>
  );
}

export const zones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
      'timeZone',
    );
  } catch {
    return [Intl.DateTimeFormat().resolvedOptions().timeZone];
  }
};

/** What an app (from its own registration: unverified) says about itself. */
interface PublicClient {
  client_name?: string;
  client_uri?: string;
}

/**
 * An app (Claude, ChatGPT, an MCP client) asks to act for you: Allow or Cancel. The page URL is
 * Better Auth's signed copy of the app's request; the client plugin sends it along with consent.
 */
export function ConsentPage() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const clientId = params.get('client_id') ?? '';
  const me = useQuery({ ...orpc.account.me.queryOptions(), retry: false });
  const client = useQuery({
    queryKey: ['oauth-client', clientId],
    enabled: !!clientId,
    retry: false,
    queryFn: async () => {
      const r = await authClient.$fetch<PublicClient>('/oauth2/public-client', {
        query: { client_id: clientId },
      });
      if (r.error) throw new Error('unknown app');
      return r.data;
    },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  let returnHost = '';
  try {
    returnHost = new URL(params.get('redirect_uri') ?? '').host;
  } catch {}
  if (!params.has('sig') || !clientId || client.isError)
    return (
      <Shell
        title="Nothing to approve"
        lede="This link is incomplete or has expired. Start connecting from the app again."
      >
        <Link to="/">Go to my dashboard</Link>
      </Shell>
    );

  const name = client.data?.client_name?.trim().slice(0, 60) || 'An app';
  const decide = async (accept: boolean) => {
    setBusy(true);
    setError('');
    const r = await authClient.oauth2.consent({ accept });
    // On success Better Auth's client follows the redirect back to the app.
    if (r.error) {
      setBusy(false);
      setError(authError(r.error, 'That took too long. Start connecting from the app again.'));
    }
  };

  return (
    <Shell
      title={`Connect ${name}?`}
      lede={`${name} wants to use HeroArc for you. It will be able to:`}
    >
      <ul className={s.lede} data-consent="1">
        <li>Read what you log: meals, weight, mood, habits, training and your goals</li>
        <li>Log new entries (you can undo them in HeroArc)</li>
        <li>Suggest edits and deletions, which wait for your OK under Settings → Agent activity</li>
      </ul>
      <p className={s.lede}>It won't see your Oura data (sleep, readiness, steps…).</p>
      <p className={s.lede}>
        {`Signed in as ${me.data?.email ?? '…'}.${returnHost ? ` You'll go back to ${returnHost}.` : ''} You can disconnect it any time in Settings → Connections.`}
      </p>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <div className={s.links}>
        <button type="button" className={u.btn} disabled={busy} onClick={() => void decide(false)}>
          Cancel
        </button>
        <button
          type="button"
          className={u.primary}
          disabled={busy || !client.data}
          onClick={() => void decide(true)}
        >
          Allow
        </button>
      </div>
    </Shell>
  );
}
