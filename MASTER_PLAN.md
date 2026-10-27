# SyncLoom: Master Implementation Plan

> **Local-First CRDT & SQLite-to-Postgres Real-Time Sync Engine for Modern Web & Mobile Apps**
>
> High-performance data synchronization infrastructure and client SDK for local-first software architectures (Linear-style UX). Binds client-side SQLite (Wasm/OPFS on web, native on mobile) to backend PostgreSQL via logical replication (CDC), resolves offline concurrent edits with Conflict-free Replicated Data Types (CRDTs), and streams deltas over WebSocket.

---

## 1. Project Overview & Architecture

Modern users demand instantaneous software experiences: zero loading spinners, immediate 0ms UI updates, and full offline capability. However, building local-first applications presents distributed systems challenges:
1. **Distributed Conflict Resolution**: When two users edit different fields of the same record concurrently while offline, naive database sync overwrites one user's changes or causes silent data loss.
2. **Vendor Lock-In and Licensing**: Commercial sync services charge steep enterprise licensing fees and require proprietary backend synchronization code.
3. **Complex Infrastructure Footprint**: Existing open-source alternatives rely on multi-tier Elixir/Erlang stacks that are cumbersome to deploy and maintain on standard cloud environments.
4. **Offline Queue Fragility**: Replaying offline operations in the wrong order or without monotonic timestamps corrupts foreign key relationships and application state.

SyncLoom provides an open-source, self-hosted, single-binary sync engine and lightweight client SDK:
- **0ms Client-Side Latency**: All UI reads and writes execute against local client SQLite (running in Wasm/OPFS in the browser, or native SQLite on mobile).
- **Postgres Change Data Capture (CDC)**: Server sidecar listens directly to PostgreSQL Logical Replication (`pgoutput` plugin), capturing row-level inserts, updates, and deletes without database triggers.
- **Hybrid Logical Clock (HLC) & Field-Level CRDTs**: Guarantees deterministic conflict resolution. Concurrent edits to different columns of the same row merge automatically; simultaneous edits to the same column resolve via monotonic Hybrid Logical Clocks.
- **Transaction-Aware Batched Sync**: Preserves Postgres atomic transactions across WebSocket deltas, preventing inconsistent intermediate states.
- **Reliable Offline Mutation Queue**: Persists transactions on client disk when network connectivity drops, replaying mutations in strict FIFO sequence with idempotency upon reconnecting.
- **Embedded Web Studio & Simulator**: Zero-dependency Go backend managing WebSocket delta streaming alongside an embedded React 19 monitoring studio with a live dual-peer conflict sandbox.

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
                        |  * Standalone / Demo CDC Fallback |
                        |  * Transactional Row Delta Stream |
                        +-----------------+-----------------+
                                          |
                        +-----------------v-----------------+
                        |   Interactive Web Studio & CLI    |
                        |  * Live Peer Sync Graph (Port 9330|
                        |  * Conflict Resolution Audit Log  |
                        |  * Interactive 2-Peer Simulator   |
                        +-----------------------------------+
```

---

## 2. Directory Structure

```
syncloom/
├── cmd/
│   └── syncloom/
│       └── main.go               # Single-binary sync server entrypoint (CLI)
├── internal/
│   ├── pgcdc/
│   │   ├── replicator.go         # PostgreSQL logical replication listener (pglogrepl)
│   │   ├── parser.go             # Ingests pgoutput relation, insert, update, delete
│   │   ├── wal_tracker.go        # Tracks confirmed LSN (Log Sequence Number)
│   │   └── standalone_cdc.go     # Embedded CDC engine for demo & local development
│   ├── crdt/
│   │   ├── hlc.go                # Hybrid Logical Clock implementation
│   │   ├── resolver.go           # Field-level Last-Write-Wins (LWW) resolver
│   │   ├── delta.go              # Compact delta records and metadata structures
│   │   └── resolver_test.go      # CRDT concurrency and convergence test suite
│   ├── hub/
│   │   ├── client.go             # WebSocket client connection handler
│   │   ├── room.go               # Table and row-level subscription routing
│   │   ├── broadcast.go          # Fan-out delta publisher to subscribed peers
│   │   └── hub_test.go           # High-concurrency broadcast benchmarks
│   ├── auth/
│   │   └── jwt_validator.go      # Row-level security & user tenant isolation
│   └── server/
│       ├── api.go                # REST API for status, metrics, conflicts, schema
│       └── static.go             # Embedded Vite frontend assets (go:embed)
├── sdk/
│   └── typescript/
│       ├── src/
│       │   ├── hlc.ts            # Client-side Hybrid Logical Clock
│       │   ├── types.ts          # Delta, mutation, query, and config typings
│       │   ├── sqlite_storage.ts # SQLite storage adapter (Wasm/OPFS & in-memory)
│       │   ├── queue.ts          # Persistent offline mutation FIFO queue
│       │   ├── sync_socket.ts    # WebSocket client with backoff and reconnection
│       │   ├── client.ts         # SyncLoomClient main entrypoint
│       │   ├── hooks.ts          # React 19 hooks (useSyncLoom, useSyncQuery, etc.)
│       │   └── index.ts          # SDK public exports
│       ├── package.json
│       ├── tsconfig.json
│       └── tests/
├── web/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx             # Studio navigation & connection indicator
│   │   │   ├── ActivePeersList.tsx    # Connected clients & sync status
│   │   │   ├── ConflictLogTable.tsx   # Merged concurrent edits audit trail
│   │   │   ├── ReplicationLagGauge.tsx# Sub-20ms replication latency gauge
│   │   │   ├── TableSyncMatrix.tsx    # Synchronized tables and live change stream
│   │   │   └── PeerSimulator.tsx      # Dual-client offline conflict simulator
│   │   ├── hooks/
│   │   │   └── useSyncStats.ts        # Live stats stream hook
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── docs/
│   ├── ARCHITECTURE.md           # Distributed system design & protocol specs
│   ├── CRDT_SPEC.md              # Mathematical specification of HLC & LWW
│   ├── PG_CDC_SETUP.md           # PostgreSQL publication & replication setup
│   └── SDK_GUIDE.md              # TypeScript SDK integration guide
├── go.mod
├── go.sum
└── README.md
```

---

## 3. Implementation Roadmap & Detailed Task Breakdown

### Phase 1: Core CRDT & Hybrid Logical Clock Engine (`internal/crdt`)
- [x] Task 1.1: `internal/crdt/hlc.go`
  - Hybrid Logical Clock implementation with physical wall clock (ms), logical counter, and client node identifier.
  - Strict monotonic ordering ($T_1 < T_2$), tick generation, and message reception logic.
  - Formatted serialization (`HLC(time.counter@node)`) and binary/JSON encoding.
- [x] Task 1.2: `internal/crdt/delta.go`
  - Delta structures: `OperationType` (INSERT, UPDATE, DELETE), `ColumnDelta`, `RowDelta`, `TransactionDelta`.
  - Column-level metadata tracking for CRDT resolution (`_syncloom_meta`).
- [x] Task 1.3: `internal/crdt/resolver.go`
  - Field-level Last-Write-Wins (LWW) resolver.
  - Automatic column merging for non-conflicting fields.
  - Deterministic tie-breaking on simultaneous edits via monotonic HLC timestamps.
  - Conflict audit event logging.
- [x] Task 1.4: Unit & property-based tests in `internal/crdt/resolver_test.go`.

### Phase 2: PostgreSQL CDC Replicator & Standalone Engine (`internal/pgcdc`)
- [x] Task 2.1: `internal/pgcdc/replicator.go`
  - Connect to PostgreSQL replication slot via `jackc/pglogrepl` (`pgoutput` plugin).
  - Manage publication creation, replication slot negotiation, and standby status acknowledgments.
- [x] Task 2.2: `internal/pgcdc/parser.go`
  - Ingest and decode `RelationMessage`, `BeginMessage`, `CommitMessage`, `InsertMessage`, `UpdateMessage`, `DeleteMessage`.
  - Extract tuple values and map to atomic `TransactionDelta` with LSN sequence tracking.
- [x] Task 2.3: `internal/pgcdc/wal_tracker.go`
  - Track acknowledged LSN and checkpointing.
- [x] Task 2.4: `internal/pgcdc/standalone_cdc.go`
  - Embedded in-memory / SQLite CDC engine for standalone demo mode and local development when PostgreSQL logical replication is not configured.

### Phase 3: WebSocket Hub, Routing & Delta Broadcaster (`internal/hub`)
- [x] Task 3.1: `internal/hub/client.go`
  - Concurrent WebSocket client management, heartbeat ping/pong, and disconnect handling.
- [x] Task 3.2: `internal/hub/room.go`
  - Granular table and row-level subscription routing.
  - Filter evaluation (e.g., `project_id = '...'`).
- [x] Task 3.3: `internal/hub/broadcast.go`
  - Low-latency fan-out delta broadcaster (<20ms SLA).
  - Metrics tracking: broadcast latency, throughput, active connections, conflict counts.
- [x] Task 3.4: Inbound mutation pipeline:
  - Receive client mutation -> Validate HLC -> Apply CRDT resolution -> Persist / Replicate -> Fan out confirmed delta.

### Phase 4: Server HTTP API & CLI Runner (`internal/server`, `cmd/syncloom`)
- [x] Task 4.1: `internal/server/api.go`
  - REST endpoints: `/api/status`, `/api/metrics`, `/api/conflicts`, `/api/tables`, `/api/simulate`.
  - WebSocket upgrade endpoint `/ws`.
- [x] Task 4.2: `internal/server/static.go`
  - Embed compiled React 19 web studio assets via `embed.FS`.
- [x] Task 4.3: `cmd/syncloom/main.go`
  - CLI commands: `serve` (with `--port`, `--pg-dsn`, `--slot`, `--pub`, `--demo`), `init` (Postgres DDL script generation), `bench` (synthetic high-throughput benchmark).

### Phase 5: TypeScript Client SDK (`sdk/typescript`)
- [x] Task 5.1: `sdk/typescript/src/hlc.ts`
  - Client-side HLC implementation compatible with Go engine.
- [x] Task 5.2: `sdk/typescript/src/sqlite_storage.ts`
  - Persistent SQLite storage adapter for local tables, metadata (`_syncloom_meta`), and mutation queue (`_syncloom_mutations`).
- [x] Task 5.3: `sdk/typescript/src/queue.ts`
  - Reliable offline FIFO mutation queue with automatic retry, deduplication, and server reconciliation.
- [x] Task 5.4: `sdk/typescript/src/sync_socket.ts`
  - WebSocket client with exponential backoff, reconnect, and automatic resubscribe.
- [x] Task 5.5: `sdk/typescript/src/client.ts`
  - `SyncLoomClient` main class: 0ms local reads/writes, optimistic mutation application, background sync.
- [x] Task 5.6: `sdk/typescript/src/hooks.ts`
  - React 19 hooks: `useSyncLoom`, `useSyncQuery`, `useSyncMutation`, `useSyncStatus`.
- [x] Task 5.7: SDK automated tests and build scripts (`npm run build`, `npm test`).

### Phase 6: React 19 Web Studio (`web/`)
- [x] Task 6.1: Scaffolding with React 19, TypeScript, TailwindCSS, Lucide icons.
- [x] Task 6.2: Replication Lag Gauge: Visual speedometer showing real-time replication latency.
- [x] Task 6.3: Conflict Resolution Audit Log: Detailed table of resolved concurrent collisions with timestamp comparison and winning values.
- [x] Task 6.4: Table Sync Matrix: Synchronized tables, schemas, row counts, and live mutation stream.
- [x] Task 6.5: Interactive 2-Peer Simulator: Split-screen visual playground to simulate offline network partitions, trigger concurrent edits, and witness CRDT LWW convergence.
- [x] Task 6.6: Production build and embedding into Go binary.

### Phase 7: Verification, Documentation, Visual Assets & Portfolio Launch
- [x] Task 7.1: Go unit & integration tests, SDK test suite, and benchmark execution.
- [x] Task 7.2: Comprehensive technical documentation in `docs/` (Architecture, CRDT Spec, Postgres Setup, SDK Guide).
- [x] Task 7.3: Generate visual assets: `docs/images/logo.png`, screenshots `syncloom-1.png` through `syncloom-4.png`, and animated demo GIF `docs/images/syncloom_demo.gif`.
- [x] Task 7.4: Finalize humanized `README.md`.
- [x] Task 7.5: Portfolio Sync Phase 2: Migrate assets to `mtlg-site` and `mtlglabs-space`, set status LIVE, run `sync.js`, assert parity, and push.
