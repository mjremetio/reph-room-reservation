'use client';

/**
 * Connect an AI app (docs/spec/06-ui.md): the MCP server address and how to add it to Claude, ChatGPT or any MCP
 * client, and what a connected app may do. The app then signs the person in on /oauth/authorize.
 */
import { useState } from 'react';
import { RULES } from '../domain/rules';
import { Sheet } from './Sheet';

export function ConnectAI({ onClose }: { onClose: () => void }) {
  const url = `${window.location.origin}/api/mcp`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // clipboard blocked: the field is selectable
    }
  };
  return (
    <Sheet title="Connect an AI app" subtitle="Claude, ChatGPT or any app that supports MCP" onClose={onClose}>
      <div className="form-grid">
        <label>
          MCP server URL
          <span className="copy-row">
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn--secondary btn--small" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </span>
        </label>
      </div>
      <div className="section-title">Add it to your AI app</div>
      <ul className="connect-list">
        <li>
          <strong>Claude</strong> (web or desktop): Settings → Connectors → Add custom connector, paste the URL, then Connect.
        </li>
        <li>
          <strong>ChatGPT</strong>: Settings → Apps &amp; Connectors → Developer mode, then Create: paste the URL, authentication OAuth.
        </li>
        <li>
          <strong>Claude Code</strong>: <code>claude mcp add --transport http reph-rooms {url}</code>, then <code>/mcp</code> to sign in.
        </li>
        <li>
          <strong>Cursor, VS Code and others</strong>: add a remote (HTTP) MCP server with this URL.
        </li>
      </ul>
      <p className="card__meta">The app opens a REPH Rooms page: sign in and press Allow. From then on it acts as you.</p>
      <div className="section-title">What it can do</div>
      <ul className="connect-list">
        <li>Find rooms, see who booked them, list your bookings and check you in.</li>
        <li>It can&apos;t book or cancel on its own: it gives you a link, and you confirm here within {RULES.linkProposalHoldMinutes} minutes.</li>
        <li>Access lasts an hour at a time and renews while you use it; after 14 days without use it asks again. Remove the connector in the app to disconnect.</li>
      </ul>
    </Sheet>
  );
}
