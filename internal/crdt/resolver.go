package crdt

import (
	"fmt"
	"reflect"
	"sync"
	"time"

	"github.com/google/uuid"
)

// RowState represents the current resolved in-memory or persisted row.
type RowState struct {
	Table      string               `json:"table"`
	PrimaryKey string               `json:"primaryKey"`
	Columns    map[string]any       `json:"columns"`
	ColMeta    map[string]Timestamp `json:"colMeta"`
	Deleted    bool                 `json:"deleted"`
	DeletedAt  Timestamp            `json:"deletedAt"`
	UpdatedAt  Timestamp            `json:"updatedAt"`
}

// Clone creates a deep copy of RowState.
func (r *RowState) Clone() *RowState {
	cols := make(map[string]any, len(r.Columns))
	for k, v := range r.Columns {
		cols[k] = v
	}
	meta := make(map[string]Timestamp, len(r.ColMeta))
	for k, v := range r.ColMeta {
		meta[k] = v
	}
	return &RowState{
		Table:      r.Table,
		PrimaryKey: r.PrimaryKey,
		Columns:    cols,
		ColMeta:    meta,
		Deleted:    r.Deleted,
		DeletedAt:  r.DeletedAt,
		UpdatedAt:  r.UpdatedAt,
	}
}

// Resolver applies CRDT field-level Last-Write-Wins (LWW) resolution rules.
type Resolver struct {
	mu            sync.RWMutex
	conflictLog   []ConflictRecord
	maxLogEntries int
}

// NewResolver initializes a new CRDT resolver with bounded conflict history.
func NewResolver(maxLogEntries int) *Resolver {
	if maxLogEntries <= 0 {
		maxLogEntries = 1000
	}
	return &Resolver{
		conflictLog:   make([]ConflictRecord, 0, maxLogEntries),
		maxLogEntries: maxLogEntries,
	}
}

// MergeResult encapsulates the outcome of a merge operation.
type MergeResult struct {
	Merged     *RowState
	Conflicts  []ConflictRecord
	Applied    bool
	Resurrect  bool
	WasDeleted bool
}

// Merge applies an incoming RowDelta onto an existing RowState according to LWW rules.
func (r *Resolver) Merge(existing *RowState, delta RowDelta) MergeResult {
	r.mu.Lock()
	defer r.mu.Unlock()

	var conflicts []ConflictRecord

	// If no existing row, create from incoming delta
	if existing == nil {
		cols := make(map[string]any, len(delta.Columns))
		meta := make(map[string]Timestamp, len(delta.ColMeta))

		for k, v := range delta.Columns {
			cols[k] = v
			if t, ok := delta.ColMeta[k]; ok {
				meta[k] = t
			} else {
				meta[k] = delta.Timestamp
			}
		}

		isDel := delta.Operation == OpDelete
		var delAt Timestamp
		if isDel {
			delAt = delta.Timestamp
		}

		merged := &RowState{
			Table:      delta.Table,
			PrimaryKey: delta.PrimaryKey,
			Columns:    cols,
			ColMeta:    meta,
			Deleted:    isDel,
			DeletedAt:  delAt,
			UpdatedAt:  delta.Timestamp,
		}

		return MergeResult{
			Merged:     merged,
			Conflicts:  nil,
			Applied:    true,
			Resurrect:  false,
			WasDeleted: isDel,
		}
	}

	merged := existing.Clone()

	// Case 1: Incoming operation is DELETE
	if delta.Operation == OpDelete {
		if merged.Deleted {
			// Already deleted: later timestamp sets final DeletedAt
			if delta.Timestamp.After(merged.DeletedAt) {
				merged.DeletedAt = delta.Timestamp
				merged.UpdatedAt = delta.Timestamp
			}
			return MergeResult{
				Merged:     merged,
				Conflicts:  nil,
				Applied:    false,
				WasDeleted: true,
			}
		}

		// Delete wins if its timestamp is equal or newer than the row's latest update
		if delta.Timestamp.After(merged.UpdatedAt) || delta.Timestamp.Equal(merged.UpdatedAt) {
			merged.Deleted = true
			merged.DeletedAt = delta.Timestamp
			merged.UpdatedAt = delta.Timestamp
			return MergeResult{
				Merged:     merged,
				Conflicts:  nil,
				Applied:    true,
				WasDeleted: true,
			}
		}

		// Row update is newer than delete: update wins over old delete
		conflict := ConflictRecord{
			ID:          uuid.New().String(),
			Table:       delta.Table,
			PrimaryKey:  delta.PrimaryKey,
			Column:      "*row*",
			WinnerNode:  merged.UpdatedAt.NodeID,
			LoserNode:   delta.Timestamp.NodeID,
			WinnerHLC:   merged.UpdatedAt,
			LoserHLC:    delta.Timestamp,
			WinnerValue: "ALIVE",
			LoserValue:  "DELETE",
			ResolvedAt:  time.Now().UTC(),
			Resolution:  "UPDATE_WINS_OVER_STALE_DELETE",
		}
		conflicts = append(conflicts, conflict)
		r.recordConflict(conflict)

		return MergeResult{
			Merged:    merged,
			Conflicts: conflicts,
			Applied:   false,
		}
	}

	// Case 2: Incoming operation is INSERT or UPDATE
	resurrected := false
	if merged.Deleted {
		if delta.Timestamp.After(merged.DeletedAt) {
			// Mutation strictly after delete resurrects the row
			merged.Deleted = false
			resurrected = true
		} else {
			// Row was deleted with a timestamp newer than or equal to this edit: delete retains
			conflict := ConflictRecord{
				ID:          uuid.New().String(),
				Table:       delta.Table,
				PrimaryKey:  delta.PrimaryKey,
				Column:      "*row*",
				WinnerNode:  merged.DeletedAt.NodeID,
				LoserNode:   delta.Timestamp.NodeID,
				WinnerHLC:   merged.DeletedAt,
				LoserHLC:    delta.Timestamp,
				WinnerValue: "DELETED",
				LoserValue:  "UPDATE",
				ResolvedAt:  time.Now().UTC(),
				Resolution:  "DELETE_WINS_OVER_PRIOR_UPDATE",
			}
			conflicts = append(conflicts, conflict)
			r.recordConflict(conflict)

			return MergeResult{
				Merged:     merged,
				Conflicts:  conflicts,
				Applied:    false,
				WasDeleted: true,
			}
		}
	}

	appliedAny := false

	// Column-level Last-Write-Wins (LWW)
	for col, incomingVal := range delta.Columns {
		incomingHLC, hasColHLC := delta.ColMeta[col]
		if !hasColHLC {
			incomingHLC = delta.Timestamp
		}

		existingHLC, hasExistingColHLC := merged.ColMeta[col]
		existingVal, hasExistingVal := merged.Columns[col]

		if !hasExistingVal || !hasExistingColHLC {
			// Brand new column for this row: apply directly
			merged.Columns[col] = incomingVal
			merged.ColMeta[col] = incomingHLC
			appliedAny = true
			continue
		}

		cmp := incomingHLC.Compare(existingHLC)
		if cmp > 0 {
			// Incoming is newer: wins
			if !reflect.DeepEqual(existingVal, incomingVal) {
				conflict := ConflictRecord{
					ID:          uuid.New().String(),
					Table:       delta.Table,
					PrimaryKey:  delta.PrimaryKey,
					Column:      col,
					WinnerNode:  incomingHLC.NodeID,
					LoserNode:   existingHLC.NodeID,
					WinnerHLC:   incomingHLC,
					LoserHLC:    existingHLC,
					WinnerValue: incomingVal,
					LoserValue:  existingVal,
					ResolvedAt:  time.Now().UTC(),
					Resolution:  "INCOMING_LWW_WINNER",
				}
				conflicts = append(conflicts, conflict)
				r.recordConflict(conflict)
			}
			merged.Columns[col] = incomingVal
			merged.ColMeta[col] = incomingHLC
			appliedAny = true
		} else if cmp < 0 {
			// Existing is newer: retains
			if !reflect.DeepEqual(existingVal, incomingVal) {
				conflict := ConflictRecord{
					ID:          uuid.New().String(),
					Table:       delta.Table,
					PrimaryKey:  delta.PrimaryKey,
					Column:      col,
					WinnerNode:  existingHLC.NodeID,
					LoserNode:   incomingHLC.NodeID,
					WinnerHLC:   existingHLC,
					LoserHLC:    incomingHLC,
					WinnerValue: existingVal,
					LoserValue:  incomingVal,
					ResolvedAt:  time.Now().UTC(),
					Resolution:  "EXISTING_LWW_WINNER",
				}
				conflicts = append(conflicts, conflict)
				r.recordConflict(conflict)
			}
		} else {
			// Timestamps are strictly equal: deterministic tie-breaker
			existingStr := fmt.Sprintf("%v", existingVal)
			incomingStr := fmt.Sprintf("%v", incomingVal)
			if incomingStr > existingStr {
				merged.Columns[col] = incomingVal
				merged.ColMeta[col] = incomingHLC
				appliedAny = true
			}
		}
	}

	if delta.Timestamp.After(merged.UpdatedAt) {
		merged.UpdatedAt = delta.Timestamp
	}

	return MergeResult{
		Merged:     merged,
		Conflicts:  conflicts,
		Applied:    appliedAny || resurrected,
		Resurrect:  resurrected,
		WasDeleted: merged.Deleted,
	}
}

// recordConflict appends to the internal circular audit buffer.
func (r *Resolver) recordConflict(c ConflictRecord) {
	if len(r.conflictLog) >= r.maxLogEntries {
		// Evict oldest
		r.conflictLog = r.conflictLog[1:]
	}
	r.conflictLog = append(r.conflictLog, c)
}

// RecentConflicts returns a slice of the most recent resolved conflicts.
func (r *Resolver) RecentConflicts(limit int) []ConflictRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()

	n := len(r.conflictLog)
	if limit <= 0 || limit > n {
		limit = n
	}

	res := make([]ConflictRecord, limit)
	copy(res, r.conflictLog[n-limit:])
	return res
}

// ConflictCount returns total conflicts logged.
func (r *Resolver) ConflictCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.conflictLog)
}
