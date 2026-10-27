package pgcdc

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/alexandrmotologa/syncloom/internal/crdt"
	"github.com/jackc/pglogrepl"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgproto3"
)

// DeltaListener is a callback function invoked whenever a row or transaction delta is decoded.
type DeltaListener func(delta crdt.RowDelta)

// ReplicatorConfig configures the PostgreSQL logical replication client.
type ReplicatorConfig struct {
	DSN             string
	SlotName        string
	PublicationName string
	NodeID          string
	StartLSN        pglogrepl.LSN
	StandbyInterval time.Duration
}

// Replicator manages PostgreSQL logical replication via pgoutput plugin.
type Replicator struct {
	cfg        ReplicatorConfig
	tracker    *WALTracker
	parser     *Parser
	listeners  []DeltaListener
	mu         sync.RWMutex
	conn       *pgconn.PgConn
	running    bool
	cancelFunc context.CancelFunc
}

// NewReplicator creates a new logical replication stream manager.
func NewReplicator(cfg ReplicatorConfig) *Replicator {
	if cfg.SlotName == "" {
		cfg.SlotName = "syncloom_slot"
	}
	if cfg.PublicationName == "" {
		cfg.PublicationName = "syncloom_pub"
	}
	if cfg.NodeID == "" {
		cfg.NodeID = "pgcdc-node"
	}
	if cfg.StandbyInterval <= 0 {
		cfg.StandbyInterval = 10 * time.Second
	}

	return &Replicator{
		cfg:       cfg,
		tracker:   NewWALTracker(cfg.StartLSN),
		parser:    NewParser(cfg.NodeID),
		listeners: make([]DeltaListener, 0),
	}
}

// AddListener registers a consumer for synchronized change deltas.
func (r *Replicator) AddListener(fn DeltaListener) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.listeners = append(r.listeners, fn)
}

// Start opens the replication connection and starts streaming WAL records.
func (r *Replicator) Start(ctx context.Context) error {
	r.mu.Lock()
	if r.running {
		r.mu.Unlock()
		return fmt.Errorf("replicator is already running")
	}

	connCfg, err := pgconn.ParseConfig(r.cfg.DSN)
	if err != nil {
		r.mu.Unlock()
		return fmt.Errorf("invalid postgres dsn: %w", err)
	}

	// Must enable replication mode on connection
	if connCfg.RuntimeParams == nil {
		connCfg.RuntimeParams = make(map[string]string)
	}
	connCfg.RuntimeParams["replication"] = "database"

	connCtx, cancel := context.WithCancel(ctx)
	r.cancelFunc = cancel

	conn, err := pgconn.ConnectConfig(connCtx, connCfg)
	if err != nil {
		r.mu.Unlock()
		return fmt.Errorf("failed to connect to postgres in replication mode: %w", err)
	}
	r.conn = conn
	r.running = true
	r.mu.Unlock()

	// Ensure publication exists or create if missing
	_ = r.ensurePublication(connCtx)

	// Ensure replication slot exists
	_, err = pglogrepl.CreateReplicationSlot(connCtx, conn, r.cfg.SlotName, "pgoutput", pglogrepl.CreateReplicationSlotOptions{
		Temporary:      false,
		SnapshotAction: "NOEXPORT_SNAPSHOT",
	})
	if err != nil {
		// If slot already exists (error code 42710 in Postgres), proceed
		if pgErr, ok := err.(*pgconn.PgError); !ok || pgErr.Code != "42710" {
			log.Printf("[pgcdc] notice on create replication slot: %v", err)
		}
	}

	pluginArguments := []string{
		"proto_version '1'",
		fmt.Sprintf("publication_names '%s'", r.cfg.PublicationName),
		"messages 'true'",
	}

	written, _, _ := r.tracker.Status()
	err = pglogrepl.StartReplication(connCtx, conn, r.cfg.SlotName, written, pglogrepl.StartReplicationOptions{
		PluginArgs: pluginArguments,
	})
	if err != nil {
		return fmt.Errorf("failed to start logical replication: %w", err)
	}

	log.Printf("[pgcdc] logical replication started on slot %s for publication %s", r.cfg.SlotName, r.cfg.PublicationName)

	go r.streamLoop(connCtx)
	go r.heartbeatLoop(connCtx)

	return nil
}

// ensurePublication creates the publication if it doesn't already exist.
func (r *Replicator) ensurePublication(ctx context.Context) error {
	query := fmt.Sprintf("CREATE PUBLICATION %s FOR ALL TABLES;", r.cfg.PublicationName)
	res := r.conn.Exec(ctx, query)
	_, err := res.ReadAll()
	return err
}

// streamLoop continuously reads replication messages and dispatches deltas.
func (r *Replicator) streamLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		rawMsg, err := r.conn.ReceiveMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[pgcdc] error receiving replication message: %v", err)
			time.Sleep(500 * time.Millisecond)
			continue
		}

		switch msg := rawMsg.(type) {
		case *pgproto3.CopyData:
			switch msg.Data[0] {
			case pglogrepl.PrimaryKeepaliveMessageByteID:
				pkm, err := pglogrepl.ParsePrimaryKeepaliveMessage(msg.Data[1:])
				if err != nil {
					log.Printf("[pgcdc] failed to parse keepalive: %v", err)
					continue
				}
				r.tracker.AdvanceWritten(pkm.ServerWALEnd)
				if pkm.ReplyRequested {
					_ = r.sendStatusUpdate(ctx)
				}

			case pglogrepl.XLogDataByteID:
				xld, err := pglogrepl.ParseXLogData(msg.Data[1:])
				if err != nil {
					log.Printf("[pgcdc] failed to parse XLogData: %v", err)
					continue
				}

				res, err := r.parser.Ingest(xld.WALData, xld.WALStart)
				if err != nil {
					log.Printf("[pgcdc] failed to ingest WAL data: %v", err)
					continue
				}

				r.tracker.AdvanceWritten(xld.WALStart + pglogrepl.LSN(len(xld.WALData)))
				r.tracker.AdvanceFlushed(xld.WALStart + pglogrepl.LSN(len(xld.WALData)))

				if res != nil && res.RowDelta != nil {
					r.dispatchDelta(*res.RowDelta)
				}
				if res != nil && res.TransactionDelta != nil {
					for _, d := range res.TransactionDelta.Deltas {
						r.dispatchDelta(d)
					}
				}
			}

		case *pgproto3.NoticeResponse:
			log.Printf("[pgcdc] postgres notice: %s", msg.Message)
		}
	}
}

// heartbeatLoop sends periodic standby status updates to PostgreSQL.
func (r *Replicator) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(r.cfg.StandbyInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = r.sendStatusUpdate(ctx)
		}
	}
}

// sendStatusUpdate notifies PostgreSQL of the confirmed received and flushed LSN.
func (r *Replicator) sendStatusUpdate(ctx context.Context) error {
	r.mu.RLock()
	conn := r.conn
	r.mu.RUnlock()

	if conn == nil {
		return nil
	}

	written, flushed, applied := r.tracker.Status()
	return pglogrepl.SendStandbyStatusUpdate(ctx, conn, pglogrepl.StandbyStatusUpdate{
		WALWritePosition: written,
		WALFlushPosition: flushed,
		WALApplyPosition: applied,
		ClientTime:       time.Now(),
		ReplyRequested:   false,
	})
}

// dispatchDelta distributes the decoded change delta to registered subscribers.
func (r *Replicator) dispatchDelta(d crdt.RowDelta) {
	r.mu.RLock()
	listeners := r.listeners
	r.mu.RUnlock()

	for _, l := range listeners {
		l(d)
	}
}

// Stop cleanly terminates replication.
func (r *Replicator) Stop() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.running {
		return nil
	}
	r.running = false
	if r.cancelFunc != nil {
		r.cancelFunc()
	}
	if r.conn != nil {
		return r.conn.Close(context.Background())
	}
	return nil
}
