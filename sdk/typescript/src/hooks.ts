import { useState, useEffect, useCallback, useTransition } from 'react';
import { SyncLoomClient } from './client.js';
import { SyncStatus } from './types.js';

/**
 * React 19 hook that queries local-first records with 0ms initial render
 * and live reactivity to both local mutations and incoming remote deltas.
 */
export function useSyncQuery<T = Record<string, any>>(
  client: SyncLoomClient,
  table: string,
  filter?: (item: T) => boolean
): { data: T[]; loading: boolean; refetch: () => Promise<void> } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [, startTransition] = useTransition();

  const loadData = useCallback(async () => {
    const results = await client.query<T>(table, filter);
    startTransition(() => {
      setData(results);
      setLoading(false);
    });
  }, [client, table, filter]);

  useEffect(() => {
    let isMounted = true;

    // 0ms instant local load
    loadData();

    // Subscribe to real-time table mutations and incoming deltas
    const unsubscribe = client.subscribeTable(table, () => {
      if (isMounted) {
        loadData();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [client, table, loadData]);

  return { data, loading, refetch: loadData };
}

/**
 * React 19 hook providing convenient mutation actions with automatic optimistic execution.
 */
export function useSyncMutation(client: SyncLoomClient) {
  const [isPending, startTransition] = useTransition();

  const insert = useCallback(
    async <T extends Record<string, any>>(table: string, data: T): Promise<T> => {
      return await client.insert<T>(table, data);
    },
    [client]
  );

  const update = useCallback(
    async <T extends Record<string, any>>(
      table: string,
      pk: string,
      updates: Partial<T>
    ): Promise<T> => {
      return await client.update<T>(table, pk, updates);
    },
    [client]
  );

  const remove = useCallback(
    async (table: string, pk: string): Promise<void> => {
      await client.delete(table, pk);
    },
    [client]
  );

  return {
    insert,
    update,
    remove,
    isPending,
  };
}

/**
 * React 19 hook observing connection health, offline queue depth, and sync status.
 */
export function useSyncStatus(client: SyncLoomClient): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({
    connected: false,
    pendingMutations: 0,
    activeSubscriptions: [],
    lastSyncedAt: null,
  });

  useEffect(() => {
    const unsubscribe = client.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    return unsubscribe;
  }, [client]);

  return status;
}
