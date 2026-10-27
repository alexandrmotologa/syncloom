package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/alexandrmotologa/syncloom/internal/auth"
	"github.com/alexandrmotologa/syncloom/internal/crdt"
	"github.com/alexandrmotologa/syncloom/internal/hub"
	"github.com/alexandrmotologa/syncloom/internal/pgcdc"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:    1024 * 16,
	WriteBufferSize:   1024 * 16,
	EnableCompression: true,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev and local-first SDK
	},
}

// ServerConfig stores HTTP server startup options.
type ServerConfig struct {
	Port       int
	PGDSN      string
	SlotName   string
	PubName    string
	DemoMode   bool
	NodeID     string
	JWTSecret  string
	StartTime  time.Time
}

// Server encapsulates the HTTP REST API and WebSocket daemon.
type Server struct {
	cfg          ServerConfig
	hub          *hub.Hub
	standalone   *pgcdc.StandaloneCDC
	replicator   *pgcdc.Replicator
	jwtValidator *auth.JWTValidator
	httpServer   *http.Server
}

// NewServer builds an API server instance.
func NewServer(cfg ServerConfig, h *hub.Hub, standalone *pgcdc.StandaloneCDC, replicator *pgcdc.Replicator) *Server {
	if cfg.Port <= 0 {
		cfg.Port = 9330
	}
	if cfg.NodeID == "" {
		cfg.NodeID = "syncloom-srv-1"
	}
	cfg.StartTime = time.Now()

	s := &Server{
		cfg:          cfg,
		hub:          h,
		standalone:   standalone,
		replicator:   replicator,
		jwtValidator: auth.NewJWTValidator(cfg.JWTSecret),
	}

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      s.corsMiddleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s
}

// registerRoutes sets up API endpoints and static studio hosting.
func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/metrics", s.handleMetrics)
	mux.HandleFunc("/api/peers", s.handlePeers)
	mux.HandleFunc("/api/conflicts", s.handleConflicts)
	mux.HandleFunc("/api/tables", s.handleTables)
	mux.HandleFunc("/api/query", s.handleQuery)
	mux.HandleFunc("/api/simulate/conflict", s.handleSimulateConflict)
	mux.HandleFunc("/api/simulate/ddl", s.handleSimulateDDL)
	mux.HandleFunc("/api/mutate", s.handleDirectMutate)

	// Static web assets or SPA fallback
	fsys := StaticFileSystem()
	if fsys != nil {
		fileServer := http.FileServer(fsys)
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/ws" {
				http.NotFound(w, r)
				return
			}
			f, err := fsys.Open(strings.TrimPrefix(r.URL.Path, "/"))
			if err == nil {
				_ = f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
			// SPA fallback: return index.html
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
		})
	} else {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"name":    "SyncLoom",
				"version": "1.0.0",
				"status":  "running",
				"ws":      fmt.Sprintf("ws://%s/ws", r.Host),
			})
		})
	}
}

// corsMiddleware allows cross-origin requests for web studio and remote SDK clients.
func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-SyncLoom-Client")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// handleWebSocket upgrades incoming requests to WebSocket streams.
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[server] failed to upgrade websocket: %v", err)
		return
	}

	clientID := r.URL.Query().Get("clientId")
	if clientID == "" {
		clientID = "peer-" + uuid.New().String()[:8]
	}

	token := r.URL.Query().Get("token")
	claims, err := s.jwtValidator.ValidateToken(token)
	if err != nil {
		log.Printf("[server] rejected unverified token for %s: %v", clientID, err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	client := hub.NewClient(clientID, s.hub, conn, r.RemoteAddr, r.UserAgent(), claims.TenantID, claims.UserID)
	s.hub.Register(client)

	// Send initial welcome sync state
	client.SendMessage(hub.OutboundMessage{
		Type:       "sync_state",
		HLC:        s.hub.Clock.Now().String(),
		ServerTime: time.Now().UnixMilli(),
	})

	go client.WritePump()
	go client.ReadPump()
}

// handleStatus returns high-level daemon and replication status.
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	mode := "Standalone CDC Engine"
	if !s.cfg.DemoMode && s.cfg.PGDSN != "" {
		mode = "PostgreSQL Logical Replication (pgoutput)"
	}

	status := map[string]any{
		"service":   "SyncLoom",
		"version":   "1.0.0",
		"mode":      mode,
		"nodeId":    s.cfg.NodeID,
		"uptime":    time.Since(s.cfg.StartTime).String(),
		"startedAt": s.cfg.StartTime.UTC(),
		"port":      s.cfg.Port,
		"demo":      s.cfg.DemoMode,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(status)
}

// handleMetrics returns live throughput and replication latency metrics.
func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	m := s.hub.Metrics()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(m)
}

// handlePeers lists all active connected WebSocket clients.
func (s *Server) handlePeers(w http.ResponseWriter, r *http.Request) {
	peers := s.hub.Peers()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(peers)
}

// handleConflicts returns recent resolved collision events from the audit log.
func (s *Server) handleConflicts(w http.ResponseWriter, r *http.Request) {
	conflicts := s.hub.Resolver.RecentConflicts(50)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(conflicts)
}

// handleTables returns active synchronized tables and their row data.
func (s *Server) handleTables(w http.ResponseWriter, r *http.Request) {
	result := make(map[string]any)

	if s.standalone != nil {
		stats := s.standalone.TableStats()
		tablesData := make(map[string][]map[string]any)
		for tbl := range stats {
			tablesData[tbl] = s.standalone.GetTableData(tbl)
		}
		result["stats"] = stats
		result["tables"] = tablesData
	} else {
		// PostgreSQL CDC mode: query in-memory row states
		active := s.hub.Rooms.ActiveTables()
		tablesData := make(map[string][]map[string]any)
		stats := make(map[string]int)
		for _, tbl := range active {
			rows := s.hub.RowStateMap(tbl)
			tablesData[tbl] = rows
			stats[tbl] = len(rows)
		}
		result["stats"] = stats
		result["tables"] = tablesData
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

// handleSimulateConflict triggers a deterministic concurrent conflict between two simulated peers.
func (s *Server) handleSimulateConflict(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Table      string `json:"table"`
		PrimaryKey string `json:"primaryKey"`
		Column     string `json:"column"`
		ValueA     string `json:"valueA"`
		ValueB     string `json:"valueB"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.Table = "tasks"
		req.PrimaryKey = "task-1"
		req.Column = "status"
		req.ValueA = "in_progress"
		req.ValueB = "done"
	}

	tA := s.hub.Clock.Now()
	// Simulate Peer B generating an edit with higher logical counter
	tB := crdt.Timestamp{
		Millis:  tA.Millis,
		Counter: tA.Counter + 5,
		NodeID:  "simulated-peer-b",
	}

	deltaA := crdt.RowDelta{
		ID:         uuid.New().String(),
		Table:      req.Table,
		PrimaryKey: req.PrimaryKey,
		Operation:  crdt.OpUpdate,
		Columns:    map[string]any{req.Column: req.ValueA},
		ColMeta:    map[string]crdt.Timestamp{req.Column: tA},
		Timestamp:  tA,
		NodeID:     "simulated-peer-a",
		CreatedAt:  time.Now().UnixMilli(),
	}

	deltaB := crdt.RowDelta{
		ID:         uuid.New().String(),
		Table:      req.Table,
		PrimaryKey: req.PrimaryKey,
		Operation:  crdt.OpUpdate,
		Columns:    map[string]any{req.Column: req.ValueB},
		ColMeta:    map[string]crdt.Timestamp{req.Column: tB},
		Timestamp:  tB,
		NodeID:     "simulated-peer-b",
		CreatedAt:  time.Now().UnixMilli(),
	}

	// Dispatch both deltas: B will win deterministically on HLC timestamp
	s.hub.Broadcast(deltaA)
	s.hub.Broadcast(deltaB)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":      "simulated",
		"winner":      req.ValueB,
		"winnerHlc":   tB.String(),
		"loser":       req.ValueA,
		"loserHlc":    tA.String(),
		"explanation": "Simulated Peer B won via higher Hybrid Logical Clock counter.",
	})
}

// handleDirectMutate accepts row mutations via REST API for webhooks or external integrations.
func (s *Server) handleDirectMutate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var delta crdt.RowDelta
	if err := json.NewDecoder(r.Body).Decode(&delta); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if delta.ID == "" {
		delta.ID = uuid.New().String()
	}
	if delta.Timestamp.Equal(crdt.ZeroTimestamp()) {
		delta.Timestamp = s.hub.Clock.Now()
	}
	if delta.NodeID == "" {
		delta.NodeID = s.cfg.NodeID
	}
	delta.CreatedAt = time.Now().UnixMilli()

	s.hub.Broadcast(delta)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"applied": true,
		"delta":   delta,
	})
}

// handleQuery executes ad-hoc SQL read queries against synchronized tables.
func (s *Server) handleQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var rawQuery string
	if r.Method == http.MethodGet {
		rawQuery = r.URL.Query().Get("q")
	} else {
		var req struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			rawQuery = req.Query
		}
	}

	rawQuery = strings.TrimSpace(rawQuery)
	if rawQuery == "" {
		rawQuery = "SELECT * FROM tasks"
	}

	start := time.Now()
	cols, rows, err := s.executeQuery(rawQuery)
	execDuration := time.Since(start)

	res := map[string]any{
		"query":           rawQuery,
		"columns":         cols,
		"rows":            rows,
		"rowCount":        len(rows),
		"executionTimeUs": execDuration.Microseconds(),
		"executionTimeMs": float64(execDuration.Microseconds()) / 1000.0,
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		res["error"] = err.Error()
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(res)
		return
	}

	_ = json.NewEncoder(w).Encode(res)
}

// executeQuery runs an ad-hoc read query against in-memory synchronized table state.
func (s *Server) executeQuery(rawQuery string) ([]string, []map[string]any, error) {
	q := strings.TrimSpace(rawQuery)
	q = strings.TrimSuffix(q, ";")

	upperQ := strings.ToUpper(q)
	if !strings.HasPrefix(upperQ, "SELECT") {
		return nil, nil, fmt.Errorf("only SELECT queries are supported in read-only console")
	}

	fromIdx := strings.Index(upperQ, " FROM ")
	if fromIdx == -1 {
		return nil, nil, fmt.Errorf("invalid SQL: missing FROM clause")
	}

	selectPart := strings.TrimSpace(q[6:fromIdx])
	afterFrom := strings.TrimSpace(q[fromIdx+6:])

	tokens := strings.Fields(afterFrom)
	if len(tokens) == 0 {
		return nil, nil, fmt.Errorf("invalid SQL: table name missing after FROM")
	}

	tableName := strings.ToLower(tokens[0])

	var rawRows []map[string]any
	if s.standalone != nil {
		rawRows = s.standalone.GetTableData(tableName)
	} else {
		rawRows = s.hub.RowStateMap(tableName)
	}

	if len(rawRows) == 0 {
		var exists bool
		if s.standalone != nil {
			stats := s.standalone.TableStats()
			_, exists = stats[tableName]
		} else {
			for _, t := range s.hub.Rooms.ActiveTables() {
				if t == tableName {
					exists = true
					break
				}
			}
		}
		if !exists {
			return nil, nil, fmt.Errorf("table '%s' does not exist. Available tables: tasks, projects", tableName)
		}
	}

	currentRows := make([]map[string]any, len(rawRows))
	for i, r := range rawRows {
		copyRow := make(map[string]any, len(r))
		for k, v := range r {
			copyRow[k] = v
		}
		currentRows[i] = copyRow
	}

	// Check for WHERE
	whereIdx := strings.Index(upperQ, " WHERE ")
	if whereIdx != -1 {
		whereClause := q[whereIdx+7:]
		if obIdx := strings.Index(strings.ToUpper(whereClause), " ORDER BY "); obIdx != -1 {
			whereClause = whereClause[:obIdx]
		}
		if limIdx := strings.Index(strings.ToUpper(whereClause), " LIMIT "); limIdx != -1 {
			whereClause = whereClause[:limIdx]
		}

		whereClause = strings.TrimSpace(whereClause)
		currentRows = filterRows(currentRows, whereClause)
	}

	// Check for ORDER BY
	obIdx := strings.Index(upperQ, " ORDER BY ")
	if obIdx != -1 {
		obClause := strings.TrimSpace(q[obIdx+10:])
		if limIdx := strings.Index(strings.ToUpper(obClause), " LIMIT "); limIdx != -1 {
			obClause = strings.TrimSpace(obClause[:limIdx])
		}
		parts := strings.Fields(obClause)
		if len(parts) > 0 {
			col := parts[0]
			desc := len(parts) > 1 && strings.EqualFold(parts[1], "DESC")
			sort.SliceStable(currentRows, func(i, j int) bool {
				v1 := fmt.Sprintf("%v", currentRows[i][col])
				v2 := fmt.Sprintf("%v", currentRows[j][col])
				if desc {
					return v1 > v2
				}
				return v1 < v2
			})
		}
	}

	// Check for LIMIT
	limIdx := strings.Index(upperQ, " LIMIT ")
	if limIdx != -1 {
		limStr := strings.TrimSpace(q[limIdx+7:])
		fields := strings.Fields(limStr)
		if len(fields) > 0 {
			if n, err := strconv.Atoi(fields[0]); err == nil && n >= 0 {
				if len(currentRows) > n {
					currentRows = currentRows[:n]
				}
			}
		}
	}

	// Project Columns
	var cols []string
	if selectPart == "*" || selectPart == "" {
		allColsMap := make(map[string]bool)
		for _, r := range currentRows {
			for k := range r {
				allColsMap[k] = true
			}
		}
		if len(allColsMap) == 0 {
			if tableName == "tasks" {
				cols = []string{"id", "title", "status", "priority", "assignee", "tenant_id", "_hlc"}
			} else if tableName == "projects" {
				cols = []string{"id", "name", "status", "owner", "tenant_id", "_hlc"}
			} else {
				cols = []string{"id", "_hlc"}
			}
		} else {
			var sorted []string
			hasID := false
			hasTenant := false
			hasHLC := false
			for k := range allColsMap {
				if k == "id" {
					hasID = true
				} else if k == "tenant_id" {
					hasTenant = true
				} else if k == "_hlc" {
					hasHLC = true
				} else {
					sorted = append(sorted, k)
				}
			}
			sort.Strings(sorted)
			if hasID {
				cols = append(cols, "id")
			}
			if hasTenant {
				cols = append(cols, "tenant_id")
			}
			cols = append(cols, sorted...)
			if hasHLC {
				cols = append(cols, "_hlc")
			}
		}
	} else {
		rawCols := strings.Split(selectPart, ",")
		for _, c := range rawCols {
			cleaned := strings.TrimSpace(c)
			if cleaned != "" {
				cols = append(cols, cleaned)
			}
		}
		projected := make([]map[string]any, len(currentRows))
		for i, r := range currentRows {
			newRow := make(map[string]any, len(cols))
			for _, col := range cols {
				newRow[col] = r[col]
			}
			projected[i] = newRow
		}
		currentRows = projected
	}

	return cols, currentRows, nil
}

func filterRows(rows []map[string]any, condition string) []map[string]any {
	var op string
	var parts []string
	if strings.Contains(condition, "!=") {
		op = "!="
		parts = strings.SplitN(condition, "!=", 2)
	} else if strings.Contains(condition, "=") {
		op = "="
		parts = strings.SplitN(condition, "=", 2)
	}

	if len(parts) != 2 {
		return rows
	}

	col := strings.TrimSpace(parts[0])
	val := strings.Trim(strings.TrimSpace(parts[1]), `"'`)

	var filtered []map[string]any
	for _, r := range rows {
		rowVal := fmt.Sprintf("%v", r[col])
		match := false
		if op == "=" && strings.EqualFold(rowVal, val) {
			match = true
		} else if op == "!=" && !strings.EqualFold(rowVal, val) {
			match = true
		}
		if match {
			filtered = append(filtered, r)
		}
	}
	return filtered
}

// handleSimulateDDL simulates a PostgreSQL DDL schema alteration (e.g. ALTER TABLE tasks ADD COLUMN priority TEXT)
func (s *Server) handleSimulateDDL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Table        string `json:"table"`
		Column       string `json:"column"`
		DefaultValue any    `json:"defaultValue"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Column == "" {
		req.Table = "tasks"
		req.Column = "estimated_hours"
		req.DefaultValue = "4h"
	}
	if req.Table == "" {
		req.Table = "tasks"
	}
	if req.DefaultValue == nil {
		req.DefaultValue = "4h"
	}

	var delta crdt.RowDelta
	if s.standalone != nil {
		delta = s.standalone.AddColumn(req.Table, req.Column, req.DefaultValue)
	} else {
		hlc := s.hub.Clock.Now()
		delta = crdt.RowDelta{
			ID:         uuid.New().String(),
			Table:      req.Table,
			PrimaryKey: "*",
			Operation:  crdt.OpSchemaMigration,
			Columns:    map[string]any{req.Column: req.DefaultValue},
			ColMeta:    map[string]crdt.Timestamp{req.Column: hlc},
			Timestamp:  hlc,
			NodeID:     s.cfg.NodeID,
			CreatedAt:  time.Now().UnixMilli(),
		}
		s.hub.Broadcast(delta)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":      "schema_migrated",
		"table":       req.Table,
		"columnAdded": req.Column,
		"delta":       delta,
	})
}

// Start launches the HTTP server on the configured port.
func (s *Server) Start() error {
	log.Printf("[server] SyncLoom listening on http://localhost:%d", s.cfg.Port)
	if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// Shutdown gracefully terminates the HTTP server.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}
