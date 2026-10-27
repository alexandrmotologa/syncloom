package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexandrmotologa/syncloom/internal/hub"
	"github.com/alexandrmotologa/syncloom/internal/pgcdc"
)

func setupTestServer() (*Server, *http.ServeMux) {
	h := hub.NewHub("test-node", 100)
	standalone := pgcdc.NewStandaloneCDC("test-node")
	cfg := ServerConfig{
		Port:      9330,
		DemoMode:  true,
		NodeID:    "test-node",
		JWTSecret: "test-secret",
	}
	s := NewServer(cfg, h, standalone, nil)
	mux := http.NewServeMux()
	s.registerRoutes(mux)
	return s, mux
}

func TestServerStatusAndMetrics(t *testing.T) {
	_, mux := setupTestServer()

	// 1. Test /api/status
	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from status, got %d", rec.Code)
	}

	var status map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &status); err != nil {
		t.Fatalf("failed to parse status JSON: %v", err)
	}
	if status["service"] != "SyncLoom" {
		t.Fatalf("unexpected service name: %v", status["service"])
	}

	// 2. Test /api/metrics includes compression stats
	reqM := httptest.NewRequest(http.MethodGet, "/api/metrics", nil)
	recM := httptest.NewRecorder()
	mux.ServeHTTP(recM, reqM)

	if recM.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from metrics, got %d", recM.Code)
	}

	var metrics map[string]any
	if err := json.Unmarshal(recM.Body.Bytes(), &metrics); err != nil {
		t.Fatalf("failed to parse metrics JSON: %v", err)
	}
	if codec, ok := metrics["compressionCodec"].(string); !ok || codec == "" {
		t.Fatalf("expected compressionCodec in metrics, got %v", metrics["compressionCodec"])
	}
}

func TestServerQueryEndpoint(t *testing.T) {
	_, mux := setupTestServer()

	// 1. Query all tasks
	body, _ := json.Marshal(map[string]string{"query": "SELECT * FROM tasks"})
	req := httptest.NewRequest(http.MethodPost, "/api/query", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/query, got %d: %s", rec.Code, rec.Body.String())
	}

	var res struct {
		Columns         []string         `json:"columns"`
		Rows            []map[string]any `json:"rows"`
		RowCount        int              `json:"rowCount"`
		ExecutionTimeUs int64            `json:"executionTimeUs"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to unmarshal query response: %v", err)
	}

	if res.RowCount < 5 {
		t.Fatalf("expected at least 5 seeded tasks, got %d", res.RowCount)
	}
	if len(res.Columns) == 0 {
		t.Fatalf("expected projected columns, got empty")
	}

	// 2. Filter query with WHERE
	bodyFilter, _ := json.Marshal(map[string]string{"query": "SELECT id, title, status FROM tasks WHERE status = 'done'"})
	reqFilter := httptest.NewRequest(http.MethodPost, "/api/query", bytes.NewReader(bodyFilter))
	recFilter := httptest.NewRecorder()
	mux.ServeHTTP(recFilter, reqFilter)

	var resFilter struct {
		Columns  []string         `json:"columns"`
		Rows     []map[string]any `json:"rows"`
		RowCount int              `json:"rowCount"`
	}
	_ = json.Unmarshal(recFilter.Body.Bytes(), &resFilter)
	if resFilter.RowCount == 0 {
		t.Fatalf("expected at least 1 completed task")
	}
	for _, r := range resFilter.Rows {
		if r["status"] != "done" {
			t.Fatalf("expected status 'done', got %v", r["status"])
		}
	}

	// 3. Invalid table error check
	bodyErr, _ := json.Marshal(map[string]string{"query": "SELECT * FROM non_existent_table"})
	reqErr := httptest.NewRequest(http.MethodPost, "/api/query", bytes.NewReader(bodyErr))
	recErr := httptest.NewRecorder()
	mux.ServeHTTP(recErr, reqErr)

	if recErr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for non-existent table, got %d", recErr.Code)
	}
}

func TestServerSimulateDDL(t *testing.T) {
	_, mux := setupTestServer()

	body, _ := json.Marshal(map[string]any{
		"table":        "tasks",
		"column":       "story_points",
		"defaultValue": "5pt",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/simulate/ddl", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/simulate/ddl, got %d: %s", rec.Code, rec.Body.String())
	}

	var res map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse DDL response: %v", err)
	}
	if res["columnAdded"] != "story_points" {
		t.Fatalf("expected columnAdded story_points, got %v", res["columnAdded"])
	}
}
