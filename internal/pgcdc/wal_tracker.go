package pgcdc

import (
	"sync"

	"github.com/jackc/pglogrepl"
)

// WALTracker safely manages confirmed and written Log Sequence Numbers (LSN).
type WALTracker struct {
	mu           sync.RWMutex
	writtenLSN   pglogrepl.LSN
	flushedLSN   pglogrepl.LSN
	appliedLSN   pglogrepl.LSN
}

// NewWALTracker initializes a tracker starting at LSN 0.
func NewWALTracker(initialLSN pglogrepl.LSN) *WALTracker {
	return &WALTracker{
		writtenLSN: initialLSN,
		flushedLSN: initialLSN,
		appliedLSN: initialLSN,
	}
}

// AdvanceWritten updates the written LSN if the new LSN is greater.
func (w *WALTracker) AdvanceWritten(lsn pglogrepl.LSN) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if lsn > w.writtenLSN {
		w.writtenLSN = lsn
	}
}

// AdvanceFlushed updates the flushed LSN if the new LSN is greater.
func (w *WALTracker) AdvanceFlushed(lsn pglogrepl.LSN) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if lsn > w.flushedLSN {
		w.flushedLSN = lsn
	}
}

// AdvanceApplied updates the applied LSN if the new LSN is greater.
func (w *WALTracker) AdvanceApplied(lsn pglogrepl.LSN) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if lsn > w.appliedLSN {
		w.appliedLSN = lsn
	}
}

// Status returns current written, flushed, and applied LSN values.
func (w *WALTracker) Status() (written, flushed, applied pglogrepl.LSN) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.writtenLSN, w.flushedLSN, w.appliedLSN
}
