export interface ParsedHLC {
  millis: number;
  counter: number;
  nodeId: string;
}

export class HybridLogicalClock {
  private millis: number = 0;
  private counter: number = 0;
  public readonly nodeId: string;

  constructor(nodeId?: string) {
    this.nodeId = nodeId || `client-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generates a new strictly monotonic timestamp for a local mutation.
   */
  public now(): string {
    const phys = Date.now();
    if (phys > this.millis) {
      this.millis = phys;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return this.format(this.millis, this.counter, this.nodeId);
  }

  /**
   * Updates the clock given an incoming remote timestamp.
   */
  public update(remoteStr: string): string {
    const remote = this.parse(remoteStr);
    const phys = Date.now();

    const m = Math.max(this.millis, phys, remote.millis);

    if (m === this.millis && m === remote.millis) {
      this.counter = Math.max(this.counter, remote.counter) + 1;
    } else if (m === this.millis) {
      this.counter += 1;
    } else if (m === remote.millis) {
      this.counter = remote.counter + 1;
    } else {
      this.counter = 0;
    }

    this.millis = m;
    return this.format(this.millis, this.counter, this.nodeId);
  }

  /**
   * Compares two HLC strings:
   * -1 if a < b
   *  0 if a == b
   *  1 if a > b
   */
  public static compare(aStr: string, bStr: string): number {
    const a = HybridLogicalClock.parseStatic(aStr);
    const b = HybridLogicalClock.parseStatic(bStr);

    if (a.millis !== b.millis) {
      return a.millis < b.millis ? -1 : 1;
    }
    if (a.counter !== b.counter) {
      return a.counter < b.counter ? -1 : 1;
    }
    if (a.nodeId !== b.nodeId) {
      return a.nodeId < b.nodeId ? -1 : 1;
    }
    return 0;
  }

  public parse(str: string): ParsedHLC {
    return HybridLogicalClock.parseStatic(str);
  }

  public static parseStatic(str: string): ParsedHLC {
    if (!str.startsWith('HLC-')) {
      return { millis: 0, counter: 0, nodeId: '' };
    }
    const withoutPrefix = str.substring(4);
    const [clockPart, nodeId] = withoutPrefix.split('@');
    const [millisStr, counterStr] = (clockPart || '').split('-');

    return {
      millis: parseInt(millisStr, 10) || 0,
      counter: parseInt(counterStr, 10) || 0,
      nodeId: nodeId || '',
    };
  }

  private format(millis: number, counter: number, nodeId: string): string {
    const paddedCounter = counter.toString().padStart(4, '0');
    return `HLC-${millis}-${paddedCounter}@${nodeId}`;
  }
}
