import type { AuditEvent, Buyer, Delivery, FollowUpMessage, Lead, LedgerLine, ProgramConfig } from './types';

export class MemoryStore {
  readonly leads = new Map<string, Lead>();
  readonly emailIndex = new Map<string, string>();
  readonly phoneIndex = new Map<string, string>();
  readonly stopTokens = new Map<string, string>();
  readonly deliveries = new Map<string, Delivery>();
  readonly buyers = new Map<string, Buyer>();
  readonly ledger: LedgerLine[] = [];
  readonly messages: FollowUpMessage[] = [];
  readonly audit: AuditEvent[] = [];
  readonly commands = new Map<string, unknown>();
  program: ProgramConfig;
  private tail: Promise<void> = Promise.resolve();

  constructor(program: ProgramConfig) {
    this.program = program;
  }

  transaction<T>(fn: () => T): Promise<T> {
    const run = this.tail.then(() => fn());
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
