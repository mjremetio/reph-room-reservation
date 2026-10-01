'use client';

/**
 * S19 Admin users (docs/spec/06-ui.md; flows F31): who can sign in. Add someone (a temporary password, shown once),
 * change name, division or role, disable or enable, reset the account (a new temporary password, signed out
 * everywhere, a new password at the next sign-in) and sign someone out everywhere.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Role } from '../../domain/types';
import { adminApi, useSession, type AccountView } from '../api';
import { fmtTool } from '../format';
import { Sheet } from '../Sheet';
import { DataGrid, type Column } from '../table/DataGrid';
import { useAdminAction } from './shared';

const statusOf = (u: AccountView) => (u.disabled ? 'Disabled' : u.mustChangePassword ? 'New password needed' : 'Active');

/** A temporary password, shown once, with Copy. */
function OneTimePassword({ login, password }: { login: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="banner banner--info otp" role="status">
      <div>
        Temporary password for <strong>{login.toLowerCase()}</strong> (shown once; give it to them in person or by phone):
      </div>
      <div className="copy-row">
        <input readOnly value={password} onFocus={(e) => e.currentTarget.select()} aria-label="Temporary password" className="dt-mono" />
        <button
          className="btn btn--secondary btn--small"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(password)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="card__meta">They choose their own password when they sign in.</div>
    </div>
  );
}

function NewUser({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [division, setDivision] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null);
  const action = useAdminAction();
  const submit = async () => {
    const res = await action.run(() => adminApi.addUser({ name: name.trim(), email: email.trim(), ...(division.trim() ? { division: division.trim() } : {}), role }));
    if (res?.password) setCreated({ login: res.user.login, password: res.password });
  };
  return (
    <Sheet title="Add a person" subtitle="They can sign in and book rooms" onClose={onClose}>
      {created ? (
        <>
          <OneTimePassword login={created.login} password={created.password} />
          <button className="btn btn--primary btn--small" onClick={onClose}>
            Done
          </button>
        </>
      ) : (
        <form
          className="form-grid"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label>
            Name (Last, First)
            <input value={name} placeholder="Tester, Foxtrot" autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            E-mail
            <input type="email" value={email} placeholder="firstname.lastname@example.com" onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Division (optional)
            <input value={division} onChange={(e) => setDivision(e.target.value)} />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="user">User: books rooms</option>
              <option value="admin">Admin: also runs these pages</option>
            </select>
          </label>
          <p className="card__note">They sign in with this e-mail. A temporary password is made for them.</p>
          {action.error && <div className="error-line">{action.error}</div>}
          <div className="btn-row">
            <button className="btn btn--primary btn--small" type="submit" disabled={action.working}>
              {action.working ? 'Adding…' : 'Add person'}
            </button>
            <button className="btn btn--secondary btn--small" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function UserSheet({ user, me, onClose }: { user: AccountView; me: string; onClose: () => void }) {
  const [u, setU] = useState(user);
  const [name, setName] = useState(user.name);
  const [division, setDivision] = useState(user.division ?? '');
  const [role, setRole] = useState<Role>(user.role);
  const [confirmReset, setConfirmReset] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const action = useAdminAction();
  const self = u.login === me;

  const save = async () => {
    const res = await action.run(() => adminApi.editUser(u.login, { name: name.trim(), division: division.trim() || null, role }));
    if (res) {
      setU(res.user);
      setNotice('Saved.');
    }
  };
  const toggle = async () => {
    const res = await action.run(() => adminApi.editUser(u.login, { disabled: !u.disabled }));
    if (res) {
      setU(res.user);
      setNotice(res.user.disabled ? 'Disabled: they are signed out and can’t sign in.' : 'Enabled: they can sign in again.');
    }
  };
  const reset = async () => {
    const res = await action.run(() => adminApi.resetUser(u.login));
    setConfirmReset(false);
    if (res?.password) {
      setU(res.user);
      setPassword(res.password);
      setNotice(null);
    }
  };
  const signOut = async () => {
    const res = await action.run(() => adminApi.signOutUser(u.login));
    if (res) setNotice('Signed out everywhere, including connected AI apps.');
  };

  return (
    <Sheet title={u.name} subtitle={`${u.login.toLowerCase()} · ${u.email}`} onClose={onClose}>
      {password && <OneTimePassword login={u.login} password={password} />}
      {notice && (
        <div className="banner banner--info" role="status">
          {notice}
        </div>
      )}
      {action.error && <div className="banner banner--error">{action.error}</div>}
      <form
        className="form-grid"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Name (Last, First)
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Division
          <input value={division} onChange={(e) => setDivision(e.target.value)} />
        </label>
        <label>
          Role
          <select value={role} disabled={self} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {self && <p className="card__note">You can&apos;t change your own role or access.</p>}
        <div className="btn-row">
          <button className="btn btn--primary btn--small" type="submit" disabled={action.working}>
            Save
          </button>
        </div>
      </form>
      <h3 className="section-title">Account</h3>
      <dl className="details">
        <div className="details__row">
          <dt>Status</dt>
          <dd>{statusOf(u)}</dd>
        </div>
        <div className="details__row">
          <dt>Last sign-in</dt>
          <dd>{u.lastSignInAt ? fmtTool(u.lastSignInAt) : '—'}</dd>
        </div>
        <div className="details__row">
          <dt>Added</dt>
          <dd>{fmtTool(u.createdAt)}</dd>
        </div>
      </dl>
      {confirmReset ? (
        <div className="admin-inline">
          <p>
            Reset <strong>{u.name}</strong>? They get a new temporary password, are signed out everywhere (AI apps too) and must choose a new password at the next sign-in.
          </p>
          <div className="btn-row">
            <button className="btn btn--danger btn--small" disabled={action.working} onClick={() => void reset()}>
              Reset account
            </button>
            <button className="btn btn--secondary btn--small" onClick={() => setConfirmReset(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="btn-row">
          <button className="btn btn--secondary btn--small" disabled={action.working} onClick={() => setConfirmReset(true)}>
            Reset account…
          </button>
          <button className="btn btn--secondary btn--small" disabled={action.working} onClick={() => void signOut()}>
            Sign out everywhere
          </button>
          {!self && (
            <button className={`btn btn--small ${u.disabled ? 'btn--primary' : 'btn--danger'}`} disabled={action.working} onClick={() => void toggle()}>
              {u.disabled ? 'Enable' : 'Disable'}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function AdminUsers() {
  const { data: users = [], isLoading, error } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminApi.users });
  const { data: me } = useSession();
  const [open, setOpen] = useState<AccountView | null>(null);
  const [adding, setAdding] = useState(false);
  const columns: Column<AccountView>[] = [
    { key: 'name', label: 'Name', value: (u) => u.name, render: (u) => <strong>{u.name}</strong> },
    { key: 'login', label: 'Tool login', value: (u) => u.login.toLowerCase(), className: 'dt-mono' },
    { key: 'email', label: 'E-mail', value: (u) => u.email },
    { key: 'division', label: 'Division', value: (u) => u.division },
    { key: 'role', label: 'Role', value: (u) => u.role, render: (u) => <span className={`dt-chip${u.role === 'admin' ? ' dt-chip--yours' : ''}`}>{u.role === 'admin' ? 'Admin' : 'User'}</span> },
    {
      key: 'status',
      label: 'Status',
      value: statusOf,
      render: (u) => <span className={`dt-chip${u.disabled ? ' dt-chip--taken' : u.mustChangePassword ? ' dt-chip--partial' : ' dt-chip--free'}`}>{statusOf(u)}</span>,
    },
    { key: 'last', label: 'Last sign-in', value: (u) => u.lastSignInAt, csv: (u) => (u.lastSignInAt ? fmtTool(u.lastSignInAt) : ''), render: (u) => (u.lastSignInAt ? fmtTool(u.lastSignInAt) : '—') },
    { key: 'created', label: 'Added', value: (u) => u.createdAt, csv: (u) => fmtTool(u.createdAt), render: (u) => fmtTool(u.createdAt) },
  ];
  return (
    <div className="admin-page">
      <header className="admin-page__head admin-page__head--row">
        <div>
          <h1>Users</h1>
          <p className="card__meta">Who can sign in. Company sign-in (Entra ID) replaces this list later.</p>
        </div>
        <button className="btn btn--primary btn--small" onClick={() => setAdding(true)}>
          + Add person
        </button>
      </header>
      {error && <div className="banner banner--error">I can&apos;t load the accounts right now.</div>}
      <DataGrid rows={users} columns={columns} rowKey={(u) => u.login} noun="people" defaultSort={{ key: 'name', dir: 'asc' }} loading={isLoading} onRowClick={setOpen} exportName="users" />
      {adding && <NewUser onClose={() => setAdding(false)} />}
      {open && <UserSheet user={open} me={me?.login ?? ''} onClose={() => setOpen(null)} />}
    </div>
  );
}
