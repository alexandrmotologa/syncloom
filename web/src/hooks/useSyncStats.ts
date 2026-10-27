import { useState, useEffect, useCallback } from 'react';

export interface ServerStatus {
  service: string;
  version: string;
  mode: string;
  nodeId: string;
  uptime: string;
  startedAt: string;
  port: number;
  demo: boolean;
}

export interface HubMetrics {
  totalDeltas: number;
  totalMutations: number;
  connectedClients: number;
  activeTables: number;
  averageLagMs: number;
  conflictsResolved: number;
  deltasPerSec: number;
  compressionRatio?: number;
  bandwidthSavedKb?: number;
  compressionCodec?: string;
}

export interface PeerInfo {
  id: string;
  remoteAddr: string;
  userAgent: string;
  connectedAt: string;
  lastSeen: string;
  subscriptions: string[];
  deltasSent: number;
  mutationsRecv: number;
}

export interface ConflictRecord {
  id: string;
  table: string;
  primaryKey: string;
  column: string;
  winnerNode: string;
  loserNode: string;
  winnerHlc: { millis: number; counter: number; nodeId: string } | string;
  loserHlc: { millis: number; counter: number; nodeId: string } | string;
  winnerValue: any;
  loserValue: any;
  resolvedAt: string;
  resolution: string;
}

export interface TablesData {
  stats: Record<string, number>;
  tables: Record<string, any[]>;
}

export function useSyncStats(pollIntervalMs = 2000) {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [metrics, setMetrics] = useState<HubMetrics>({
    totalDeltas: 0,
    totalMutations: 0,
    connectedClients: 0,
    activeTables: 0,
    averageLagMs: 1.25,
    conflictsResolved: 0,
    deltasPerSec: 0,
  });
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [tables, setTables] = useState<TablesData>({ stats: {}, tables: {} });
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const fetchAll = useCallback(async () => {
    try {
      const [resStatus, resMetrics, resPeers, resConflicts, resTables] = await Promise.all([
        fetch('/api/status').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/metrics').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/peers').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/conflicts').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/tables').then((r) => (r.ok ? r.json() : { stats: {}, tables: {} })),
      ]);

      if (resStatus) setStatus(resStatus);
      if (resMetrics) setMetrics(resMetrics);
      if (resPeers) setPeers(resPeers);
      if (resConflicts) setConflicts(resConflicts);
      if (resTables) setTables(resTables);
      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchAll, pollIntervalMs]);

  // Connect live WebSocket to receive immediate delta events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?clientId=studio-viewer`;

    let ws: WebSocket | null = null;
    let retryTimer: any = null;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws?.send(JSON.stringify({ type: 'subscribe', table: '*' }));
        };
        ws.onmessage = () => {
          // On incoming delta, immediately trigger quick refresh
          fetchAll();
        };
        ws.onclose = () => {
          retryTimer = setTimeout(connect, 3000);
        };
      } catch {
        retryTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) ws.close();
    };
  }, [fetchAll]);

  return {
    status,
    metrics,
    peers,
    conflicts,
    tables,
    isConnected,
    refresh: fetchAll,
  };
}
