package hub

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alexandrmotologa/syncloom/internal/crdt"
)

func TestRoomSubscriptionAndDispatch(t *testing.T) {
	hub := NewHub("server-hub", 100)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	clientA := &Client{
		ID:            "client-a",
		TenantID:      "default",
		UserID:        "user-a",
		Hub:           hub,
		Send:          make(chan []byte, 10),
		Subscriptions: make(map[string]bool),
	}
	clientB := &Client{
		ID:            "client-b",
		TenantID:      "default",
		UserID:        "user-b",
		Hub:           hub,
		Send:          make(chan []byte, 10),
		Subscriptions: make(map[string]bool),
	}

	hub.Register(clientA)
	hub.Register(clientB)

	// Subscribe clientA to "tasks", clientB to "projects"
	hub.Rooms.Subscribe("tasks", clientA)
	hub.Rooms.Subscribe("projects", clientB)

	deltaTask := crdt.RowDelta{
		Table:      "tasks",
		PrimaryKey: "task-1",
		Operation:  crdt.OpInsert,
		Columns:    map[string]any{"title": "Task One"},
		Timestamp:  hub.Clock.Now(),
		NodeID:     "server-hub",
	}

	hub.Broadcast(deltaTask)

	// Client A should receive the delta
	select {
	case msg := <-clientA.Send:
		var out OutboundMessage
		if err := json.Unmarshal(msg, &out); err != nil {
			t.Fatalf("failed to parse message: %v", err)
		}
		if out.Type != "delta" || out.Delta.PrimaryKey != "task-1" {
			t.Fatalf("unexpected message on clientA: %+v", out)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timeout waiting for delta on clientA")
	}

	// Client B should NOT receive tasks delta
	select {
	case msg := <-clientB.Send:
		t.Fatalf("clientB should not have received delta for tasks: %s", string(msg))
	case <-time.After(50 * time.Millisecond):
		// Expected: no message
	}

	// Unregister
	hub.Unregister(clientA)
	hub.Unregister(clientB)

	metrics := hub.Metrics()
	if metrics.ConnectedClients != 0 {
		t.Fatalf("expected 0 connected clients after unregister")
	}
}

func TestClientMutationAndFanOut(t *testing.T) {
	hub := NewHub("server-hub", 100)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	client1 := &Client{
		ID:            "peer-1",
		TenantID:      "default",
		UserID:        "user-1",
		Hub:           hub,
		Send:          make(chan []byte, 10),
		Subscriptions: make(map[string]bool),
	}
	client2 := &Client{
		ID:            "peer-2",
		TenantID:      "default",
		UserID:        "user-2",
		Hub:           hub,
		Send:          make(chan []byte, 10),
		Subscriptions: make(map[string]bool),
	}

	hub.Register(client1)
	hub.Register(client2)

	hub.Rooms.Subscribe("notes", client1)
	hub.Rooms.Subscribe("notes", client2)

	mutationDelta := crdt.RowDelta{
		Table:      "notes",
		PrimaryKey: "note-1",
		Operation:  crdt.OpInsert,
		Columns:    map[string]any{"body": "Hello Local First"},
		Timestamp:  hub.Clock.Now(),
		NodeID:     "peer-1",
	}

	hub.HandleClientMutation(client1, "mut-101", mutationDelta)

	// Client 1 should receive ACK
	select {
	case msg := <-client1.Send:
		var out OutboundMessage
		if err := json.Unmarshal(msg, &out); err != nil {
			t.Fatalf("failed to unmarshal ack: %v", err)
		}
		if out.Type != "ack" || out.MutationID != "mut-101" || !out.Applied {
			t.Fatalf("unexpected ack response: %+v", out)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timed out waiting for ack")
	}

	// Client 2 should receive fan-out delta
	select {
	case msg := <-client2.Send:
		var out OutboundMessage
		if err := json.Unmarshal(msg, &out); err != nil {
			t.Fatalf("failed to unmarshal fanout delta: %v", err)
		}
		if out.Type != "delta" || out.Delta.Columns["body"] != "Hello Local First" {
			t.Fatalf("unexpected fanout delta on client 2: %+v", out)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timed out waiting for fan-out delta on client 2")
	}
}

func TestTenantIsolationAndRLS(t *testing.T) {
	hub := NewHub("server-hub", 100)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	clientAcme := &Client{
		ID:            "peer-acme",
		TenantID:      "tenant-acme",
		UserID:        "alice",
		Hub:           hub,
		Send:          make(chan []byte, 10),
		Subscriptions: make(map[string]bool),
	}
	clientGlobex := &Client{
		ID:            "peer-globex",
		TenantID:      "tenant-globex",
		UserID:        "bob",
		Hub:           hub,
		Send:          make(chan []byte, 10),
		Subscriptions: make(map[string]bool),
	}

	hub.Register(clientAcme)
	hub.Register(clientGlobex)

	hub.Rooms.Subscribe("documents", clientAcme)
	hub.Rooms.Subscribe("documents", clientGlobex)

	// Broadcast document belonging to tenant-acme
	acmeDoc := crdt.RowDelta{
		Table:      "documents",
		PrimaryKey: "doc-1",
		Operation:  crdt.OpInsert,
		Columns: map[string]any{
			"tenant_id": "tenant-acme",
			"title":     "Confidential Acme Strategy",
		},
		Timestamp: hub.Clock.Now(),
		NodeID:    "server-hub",
	}

	hub.Broadcast(acmeDoc)

	// Acme client must receive it
	select {
	case msg := <-clientAcme.Send:
		var out OutboundMessage
		if err := json.Unmarshal(msg, &out); err != nil {
			t.Fatalf("failed to parse message: %v", err)
		}
		if out.Delta.Columns["title"] != "Confidential Acme Strategy" {
			t.Fatalf("unexpected delta content")
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timed out waiting for acme client delta")
	}

	// Globex client must NOT receive Acme's confidential document
	select {
	case msg := <-clientGlobex.Send:
		t.Fatalf("security violation: cross-tenant data leaked to globex: %s", string(msg))
	case <-time.After(50 * time.Millisecond):
		// Success: no data leaked
	}
}
