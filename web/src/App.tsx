import React, { useState } from 'react';
import { useSyncStats } from './hooks/useSyncStats';
import { Header } from './components/Header';
import { ReplicationLagGauge } from './components/ReplicationLagGauge';
import { ConflictLogTable } from './components/ConflictLogTable';
import { TableSyncMatrix } from './components/TableSyncMatrix';
import { ActivePeersList } from './components/ActivePeersList';
import { PeerSimulator } from './components/PeerSimulator';
import { SqlConsole } from './components/SqlConsole';
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
        {/* Top Key Metrics Banner with Valid Padding and Robust Spacing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 backdrop-blur-md flex items-start justify-between shadow-sm hover:border-slate-700/80 transition-colors">
            <div className="space-y-1">
              <span className="text-[11px] text-slate-400 font-mono font-medium uppercase tracking-wider block">
                Replication Lag
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-cyan-400 tracking-tight">
                {metrics.averageLagMs < 1 ? '<1' : metrics.averageLagMs.toFixed(1)} <span className="text-sm font-normal text-slate-400">ms</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono block">● Sub-20ms SLA</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-950/70 border border-cyan-800/70 flex items-center justify-center text-cyan-400 flex-shrink-0 shadow-inner">
              <Zap className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 backdrop-blur-md flex items-start justify-between shadow-sm hover:border-slate-700/80 transition-colors">
            <div className="space-y-1">
              <span className="text-[11px] text-slate-400 font-mono font-medium uppercase tracking-wider block">
                Connected Peers
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-blue-400 tracking-tight">
                {metrics.connectedClients}
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">Active Web & Mobile</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-950/70 border border-blue-800/70 flex items-center justify-center text-blue-400 flex-shrink-0 shadow-inner">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 backdrop-blur-md flex items-start justify-between shadow-sm hover:border-slate-700/80 transition-colors">
            <div className="space-y-1">
              <span className="text-[11px] text-slate-400 font-mono font-medium uppercase tracking-wider block">
                Active Tables
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 tracking-tight">
                {Object.keys(tables.stats || {}).length || 2}
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">PostgreSQL Replicas</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-950/70 border border-emerald-800/70 flex items-center justify-center text-emerald-400 flex-shrink-0 shadow-inner">
              <Database className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 backdrop-blur-md flex items-start justify-between shadow-sm hover:border-slate-700/80 transition-colors">
            <div className="space-y-1">
              <span className="text-[11px] text-slate-400 font-mono font-medium uppercase tracking-wider block">
                Resolved Collisions
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-purple-400 tracking-tight">
                {metrics.conflictsResolved}
              </div>
              <span className="text-[10px] text-purple-400 font-mono block">CRDT LWW Deterministic</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-950/70 border border-purple-800/70 flex items-center justify-center text-purple-400 flex-shrink-0 shadow-inner">
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
              compressionRatio={metrics.compressionRatio}
              bandwidthSavedKb={metrics.bandwidthSavedKb}
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

        {activeTab === 'sql' && (
          <div className="space-y-8">
            <SqlConsole />
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
