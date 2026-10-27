import React from 'react';
import { PeerInfo } from '../hooks/useSyncStats';
import { Users, Wifi, Globe, Smartphone, Laptop, Radio } from 'lucide-react';

interface ActivePeersListProps {
  peers: PeerInfo[];
}

export const ActivePeersList: React.FC<ActivePeersListProps> = ({ peers }) => {
  const getDeviceIcon = (ua: string) => {
    if (/mobile|android|iphone/i.test(ua)) {
      return <Smartphone className="w-4 h-4 text-cyan-400" />;
    }
    return <Laptop className="w-4 h-4 text-blue-400" />;
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur">
      <div className="p-6 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-950/60 text-blue-400 border border-blue-800/60">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">Active Connected Peers</h3>
            <p className="text-xs text-slate-400">
              Live WebSocket sessions streaming row deltas and uploading offline mutations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 text-xs font-mono">
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span>{peers.length} Peers Online</span>
        </div>
      </div>

      {peers.length === 0 ? (
        <div className="p-12 text-center text-slate-500 text-xs font-mono">
          No external client devices connected. Connect using the TypeScript SDK or open a second browser window.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {peers.map((peer) => (
            <div
              key={peer.id}
              className="p-4 hover:bg-slate-800/20 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono text-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800 border border-slate-700/60">
                  {getDeviceIcon(peer.userAgent)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">{peer.id}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                      {peer.remoteAddr}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate max-w-sm mt-0.5">
                    {peer.userAgent || 'SyncLoom TypeScript SDK'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[11px]">
                <div>
                  <span className="text-slate-500 mr-1.5">Subscriptions:</span>
                  <span className="text-cyan-400">
                    {peer.subscriptions.length > 0 ? peer.subscriptions.join(', ') : 'None'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 mr-1.5">Streamed:</span>
                  <span className="text-emerald-400 font-semibold">{peer.deltasSent} deltas</span>
                </div>

                <div>
                  <span className="text-slate-500 mr-1.5">Mutations:</span>
                  <span className="text-purple-400 font-semibold">{peer.mutationsRecv} recv</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
