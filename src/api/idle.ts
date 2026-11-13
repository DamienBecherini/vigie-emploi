// Automatic stop of the dashboard after a period without activity ("local service" contract).
// Every request counts, except the health check: the interface does not poll the server.
// The API handles each request in one go: the service has no background work, so it is never "busy".

export class Idle {
  readonly timeoutS: number;
  private readonly clock: () => number;
  private last: number;

  constructor(timeoutS: number, clock: () => number = () => performance.now() / 1000) {
    this.timeoutS = timeoutS;
    this.clock = clock;
    this.last = clock();
  }

  signal(): void {
    this.last = this.clock();
  }

  expired(): boolean {
    return this.timeoutS > 0 && this.clock() - this.last >= this.timeoutS;
  }

  /** Seconds before the stop; null if the automatic stop is disabled. */
  remainingS(): number | null {
    if (this.timeoutS <= 0) return null;
    return Math.max(0, Math.round((this.timeoutS - (this.clock() - this.last)) * 10) / 10);
  }
}
