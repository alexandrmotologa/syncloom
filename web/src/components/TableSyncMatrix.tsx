import React, { useState } from 'react';
import { TablesData } from '../hooks/useSyncStats';
import { Table, Database, ArrowUpDown, RefreshCw, Eye } from 'lucide-react';

interface TableSyncMatrixProps {
  tablesData: TablesData;
  onRefresh: () => void;
}

export const TableSyncMatrix: React.FC<TableSyncMatrixProps> = ({ tablesData, onRefresh }) => {
  const tableNames = Object.keys(tablesData.stats || {});
  const [selectedTable, setSelectedTable] = useState<string>(tableNames[0] || 'tasks');

  const rows = tablesData.tables[selectedTable] || [];

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur">
      <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/60 text-cyan-400 border border-cyan-800/60">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">Table Synchronization Matrix</h3>
            <p className="text-xs text-slate-400">
              Live SQLite-to-PostgreSQL replica state with column-level HLC timestamps
            </p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/60 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Refresh Data</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-800">
        {/* Table Selector Sidebar */}
        <div className="p-4 space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 px-2 font-semibold">
            Monitored Tables
          </div>
          {tableNames.length === 0 ? (
            <div className="text-xs text-slate-500 p-2">No tables synchronized yet</div>
          ) : (
            tableNames.map((tbl) => {
              const count = tablesData.stats[tbl] || 0;
              const isSelected = selectedTable === tbl;
              return (
                <button
                  key={tbl}
                  onClick={() => setSelectedTable(tbl)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-mono transition-all text-left ${
                    isSelected
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4 text-cyan-400" />
                    <span className="font-medium">{tbl}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px]">
                    {count} rows
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Rows Table */}
        <div className="md:col-span-3 p-4 overflow-x-auto">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs font-mono">
              Table &quot;{selectedTable}&quot; is currently empty or awaiting initial logical replication snapshot.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                    {Object.keys(rows[0] || {}).map((col) => (
                      <th key={col} className="py-2.5 px-3 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      {Object.entries(row).map(([col, val]) => (
                        <td key={col} className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                          {col === '_hlc' ? (
                            <span className="px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 text-[10px]">
                              {String(val)}
                            </span>
                          ) : col === 'status' ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                val === 'done'
                                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                                  : val === 'in_progress'
                                  ? 'bg-cyan-950/80 text-cyan-400 border-cyan-800/60'
                                  : 'bg-slate-800 text-slate-300 border-slate-700/60'
                              }`}
                            >
                              {String(val)}
                            </span>
                          ) : (
                            String(val ?? 'null')
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
