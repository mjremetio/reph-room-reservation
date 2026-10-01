import type { Account } from '../config/accounts';
import type { AccountPatch, AppStore, AuditEntry, Message, StoredAccount, Thread } from './AppStore';

/** Oldest entries go first once the log is this long (in memory only; P3-06 keeps everything in PostgreSQL). */
export const AUDIT_LIMIT = 5000;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const copyAccount = (a: StoredAccount): StoredAccount => ({ ...a });
const copyThread = (t: Thread): Thread => ({ ...t, messages: t.messages.map((m) => ({ ...m })) });

/** Everything in a MemoryStore, as plain data for the shared state. */
export interface StoreSnapshot {
  accounts: StoredAccount[];
  audit: AuditEntry[];
  threads: Thread[];
  reads: Array<[string, Date]>;
  nextAudit: number;
  nextMessage: number;
}

/** In-memory AppStore: starts from the configured accounts and forgets everything else on restart. */
export class MemoryStore implements AppStore {
  private accountList: StoredAccount[];
  private auditLog: AuditEntry[] = [];
  private threadMap = new Map<string, Thread>();
  private reads = new Map<string, Date>();
  private nextAudit = 1;
  private nextMessage = 1;

  constructor(seed: readonly Account[], at: Date) {
    this.accountList = seed.map((a) => ({ ...a, disabled: false, mustChangePassword: false, sessionsValidAfter: 0, createdAt: at }));
  }

  /** A copy of everything, for the shared state (src/app/api/_shared.ts). */
  snapshot(): StoreSnapshot {
    return {
      accounts: this.accountList.map(copyAccount),
      audit: this.auditLog.map((e) => ({ ...e })),
      threads: [...this.threadMap.values()].map(copyThread),
      reads: [...this.reads.entries()],
      nextAudit: this.nextAudit,
      nextMessage: this.nextMessage,
    };
  }

  /** Replaces everything with a snapshot taken by another server instance. */
  restore(s: StoreSnapshot): void {
    this.accountList = s.accounts.map(copyAccount);
    this.auditLog = s.audit.map((e) => ({ ...e }));
    this.threadMap = new Map(s.threads.map((t) => [t.ticketNo, copyThread(t)]));
    this.reads = new Map(s.reads);
    this.nextAudit = s.nextAudit;
    this.nextMessage = s.nextMessage;
  }

  accounts = {
    list: (): StoredAccount[] => this.accountList.map(copyAccount),
    find: (username: string): StoredAccount | undefined => {
      const a = this.accountList.find((x) => same(x.login, username) || same(x.email, username));
      return a && copyAccount(a);
    },
    create: (account: Account, at: Date): StoredAccount => {
      if (this.accountList.some((x) => same(x.login, account.login) || same(x.email, account.email))) {
        throw new Error(`An account with login ${account.login} or e-mail ${account.email} already exists.`);
      }
      const created: StoredAccount = { ...account, disabled: false, mustChangePassword: false, sessionsValidAfter: 0, createdAt: at };
      this.accountList.push(created);
      return copyAccount(created);
    },
    update: (login: string, patch: AccountPatch): StoredAccount => {
      const a = this.accountList.find((x) => same(x.login, login));
      if (!a) throw new Error(`Unknown account ${login}.`);
      Object.assign(a, patch);
      if (patch.division === undefined && 'division' in patch) delete a.division;
      return copyAccount(a);
    },
  };

  audit = {
    record: (entry: Omit<AuditEntry, 'id'>): AuditEntry => {
      const saved = { ...entry, id: this.nextAudit++ };
      this.auditLog.push(saved);
      if (this.auditLog.length > AUDIT_LIMIT) this.auditLog.splice(0, this.auditLog.length - AUDIT_LIMIT);
      return { ...saved };
    },
    list: (): AuditEntry[] => this.auditLog.map((e) => ({ ...e })).reverse(),
  };

  messages = {
    thread: (ticketNo: string): Thread | undefined => {
      const t = this.threadMap.get(ticketNo);
      return t && copyThread(t);
    },
    threads: (): Thread[] => [...this.threadMap.values()].map(copyThread),
    post: (owner: { ticketNo: string; ownerEmail: string; ownerName: string }, message: Omit<Message, 'id' | 'ticketNo'>): Message => {
      const t = this.threadMap.get(owner.ticketNo) ?? { ...owner, messages: [] };
      this.threadMap.set(owner.ticketNo, t);
      const saved: Message = { ...message, id: this.nextMessage++, ticketNo: owner.ticketNo };
      t.messages.push(saved);
      return { ...saved };
    },
    lastRead: (ticketNo: string, login: string): Date | undefined => this.reads.get(`${login.toUpperCase()}|${ticketNo}`),
    markRead: (ticketNo: string, login: string, at: Date): void => {
      this.reads.set(`${login.toUpperCase()}|${ticketNo}`, at);
    },
  };
}
