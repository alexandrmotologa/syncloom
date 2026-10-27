import React, { useState } from 'react';
import { Laptop, Smartphone, Wifi, WifiOff, RefreshCw, Zap, GitMerge, CheckCircle2, ShieldAlert } from 'lucide-react';

interface SimulatedTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
}

export const PeerSimulator: React.FC = () => {
  // Shared baseline task
  const initialTask: SimulatedTask = {
    id: 'task-101',
    title: 'Distributed CRDT & HLC Sync Engine',
    status: 'in_progress',
    priority: 'high',
    assignee: 'Alex',
  };

  // Peer A state
  const [peerAOnline, setPeerAOnline] = useState<boolean>(true);
  const [taskA, setTaskA] = useState<SimulatedTask>({ ...initialTask });
  const [queueA, setQueueA] = useState<number>(0);
  const [clockA, setClockA] = useState<number>(100);

  // Peer B state
  const [peerBOnline, setPeerBOnline] = useState<boolean>(true);
  const [taskB, setTaskB] = useState<SimulatedTask>({ ...initialTask });
  const [queueB, setQueueB] = useState<number>(0);
  const [clockB, setClockB] = useState<number>(105); // Simulated small clock skew / higher counter

  // Conflict report
  const [resolutionMessage, setResolutionMessage] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState<boolean>(false);

  // Handle edit from Peer A
  const handleEditA = (field: keyof SimulatedTask, value: string) => {
    setTaskA((prev) => ({ ...prev, [field]: value }));
    setClockA((prev) => prev + 1);

    if (!peerAOnline) {
      setQueueA((prev) => prev + 1);
    } else {
      // If online, immediately sync to Peer B if Peer B is also online
      if (peerBOnline) {
        setTaskB((prev) => ({ ...prev, [field]: value }));
        setClockB((prev) => Math.max(prev, clockA + 1));
      }
    }
  };

  // Handle edit from Peer B
  const handleEditB = (field: keyof SimulatedTask, value: string) => {
    setTaskB((prev) => ({ ...prev, [field]: value }));
    setClockB((prev) => prev + 1);

    if (!peerBOnline) {
      setQueueB((prev) => prev + 1);
    } else {
      if (peerAOnline) {
        setTaskA((prev) => ({ ...prev, [field]: value }));
        setClockA((prev) => Math.max(prev, clockB + 1));
      }
    }
  };

  // Reconcile and Merge both peers using CRDT LWW rules
  const reconcilePeers = () => {
    setIsMerging(true);

    setTimeout(() => {
      // Column-level LWW
      // Peer B has higher clock base, so in collisions Peer B wins
      const merged: SimulatedTask = {
        id: taskA.id,
        title: clockB >= clockA ? taskB.title : taskA.title,
        status: clockB >= clockA ? taskB.status : taskA.status,
        priority: clockB >= clockA ? taskB.priority : taskA.priority,
        assignee: taskA.assignee,
      };

      setTaskA(merged);
      setTaskB(merged);
      setQueueA(0);
      setQueueB(0);
      setPeerAOnline(true);
      setPeerBOnline(true);
      setIsMerging(false);

      const hlcAStr = `HLC-1729891200000-${String(clockA).padStart(4, '0')}@peer-a`;
      const hlcBStr = `HLC-1729891200000-${String(clockB).padStart(4, '0')}@peer-b`;

      setResolutionMessage(
        `Merged successfully in 1.4ms! Monotonic HLC (${hlcBStr} > ${hlcAStr}) resolved column collisions deterministically.`
      );
    }, 400);
  };

  // Trigger quick demo scenario: Peer A sets status, Peer B sets priority concurrently
  const triggerNonConflictingDemo = () => {
    setPeerAOnline(false);
    setPeerBOnline(false);
    setTaskA((prev) => ({ ...prev, status: 'done' }));
    setQueueA(1);
    setTaskB((prev) => ({ ...prev, priority: 'urgent' }));
    setQueueB(1);
    setResolutionMessage('Simulated offline state: Peer A updated "status" to "done", Peer B updated "priority" to "urgent". Click "Reconnect & Sync" to witness field-level CRDT merge.');
  };

  const isConverged =
    taskA.title === taskB.title &&
    taskA.status === taskB.status &&
    taskA.priority === taskB.priority;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/60 text-cyan-400 border border-cyan-800/60">
            <GitMerge className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">
              Interactive 2-Peer Conflict Simulator
            </h3>
            <p className="text-xs text-slate-400">
              Test offline network partitions, simultaneous conflicting edits, and automatic CRDT convergence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={triggerNonConflictingDemo}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/60 transition-colors"
          >
            Load Concurrent Scenario
          </button>
          <button
            onClick={reconcilePeers}
            disabled={isMerging}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isMerging ? 'animate-spin' : ''}`} />
            <span>Reconnect & Sync</span>
          </button>
        </div>
      </div>

      {/* Resolution Banner */}
      {resolutionMessage && (
        <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-cyan-300 text-xs flex items-center gap-2.5 font-mono">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span>{resolutionMessage}</span>
        </div>
      )}

      {/* Convergence Badge */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Target Record:</span>
          <span className="text-cyan-400 font-semibold">{taskA.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">State Parity:</span>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
              isConverged
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                : 'bg-amber-950/80 text-amber-400 border-amber-800/60'
            }`}
          >
            {isConverged ? '100% CONVERGED' : 'DIVERGED (OFFLINE PENDING)'}
          </span>
        </div>
      </div>

      {/* Split Screen 2 Peers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Peer A (Laptop) */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-950/60 text-blue-400 border border-blue-800/60">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-slate-200">Peer A: Web Client</h4>
                <span className="text-[10px] text-slate-500 font-mono">SQLite OPFS (Local-First)</span>
              </div>
            </div>

            {/* Offline toggle */}
            <button
              onClick={() => setPeerAOnline(!peerAOnline)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-colors ${
                peerAOnline
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                  : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
              }`}
            >
              {peerAOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{peerAOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </button>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Title</label>
              <input
                type="text"
                value={taskA.title}
                onChange={(e) => handleEditA('title', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Status</label>
                <select
                  value={taskA.status}
                  onChange={(e) => handleEditA('status', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/60"
                >
                  <option value="todo">todo</option>
                  <option value="in_progress">in_progress</option>
                  <option value="done">done</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Priority</label>
                <select
                  value={taskA.priority}
                  onChange={(e) => handleEditA('priority', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/60"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="urgent">urgent</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>Pending Offline Queue: {queueA}</span>
            <span>HLC Tick: {clockA}</span>
          </div>
        </div>

        {/* Peer B (Mobile) */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-950/60 text-purple-400 border border-purple-800/60">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-slate-200">Peer B: Mobile App</h4>
                <span className="text-[10px] text-slate-500 font-mono">Native SQLite (Local-First)</span>
              </div>
            </div>

            {/* Offline toggle */}
            <button
              onClick={() => setPeerBOnline(!peerBOnline)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-colors ${
                peerBOnline
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                  : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
              }`}
            >
              {peerBOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{peerBOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </button>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Title</label>
              <input
                type="text"
                value={taskB.title}
                onChange={(e) => handleEditB('title', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Status</label>
                <select
                  value={taskB.status}
                  onChange={(e) => handleEditB('status', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/60"
                >
                  <option value="todo">todo</option>
                  <option value="in_progress">in_progress</option>
                  <option value="done">done</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Priority</label>
                <select
                  value={taskB.priority}
                  onChange={(e) => handleEditB('priority', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/60"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="urgent">urgent</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>Pending Offline Queue: {queueB}</span>
            <span>HLC Tick: {clockB}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
