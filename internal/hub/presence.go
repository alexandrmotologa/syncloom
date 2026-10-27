package hub

import (
	"sync"
	"time"
)

// PeerPresence represents transient collaborative state of a connected user.
type PeerPresence struct {
	ClientID   string    `json:"clientId"`
	User       string    `json:"user"`
	Table      string    `json:"table"`
	PrimaryKey string    `json:"primaryKey,omitempty"`
	Field      string    `json:"field,omitempty"`
	Typing     bool      `json:"typing"`
	Color      string    `json:"color"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// PresenceManager coordinates ephemeral collaborative states across rooms without disk overhead.
type PresenceManager struct {
	mu       sync.RWMutex
	presence map[string]map[string]*PeerPresence // table -> clientID -> presence
}

// NewPresenceManager initializes a presence manager.
func NewPresenceManager() *PresenceManager {
	return &PresenceManager{
		presence: make(map[string]map[string]*PeerPresence),
	}
}

// Update updates or inserts peer presence for a table room.
func (pm *PresenceManager) Update(table string, p PeerPresence) []PeerPresence {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if _, ok := pm.presence[table]; !ok {
		pm.presence[table] = make(map[string]*PeerPresence)
	}

	p.UpdatedAt = time.Now().UTC()
	if p.Color == "" {
		p.Color = pickColor(p.ClientID)
	}

	pm.presence[table][p.ClientID] = &p
	return pm.getRoomPresenceLocked(table)
}

// RemoveClient cleans up all presence entries for a disconnecting client.
func (pm *PresenceManager) RemoveClient(clientID string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for table, peers := range pm.presence {
		delete(peers, clientID)
		if len(peers) == 0 {
			delete(pm.presence, table)
		}
	}
}

// GetRoomPresence returns active peer presences in a given table room.
func (pm *PresenceManager) GetRoomPresence(table string) []PeerPresence {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return pm.getRoomPresenceLocked(table)
}

func (pm *PresenceManager) getRoomPresenceLocked(table string) []PeerPresence {
	peers, ok := pm.presence[table]
	if !ok {
		return []PeerPresence{}
	}

	now := time.Now().UTC()
	result := make([]PeerPresence, 0, len(peers))

	for id, p := range peers {
		// Evict stale presences older than 30 seconds
		if now.Sub(p.UpdatedAt) > 30*time.Second {
			delete(peers, id)
			continue
		}
		result = append(result, *p)
	}

	return result
}

// pickColor deterministically assigns a brand accent color to a client ID.
func pickColor(id string) string {
	colors := []string{
		"#06b6d4", // cyan
		"#3b82f6", // blue
		"#10b981", // emerald
		"#8b5cf6", // purple
		"#f59e0b", // amber
		"#f43f5e", // rose
	}
	hash := 0
	for _, c := range id {
		hash = (hash*31 + int(c)) % len(colors)
	}
	if hash < 0 {
		hash = -hash
	}
	return colors[hash]
}
