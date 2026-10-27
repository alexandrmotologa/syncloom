import React, { useState } from 'react';
import { Terminal, Play, RotateCcw, CheckCircle2, AlertTriangle, Database, Zap } from 'lucide-react';

interface QueryResult {
  query: string;
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeUs: number;
  executionTimeMs: number;
  error?: string;
}

export const SqlConsole: React.FC = () => {
  const [query, setQuery] = useState('SELECT * FROM tasks');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  const presets = [
    { label: 'All Tasks', sql: 'SELECT * FROM tasks' },
    { label: 'In Progress Tasks', sql: "SELECT id, title, status, priority FROM tasks WHERE status = 'in_progress'" },
    { label: 'Acme Tenant Tasks', sql: "SELECT id, title, assignee, tenant_id FROM tasks WHERE tenant_id = 'tenant_acme'" },
    { label: 'All Projects', sql: 'SELECT * FROM projects' },
  ];

  const handleRunQuery = async (sqlToRun?: string) => {
    const q = sqlToRun || query;
    if (!q.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({
        query: q,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeUs: 0,
        executionTimeMs: 0,
        error: err.message || 'Failed to execute query',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunQuery();
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur space-y-6">
      {/* Header & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-800 text-cyan-400 border border-slate-700/60 shadow-inner flex-shrink-0">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
              <span>Interactive SQL Console</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 whitespace-nowrap">
                Zero-Lag Read Replica
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Query synced client SQLite state or PostgreSQL WAL replica in microseconds.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handleRunQuery()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-cyan-950/50 transition-all duration-150 disabled:opacity-50 whitespace-nowrap flex-shrink-0"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Executing...' : 'Run Query'}</span>
            <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[9px] bg-white/20 rounded font-mono">
              Ctrl+Enter
            </kbd>
          </button>
        </div>
      </div>

      {/* Preset Query Badges */}
      <div className="space-y-2">
        <span className="text-[11px] text-slate-400 font-mono font-medium uppercase tracking-wider block">
          Preset Templates
        </span>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setQuery(p.sql);
                handleRunQuery(p.sql);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-mono transition-colors whitespace-nowrap flex-shrink-0"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Query Input Box */}
      <div className="relative">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder="SELECT * FROM tasks WHERE status = 'in_progress'"
          className="w-full bg-[#070b12] border border-slate-800 rounded-xl p-4 font-mono text-xs sm:text-sm text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all resize-y"
        />
      </div>

      {/* Query Execution Status Banner */}
      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center gap-3">
              {result.error ? (
                <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Syntax or Table Error</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Success</span>
                </span>
              )}
              <span className="text-slate-500">•</span>
              <span className="text-slate-300">
                {result.rowCount} {result.rowCount === 1 ? 'row' : 'rows'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-400">
              <Zap className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span>
                Execution Time:{' '}
                <strong className="text-cyan-400">
                  {result.executionTimeMs < 1 ? '<1' : result.executionTimeMs.toFixed(3)} ms
                </strong>{' '}
                ({result.executionTimeUs} µs)
              </span>
            </div>
          </div>

          {/* Error Message Box */}
          {result.error && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 font-mono space-y-1">
              <p className="font-semibold">Query execution error:</p>
              <p>{result.error}</p>
            </div>
          )}

          {/* Results Table */}
          {!result.error && result.rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#070b12]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-mono uppercase tracking-wider text-[11px]">
                    {result.columns.map((col) => (
                      <th key={col} className="p-3.5 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {result.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      {result.columns.map((col) => {
                        const val = row[col];
                        let renderedVal = String(val ?? '');

                        // Custom status chip
                        if (col === 'status') {
                          const isDone = val === 'done';
                          const isProgress = val === 'in_progress';
                          return (
                            <td key={col} className="p-3.5 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  isDone
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                    : isProgress
                                    ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}
                              >
                                {renderedVal}
                              </span>
                            </td>
                          );
                        }

                        // Custom priority chip
                        if (col === 'priority') {
                          const isUrgent = val === 'urgent';
                          const isHigh = val === 'high';
                          return (
                            <td key={col} className="p-3.5 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  isUrgent
                                    ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                                    : isHigh
                                    ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                                    : 'bg-blue-950/80 text-blue-400 border border-blue-800/60'
                                }`}
                              >
                                {renderedVal}
                              </span>
                            </td>
                          );
                        }

                        // Tenant ID pill
                        if (col === 'tenant_id') {
                          return (
                            <td key={col} className="p-3.5 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded bg-indigo-950/70 text-indigo-300 border border-indigo-800/50 text-[10px]">
                                {renderedVal}
                              </span>
                            </td>
                          );
                        }

                        // HLC badge
                        if (col === '_hlc') {
                          return (
                            <td key={col} className="p-3.5 whitespace-nowrap text-slate-500 text-[10px]">
                              {renderedVal}
                            </td>
                          );
                        }

                        return (
                          <td key={col} className="p-3.5 text-slate-200 whitespace-nowrap">
                            {renderedVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!result.error && result.rows.length === 0 && (
            <div className="py-8 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-xl">
              0 rows matched the query predicate.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
