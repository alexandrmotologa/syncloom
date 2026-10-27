import { RowDelta } from './types.js';

export type MessageHandler = (msg: ServerMessage) => void;

export interface ServerMessage {
  type: 'delta' | 'ack' | 'pong' | 'error' | 'sync_state';
  delta?: RowDelta;
  mutationId?: string;
  hlc?: string;
  applied?: boolean;
  error?: string;
  serverTime?: number;
}

export class SyncSocket {
  private ws: any = null;
  private isConnected = false;
  private reconnectTimer: any = null;
  private reconnectAttempts = 0;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionChangeHandlers: Set<(connected: boolean) => void> = new Set();
  private pendingSubscriptions: Set<string> = new Set();

  constructor(
    private url: string,
    private clientId: string,
    private reconnectInterval: number = 1000
  ) {}

  public connect(): void {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return;
    }

    const wsUrl = `${this.url.replace(/^http/, 'ws')}?clientId=${encodeURIComponent(this.clientId)}`;

    try {
      // Support both Browser WebSocket and Node global WebSocket
      const WS = typeof WebSocket !== 'undefined' ? WebSocket : (globalThis as any).WebSocket;
      if (!WS) {
        console.warn('[syncloom] WebSocket not available in environment');
        return;
      }

      this.ws = new WS(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyConnection(true);

        // Resubscribe to all pending subscriptions
        for (const table of this.pendingSubscriptions) {
          this.send({ type: 'subscribe', table });
        }
      };

      this.ws.onmessage = (event: any) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : event.data.toString();
          // Message could contain newline separated JSON payloads
          const lines = raw.split('\n').filter((l: string) => l.trim().length > 0);
          for (const line of lines) {
            const parsed = JSON.parse(line) as ServerMessage;
            this.notifyHandlers(parsed);
          }
        } catch (e) {
          console.error('[syncloom] failed to parse incoming message', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.notifyConnection(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (err: any) => {
        // Socket errors will trigger onclose
      };
    } catch (e) {
      this.isConnected = false;
      this.notifyConnection(false);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.notifyConnection(false);
  }

  public subscribe(table: string): void {
    this.pendingSubscriptions.add(table);
    if (this.isConnected) {
      this.send({ type: 'subscribe', table });
    }
  }

  public unsubscribe(table: string): void {
    this.pendingSubscriptions.delete(table);
    if (this.isConnected) {
      this.send({ type: 'unsubscribe', table });
    }
  }

  public sendMutation(mutationId: string, delta: RowDelta): void {
    this.send({
      type: 'mutate',
      mutationId,
      delta,
    });
  }

  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onConnectionChange(handler: (connected: boolean) => void): () => void {
    this.connectionChangeHandlers.add(handler);
    handler(this.isConnected);
    return () => this.connectionChangeHandlers.delete(handler);
  }

  public getConnected(): boolean {
    return this.isConnected;
  }

  private send(payload: any): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private notifyHandlers(msg: ServerMessage): void {
    for (const h of this.messageHandlers) {
      try {
        h(msg);
      } catch (e) {
        console.error('[syncloom] error in message handler', e);
      }
    }
  }

  private notifyConnection(connected: boolean): void {
    for (const h of this.connectionChangeHandlers) {
      try {
        h(connected);
      } catch (e) {
        console.error('[syncloom] error in connection handler', e);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    // Exponential backoff capped at 10 seconds
    const delay = Math.min(this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1), 10000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
