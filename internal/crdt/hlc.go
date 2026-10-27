package crdt

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Timestamp represents an immutable Hybrid Logical Clock timestamp.
type Timestamp struct {
	Millis  int64  `json:"millis"`
	Counter uint32 `json:"counter"`
	NodeID  string `json:"nodeId"`
}

// ZeroTimestamp returns an empty base timestamp.
func ZeroTimestamp() Timestamp {
	return Timestamp{
		Millis:  0,
		Counter: 0,
		NodeID:  "",
	}
}

// Compare returns:
//
//	-1 if t < other
//	 0 if t == other
//	 1 if t > other
func (t Timestamp) Compare(other Timestamp) int {
	if t.Millis < other.Millis {
		return -1
	}
	if t.Millis > other.Millis {
		return 1
	}
	if t.Counter < other.Counter {
		return -1
	}
	if t.Counter > other.Counter {
		return 1
	}
	if t.NodeID < other.NodeID {
		return -1
	}
	if t.NodeID > other.NodeID {
		return 1
	}
	return 0
}

// After returns true if t > other.
func (t Timestamp) After(other Timestamp) bool {
	return t.Compare(other) > 0
}

// Before returns true if t < other.
func (t Timestamp) Before(other Timestamp) bool {
	return t.Compare(other) < 0
}

// Equal returns true if t == other.
func (t Timestamp) Equal(other Timestamp) bool {
	return t.Compare(other) == 0
}

// String returns the formatted representation HLC-<millis>-<counter>@<nodeId>.
func (t Timestamp) String() string {
	return fmt.Sprintf("HLC-%d-%04d@%s", t.Millis, t.Counter, t.NodeID)
}

// MarshalJSON serializes the timestamp to standard JSON string representation.
func (t Timestamp) MarshalJSON() ([]byte, error) {
	return json.Marshal(t.String())
}

// UnmarshalJSON deserializes from either a formatted string or an object representation.
func (t *Timestamp) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		parsed, err := ParseTimestamp(s)
		if err != nil {
			return err
		}
		*t = parsed
		return nil
	}

	type raw struct {
		Millis  int64  `json:"millis"`
		Counter uint32 `json:"counter"`
		NodeID  string `json:"nodeId"`
	}
	var r raw
	if err := json.Unmarshal(data, &r); err != nil {
		return err
	}
	t.Millis = r.Millis
	t.Counter = r.Counter
	t.NodeID = r.NodeID
	return nil
}

// ParseTimestamp parses a formatted string into a Timestamp struct.
func ParseTimestamp(s string) (Timestamp, error) {
	if !strings.HasPrefix(s, "HLC-") {
		return Timestamp{}, fmt.Errorf("invalid HLC prefix in: %s", s)
	}
	rest := strings.TrimPrefix(s, "HLC-")
	parts := strings.Split(rest, "@")
	if len(parts) != 2 {
		return Timestamp{}, fmt.Errorf("missing node separator in: %s", s)
	}
	nodeID := parts[1]

	numParts := strings.Split(parts[0], "-")
	if len(numParts) != 2 {
		return Timestamp{}, fmt.Errorf("invalid millis/counter format in: %s", s)
	}

	millis, err := strconv.ParseInt(numParts[0], 10, 64)
	if err != nil {
		return Timestamp{}, fmt.Errorf("invalid millis in %s: %w", s, err)
	}

	counter64, err := strconv.ParseUint(numParts[1], 10, 32)
	if err != nil {
		return Timestamp{}, fmt.Errorf("invalid counter in %s: %w", s, err)
	}

	return Timestamp{
		Millis:  millis,
		Counter: uint32(counter64),
		NodeID:  nodeID,
	}, nil
}

// Clock maintains a thread-safe monotonic Hybrid Logical Clock for a single node.
type Clock struct {
	mu     sync.Mutex
	nodeID string
	latest Timestamp
	nowFn  func() time.Time
}

// NewClock creates a new Hybrid Logical Clock for the given node ID.
func NewClock(nodeID string) *Clock {
	return &Clock{
		nodeID: nodeID,
		nowFn:  time.Now,
		latest: Timestamp{
			Millis:  0,
			Counter: 0,
			NodeID:  nodeID,
		},
	}
}

// SetTimeSource overrides the physical time generator for deterministic testing.
func (c *Clock) SetTimeSource(fn func() time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.nowFn = fn
}

// Now generates a new monotonic timestamp for a local mutation.
func (c *Clock) Now() Timestamp {
	c.mu.Lock()
	defer c.mu.Unlock()

	phys := c.nowFn().UnixMilli()
	if phys > c.latest.Millis {
		c.latest = Timestamp{
			Millis:  phys,
			Counter: 0,
			NodeID:  c.nodeID,
		}
	} else {
		// Clock skew or within the same millisecond: advance counter.
		c.latest = Timestamp{
			Millis:  c.latest.Millis,
			Counter: c.latest.Counter + 1,
			NodeID:  c.nodeID,
		}
	}

	return c.latest
}

// Update incorporates an incoming remote timestamp and advances the local clock monotonically.
func (c *Clock) Update(remote Timestamp) Timestamp {
	c.mu.Lock()
	defer c.mu.Unlock()

	phys := c.nowFn().UnixMilli()

	m := c.latest.Millis
	if phys > m {
		m = phys
	}
	if remote.Millis > m {
		m = remote.Millis
	}

	var counter uint32
	if m == c.latest.Millis && m == remote.Millis {
		if remote.Counter > c.latest.Counter {
			counter = remote.Counter + 1
		} else {
			counter = c.latest.Counter + 1
		}
	} else if m == c.latest.Millis {
		counter = c.latest.Counter + 1
	} else if m == remote.Millis {
		counter = remote.Counter + 1
	} else {
		counter = 0
	}

	c.latest = Timestamp{
		Millis:  m,
		Counter: counter,
		NodeID:  c.nodeID,
	}

	return c.latest
}

// Latest returns the most recent timestamp without advancing the clock.
func (c *Clock) Latest() Timestamp {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.latest
}

// NodeID returns the identifier of this clock node.
func (c *Clock) NodeID() string {
	return c.nodeID
}
