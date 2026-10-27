export type Operation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RowDelta {
  id: string;
  table: string;
  primaryKey: string;
  operation: Operation;
  columns: Record<string, any>;
  colMeta: Record<string, string>;
  timestamp: string;
  nodeId: string;
  txId?: string;
  lsn?: number;
  createdAt: number;
}

export interface Mutation {
  id: string;
  table: string;
  primaryKey: string;
  operation: Operation;
  columns: Record<string, any>;
  colMeta: Record<string, string>;
  hlc: string;
  status: 'pending' | 'applied' | 'rejected';
  createdAt: number;
}

export interface SyncStatus {
  connected: boolean;
  pendingMutations: number;
  activeSubscriptions: string[];
  lastSyncedAt: number | null;
}

export interface SyncLoomConfig {
  url: string;
  nodeId?: string;
  autoSync?: boolean;
  reconnectInterval?: number;
  storage?: StorageAdapter;
  onConflict?: (conflict: ConflictEvent) => void;
  onStatusChange?: (status: SyncStatus) => void;
}

export interface ConflictEvent {
  table: string;
  primaryKey: string;
  column: string;
  localHlc: string;
  remoteHlc: string;
  localValue: any;
  remoteValue: any;
  resolution: 'LOCAL_WINNER' | 'REMOTE_WINNER';
}

export interface StorageAdapter {
  get(table: string, pk: string): Promise<Record<string, any> | null>;
  getAll(table: string): Promise<Record<string, any>[]>;
  set(table: string, pk: string, data: Record<string, any>, colMeta: Record<string, string>): Promise<void>;
  delete(table: string, pk: string): Promise<void>;
  getPendingMutations(): Promise<Mutation[]>;
  addMutation(mutation: Mutation): Promise<void>;
  removeMutation(id: string): Promise<void>;
  updateMutationStatus(id: string, status: 'pending' | 'applied' | 'rejected'): Promise<void>;
}
