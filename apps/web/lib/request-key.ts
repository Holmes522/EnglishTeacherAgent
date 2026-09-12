// Keep the key on uncertain network failures; clear only after receiving the run.
export class PendingRequestKey {
  private pending?: { scope: string; key: string };

  get(scope: string): string {
    if (this.pending?.scope !== scope)
      this.pending = { scope, key: crypto.randomUUID() };
    return this.pending.key;
  }

  clear(): void {
    this.pending = undefined;
  }
}
