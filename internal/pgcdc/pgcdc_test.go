package pgcdc

import (
	"testing"

	"github.com/alexandrmotologa/syncloom/internal/crdt"
)

func TestStandaloneCDCAndListeners(t *testing.T) {
	cdc := NewStandaloneCDC("server-node")

	receivedCount := 0
	var lastDelta crdt.RowDelta

	cdc.AddListener(func(d crdt.RowDelta) {
		receivedCount++
		lastDelta = d
	})

	delta := cdc.ApplyMutation("tasks", "task-99", crdt.OpInsert, map[string]any{
		"id":    "task-99",
		"title": "Newly created task",
	}, crdt.ZeroTimestamp())

	if receivedCount != 1 {
		t.Fatalf("expected 1 delta dispatched, got %d", receivedCount)
	}
	if lastDelta.PrimaryKey != "task-99" {
		t.Fatalf("expected primary key task-99, got %s", lastDelta.PrimaryKey)
	}
	if delta.Columns["title"] != "Newly created task" {
		t.Fatalf("unexpected delta column: %v", delta.Columns)
	}

	// Verify table stats
	stats := cdc.TableStats()
	if stats["tasks"] < 6 {
		t.Fatalf("expected at least 6 tasks in stats, got %d", stats["tasks"])
	}

	// Verify table data
	rows := cdc.GetTableData("tasks")
	found := false
	for _, r := range rows {
		if r["id"] == "task-99" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("task-99 not found in table data query")
	}

	// Delete task
	delDelta := cdc.ApplyMutation("tasks", "task-99", crdt.OpDelete, nil, crdt.ZeroTimestamp())
	if delDelta.Operation != crdt.OpDelete {
		t.Fatalf("expected OpDelete")
	}

	// Row should not be returned in GetTableData
	rowsAfterDel := cdc.GetTableData("tasks")
	for _, r := range rowsAfterDel {
		if r["id"] == "task-99" {
			t.Fatalf("deleted task-99 should not appear in GetTableData")
		}
	}
}

func TestWALTracker(t *testing.T) {
	tracker := NewWALTracker(100)
	tracker.AdvanceWritten(200)
	tracker.AdvanceFlushed(150)
	tracker.AdvanceApplied(120)

	w, f, a := tracker.Status()
	if w != 200 || f != 150 || a != 120 {
		t.Fatalf("unexpected tracker status: written=%d, flushed=%d, applied=%d", w, f, a)
	}

	// Monotonicity: smaller LSN should not regress
	tracker.AdvanceWritten(180)
	w, _, _ = tracker.Status()
	if w != 200 {
		t.Fatalf("written LSN regressed: %d", w)
	}
}

func TestParserRelationRegistration(t *testing.T) {
	parser := NewParser("test-node")

	rel := &RelationSchema{
		ID:        42,
		Namespace: "public",
		Name:      "orders",
		Columns: []ColumnDefinition{
			{Name: "id", DataType: 23, IsPK: true},
			{Name: "amount", DataType: 1700, IsPK: false},
		},
	}

	parser.RegisterRelation(rel)

	cached, ok := parser.GetRelation(42)
	if !ok || cached.Name != "orders" {
		t.Fatalf("failed to retrieve registered relation")
	}
}
