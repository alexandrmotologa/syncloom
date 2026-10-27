import { Operation } from './types.js';

export interface HistoryEntry {
  table: string;
  primaryKey: string;
  operation: Operation;
  forwardData: Record<string, any>;
  inverseData: Record<string, any> | null;
  forwardColMeta: Record<string, string>;
  inverseColMeta: Record<string, string>;
  hlc: string;
  timestamp: number;
}

export class UndoManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxDepth: number;
  private listeners: Set<() => void> = new Set();

  constructor(maxDepth: number = 100) {
    this.maxDepth = maxDepth;
  }

  public record(entry: HistoryEntry): void {
    if (this.undoStack.length >= this.maxDepth) {
      this.undoStack.shift();
    }
    this.undoStack.push(entry);
    this.redoStack = []; // Clear redo stack on new action
    this.notify();
  }

  public popUndo(): HistoryEntry | null {
    const entry = this.undoStack.pop();
    if (entry) {
      this.redoStack.push(entry);
      this.notify();
      return entry;
    }
    return null;
  }

  public popRedo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (entry) {
      this.undoStack.push(entry);
      this.notify();
      return entry;
    }
    return null;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  public onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch (e) {
        console.error('[syncloom] error in undo manager listener', e);
      }
    }
  }
}
