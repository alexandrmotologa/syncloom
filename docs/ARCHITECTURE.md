# SyncLoom Architecture

SyncLoom connects client-side SQLite instances to a central PostgreSQL database. Reads and writes execute against local SQLite in 0ms. Changes propagate through PostgreSQL logical replication and stream to connected peers over WebSockets.

## System Topology

```
+-----------------------------------------------------------------------------+
|                                  PostgreSQL                                 |
|                         WAL Engine & Logical Slot                           |
+--------------------------------------+--------------------------------------+
                                       |
                   pgoutput Logical Stream (TCP)
                                       |
+--------------------------------------v--------------------------------------+
|                           SyncLoom Go Sidecar                               |
|                                                                             |
|   +--------------------+   +-------------------+   +--------------------+   |
|   |   pglogrepl CDC    |-->|   CRDT Resolver   |-->|   WebSocket Hub    |   |
|   |  Relation & Tuple  |   |    HLC Ordering   |   |   Room Routing     |   |
|   +--------------------+   +-------------------+   +--------------------+   |
|                                                              ^              |
+--------------------------------------------------------------|--------------+
                                                               |
                                            Bidirectional Delta Stream (WS)
                                                               |
               +-----------------------------------------------+
               |                                               |
+--------------v---------------+               +---------------v--------------+
|     Client SDK (Browser)     |               |      Client SDK (Mobile)     |
|   * Wasm / OPFS SQLite       |               |   * Native SQLite            |
|   * Local 0ms Reads/Writes   |               |   * Local 0ms Reads/Writes   |
|   * Offline Mutation Queue   |               |   * Offline Mutation Queue   |
|   * React 19 State Hooks     |               |   * Mobile State Hooks       |
+------------------------------+               +------------------------------+
```

## Core Components

### 1. PostgreSQL Logical Replication Listener (`internal/pgcdc`)
SyncLoom acts as a logical replication subscriber. It establishes a replication connection to PostgreSQL using the `pgoutput` plugin.

1. **Relation Caching**: When tables are modified, PostgreSQL sends `RelationMessage` packets containing column names, types, and replica identities. SyncLoom caches these schemas in memory.
2. **Tuple Decoding**: For every `INSERT`, `UPDATE`, or `DELETE`, PostgreSQL streams row data. SyncLoom converts these tuples into unified `RowDelta` structs.
3. **Transaction Grouping**: Operations between `BeginMessage` and `CommitMessage` are grouped into atomic `TransactionDelta` packages, ensuring partial transactions never reach clients.
4. **LSN Standby Acknowledgement**: SyncLoom regularly confirms flushed and applied Log Sequence Numbers (`SendStandbyStatusUpdate`), allowing PostgreSQL to safely recycle WAL segments.

### 2. Hybrid Logical Clock & CRDT Engine (`internal/crdt`)
SyncLoom uses Hybrid Logical Clocks (HLC) to order events across distributed nodes without synchronized physical clocks.

- Each timestamp contains physical milliseconds, a logical counter, and a client node ID: `HLC-<millis>-<counter>@<nodeId>`.
- Clocks advance monotonically on every local mutation and on receiving remote messages.
- Conflict resolution uses field-level Last-Write-Wins (LWW). Concurrent edits to distinct columns of the same row merge automatically. Simultaneous edits to the same column resolve in favor of the higher HLC timestamp.

### 3. WebSocket Hub & Subscription Broadcaster (`internal/hub`)
The server sidecar maintains persistent WebSocket connections with active clients.

- **Granular Subscriptions**: Clients subscribe to specific tables or wildcard scopes (`subscribe("tasks")`).
- **Fan-Out Dispatch**: Inbound WAL events or client mutations are dispatched to matching subscribers in under 20ms.
- **Inbound Mutation Pipeline**: When an online or reconnecting client uploads mutations, the hub updates its clock, applies the CRDT merge, acknowledges the mutation to the sender, and broadcasts the confirmed delta to peers.

### 4. Client SDK (`sdk/typescript`)
The TypeScript SDK provides a local-first interface for web and mobile applications:
- **0ms Query Latency**: Queries execute synchronously against local SQLite or memory storage.
- **Optimistic Mutation Execution**: Local writes return immediately and update UI components before network transmission.
- **Offline Mutation Queue**: If network connectivity drops, mutations are persisted in `_syncloom_mutations`. When connectivity resumes, the queue flushes in strict FIFO order.
- **React 19 Integration**: Hooks like `useSyncQuery` and `useSyncMutation` leverage React transitions for smooth re-rendering without loading spinners.
