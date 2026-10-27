import React, { useState } from 'react';
import { ConflictRecord } from '../hooks/useSyncStats';
import { ShieldCheck, GitMerge, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';

interface ConflictLogTableProps {
  conflicts: ConflictRecord[];
}

export const ConflictLogTable: React.FC<ConflictLogTableProps> = ({ conflicts }) => {
  const [filter, setFilter] = useState('');

  const filtered = conflicts.filter(
    (c) =>
      c.table.toLowerCase().includes(filter.toLowerCase()) ||
      c.primaryKey.toLowerCase().includes(filter.toLowerCase()) ||
      c.column.toLowerCase().includes(filter.toLowerCase())
  );

  const formatHlc = (hlc: any) => {
    if (!hlc) return 'N/A';
    if (typeof hlc === 'string') return hlc;
    return `HLC-${hlc.millis}-${String(hlc.counter).padStart(4, '0')}@${hlc.nodeId}`;
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur">
      <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-950/60 text-purple-400 border border-purple-800/60">
            <GitMerge className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">Conflict Resolution Audit Log</h3>
            <p className="text-xs text-slate-400">
              Deterministic CRDT field-level Last-Write-Wins collisions and resolutions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Filter table, key, column..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full sm:w-64 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono"
          />
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono whitespace-nowrap">
            {conflicts.length} Total
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/40 text-emerald-400 mx-auto flex items-center justify-center mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200">Zero Unresolved Divergences</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            All concurrent edits either operated on distinct columns or converged cleanly via monotonic Hybrid Logical Clocks.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/40 border-b border-slate-800/80 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Column</th>
                <th className="py-3 px-4">Winner (HLC)</th>
                <th className="py-3 px-4">Loser (HLC)</th>
                <th className="py-3 px-4">Value Resolution</th>
                <th className="py-3 px-4">Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-mono">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-semibold text-cyan-400">{c.table}</span>
                    <span className="text-slate-500 ml-1.5 font-normal">#{c.primaryKey}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 font-semibold">
                      {c.column}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-emerald-400">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate max-w-[150px]" title={formatHlc(c.winnerHlc)}>
                        {formatHlc(c.winnerHlc)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-rose-400">
                    <span className="truncate max-w-[150px] opacity-80" title={formatHlc(c.loserHlc)}>
                      {formatHlc(c.loserHlc)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-rose-400 line-through opacity-70">
                        {String(c.loserValue)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="text-emerald-400 font-semibold">
                        {String(c.winnerValue)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                      {c.resolution || 'LWW_WINNER'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
