package hub

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/alexandrmotologa/syncloom/internal/crdt"
	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024 // 512 KB
)

// InboundMessage represents a command received from a WebSocket client.
type InboundMessage struct {
	Type       string         `json:"type"` // "subscribe", "unsubscribe", "mutate", "presence", "ping"
	Table      string         `json:"table,omitempty"`
	Filter     map[string]any `json:"filter,omitempty"`
	Delta      *crdt.RowDelta `json:"delta,omitempty"`
	MutationID string         `json:"mutationId,omitempty"`
	Presence   *PeerPresence  `json:"presence,omitempty"`
}

// OutboundMessage represents a payload dispatched to a WebSocket client.
type OutboundMessage struct {
	Type       string         `json:"type"` // "delta", "ack", "presence", "pong", "error", "sync_state"
	Delta      *crdt.RowDelta `json:"delta,omitempty"`
	MutationID string         `json:"mutationId,omitempty"`
	HLC        string         `json:"hlc,omitempty"`
	Applied    bool           `json:"applied,omitempty"`
	Error      string         `json:"error,omitempty"`
	ServerTime int64          `json:"serverTime,omitempty"`
	Table      string         `json:"table,omitempty"`
	Peers      []PeerPresence `json:"peers,omitempty"`
}

// PeerInfo exposes metadata about a connected client for studio monitoring.
type PeerInfo struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenantId"`
	UserID        string    `json:"userId"`
	RemoteAddr    string    `json:"remoteAddr"`
	UserAgent     string    `json:"userAgent"`
	ConnectedAt   time.Time `json:"connectedAt"`
	LastSeen      time.Time `json:"lastSeen"`
	Subscriptions []string  `json:"subscriptions"`
	DeltasSent    uint64    `json:"deltasSent"`
	MutationsRecv uint64    `json:"mutationsRecv"`
}

// Client models an active WebSocket peer connection.
type Client struct {
	ID            string
	TenantID      string
	UserID        string
	Hub           *Hub
	Conn          *websocket.Conn
	Send          chan []byte
	RemoteAddr    string
	UserAgent     string
	ConnectedAt   time.Time
	LastSeen      time.Time
	Subscriptions map[string]bool
	DeltasSent    uint64
	MutationsRecv uint64
	mu            sync.RWMutex
}

// NewClient initializes a new connected peer.
func NewClient(id string, hub *Hub, conn *websocket.Conn, remoteAddr, userAgent, tenantID, userID string) *Client {
	if tenantID == "" {
		tenantID = "default"
	}
	if userID == "" {
		userID = id
	}
	if conn != nil {
		conn.EnableWriteCompression(true)
	}
	return &Client{
		ID:            id,
		TenantID:      tenantID,
		UserID:        userID,
		Hub:           hub,
		Conn:          conn,
		Send:          make(chan []byte, 256),
		RemoteAddr:    remoteAddr,
		UserAgent:     userAgent,
		ConnectedAt:   time.Now().UTC(),
		LastSeen:      time.Now().UTC(),
		Subscriptions: make(map[string]bool),
	}
}

// ReadPump handles messages received from the WebSocket connection.
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister(c)
		_ = c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		c.mu.Lock()
		c.LastSeen = time.Now().UTC()
		c.mu.Unlock()
		return nil
	})

	for {
		_, payload, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[hub] client %s read error: %v", c.ID, err)
			}
			break
		}

		c.mu.Lock()
		c.LastSeen = time.Now().UTC()
		c.mu.Unlock()

		var msg InboundMessage
		if err := json.Unmarshal(payload, &msg); err != nil {
			c.SendError("invalid json message format")
			continue
		}

		c.handleMessage(msg)
	}
}

// WritePump writes queued outbound messages to the WebSocket client.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.Conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(msg)

			// Drain queued messages into the current frame
			n := len(c.Send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

			c.mu.Lock()
			c.DeltasSent++
			c.mu.Unlock()

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage routes incoming client commands.
func (c *Client) handleMessage(msg InboundMessage) {
	switch msg.Type {
	case "subscribe":
		table := msg.Table
		if table == "" {
			table = "*"
		}
		c.mu.Lock()
		c.Subscriptions[table] = true
		c.mu.Unlock()
		c.Hub.Rooms.Subscribe(table, c)

	case "unsubscribe":
		table := msg.Table
		if table != "" {
			c.mu.Lock()
			delete(c.Subscriptions, table)
			c.mu.Unlock()
			c.Hub.Rooms.Unsubscribe(table, c.ID)
		}

	case "mutate":
		if msg.Delta == nil {
			c.SendError("mutate message requires delta payload")
			return
		}
		c.mu.Lock()
		c.MutationsRecv++
		c.mu.Unlock()
		c.Hub.HandleClientMutation(c, msg.MutationID, *msg.Delta)

	case "presence":
		table := msg.Table
		if table == "" {
			table = "*"
		}
		if msg.Presence != nil {
			msg.Presence.ClientID = c.ID
			c.Hub.BroadcastPresence(table, *msg.Presence)
		}

	case "ping":
		c.SendMessage(OutboundMessage{
			Type:       "pong",
			ServerTime: time.Now().UnixMilli(),
		})
	}
}

// SendMessage enqueues a structured message to be dispatched to this client.
func (c *Client) SendMessage(msg OutboundMessage) {
	bytes, err := json.Marshal(msg)
	if err != nil {
		return
	}

	select {
	case c.Send <- bytes:
	default:
		// Client buffer saturated, drop message or disconnect
		log.Printf("[hub] client %s send buffer saturated, dropping delta", c.ID)
	}
}

// SendError sends an error message to the client.
func (c *Client) SendError(errText string) {
	c.SendMessage(OutboundMessage{
		Type:  "error",
		Error: errText,
	})
}

// Info returns an immutable snapshot of client state for monitoring.
func (c *Client) Info() PeerInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()

	subs := make([]string, 0, len(c.Subscriptions))
	for s := range c.Subscriptions {
		subs = append(subs, s)
	}

	return PeerInfo{
		ID:            c.ID,
		TenantID:      c.TenantID,
		UserID:        c.UserID,
		RemoteAddr:    c.RemoteAddr,
		UserAgent:     c.UserAgent,
		ConnectedAt:   c.ConnectedAt,
		LastSeen:      c.LastSeen,
		Subscriptions: subs,
		DeltasSent:    c.DeltasSent,
		MutationsRecv: c.MutationsRecv,
	}
}
