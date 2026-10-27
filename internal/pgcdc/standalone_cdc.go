package pgcdc

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/alexandrmotologa/syncloom/internal/crdt"
	"github.com/google/uuid"
)

// StandaloneCDC provides an embedded CDC and state engine for demo mode and local testing.
type StandaloneCDC struct {
	mu        sync.RWMutex
	clock     *crdt.Clock
	tables    map[string]map[string]*crdt.RowState
	listeners []DeltaListener
	running   bool
	cancel    context.CancelFunc
}

// NewStandaloneCDC creates a new standalone CDC engine with seeded demo tables.
func NewStandaloneCDC(nodeID string) *StandaloneCDC {
	cdc := &StandaloneCDC{
		clock:     crdt.NewClock(nodeID),
		tables:    make(map[string]map[string]*crdt.RowState),
		listeners: make([]DeltaListener, 0),
	}

	cdc.seedDemoData()
	return cdc
}

// seedDemoData populates default tables (e.g. "tasks", "projects", "notes") for immediate demonstration.
func (s *StandaloneCDC) seedDemoData() {
	s.tables["tasks"] = make(map[string]*crdt.RowState)
	s.tables["projects"] = make(map[string]*crdt.RowState)

	initialTasks := []struct {
		id       string
		title    string
		status   string
		priority string
		assignee string
	}{
		{"task-1", "Local-first SQLite architecture with OPFS", "in_progress", "urgent", "Alex"},
		{"task-2", "Implement PostgreSQL pgoutput logical replication", "done", "high", "Elena"},
		{"task-3", "Hybrid Logical Clock conflict resolution", "done", "urgent", "Alex"},
		{"task-4", "WebSocket delta fan-out broadcaster", "in_progress", "medium", "Marcus"},
		{"task-5", "Offline FIFO mutation queue with rollback", "todo", "high", "Sarah"},
	}

	t0 := s.clock.Now()
	for _, itm := range initialTasks {
		s.tables["tasks"][itm.id] = &crdt.RowState{
			Table:      "tasks",
			PrimaryKey: itm.id,
			Columns: map[string]any{
				"id":       itm.id,
				"title":    itm.title,
				"status":   itm.status,
				"priority": itm.priority,
				"assignee": itm.assignee,
			},
			ColMeta: map[string]crdt.Timestamp{
				"id":       t0,
				"title":    t0,
				"status":   t0,
				"priority": t0,
				"assignee": t0,
			},
			Deleted:   false,
			UpdatedAt: t0,
		}
	}
}

// AddListener registers a subscriber for CDC deltas.
func (s *StandaloneCDC) AddListener(fn DeltaListener) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.listeners = append(s.listeners, fn)
}

// ApplyMutation applies a local or client mutation to the in-memory state and broadcasts the delta.
func (s *StandaloneCDC) ApplyMutation(table, pk string, op crdt.Operation, cols map[string]any, hlc crdt.Timestamp) crdt.RowDelta {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.tables[table]; !ok {
		s.tables[table] = make(map[string]*crdt.RowState)
	}

	if hlc.Equal(crdt.ZeroTimestamp()) {
		hlc = s.clock.Now()
	} else {
		hlc = s.clock.Update(hlc)
	}

	colMeta := make(map[string]crdt.Timestamp, len(cols))
	for k := range cols {
		colMeta[k] = hlc
	}

	delta := crdt.RowDelta{
		ID:         uuid.New().String(),
		Table:      table,
		PrimaryKey: pk,
		Operation:  op,
		Columns:    cols,
		ColMeta:    colMeta,
		Timestamp:  hlc,
		NodeID:     s.clock.NodeID(),
		CreatedAt:  time.Now().UnixMilli(),
	}

	// Update in-memory state
	if op == crdt.OpDelete {
		if existing, ok := s.tables[table][pk]; ok {
			existing.Deleted = true
			existing.DeletedAt = hlc
			existing.UpdatedAt = hlc
		}
	} else {
		existing, ok := s.tables[table][pk]
		if !ok {
			s.tables[table][pk] = &crdt.RowState{
				Table:      table,
				PrimaryKey: pk,
				Columns:    cols,
				ColMeta:    colMeta,
				Deleted:    false,
				UpdatedAt:  hlc,
			}
		} else {
			for k, v := range cols {
				existing.Columns[k] = v
				existing.ColMeta[k] = hlc
			}
			existing.Deleted = false
			existing.UpdatedAt = hlc
		}
	}

	s.dispatch(delta)
	return delta
}

// dispatch sends the delta to all registered listeners.
func (s *StandaloneCDC) dispatch(d crdt.RowDelta) {
	for _, l := range s.listeners {
		l(d)
	}
}

// GetTableData returns all non-deleted rows for a given table.
func (s *StandaloneCDC) GetTableData(table string) []map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, ok := s.tables[table]
	if !ok {
		return []map[string]any{}
	}

	result := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		if !r.Deleted {
			rowCopy := make(map[string]any, len(r.Columns)+1)
			for k, v := range r.Columns {
				rowCopy[k] = v
			}
			rowCopy["_hlc"] = r.UpdatedAt.String()
			result = append(result, rowCopy)
		}
	}
	return result
}

// TableStats returns row counts for all managed tables.
func (s *StandaloneCDC) TableStats() map[string]int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := make(map[string]int, len(s.tables))
	for tbl, rows := range s.tables {
		count := 0
		for _, r := range rows {
			if !r.Deleted {
				count++
			}
		}
		stats[tbl] = count
	}
	return stats
}

// StartSimulatedTraffic starts a background routine emitting periodic background edits for demo mode.
func (s *StandaloneCDC) StartSimulatedTraffic(ctx context.Context, interval time.Duration) {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	runCtx, cancel := context.WithCancel(ctx)
	s.cancel = cancel
	s.mu.Unlock()

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		statuses := []string{"todo", "in_progress", "done"}
		priorities := []string{"low", "medium", "high", "urgent"}

		for {
			select {
			case <-runCtx.Done():
				return
			case <-ticker.C:
				taskID := fmt.Sprintf("task-%d", rand.Intn(5)+1)
				newStatus := statuses[rand.Intn(len(statuses))]
				newPriority := priorities[rand.Intn(len(priorities))]

				s.ApplyMutation("tasks", taskID, crdt.OpUpdate, map[string]any{
					"status":   newStatus,
					"priority": newPriority,
				}, crdt.ZeroTimestamp())
			}
		}
	}()
}

// Stop terminates background simulated traffic.
func (s *StandaloneCDC) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	s.running = false
}
