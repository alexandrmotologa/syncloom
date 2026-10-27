package pgcdc

import (
	"fmt"
	"sync"
	"time"

	"github.com/alexandrmotologa/syncloom/internal/crdt"
	"github.com/google/uuid"
	"github.com/jackc/pglogrepl"
)

// RelationSchema stores the column structure for a replicated PostgreSQL table.
type RelationSchema struct {
	ID        uint32
	Namespace string
	Name      string
	Columns   []ColumnDefinition
}

// ColumnDefinition describes a column in a PostgreSQL table relation.
type ColumnDefinition struct {
	Name     string
	DataType uint32
	IsPK     bool
}

// Parser decodes raw WAL messages emitted by PostgreSQL pgoutput logical replication plugin.
type Parser struct {
	mu        sync.RWMutex
	relations map[uint32]*RelationSchema
	clock     *crdt.Clock
	curTx     *crdt.TransactionDelta
}

// NewParser creates a new WAL decoder instance.
func NewParser(nodeID string) *Parser {
	return &Parser{
		relations: make(map[uint32]*RelationSchema),
		clock:     crdt.NewClock(nodeID),
	}
}

// ParseResult holds any completed row deltas or transaction bundles produced by a WAL payload.
type ParseResult struct {
	RowDelta         *crdt.RowDelta
	TransactionDelta *crdt.TransactionDelta
}

// Ingest processes a binary pgoutput message payload from PostgreSQL.
func (p *Parser) Ingest(payload []byte, lsn pglogrepl.LSN) (*ParseResult, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	logicalMsg, err := pglogrepl.Parse(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to parse pgoutput message: %w", err)
	}

	switch m := logicalMsg.(type) {
	case *pglogrepl.RelationMessage:
		cols := make([]ColumnDefinition, len(m.Columns))
		for i, c := range m.Columns {
			cols[i] = ColumnDefinition{
				Name:     c.Name,
				DataType: c.DataType,
				IsPK:     c.Flags == 1, // Replica identity / PK flag
			}
		}

		var schemaDelta *crdt.RowDelta
		if existing, ok := p.relations[m.RelationID]; ok {
			// Detect added columns
			oldMap := make(map[string]bool)
			for _, oc := range existing.Columns {
				oldMap[oc.Name] = true
			}
			newCols := make(map[string]any)
			for _, nc := range cols {
				if !oldMap[nc.Name] {
					newCols[nc.Name] = "TEXT"
				}
			}
			if len(newCols) > 0 {
				hlc := p.clock.Now()
				delta := crdt.RowDelta{
					ID:         uuid.New().String(),
					Table:      m.RelationName,
					PrimaryKey: "*schema*",
					Operation:  crdt.OpSchemaMigration,
					Columns:    newCols,
					ColMeta:    make(map[string]crdt.Timestamp),
					Timestamp:  hlc,
					NodeID:     p.clock.NodeID(),
					LSN:        uint64(lsn),
					CreatedAt:  time.Now().UnixMilli(),
				}
				schemaDelta = &delta
			}
		}

		p.relations[m.RelationID] = &RelationSchema{
			ID:        m.RelationID,
			Namespace: m.Namespace,
			Name:      m.RelationName,
			Columns:   cols,
		}
		if schemaDelta != nil {
			return &ParseResult{RowDelta: schemaDelta}, nil
		}
		return nil, nil

	case *pglogrepl.BeginMessage:
		p.curTx = &crdt.TransactionDelta{
			TxID:      fmt.Sprintf("%d", m.Xid),
			LSN:       uint64(m.FinalLSN),
			Timestamp: m.CommitTime.UnixMilli(),
			Deltas:    make([]crdt.RowDelta, 0),
		}
		return nil, nil

	case *pglogrepl.CommitMessage:
		if p.curTx != nil {
			tx := p.curTx
			tx.LSN = uint64(m.CommitLSN)
			if !m.CommitTime.IsZero() {
				tx.Timestamp = m.CommitTime.UnixMilli()
			}
			p.curTx = nil
			return &ParseResult{TransactionDelta: tx}, nil
		}
		return nil, nil

	case *pglogrepl.InsertMessage:
		rel, ok := p.relations[m.RelationID]
		if !ok {
			return nil, fmt.Errorf("unknown relation ID %d for insert", m.RelationID)
		}
		delta := p.decodeTuple(rel, m.Tuple, crdt.OpInsert, lsn)
		if p.curTx != nil {
			p.curTx.Deltas = append(p.curTx.Deltas, delta)
		}
		return &ParseResult{RowDelta: &delta}, nil

	case *pglogrepl.UpdateMessage:
		rel, ok := p.relations[m.RelationID]
		if !ok {
			return nil, fmt.Errorf("unknown relation ID %d for update", m.RelationID)
		}
		delta := p.decodeTuple(rel, m.NewTuple, crdt.OpUpdate, lsn)
		if p.curTx != nil {
			p.curTx.Deltas = append(p.curTx.Deltas, delta)
		}
		return &ParseResult{RowDelta: &delta}, nil

	case *pglogrepl.DeleteMessage:
		rel, ok := p.relations[m.RelationID]
		if !ok {
			return nil, fmt.Errorf("unknown relation ID %d for delete", m.RelationID)
		}
		delta := p.decodeTuple(rel, m.OldTuple, crdt.OpDelete, lsn)
		if p.curTx != nil {
			p.curTx.Deltas = append(p.curTx.Deltas, delta)
		}
		return &ParseResult{RowDelta: &delta}, nil

	default:
		// Unsupported or non-data message (e.g. TypeMessage)
		return nil, nil
	}
}

// decodeTuple transforms a PostgreSQL TupleData into a unified RowDelta.
func (p *Parser) decodeTuple(rel *RelationSchema, tuple *pglogrepl.TupleData, op crdt.Operation, lsn pglogrepl.LSN) crdt.RowDelta {
	cols := make(map[string]any)
	colMeta := make(map[string]crdt.Timestamp)
	pk := ""

	hlcTimestamp := p.clock.Now()

	for i, col := range tuple.Columns {
		if i >= len(rel.Columns) {
			break
		}
		def := rel.Columns[i]
		name := def.Name

		var val any
		switch col.DataType {
		case 'n': // null
			val = nil
		case 'u': // unchanged toast
			continue
		case 't': // text
			val = string(col.Data)
		case 'b': // binary
			val = col.Data
		}

		// Heuristic or flagged primary key detection
		if def.IsPK || name == "id" || name == "uuid" || pk == "" {
			if pk == "" || def.IsPK {
				pk = fmt.Sprintf("%v", val)
			}
		}

		// Handle embedded HLC metadata column if present
		if name == "_syncloom_meta" && val != nil {
			if metaMap, err := crdt.ParseMetadataMap(fmt.Sprintf("%v", val)); err == nil {
				for k, v := range metaMap {
					colMeta[k] = v
				}
			}
		} else {
			cols[name] = val
			if _, exists := colMeta[name]; !exists {
				colMeta[name] = hlcTimestamp
			}
		}
	}

	if pk == "" {
		pk = uuid.New().String()
	}

	txID := ""
	if p.curTx != nil {
		txID = p.curTx.TxID
	}

	return crdt.RowDelta{
		ID:         uuid.New().String(),
		Table:      rel.Name,
		PrimaryKey: pk,
		Operation:  op,
		Columns:    cols,
		ColMeta:    colMeta,
		Timestamp:  hlcTimestamp,
		NodeID:     p.clock.NodeID(),
		TxID:       txID,
		LSN:        uint64(lsn),
		CreatedAt:  time.Now().UnixMilli(),
	}
}

// RegisterRelation adds relation schema metadata directly (used in tests or manual registrations).
func (p *Parser) RegisterRelation(schema *RelationSchema) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.relations[schema.ID] = schema
}

// GetRelation retrieves cached relation schema.
func (p *Parser) GetRelation(id uint32) (*RelationSchema, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	rel, ok := p.relations[id]
	return rel, ok
}
