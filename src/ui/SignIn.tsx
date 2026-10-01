'use client';

/** The sign-in screen (docs/spec/06-ui.md, Sign-in): e-mail and password. Nothing else loads until it succeeds. */
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import { forgetUser } from './session';
import { Brand } from './Brand';

export function SignIn() {
  const client = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return setError('Enter your e-mail and password.');
    setWorking(true);
    setError(null);
    try {
      forgetUser(client, await api.signIn(username.trim(), password));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
      setPassword('');
      setWorking(false);
    }
  };

  return (
    <main className="signin">
      <form className="signin__card form-grid" onSubmit={submit} noValidate aria-labelledby="signin-title">
        <Brand />
        <h1 id="signin-title">Sign in</h1>
        <p className="signin__lede">Book rooms at Bldg. H with the room assistant and the live floor map.</p>
        <label>
          E-mail
          <input
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={username}
            placeholder="name@company.com"
            aria-invalid={!!error || undefined}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} aria-invalid={!!error || undefined} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <div className="form-error" role="alert">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <circle cx="9" cy="9" r="8" fill="currentColor" />
              <path d="M9 4.8v5M9 12.6v.1" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        <button className="btn btn--primary signin__submit" type="submit" disabled={working}>
          {working ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="signin__note">Sign in with your work e-mail address.</p>
      </form>
    </main>
  );
}
