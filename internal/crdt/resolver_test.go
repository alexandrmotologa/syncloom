package crdt

import (
	"testing"
	"time"
)

func TestHLCMonotonicityAndClockDrift(t *testing.T) {
	nodeA := NewClock("client-a")
	nodeB := NewClock("client-b")

	// Fixed time generator for testing
	simulatedTime := time.UnixMilli(1700000000000)
	nodeA.SetTimeSource(func() time.Time { return simulatedTime })
	nodeB.SetTimeSource(func() time.Time { return simulatedTime })

	t1 := nodeA.Now()
	t2 := nodeA.Now()
	if !t2.After(t1) {
		t.Fatalf("expected t2 (%s) > t1 (%s)", t2, t1)
	}
	if t2.Millis != t1.Millis || t2.Counter != t1.Counter+1 {
		t.Fatalf("expected counter increment on same millisecond: %+v vs %+v", t1, t2)
	}

	// Remote update from nodeA to nodeB
	tB := nodeB.Update(t2)
	if !tB.After(t2) {
		t.Fatalf("expected nodeB updated timestamp (%s) > nodeA (%s)", tB, t2)
	}

	// Simulate wall clock jumping backward (clock skew)
	nodeA.SetTimeSource(func() time.Time { return simulatedTime.Add(-5 * time.Second) })
	tBackward := nodeA.Now()
	if !tBackward.After(t2) {
		t.Fatalf("clock jumped backwards but HLC must stay monotonic: %s vs %s", tBackward, t2)
	}
}

func TestFieldLevelLWWNonConflictingColumns(t *testing.T) {
	resolver := NewResolver(100)

	clockA := NewClock("client-a")
	clockB := NewClock("client-b")

	t0 := time.UnixMilli(1700000000000)
	clockA.SetTimeSource(func() time.Time { return t0 })
	clockB.SetTimeSource(func() time.Time { return t0.Add(5 * time.Millisecond) })

	// Initial insert from Client A
	tsA := clockA.Now()
	initialDelta := RowDelta{
		Table:      "tasks",
		PrimaryKey: "task-101",
		Operation:  OpInsert,
		Columns: map[string]any{
			"title":    "Initial Task",
			"status":   "todo",
			"assignee": "Alex",
		},
		ColMeta: map[string]Timestamp{
			"title":    tsA,
			"status":   tsA,
			"assignee": tsA,
		},
		Timestamp: tsA,
		NodeID:    "client-a",
	}

	res1 := resolver.Merge(nil, initialDelta)
	if res1.Merged == nil || res1.Merged.Columns["title"] != "Initial Task" {
		t.Fatalf("initial insert failed: %+v", res1)
	}

	// Client A modifies "title" concurrently while offline
	tsA2 := clockA.Now()
	deltaA := RowDelta{
		Table:      "tasks",
		PrimaryKey: "task-101",
		Operation:  OpUpdate,
		Columns: map[string]any{
			"title": "Refined Title by A",
		},
		ColMeta: map[string]Timestamp{
			"title": tsA2,
		},
		Timestamp: tsA2,
		NodeID:    "client-a",
	}

	// Client B modifies "status" concurrently while offline
	tsB := clockB.Now()
	deltaB := RowDelta{
		Table:      "tasks",
		PrimaryKey: "task-101",
		Operation:  OpUpdate,
		Columns: map[string]any{
			"status": "in_progress",
		},
		ColMeta: map[string]Timestamp{
			"status": tsB,
		},
		Timestamp: tsB,
		NodeID:    "client-b",
	}

	// Merge deltaA first, then deltaB
	mergedA := resolver.Merge(res1.Merged, deltaA)
	finalMerge := resolver.Merge(mergedA.Merged, deltaB)

	// In field-level CRDT, both non-conflicting fields must coexist!
	if finalMerge.Merged.Columns["title"] != "Refined Title by A" {
		t.Fatalf("expected title to be 'Refined Title by A', got %v", finalMerge.Merged.Columns["title"])
	}
	if finalMerge.Merged.Columns["status"] != "in_progress" {
		t.Fatalf("expected status to be 'in_progress', got %v", finalMerge.Merged.Columns["status"])
	}
	if finalMerge.Merged.Columns["assignee"] != "Alex" {
		t.Fatalf("expected unmodified field 'assignee' to remain 'Alex', got %v", finalMerge.Merged.Columns["assignee"])
	}
}

func TestFieldLevelLWWCollidingColumns(t *testing.T) {
	resolver := NewResolver(100)

	clockA := NewClock("client-a")
	clockB := NewClock("client-b")

	t0 := time.UnixMilli(1700000000000)
	clockA.SetTimeSource(func() time.Time { return t0 })
	clockB.SetTimeSource(func() time.Time { return t0.Add(50 * time.Millisecond) })

	tsA := clockA.Now()
	tsB := clockB.Now() // strictly newer HLC

	initialDelta := RowDelta{
		Table:      "issues",
		PrimaryKey: "issue-1",
		Operation:  OpInsert,
		Columns: map[string]any{
			"priority": "low",
		},
		ColMeta: map[string]Timestamp{
			"priority": tsA,
		},
		Timestamp: tsA,
		NodeID:    "client-a",
	}

	res := resolver.Merge(nil, initialDelta)

	// Both update "priority": Client A updates to "medium" with tsA2, Client B updates to "high" with tsB
	tsA2 := clockA.Now() // tsA2 is still before tsB because clockB was set 50ms ahead
	deltaA := RowDelta{
		Table:      "issues",
		PrimaryKey: "issue-1",
		Operation:  OpUpdate,
		Columns:    map[string]any{"priority": "medium"},
		ColMeta:    map[string]Timestamp{"priority": tsA2},
		Timestamp:  tsA2,
		NodeID:     "client-a",
	}

	deltaB := RowDelta{
		Table:      "issues",
		PrimaryKey: "issue-1",
		Operation:  OpUpdate,
		Columns:    map[string]any{"priority": "urgent"},
		ColMeta:    map[string]Timestamp{"priority": tsB},
		Timestamp:  tsB,
		NodeID:     "client-b",
	}

	// Commutativity test: Order 1 (A then B)
	step1 := resolver.Merge(res.Merged, deltaA)
	order1 := resolver.Merge(step1.Merged, deltaB)

	// Commutativity test: Order 2 (B then A)
	step2 := resolver.Merge(res.Merged, deltaB)
	order2 := resolver.Merge(step2.Merged, deltaA)

	if order1.Merged.Columns["priority"] != "urgent" {
		t.Fatalf("expected B's newer priority 'urgent' to win in order 1, got %v", order1.Merged.Columns["priority"])
	}
	if order2.Merged.Columns["priority"] != "urgent" {
		t.Fatalf("expected B's newer priority 'urgent' to win in order 2, got %v", order2.Merged.Columns["priority"])
	}

	// Verify conflict was recorded
	if resolver.ConflictCount() == 0 {
		t.Fatalf("expected conflict record to be logged")
	}
}

func TestDeleteAndResurrectionSemantics(t *testing.T) {
	resolver := NewResolver(100)
	clock := NewClock("client-main")

	t0 := clock.Now()
	row := resolver.Merge(nil, RowDelta{
		Table:      "docs",
		PrimaryKey: "doc-1",
		Operation:  OpInsert,
		Columns:    map[string]any{"content": "Draft 1"},
		Timestamp:  t0,
		NodeID:     "client-main",
	}).Merged

	// Delete row
	tDel := clock.Now()
	resDel := resolver.Merge(row, RowDelta{
		Table:      "docs",
		PrimaryKey: "doc-1",
		Operation:  OpDelete,
		Timestamp:  tDel,
		NodeID:     "client-main",
	})
	if !resDel.Merged.Deleted {
		t.Fatalf("expected row to be marked deleted")
	}

	// Stale edit arriving after delete
	tStale := t0
	resStale := resolver.Merge(resDel.Merged, RowDelta{
		Table:      "docs",
		PrimaryKey: "doc-1",
		Operation:  OpUpdate,
		Columns:    map[string]any{"content": "Stale Edit"},
		Timestamp:  tStale,
		NodeID:     "client-main",
	})
	if !resStale.Merged.Deleted {
		t.Fatalf("expected stale edit to NOT resurrect row")
	}

	// Fresh edit with newer timestamp resurrects row
	tFresh := clock.Now()
	resFresh := resolver.Merge(resDel.Merged, RowDelta{
		Table:      "docs",
		PrimaryKey: "doc-1",
		Operation:  OpUpdate,
		Columns:    map[string]any{"content": "Resurrected Document"},
		Timestamp:  tFresh,
		NodeID:     "client-main",
	})
	if resFresh.Merged.Deleted {
		t.Fatalf("expected fresh edit to resurrect row")
	}
	if resFresh.Merged.Columns["content"] != "Resurrected Document" {
		t.Fatalf("expected content to be 'Resurrected Document'")
	}
}
