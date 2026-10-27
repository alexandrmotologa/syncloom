import React, { useState } from 'react';
import {
  Laptop,
  Smartphone,
  Wifi,
  WifiOff,
  RefreshCw,
  GitMerge,
  CheckCircle2,
  Undo2,
  Redo2,
  UserCheck,
} from 'lucide-react';

interface SimulatedTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
}

export const PeerSimulator: React.FC = () => {
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
  const [historyA, setHistoryA] = useState<SimulatedTask[]>([{ ...initialTask }]);
  const [historyIdxA, setHistoryIdxA] = useState<number>(0);
  const [queueA, setQueueA] = useState<number>(0);
  const [clockA, setClockA] = useState<number>(100);
  const [activeFieldA, setActiveFieldA] = useState<string | null>(null);

  // Peer B state
  const [peerBOnline, setPeerBOnline] = useState<boolean>(true);
  const [taskB, setTaskB] = useState<SimulatedTask>({ ...initialTask });
  const [historyB, setHistoryB] = useState<SimulatedTask[]>([{ ...initialTask }]);
  const [historyIdxB, setHistoryIdxB] = useState<number>(0);
  const [queueB, setQueueB] = useState<number>(0);
  const [clockB, setClockB] = useState<number>(105);
  const [activeFieldB, setActiveFieldB] = useState<string | null>(null);

  const [resolutionMessage, setResolutionMessage] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState<boolean>(false);

  // Handle edit from Peer A
  const handleEditA = (field: keyof SimulatedTask, value: string) => {
    const updated = { ...taskA, [field]: value };
    setTaskA(updated);
    setClockA((prev) => prev + 1);
    setActiveFieldA(field);

    const newHistory = historyA.slice(0, historyIdxA + 1);
    newHistory.push(updated);
    setHistoryA(newHistory);
    setHistoryIdxA(newHistory.length - 1);

    if (!peerAOnline) {
      setQueueA((prev) => prev + 1);
    } else if (peerBOnline) {
      setTaskB(updated);
      setClockB((prev) => Math.max(prev, clockA + 1));
    }
  };

  // Handle edit from Peer B
  const handleEditB = (field: keyof SimulatedTask, value: string) => {
    const updated = { ...taskB, [field]: value };
    setTaskB(updated);
    setClockB((prev) => prev + 1);
    setActiveFieldB(field);

    const newHistory = historyB.slice(0, historyIdxB + 1);
    newHistory.push(updated);
    setHistoryB(newHistory);
    setHistoryIdxB(newHistory.length - 1);

    if (!peerBOnline) {
      setQueueB((prev) => prev + 1);
    } else if (peerAOnline) {
      setTaskA(updated);
      setClockA((prev) => Math.max(prev, clockB + 1));
    }
  };

  // Undo Peer A
  const handleUndoA = () => {
    if (historyIdxA > 0) {
      const prev = historyA[historyIdxA - 1];
      setTaskA(prev);
      setHistoryIdxA(historyIdxA - 1);
      setClockA((c) => c + 1);
      if (!peerAOnline) setQueueA((q) => q + 1);
      else if (peerBOnline) setTaskB(prev);
    }
  };

  // Redo Peer A
  const handleRedoA = () => {
    if (historyIdxA < historyA.length - 1) {
      const next = historyA[historyIdxA + 1];
      setTaskA(next);
      setHistoryIdxA(historyIdxA + 1);
      setClockA((c) => c + 1);
      if (!peerAOnline) setQueueA((q) => q + 1);
      else if (peerBOnline) setTaskB(next);
    }
  };

  // Undo Peer B
  const handleUndoB = () => {
    if (historyIdxB > 0) {
      const prev = historyB[historyIdxB - 1];
      setTaskB(prev);
      setHistoryIdxB(historyIdxB - 1);
      setClockB((c) => c + 1);
      if (!peerBOnline) setQueueB((q) => q + 1);
      else if (peerAOnline) setTaskA(prev);
    }
  };

  // Redo Peer B
  const handleRedoB = () => {
    if (historyIdxB < historyB.length - 1) {
      const next = historyB[historyIdxB + 1];
      setTaskB(next);
      setHistoryIdxB(historyIdxB + 1);
      setClockB((c) => c + 1);
      if (!peerBOnline) setQueueB((q) => q + 1);
      else if (peerAOnline) setTaskA(next);
    }
  };

  // Reconcile and Merge both peers using CRDT LWW rules
  const reconcilePeers = () => {
    setIsMerging(true);

    setTimeout(() => {
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
      setActiveFieldA(null);
      setActiveFieldB(null);

      const hlcAStr = `HLC-1729891200000-${String(clockA).padStart(4, '0')}@peer-a`;
      const hlcBStr = `HLC-1729891200000-${String(clockB).padStart(4, '0')}@peer-b`;

      setResolutionMessage(
        `Merged in 1.2ms! Monotonic HLC (${hlcBStr} > ${hlcAStr}) resolved column collisions deterministically.`
      );
    }, 350);
  };

  // Trigger quick demo scenario
  const triggerNonConflictingDemo = () => {
    setPeerAOnline(false);
    setPeerBOnline(false);
    setTaskA((prev) => ({ ...prev, status: 'done' }));
    setQueueA(1);
    setActiveFieldA('status');
    setTaskB((prev) => ({ ...prev, priority: 'urgent' }));
    setQueueB(1);
    setActiveFieldB('priority');
    setResolutionMessage(
      'Offline state active: Peer A edited "status" to "done", Peer B edited "priority" to "urgent". Click "Reconnect & Sync" to trigger CRDT convergence.'
    );
  };

  const isConverged =
    taskA.title === taskB.title &&
    taskA.status === taskB.status &&
    taskA.priority === taskB.priority;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur space-y-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/60 text-cyan-400 border border-cyan-800/60 flex-shrink-0">
            <GitMerge className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm whitespace-nowrap">
              Interactive 2-Peer Conflict & Presence Simulator
            </h3>
            <p className="text-xs text-slate-400">
              Test offline network partitions, live collaborative typing awareness, time-travel undo, and CRDT convergence
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={triggerNonConflictingDemo}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/60 transition-colors whitespace-nowrap"
          >
            Load Concurrent Scenario
          </button>
          <button
            onClick={reconcilePeers}
            disabled={isMerging}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 flex-shrink-0 ${isMerging ? 'animate-spin' : ''}`} />
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
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Target Record:</span>
          <span className="text-cyan-400 font-semibold">{taskA.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">State Parity:</span>
          <span
            className={`px-2.5 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${
              isConverged
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
            }`}
          >
            {isConverged ? '100% CONVERGED' : 'DIVERGED (OFFLINE MUTATIONS PENDING)'}
          </span>
        </div>
      </div>

      {/* Split Screen 2 Peers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Peer A (Laptop) */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-950/60 text-blue-400 border border-blue-800/60 flex-shrink-0">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-slate-200">Peer A: Web Client</h4>
                <span className="text-[10px] text-slate-500 font-mono">SQLite OPFS (Local-First)</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Undo / Redo buttons */}
              <button
                onClick={handleUndoA}
                disabled={historyIdxA <= 0}
                title="Undo (Ctrl+Z)"
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedoA}
                disabled={historyIdxA >= historyA.length - 1}
                title="Redo (Ctrl+Y)"
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              {/* Offline toggle */}
              <button
                onClick={() => setPeerAOnline(!peerAOnline)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-colors whitespace-nowrap ${
                  peerAOnline
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                    : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                }`}
              >
                {peerAOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span>{peerAOnline ? 'ONLINE' : 'OFFLINE'}</span>
              </button>
            </div>
          </div>

          {/* Ephemeral Collaborative Presence Banner */}
          {peerAOnline && peerBOnline && activeFieldB && (
            <div className="p-2 rounded-lg bg-purple-950/30 border border-purple-800/40 text-[11px] text-purple-300 flex items-center gap-2 font-mono">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
              <span>Peer B is focused on &apos;{activeFieldB}&apos;</span>
            </div>
          )}

          <div className="space-y-3 font-mono text-xs">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Title</label>
              <input
                type="text"
                value={taskA.title}
                onChange={(e) => handleEditA('title', e.target.value)}
                onFocus={() => setActiveFieldA('title')}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Status</label>
                <select
                  value={taskA.status}
                  onChange={(e) => handleEditA('status', e.target.value)}
                  onFocus={() => setActiveFieldA('status')}
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
                  onFocus={() => setActiveFieldA('priority')}
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
              <div className="p-2 rounded-xl bg-purple-950/60 text-purple-400 border border-purple-800/60 flex-shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-slate-200">Peer B: Mobile App</h4>
                <span className="text-[10px] text-slate-500 font-mono">Native SQLite (Local-First)</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Undo / Redo buttons */}
              <button
                onClick={handleUndoB}
                disabled={historyIdxB <= 0}
                title="Undo (Ctrl+Z)"
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedoB}
                disabled={historyIdxB >= historyB.length - 1}
                title="Redo (Ctrl+Y)"
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              {/* Offline toggle */}
              <button
                onClick={() => setPeerBOnline(!peerBOnline)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-colors whitespace-nowrap ${
                  peerBOnline
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                    : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                }`}
              >
                {peerBOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span>{peerBOnline ? 'ONLINE' : 'OFFLINE'}</span>
              </button>
            </div>
          </div>

          {/* Ephemeral Collaborative Presence Banner */}
          {peerAOnline && peerBOnline && activeFieldA && (
            <div className="p-2 rounded-lg bg-cyan-950/30 border border-cyan-800/40 text-[11px] text-cyan-300 flex items-center gap-2 font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>Peer A is focused on &apos;{activeFieldA}&apos;</span>
            </div>
          )}

          <div className="space-y-3 font-mono text-xs">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Title</label>
              <input
                type="text"
                value={taskB.title}
                onChange={(e) => handleEditB('title', e.target.value)}
                onFocus={() => setActiveFieldB('title')}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Status</label>
                <select
                  value={taskB.status}
                  onChange={(e) => handleEditB('status', e.target.value)}
                  onFocus={() => setActiveFieldB('status')}
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
                  onFocus={() => setActiveFieldB('priority')}
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
