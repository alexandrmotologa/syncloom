import { ConflictEvent, Mutation, RowDelta, StorageAdapter, SyncLoomConfig, SyncStatus } from './types.js';
import { HybridLogicalClock } from './hlc.js';
import { MemoryStorageAdapter } from './sqlite_storage.js';
import { SyncSocket, ServerMessage } from './sync_socket.js';
import { OfflineQueue } from './queue.js';
import { UndoManager } from './undo.js';
import { PeerPresence, PresenceListener } from './presence.js';

export type TableChangeListener = (table: string, primaryKey: string, data: Record<string, any> | null) => void;

export class SyncLoomClient {
  public readonly clock: HybridLogicalClock;
  public readonly storage: StorageAdapter;
  public readonly undoManager: UndoManager = new UndoManager();
  private socket: SyncSocket;
  private queue: OfflineQueue;
  private subscriptions: Set<string> = new Set();
  private tableListeners: Map<string, Set<TableChangeListener>> = new Map();
  private presenceListeners: Map<string, Set<PresenceListener>> = new Map();
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();
  private onConflictCallback?: (conflict: ConflictEvent) => void;
  private lastSyncedAt: number | null = null;

  constructor(private config: SyncLoomConfig) {
    this.clock = new HybridLogicalClock(config.nodeId);
    this.storage = config.storage || new MemoryStorageAdapter();
    this.onConflictCallback = config.onConflict;

    this.socket = new SyncSocket(
      config.url,
      this.clock.nodeId,
      config.reconnectInterval || 1000
    );

    this.queue = new OfflineQueue(this.storage, this.socket);

    this.socket.onMessage((msg) => this.handleServerMessage(msg));
    this.socket.onConnectionChange((connected) => {
      if (connected) {
        this.lastSyncedAt = Date.now();
        this.queue.tryFlush();
      }
      this.notifyStatus();
    });

    this.queue.onChange(() => {
      this.notifyStatus();
    });

    if (config.autoSync !== false) {
      this.socket.connect();
    }
  }

  /**
   * Reads a single record instantly from local storage (0ms).
   */
  public async get<T = Record<string, any>>(table: string, pk: string): Promise<T | null> {
    return (await this.storage.get(table, pk)) as T | null;
  }

  /**
   * Queries records instantly from local storage (0ms).
   */
  public async query<T = Record<string, any>>(
    table: string,
    filter?: (item: T) => boolean
  ): Promise<T[]> {
    const all = (await this.storage.getAll(table)) as T[];
    if (!filter) return all;
    return all.filter(filter);
  }

  /**
   * Inserts a record locally with 0ms latency and enqueues sync mutation.
   */
  public async insert<T extends Record<string, any>>(table: string, data: T): Promise<T> {
    const pk = data.id || data.uuid || `rec-${Math.random().toString(36).substring(2, 9)}`;
    const rowData = { ...data, id: pk };

    const hlc = this.clock.now();
    const colMeta: Record<string, string> = {};
    for (const key of Object.keys(rowData)) {
      colMeta[key] = hlc;
    }

    // 0ms local write
    await this.storage.set(table, pk, rowData, colMeta);

    // Queue for replication
    const mutation: Mutation = {
      id: `mut-${Math.random().toString(36).substring(2, 9)}`,
      table,
      primaryKey: pk,
      operation: 'INSERT',
      columns: rowData,
      colMeta,
      hlc,
      status: 'pending',
      createdAt: Date.now(),
    };
    await this.queue.enqueue(mutation);

    // Record in undo manager
    this.undoManager.record({
      table,
      primaryKey: pk,
      operation: 'INSERT',
      forwardData: rowData,
      inverseData: null,
      forwardColMeta: colMeta,
      inverseColMeta: {},
      hlc,
      timestamp: Date.now(),
    });

    this.notifyTableListeners(table, pk, rowData);
    return rowData as T;
  }

  /**
   * Updates an existing record locally with 0ms latency and column-level CRDT metadata.
   */
  public async update<T extends Record<string, any>>(
    table: string,
    pk: string,
    updates: Partial<T>
  ): Promise<T> {
    const existing = await this.storage.get(table, pk);
    const merged = { ...(existing || { id: pk }), ...updates };

    const hlc = this.clock.now();
    const colMeta: Record<string, string> = {};
    for (const key of Object.keys(updates)) {
      colMeta[key] = hlc;
    }

    // 0ms local write
    await this.storage.set(table, pk, merged, colMeta);

    // Queue mutation
    const mutation: Mutation = {
      id: `mut-${Math.random().toString(36).substring(2, 9)}`,
      table,
      primaryKey: pk,
      operation: 'UPDATE',
      columns: updates,
      colMeta,
      hlc,
      status: 'pending',
      createdAt: Date.now(),
    };
    await this.queue.enqueue(mutation);

    // Record in undo manager with inverse field values
    const prevInverseData: Record<string, any> = {};
    if (existing) {
      for (const k of Object.keys(updates)) {
        prevInverseData[k] = existing[k];
      }
    }
    this.undoManager.record({
      table,
      primaryKey: pk,
      operation: 'UPDATE',
      forwardData: updates,
      inverseData: prevInverseData,
      forwardColMeta: colMeta,
      inverseColMeta: {},
      hlc,
      timestamp: Date.now(),
    });

    this.notifyTableListeners(table, pk, merged);
    return merged as T;
  }

  /**
   * Deletes a record locally with 0ms latency and enqueues deletion delta.
   */
  public async delete(table: string, pk: string): Promise<void> {
    const existing = await this.storage.get(table, pk);
    const hlc = this.clock.now();
    await this.storage.delete(table, pk);

    const mutation: Mutation = {
      id: `mut-${Math.random().toString(36).substring(2, 9)}`,
      table,
      primaryKey: pk,
      operation: 'DELETE',
      columns: {},
      colMeta: {},
      hlc,
      status: 'pending',
      createdAt: Date.now(),
    };
    await this.queue.enqueue(mutation);

    // Record in undo manager to allow resurrecting deleted record
    this.undoManager.record({
      table,
      primaryKey: pk,
      operation: 'DELETE',
      forwardData: {},
      inverseData: existing,
      forwardColMeta: {},
      inverseColMeta: {},
      hlc,
      timestamp: Date.now(),
    });

    this.notifyTableListeners(table, pk, null);
  }

  /**
   * Reverts the most recent local mutation using time-travel inverse deltas.
   */
  public async undo(): Promise<boolean> {
    const entry = this.undoManager.popUndo();
    if (!entry) return false;

    const hlc = this.clock.now();

    if (entry.operation === 'INSERT') {
      // Inverse of INSERT is DELETE
      await this.storage.delete(entry.table, entry.primaryKey);
      await this.queue.enqueue({
        id: `mut-${Math.random().toString(36).substring(2, 9)}`,
        table: entry.table,
        primaryKey: entry.primaryKey,
        operation: 'DELETE',
        columns: {},
        colMeta: {},
        hlc,
        status: 'pending',
        createdAt: Date.now(),
      });
      this.notifyTableListeners(entry.table, entry.primaryKey, null);
    } else if (entry.operation === 'UPDATE' && entry.inverseData) {
      // Inverse of UPDATE applies previous field values
      const existing = await this.storage.get(entry.table, entry.primaryKey);
      const reverted = { ...(existing || { id: entry.primaryKey }), ...entry.inverseData };
      const colMeta: Record<string, string> = {};
      for (const k of Object.keys(entry.inverseData)) {
        colMeta[k] = hlc;
      }
      await this.storage.set(entry.table, entry.primaryKey, reverted, colMeta);
      await this.queue.enqueue({
        id: `mut-${Math.random().toString(36).substring(2, 9)}`,
        table: entry.table,
        primaryKey: entry.primaryKey,
        operation: 'UPDATE',
        columns: entry.inverseData,
        colMeta,
        hlc,
        status: 'pending',
        createdAt: Date.now(),
      });
      this.notifyTableListeners(entry.table, entry.primaryKey, reverted);
    } else if (entry.operation === 'DELETE' && entry.inverseData) {
      // Inverse of DELETE resurrects previous row
      const colMeta: Record<string, string> = {};
      for (const k of Object.keys(entry.inverseData)) {
        colMeta[k] = hlc;
      }
      await this.storage.set(entry.table, entry.primaryKey, entry.inverseData, colMeta);
      await this.queue.enqueue({
        id: `mut-${Math.random().toString(36).substring(2, 9)}`,
        table: entry.table,
        primaryKey: entry.primaryKey,
        operation: 'INSERT',
        columns: entry.inverseData,
        colMeta,
        hlc,
        status: 'pending',
        createdAt: Date.now(),
      });
      this.notifyTableListeners(entry.table, entry.primaryKey, entry.inverseData);
    }

    return true;
  }

  /**
   * Re-applies the previously undone mutation.
   */
  public async redo(): Promise<boolean> {
    const entry = this.undoManager.popRedo();
    if (!entry) return false;

    const hlc = this.clock.now();

    if (entry.operation === 'INSERT') {
      const colMeta: Record<string, string> = {};
      for (const k of Object.keys(entry.forwardData)) {
        colMeta[k] = hlc;
      }
      await this.storage.set(entry.table, entry.primaryKey, entry.forwardData, colMeta);
      await this.queue.enqueue({
        id: `mut-${Math.random().toString(36).substring(2, 9)}`,
        table: entry.table,
        primaryKey: entry.primaryKey,
        operation: 'INSERT',
        columns: entry.forwardData,
        colMeta,
        hlc,
        status: 'pending',
        createdAt: Date.now(),
      });
      this.notifyTableListeners(entry.table, entry.primaryKey, entry.forwardData);
    } else if (entry.operation === 'UPDATE') {
      const existing = await this.storage.get(entry.table, entry.primaryKey);
      const reapplied = { ...(existing || { id: entry.primaryKey }), ...entry.forwardData };
      const colMeta: Record<string, string> = {};
      for (const k of Object.keys(entry.forwardData)) {
        colMeta[k] = hlc;
      }
      await this.storage.set(entry.table, entry.primaryKey, reapplied, colMeta);
      await this.queue.enqueue({
        id: `mut-${Math.random().toString(36).substring(2, 9)}`,
        table: entry.table,
        primaryKey: entry.primaryKey,
        operation: 'UPDATE',
        columns: entry.forwardData,
        colMeta,
        hlc,
        status: 'pending',
        createdAt: Date.now(),
      });
      this.notifyTableListeners(entry.table, entry.primaryKey, reapplied);
    } else if (entry.operation === 'DELETE') {
      await this.storage.delete(entry.table, entry.primaryKey);
      await this.queue.enqueue({
        id: `mut-${Math.random().toString(36).substring(2, 9)}`,
        table: entry.table,
        primaryKey: entry.primaryKey,
        operation: 'DELETE',
        columns: {},
        colMeta: {},
        hlc,
        status: 'pending',
        createdAt: Date.now(),
      });
      this.notifyTableListeners(entry.table, entry.primaryKey, null);
    }

    return true;
  }

  public canUndo(): boolean {
    return this.undoManager.canUndo();
  }

  public canRedo(): boolean {
    return this.undoManager.canRedo();
  }

  /**
   * Broadcasts ephemeral cursor or typing presence without persisting to database.
   */
  public updatePresence(
    table: string,
    opts: { primaryKey?: string; field?: string; typing?: boolean; user?: string }
  ): void {
    const presence: PeerPresence = {
      clientId: this.clock.nodeId,
      user: opts.user || this.clock.nodeId,
      table,
      primaryKey: opts.primaryKey,
      field: opts.field,
      typing: opts.typing || false,
      color: '',
    };
    this.socket.sendPresence(table, presence);
  }

  /**
   * Convenience alias to emit ephemeral presence.
   */
  public sendPresence(table: string, primaryKey?: string, field?: string, typing?: boolean, user?: string): void {
    this.updatePresence(table, { primaryKey, field, typing, user });
  }

  /**
   * Subscribes to real-time presence events for a table.
   */
  public subscribePresence(table: string, listener: PresenceListener): () => void {
    if (!this.presenceListeners.has(table)) {
      this.presenceListeners.set(table, new Set());
    }
    this.presenceListeners.get(table)!.add(listener);

    return () => {
      if (this.presenceListeners.has(table)) {
        this.presenceListeners.get(table)!.delete(listener);
      }
    };
  }

  /**
   * Subscribes to real-time table delta streaming from the server.
   */
  public subscribeTable(table: string, listener?: TableChangeListener): () => void {
    this.subscriptions.add(table);
    this.socket.subscribe(table);

    if (listener) {
      if (!this.tableListeners.has(table)) {
        this.tableListeners.set(table, new Set());
      }
      this.tableListeners.get(table)!.add(listener);
    }

    return () => {
      if (listener && this.tableListeners.has(table)) {
        this.tableListeners.get(table)!.delete(listener);
      }
    };
  }

  /**
   * Returns current synchronization status.
   */
  public async getStatus(): Promise<SyncStatus> {
    const pending = await this.queue.getPendingCount();
    return {
      connected: this.socket.getConnected(),
      pendingMutations: pending,
      activeSubscriptions: Array.from(this.subscriptions),
      lastSyncedAt: this.lastSyncedAt,
    };
  }

  /**
   * Observes live status changes.
   */
  public onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    this.getStatus().then(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Cleanly closes network socket and resources.
   */
  public close(): void {
    this.socket.disconnect();
  }

  private async handleServerMessage(msg: ServerMessage): Promise<void> {
    if (msg.type === 'ack' && msg.mutationId) {
      await this.queue.handleAck(msg.mutationId, msg.applied !== false);
      if (msg.hlc) {
        this.clock.update(msg.hlc);
      }
    } else if (msg.type === 'delta' && msg.delta) {
      await this.applyRemoteDelta(msg.delta);
    } else if (msg.type === 'presence' && msg.table && msg.peers) {
      this.notifyPresenceListeners(msg.table, msg.peers);
    }
  }

  private notifyPresenceListeners(table: string, peers: PeerPresence[]): void {
    const listeners = this.presenceListeners.get(table);
    if (listeners) {
      for (const l of listeners) {
        try {
          l(table, peers);
        } catch (e) {
          console.error('[syncloom] error in presence listener', e);
        }
      }
    }
  }

  /**
   * Resolves an incoming remote delta using field-level Last-Write-Wins CRDT.
   */
  private async applyRemoteDelta(delta: RowDelta): Promise<void> {
    this.clock.update(delta.timestamp);
    this.lastSyncedAt = Date.now();

    const existing = await this.storage.get(delta.table, delta.primaryKey);

    if (delta.operation === 'DELETE') {
      await this.storage.delete(delta.table, delta.primaryKey);
      this.notifyTableListeners(delta.table, delta.primaryKey, null);
      return;
    }

    if (delta.operation === 'SCHEMA_MIGRATION') {
      if ('migrateSchema' in this.storage) {
        await (this.storage as any).migrateSchema(delta.table, delta.columns);
      }
      return;
    }

    const mergedData = { ...(existing || { id: delta.primaryKey }) };
    const mergedColMeta: Record<string, string> = {};

    let hasLocalChanges = false;

    for (const [col, remoteVal] of Object.entries(delta.columns)) {
      const remoteHlc = delta.colMeta[col] || delta.timestamp;
      const localVal = existing ? existing[col] : undefined;

      // In MemoryStorageAdapter, inspect existing colMeta
      let localHlc = 'HLC-0-0000@';
      if (this.storage instanceof MemoryStorageAdapter) {
        const meta = this.storage.getColMeta(delta.table, delta.primaryKey);
        if (meta && meta[col]) {
          localHlc = meta[col];
        }
      }

      const cmp = HybridLogicalClock.compare(remoteHlc, localHlc);

      if (cmp >= 0) {
        // Remote wins or is newer
        if (localVal !== undefined && localVal !== remoteVal) {
          this.notifyConflict({
            table: delta.table,
            primaryKey: delta.primaryKey,
            column: col,
            localHlc,
            remoteHlc,
            localValue: localVal,
            remoteValue: remoteVal,
            resolution: 'REMOTE_WINNER',
          });
        }
        mergedData[col] = remoteVal;
        mergedColMeta[col] = remoteHlc;
        hasLocalChanges = true;
      } else {
        // Local is newer: retains
        if (localVal !== undefined && localVal !== remoteVal) {
          this.notifyConflict({
            table: delta.table,
            primaryKey: delta.primaryKey,
            column: col,
            localHlc,
            remoteHlc,
            localValue: localVal,
            remoteValue: remoteVal,
            resolution: 'LOCAL_WINNER',
          });
        }
        mergedData[col] = localVal;
        mergedColMeta[col] = localHlc;
      }
    }

    if (hasLocalChanges || !existing) {
      await this.storage.set(delta.table, delta.primaryKey, mergedData, mergedColMeta);
      this.notifyTableListeners(delta.table, delta.primaryKey, mergedData);
    }
  }

  private notifyTableListeners(table: string, pk: string, data: Record<string, any> | null): void {
    const listeners = this.tableListeners.get(table);
    if (listeners) {
      for (const l of listeners) {
        try {
          l(table, pk, data);
        } catch (e) {
          console.error('[syncloom] error in table listener', e);
        }
      }
    }
  }

  private notifyConflict(event: ConflictEvent): void {
    if (this.onConflictCallback) {
      try {
        this.onConflictCallback(event);
      } catch (e) {
        console.error('[syncloom] error in onConflict handler', e);
      }
    }
  }

  private async notifyStatus(): Promise<void> {
    const s = await this.getStatus();
    for (const l of this.statusListeners) {
      try {
        l(s);
      } catch (e) {
        console.error('[syncloom] error in status listener', e);
      }
    }
  }
}
