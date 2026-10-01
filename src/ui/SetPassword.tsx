'use client';

/**
 * "Choose a new password" (docs/spec/06-ui.md, S15): shown instead of the app after an Admin reset or for a new
 * account, until the person replaces the temporary password.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError, type Person } from './api';
import { useSignOut } from './session';
import { Brand } from './Brand';

const MIN = 12;

export function SetPassword({ user }: { user: Person }) {
  const client = useQueryClient();
  const signOut = useSignOut();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!current || !next) return setError('Enter the temporary password and a new one.');
    if (next.length < MIN) return setError(`Use at least ${MIN} characters.`);
    if (next !== again) return setError("The new passwords don't match.");
    setWorking(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      client.setQueryData(['session'], { ...user, mustChangePassword: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work. Please try again.');
      setWorking(false);
    }
  };

  return (
    <main className="signin">
      <form className="signin__card form-grid" onSubmit={submit} noValidate aria-labelledby="setpw-title">
        <Brand />
        <h1 id="setpw-title">Choose a new password</h1>
        <p className="signin__lede">Admin gave you a temporary password. Choose your own before you continue.</p>
        <label>
          Temporary password
          <input type="password" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label>
          New password
          <input type="password" autoComplete="new-password" value={next} aria-describedby="setpw-hint" onChange={(e) => setNext(e.target.value)} />
        </label>
        <label>
          New password again
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        <p id="setpw-hint" className="signin__note">
          At least {MIN} characters. A short sentence is easy to remember.
        </p>
        {error && (
          <div className="form-error" role="alert">
            <span>{error}</span>
          </div>
        )}
        <button className="btn btn--primary signin__submit" type="submit" disabled={working}>
          {working ? 'Saving…' : 'Save and continue'}
        </button>
        <button className="btn btn--link btn--small" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </form>
    </main>
  );
}
