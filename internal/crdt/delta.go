package crdt

import (
	"encoding/json"
	"time"
)

// Operation represents the type of row-level mutation.
type Operation string

const (
	OpInsert          Operation = "INSERT"
	OpUpdate          Operation = "UPDATE"
	OpDelete          Operation = "DELETE"
	OpSchemaMigration Operation = "SCHEMA_MIGRATION"
)

// RowDelta represents a single synchronized row change across the cluster.
type RowDelta struct {
	ID         string               `json:"id"`
	Table      string               `json:"table"`
	PrimaryKey string               `json:"primaryKey"`
	Operation  Operation            `json:"operation"`
	Columns    map[string]any       `json:"columns"`
	ColMeta    map[string]Timestamp `json:"colMeta"`
	Timestamp  Timestamp            `json:"timestamp"`
	NodeID     string               `json:"nodeId"`
	TxID       string               `json:"txId,omitempty"`
	LSN        uint64               `json:"lsn,omitempty"`
	CreatedAt  int64                `json:"createdAt"`
}

// TransactionDelta groups atomic changes emitted in a single transaction.
type TransactionDelta struct {
	TxID      string     `json:"txId"`
	LSN       uint64     `json:"lsn"`
	Timestamp int64      `json:"timestamp"`
	Deltas    []RowDelta `json:"deltas"`
}

// ConflictRecord logs an audit trail event whenever concurrent edits collide.
type ConflictRecord struct {
	ID           string    `json:"id"`
	Table        string    `json:"table"`
	PrimaryKey   string    `json:"primaryKey"`
	Column       string    `json:"column"`
	WinnerNode   string    `json:"winnerNode"`
	LoserNode    string    `json:"loserNode"`
	WinnerHLC    Timestamp `json:"winnerHlc"`
	LoserHLC     Timestamp `json:"loserHlc"`
	WinnerValue  any       `json:"winnerValue"`
	LoserValue   any       `json:"loserValue"`
	ResolvedAt   time.Time `json:"resolvedAt"`
	Resolution   string    `json:"resolution"` // e.g. "LWW_WINNER"
}

// MetadataMap encodes column-level timestamps into a compact map suitable for storage.
type MetadataMap map[string]Timestamp

// ToJSON converts column metadata into a JSON string.
func (m MetadataMap) ToJSON() (string, error) {
	bytes, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// ParseMetadataMap parses column metadata from JSON string.
func ParseMetadataMap(raw string) (MetadataMap, error) {
	if raw == "" || raw == "{}" {
		return make(MetadataMap), nil
	}
	var res MetadataMap
	err := json.Unmarshal([]byte(raw), &res)
	if err != nil {
		return nil, err
	}
	return res, nil
}
