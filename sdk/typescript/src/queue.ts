import { Mutation, RowDelta, StorageAdapter } from './types.js';
import { SyncSocket } from './sync_socket.js';

export class OfflineQueue {
  private inFlight: Map<string, Mutation> = new Map();
  private isFlushing = false;
  private changeListeners: Set<(count: number) => void> = new Set();

  constructor(
    private storage: StorageAdapter,
    private socket: SyncSocket
  ) {}

  public async enqueue(mutation: Mutation): Promise<void> {
    await this.storage.addMutation(mutation);
    this.notifyChange();
    this.tryFlush();
  }

  public async getPendingCount(): Promise<number> {
    const list = await this.storage.getPendingMutations();
    return list.length;
  }

  public async handleAck(mutationId: string, applied: boolean): Promise<void> {
    this.inFlight.delete(mutationId);
    if (applied) {
      await this.storage.removeMutation(mutationId);
    } else {
      await this.storage.updateMutationStatus(mutationId, 'rejected');
    }
    this.notifyChange();
    this.tryFlush();
  }

  public async tryFlush(): Promise<void> {
    if (this.isFlushing || !this.socket.getConnected()) {
      return;
    }
    this.isFlushing = true;

    try {
      const pending = await this.storage.getPendingMutations();
      for (const m of pending) {
        if (!this.socket.getConnected()) break;
        if (this.inFlight.has(m.id)) continue;

        this.inFlight.set(m.id, m);

        const delta: RowDelta = {
          id: m.id,
          table: m.table,
          primaryKey: m.primaryKey,
          operation: m.operation,
          columns: m.columns,
          colMeta: m.colMeta,
          timestamp: m.hlc,
          nodeId: m.hlc.split('@')[1] || '',
          createdAt: m.createdAt,
        };

        this.socket.sendMutation(m.id, delta);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  public onChange(listener: (count: number) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private async notifyChange(): Promise<void> {
    const count = await this.getPendingCount();
    for (const l of this.changeListeners) {
      try {
        l(count);
      } catch (e) {
        console.error('[syncloom] error in queue listener', e);
      }
    }
  }
}
