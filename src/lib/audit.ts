/**
 * The audit log (docs/spec/09-quality.md, Audit): one entry for every write and sign-in, read by Admin at /admin/logs.
 * Entries name the actor, the action and its target, with a short summary. Never message text or passwords.
 */
import type { AuditAction, AuditEntry } from '../store/AppStore';
import { getStore } from '../store';
import { now } from './clock';

export function audit(actor: { login: string; name: string }, action: AuditAction, target?: string, detail?: string): void {
  getStore().audit.record({ at: now(), actor: actor.login, actorName: actor.name, action, ...(target ? { target } : {}), ...(detail ? { detail } : {}) });
}

/** An entry as JSON for /admin/logs. */
export const auditView = (e: AuditEntry) => ({ id: e.id, at: e.at.toISOString(), actor: e.actor, actorName: e.actorName, action: e.action, target: e.target ?? null, detail: e.detail ?? null });
export type AuditView = ReturnType<typeof auditView>;
