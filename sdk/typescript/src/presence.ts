export interface PeerPresence {
  clientId: string;
  user: string;
  table: string;
  primaryKey?: string;
  field?: string;
  typing: boolean;
  color: string;
  updatedAt?: string;
}

export type PresenceListener = (table: string, peers: PeerPresence[]) => void;
