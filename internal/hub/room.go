package hub

import (
	"sync"
)

// Subscription represents a client's interest in a table and optional column/row filter.
type Subscription struct {
	Table  string         `json:"table"`
	Filter map[string]any `json:"filter,omitempty"`
}

// RoomManager maintains table-level and filtered client subscription mappings.
type RoomManager struct {
	mu            sync.RWMutex
	subscriptions map[string]map[string]*Client // table -> clientID -> *Client
}

// NewRoomManager creates a subscription registry.
func NewRoomManager() *RoomManager {
	return &RoomManager{
		subscriptions: make(map[string]map[string]*Client),
	}
}

// Subscribe adds a client to a table stream.
func (r *RoomManager) Subscribe(table string, client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.subscriptions[table]; !ok {
		r.subscriptions[table] = make(map[string]*Client)
	}
	r.subscriptions[table][client.ID] = client
}

// Unsubscribe removes a client from a table stream.
func (r *RoomManager) Unsubscribe(table string, clientID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if clients, ok := r.subscriptions[table]; ok {
		delete(clients, clientID)
		if len(clients) == 0 {
			delete(r.subscriptions, table)
		}
	}
}

// RemoveClient removes a client from all subscriptions.
func (r *RoomManager) RemoveClient(clientID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for table, clients := range r.subscriptions {
		delete(clients, clientID)
		if len(clients) == 0 {
			delete(r.subscriptions, table)
		}
	}
}

// GetSubscribers returns all active clients subscribed to a specific table.
func (r *RoomManager) GetSubscribers(table string) []*Client {
	r.mu.RLock()
	defer r.mu.RUnlock()

	clients, ok := r.subscriptions[table]
	if !ok {
		// If table has no direct subscribers, check wildcard "*"
		if wild, ok := r.subscriptions["*"]; ok {
			res := make([]*Client, 0, len(wild))
			for _, c := range wild {
				res = append(res, c)
			}
			return res
		}
		return nil
	}

	res := make([]*Client, 0, len(clients))
	for _, c := range clients {
		res = append(res, c)
	}

	// Also include wildcard subscribers
	if wild, ok := r.subscriptions["*"]; ok {
		for id, c := range wild {
			if _, exists := clients[id]; !exists {
				res = append(res, c)
			}
		}
	}

	return res
}

// ActiveTables returns list of all currently subscribed table names.
func (r *RoomManager) ActiveTables() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	tables := make([]string, 0, len(r.subscriptions))
	for tbl := range r.subscriptions {
		tables = append(tables, tbl)
	}
	return tables
}
