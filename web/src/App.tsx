import React, { useState } from 'react';
import { useSyncStats } from './hooks/useSyncStats';
import { Header } from './components/Header';
import { ReplicationLagGauge } from './components/ReplicationLagGauge';
import { ConflictLogTable } from './components/ConflictLogTable';
import { TableSyncMatrix } from './components/TableSyncMatrix';
import { ActivePeersList } from './components/ActivePeersList';
import { PeerSimulator } from './components/PeerSimulator';
import { Zap, Users, Database, ShieldCheck, Activity } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const { status, metrics, peers, conflicts, tables, isConnected, refresh } = useSyncStats(2000);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      <Header
        status={status}
        isConnected={isConnected}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Key Metrics Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4.5 backdrop-blur flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">
                Replication Lag
              </div>
              <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                {metrics.averageLagMs < 1 ? '<1' : metrics.averageLagMs.toFixed(1)} ms
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <Zap className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4.5 backdrop-blur flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">
                Connected Peers
              </div>
              <div className="text-2xl font-bold font-mono text-blue-400 mt-1">
                {metrics.connectedClients}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-blue-400">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4.5 backdrop-blur flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">
                Active Tables
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                {Object.keys(tables.stats || {}).length || 2}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4.5 backdrop-blur flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">
                Resolved Collisions
              </div>
              <div className="text-2xl font-bold font-mono text-purple-400 mt-1">
                {metrics.conflictsResolved}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-800/60 flex items-center justify-center text-purple-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Tab View Content */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <ReplicationLagGauge
              lagMs={metrics.averageLagMs}
              deltasPerSec={metrics.deltasPerSec}
              totalDeltas={metrics.totalDeltas}
              conflictsCount={metrics.conflictsResolved}
            />
            <PeerSimulator />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <TableSyncMatrix tablesData={tables} onRefresh={refresh} />
              <ActivePeersList peers={peers} />
            </div>
          </div>
        )}

        {activeTab === 'simulator' && (
          <div className="space-y-8">
            <PeerSimulator />
            <ConflictLogTable conflicts={conflicts} />
          </div>
        )}

        {activeTab === 'tables' && (
          <div className="space-y-8">
            <TableSyncMatrix tablesData={tables} onRefresh={refresh} />
          </div>
        )}

        {activeTab === 'conflicts' && (
          <div className="space-y-8">
            <ConflictLogTable conflicts={conflicts} />
          </div>
        )}

        {activeTab === 'peers' && (
          <div className="space-y-8">
            <ActivePeersList peers={peers} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950/60 py-6 text-center text-xs text-slate-500 font-mono">
        <p>SyncLoom Engine • Local-First CRDT & PostgreSQL Real-Time Sync • Single-Binary Go 1.23 + React 19</p>
      </footer>
    </div>
  );
};
