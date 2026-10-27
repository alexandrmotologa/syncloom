# SyncLoom: Master Implementation Plan

> **Local-First CRDT & SQLite-to-Postgres Real-Time Sync Engine for Modern Web & Mobile Apps**
>
> *High-performance data synchronization infrastructure and client SDK for local-first software architectures (Linear-style UX). Binds client-side SQLite (Wasm/OPFS on web, native on mobile) to backend PostgreSQL via logical replication (CDC), resolves offline concurrent edits with Conflict-free Replicated Data Types (CRDTs), and streams deltas over WebSocket.*

---

## 1. Project Overview & Architecture

Modern users demand instantaneous software experiences (like Linear, Superhuman, and Notion): zero loading spinners, immediate 0ms UI updates, and full offline capability. However, building local-first applications is notorious for immense distributed systems complexity:
1. **The Distributed Conflict Problem**: When two users edit different fields of the same record simultaneously while offline, naive database sync overwrites one user's changes or causes silent data loss.
2. **Proprietary & Costly Vendor Lock-In**: Commercial sync services (Replicache) charge steep enterprise licensing fees and require proprietary backend synchronization code.
3. **Complex Infrastructure Footprint**: Existing open-source projects (ElectricSQL) rely on complex multi-tier Elixir/Erlang stacks that are cumbersome to deploy and maintain on standard cloud environments.
4. **Offline Queue Fragility**: Replaying offline operations in the wrong order or without monotonic timestamps corrupts foreign key relationships and application state.

**SyncLoom** provides an open-source, self-hosted, single-binary sync engine and lightweight client SDK:
- **0ms Client-Side Latency**: All UI reads and writes execute against local client SQLite (running in Wasm/OPFS in the browser, or native SQLite in React Native / Android).
- **Postgres Change Data Capture (CDC)**: Server sidecar listens directly to PostgreSQL Logical Replication (`pgoutput` plugin), capturing row-level inserts, updates, and deletes without database triggers.
- **Hybrid Logical Clock (HLC) & Field-Level CRDTs**: Guarantees deterministic conflict resolution. Concurrent edits to different columns of the same row merge automatically; simultaneous edits to the same column resolve via monotonic Hybrid Logical Clocks.
- **Reliable Offline Mutation Queue**: Automatically stores transactions on client disk when network connectivity drops, replaying mutations in strict sequence upon reconnecting.
- **Single-Binary Go Server & Web Studio**: Zero-dependency Go backend managing WebSocket delta streaming alongside an embedded React 19 monitoring studio.

```
+-----------------------------------------------------------------------------------+
|                                     SYNCLOOM                                      |
+-----------------------------------------+-----------------------------------------+
                                          |
        +---------------------------------+---------------------------------+
        |                                                                   |
+-------v-------------------------+                 +-----------------------v-------+
|   Client SDK (Browser / Mobile) |                 |    SyncLoom Go Server Sidecar |
|  * 0ms Local SQLite Reads/Writes|                 |  * High-Concurrency WebSockets|
|  * OPFS / Wasm / Native Mobile  |                 |  * Room & Table Subscriptions |
|  * Persistent Offline Queue     |                 |  * Delta Stream Broadcaster   |
+-------+-------------------------+                 +-----------------------+-------+
        |                                                                   |
        +---------------------------------+---------------------------------+
                                          |
                        +-----------------v-----------------+
                        |   Hybrid Logical Clocks & CRDT    |
                        |  * Field-Level LWW (Last-Write)   |
                        |  * Monotonic Timestamp Generator  |
                        |  * Deterministic Conflict Resolve |
                        +-----------------+-----------------+
                                          |
                        +-----------------v-----------------+
                        |    PostgreSQL CDC Replication     |
                        |  * Native pgoutput Logical Stream |
                        |  * Zero Custom Database Triggers  |
                        |  * Row Delta Transformation       |
                        +-----------------+-----------------+
                                          |
                        +-----------------v-----------------+
                        |   Interactive Web Studio & CLI    |
                        |  * Live Peer Sync Graph (Port 9330|
                        |  * Conflict Resolution Audit Log  |
                        |  * Replication Lag Gauges         |
                        +-----------------------------------+
```

---

## 2. Directory Structure

```
syncloom/
├── cmd/
│   └── syncloom/
│       └── main.go               # Single-binary sync server entrypoint
├── internal/
│   ├── pgcdc/
│   │   ├── replicator.go         # PostgreSQL logical replication listener (pglogrepl)
│   │   ├── parser.go             # Ingests pgoutput relation, insert, update, delete
│   │   └── wal_tracker.go        # Tracks confirmed LSN (Log Sequence Number)
│   ├── crdt/
│   │   ├── hlc.go                # Hybrid Logical Clock implementation
│   │   ├── resolver.go           # Field-level Last-Write-Wins (LWW) resolver
│   │   └── delta.go              # Compact binary/JSON delta representation
│   ├── hub/
│   │   ├── client.go             # WebSocket client connection handler
│   │   ├── room.go               # Table and row-level subscription routing
│   │   └── broadcast.go          # Fan-out delta publisher to subscribed peers
│   ├── auth/
│   │   └── jwt_validator.go      # Row-level security & user tenant isolation
│   └── server/
│       ├── api.go                # REST API for status & schema sync
│       └── static.go             # Embedded Vite frontend assets
├── sdk/
│   ├── typescript/
│   │   ├── src/
│   │   │   ├── client.ts         # SyncLoomClient main entrypoint
│   │   │   ├── sqlite_wasm.ts    # OPFS SQLite Wasm storage adapter
│   │   │   ├── queue.ts          # Persistent offline mutation queue
│   │   │   ├── sync_socket.ts    # WebSocket client with exponential reconnect
│   │   │   └── hooks.ts          # React hooks (useSyncQuery, useSyncMutation)
│   │   ├── package.json
│   │   └── tsconfig.json
├── web/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ActivePeersList.tsx   # Connected clients & sync status
│   │   │   ├── ConflictLogTable.tsx  # Merged concurrent edits audit trail
│   │   │   ├── ReplicationLagGauge.tsx # Milliseconds latency from Postgres to client
│   │   │   └── TableSyncMatrix.tsx   # Synchronized tables and row counts
│   │   ├── hooks/
│   │   │   └── useSyncStats.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── go.mod
├── go.sum
└── README.md
```

---

## 3. Implementation Roadmap

### Phase 1: PostgreSQL Logical Replication Listener (`pgoutput`)
- Implement `internal/pgcdc/replicator.go` using `github.com/jackc/pglogrepl`:
  - Connect to PostgreSQL replication slot (`CREATE_REPLICATION_SLOT ... LOGICAL pgoutput`).
  - Listen to streaming WAL records.
  - Parse `RelationMessage`, `InsertMessage`, `UpdateMessage`, `DeleteMessage`.
- Extract column-level values and map them to unified row delta payloads with primary key identification.

### Phase 2: Hybrid Logical Clocks & CRDT Conflict Resolution
- Implement `internal/crdt/hlc.go`:
  - Generate monotonic Hybrid Logical Clock timestamps: $(\text{physical\_time}, \text{logical\_counter}, \text{client\_id})$.
  - Guarantee that causality is strictly preserved across distributed clients regardless of system clock drift.
- Implement `internal/crdt/resolver.go`:
  - Column-level Last-Write-Wins (LWW):
    If Client A updates `status` at $T_1$ and Client B updates `title` at $T_2$, both updates are merged into the row without conflict.
    If Client A and Client B both update `status`, the higher HLC timestamp deterministically wins.

### Phase 3: High-Concurrency WebSocket Hub & Delta Streaming
- Implement `internal/hub/client.go` using `gorilla/websocket`:
  - Maintain low-overhead client connections.
  - Support granular channel subscriptions: `subscribe("tasks", { project_id: "xyz" })`.
- Implement `internal/hub/broadcast.go`:
  - When Postgres emits a change or a client uploads a mutation, calculate delta and broadcast to matching subscribers in $< 20\text{ms}$.
  - Support JWT token authentication to enforce multi-tenant isolation.

### Phase 4: TypeScript Client SDK (Web OPFS & Mobile)
- Implement `sdk/typescript/src/sqlite_wasm.ts`:
  - Load official SQLite Wasm with Origin Private File System (OPFS) storage for persistent local storage in browsers.
  - Execute queries locally with 0ms latency.
- Implement `sdk/typescript/src/queue.ts`:
  - When mutations occur offline, persist them in a local `_syncloom_mutations` table.
  - When network connection is re-established, flush mutations in strict FIFO order, receive confirmed server state, and reconcile local records.

### Phase 5: Web Studio, Verification Suite & Benchmarking
- Build modern React 19 interface in `web/`:
  - **Replication Lag Gauge**: Real-time display of roundtrip replication latency (Postgres WAL -> Go Server -> Client WebSocket).
  - **Conflict Audit Table**: Detailed record of every resolved collision, showing competing timestamps and winning values.
  - **Connected Peers Map**: Live count of connected web and mobile devices.
- Performance benchmark: Sync 50,000 updates/sec with $< 30\text{ms}$ end-to-end propagation.

---

## 4. Agent Kickoff Prompt

```markdown
You are implementing **SyncLoom**, a local-first CRDT and SQLite-to-Postgres real-time sync engine in Go 1.23 + TypeScript SDK + React 19.

### Execution Plan:
1. Initialize Go module `github.com/alexandrmotologa/syncloom` in `B:\workgit\syncloom`.
2. Implement `internal/pgcdc/` using `jackc/pglogrepl` to stream row changes from PostgreSQL logical replication (`pgoutput`).
3. Implement `internal/crdt/` for Hybrid Logical Clocks (HLC) and field-level Last-Write-Wins (LWW) conflict resolution.
4. Implement `internal/hub/` to manage WebSocket client connections, subscription routing, and low-latency delta broadcasting.
5. Implement the TypeScript client SDK in `sdk/typescript/` supporting OPFS SQLite Wasm and persistent offline mutation queuing.
6. Build the modern React 19 web studio in `web/` featuring the Replication Lag Gauge, Conflict Audit Table, and Table Sync Matrix.
7. Implement the CLI entrypoint in `cmd/syncloom/main.go` supporting `serve --pg-dsn postgres://... --port 9330`.

Maintain 100% production code without mocks, placeholders, or empty handlers.
```
