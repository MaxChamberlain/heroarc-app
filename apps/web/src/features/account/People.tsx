import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api, orpc } from '../../lib/orpc';
import { cx } from '../board/lib';
import u from '../board/ui.module.css';
import { authClient } from './auth-client';

/** Settings → Account: who you are, and sign out. */
export function AccountSection() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useQuery({ ...orpc.account.me.queryOptions(), retry: false });
  if (!me.data) return null;
  return (
    <>
      <div className={u.caps}>Account</div>
      <div className={u.row}>
        <span>
          <b>{me.data.name}</b>
          <span
            className={u.muted}
          >{` · ${me.data.username ? `@${me.data.username} · ` : ''}${me.data.email}`}</span>
        </span>
        <button
          type="button"
          className={cx(u.btn, u.small)}
          data-sign-out="1"
          onClick={async () => {
            await authClient.signOut();
            qc.clear();
            void nav({ to: '/sign-in' });
          }}
        >
          Sign out
        </button>
      </div>
      <p className={u.note}>{`Timezone: ${me.data.timezone.replace(/_/g, ' ')}`}</p>
    </>
  );
}

/** Settings → People (admins): invite someone, see and revoke invites. */
export function PeopleSection() {
  const qc = useQueryClient();
  const me = useQuery({ ...orpc.account.me.queryOptions(), retry: false });
  const invites = useQuery({
    ...orpc.account.invites.queryOptions(),
    enabled: me.data?.role === 'admin',
  });
  const [email, setEmail] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (me.data?.role !== 'admin') return null;
  const refresh = () => qc.invalidateQueries({ queryKey: orpc.account.invites.queryKey() });
  return (
    <>
      <div className={u.caps}>People</div>
      <p className={u.note}>
        HeroArc is invite-only. Add an email to send the invite, or leave it blank and share the
        link.
      </p>
      <form
        className={u.inline}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const inv = await api.account.createInvite({
            ...(email.trim() && { email: email.trim() }),
            role: 'member',
          });
          setBusy(false);
          setEmail('');
          setMade(inv.url);
          void refresh();
        }}
      >
        <input
          className={u.input}
          type="email"
          placeholder="Email (optional)"
          aria-label="Invite email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className={u.primary} disabled={busy} data-invite="1">
          Invite
        </button>
      </form>
      {made && (
        <div className={u.row}>
          <code style={{ overflowWrap: 'anywhere' }} data-invite-url="1">
            {made}
          </code>
          <button
            type="button"
            className={cx(u.btn, u.small)}
            onClick={() => void navigator.clipboard?.writeText(made)}
          >
            Copy
          </button>
        </div>
      )}
      {invites.data
        ?.filter((i) => !i.usedAt)
        .map((i) => (
          <div className={u.row} key={i.code} data-invite-code={i.code}>
            <span className={u.muted}>
              {`${i.email ?? 'Link invite'} · expires ${new Date(i.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
            </span>
            <button
              type="button"
              className={u.link}
              onClick={async () => {
                await api.account.revokeInvite({ code: i.code });
                void refresh();
              }}
            >
              Revoke
            </button>
          </div>
        ))}
    </>
  );
}
