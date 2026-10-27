import React from 'react';
import { ServerStatus } from '../hooks/useSyncStats';
import { Layers, Activity, Database, GitMerge, Table, ShieldCheck, Users, Terminal } from 'lucide-react';

interface HeaderProps {
  status: ServerStatus | null;
  isConnected: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ status, isConnected, activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'overview', label: 'Overview & Lag', icon: Activity },
    { id: 'simulator', label: 'CRDT Simulator', icon: GitMerge },
    { id: 'sql', label: 'SQL Console', icon: Terminal },
    { id: 'tables', label: 'Table Matrix', icon: Table },
    { id: 'conflicts', label: 'Conflict Audit', icon: ShieldCheck },
    { id: 'peers', label: 'Active Peers', icon: Users },
  ];

  return (
    <header className="border-b border-slate-800 bg-[#090d16]/95 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[4.25rem] py-2 gap-4">
          {/* Logo and Brand */}
          <div className="flex items-center gap-3.5 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  SyncLoom
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-950/90 text-cyan-400 border border-cyan-800/80 whitespace-nowrap">
                  STUDIO v{status?.version || '1.0.0'}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block whitespace-nowrap">
                Local-First CRDT & PostgreSQL Real-Time Sync
              </p>
            </div>
          </div>

          {/* Navigation Tabs - Strict Single Line with Whitespace-Nowrap */}
          <nav className="hidden lg:flex items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800/90">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Connection Status & Mode Badge */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-nowrap">
              <Database className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span>{status?.mode || 'Standalone CDC'}</span>
            </div>

            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-medium border whitespace-nowrap shadow-sm ${
                isConnected
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
                  : 'bg-rose-950/70 text-rose-300 border-rose-700/60'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              <span>{isConnected ? 'LIVE WS' : 'OFFLINE'}</span>
            </div>
          </div>
        </div>

        {/* Medium and Mobile Navigation Bar - Single Line Horizontal Scrolling */}
        <div className="flex lg:hidden overflow-x-auto py-2.5 gap-2 border-t border-slate-800/80 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 flex-shrink-0 ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
