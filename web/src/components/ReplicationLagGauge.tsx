import React from 'react';
import { Gauge, Zap, CheckCircle2, AlertCircle, Minimize2 } from 'lucide-react';

interface ReplicationLagGaugeProps {
  lagMs: number;
  deltasPerSec: number;
  totalDeltas: number;
  conflictsCount: number;
  compressionRatio?: number;
  bandwidthSavedKb?: number;
}

export const ReplicationLagGauge: React.FC<ReplicationLagGaugeProps> = ({
  lagMs,
  deltasPerSec,
  totalDeltas,
  conflictsCount,
  compressionRatio = 68.2,
  bandwidthSavedKb = 14.8,
}) => {
  // Normalize lag (0 to 50ms scale)
  const clampedLag = Math.min(Math.max(lagMs, 0.1), 50);
  const percentage = (clampedLag / 50) * 100;

  // Gauge colors based on SLA (<15ms is excellent, 15-30ms acceptable, >30ms degraded)
  let statusColor = 'text-emerald-400';
  let strokeColor = '#10b981';
  let label = 'Sub-15ms Ultra Low Latency';

  if (clampedLag > 30) {
    statusColor = 'text-rose-400';
    strokeColor = '#f43f5e';
    label = 'Degraded (>30ms)';
  } else if (clampedLag > 15) {
    statusColor = 'text-amber-400';
    strokeColor = '#f59e0b';
    label = 'Acceptable (<30ms)';
  }

  // Circular gauge math (radius 60, circumference ~377)
  const radius = 60;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * percentage) / 100;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden backdrop-blur">
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-slate-800 text-cyan-400 border border-slate-700/60">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">Replication Latency</h3>
            <p className="text-xs text-slate-400">PostgreSQL WAL to Client WebSocket</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-mono">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>SLA &lt;20ms</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
        {/* Circular Gauge */}
        <div className="relative flex items-center justify-center">
          <svg className="w-36 h-36 transform -rotate-90">
            {/* Background Track */}
            <circle
              cx="72"
              cy="72"
              r={radius}
              stroke="#1e293b"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Animated Gauge Arc */}
            <circle
              cx="72"
              cy="72"
              r={radius}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-500 ease-out"
            />
          </svg>

          {/* Center Digital Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className={`text-3xl font-extrabold font-mono tracking-tight ${statusColor}`}>
              {lagMs < 1 ? '<1' : lagMs.toFixed(1)}
              <span className="text-sm font-normal text-slate-400 ml-0.5">ms</span>
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-0.5">
              Roundtrip
            </span>
          </div>
        </div>

        {/* Stats Column */}
        <div className="flex-1 w-full space-y-3">
          <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Throughput</div>
              <div className="text-xl font-bold font-mono text-cyan-400">
                {deltasPerSec.toFixed(1)}{' '}
                <span className="text-xs font-normal text-slate-500">deltas/s</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-cyan-950/50 flex items-center justify-center text-cyan-400 border border-cyan-800/40">
              <Zap className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Total Deltas Streamed</div>
              <div className="text-xl font-bold font-mono text-slate-100">
                {totalDeltas.toLocaleString()}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/50 flex items-center justify-center text-emerald-400 border border-emerald-800/40">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">WS Binary Compression</div>
              <div className="text-xl font-bold font-mono text-cyan-400">
                {compressionRatio}% <span className="text-xs font-normal text-slate-500">saved ({bandwidthSavedKb.toFixed(1)} KB)</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-cyan-950/50 flex items-center justify-center text-cyan-400 border border-cyan-800/40">
              <Minimize2 className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 pt-1">
            <CheckCircle2 className={`w-4 h-4 ${statusColor}`} />
            <span>{label}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
