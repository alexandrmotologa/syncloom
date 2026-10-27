<p align="center">
  <img src="docs/images/logo.png?raw=true" alt="SyncLoom Logo" width="130" style="border-radius: 28px;" />
</p>

<h1 align="center">SyncLoom</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.23-00ADD8?style=flat&logo=go" alt="Go 1.23" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript" alt="TypeScript 5.7" />
  <img src="https://img.shields.io/badge/Replication-pgoutput-336791?style=flat&logo=postgresql" alt="PostgreSQL Logical Replication" />
  <img src="https://img.shields.io/badge/Propagation-%3C20ms-10b981?style=flat" alt="Sub-20ms Propagation" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
</p>

<p align="center">
  Local-first CRDT and SQLite-to-Postgres real-time sync engine with logical replication, hybrid logical clocks, and TypeScript SDK.
</p>

---

<p align="center">
  <img src="docs/images/syncloom_demo.gif" alt="SyncLoom Animated Demo" width="100%" />
</p>

SyncLoom connects client-side SQLite instances directly to a central PostgreSQL database. Client reads and writes execute against local storage in 0ms. Changes stream through PostgreSQL native logical replication (`pgoutput`) and broadcast to connected peers over WebSockets in under 20ms. Concurrent offline edits resolve deterministically using Hybrid Logical Clocks and field-level Conflict-Free Replicated Data Types (CRDTs).

---

## Capabilities

- **0ms Local Reads and Writes**: Client queries execute against local SQLite (Wasm/OPFS in browsers, native SQLite on mobile) without waiting for network roundtrips.
- **PostgreSQL Logical Replication (CDC)**: Reads database modifications via PostgreSQL WAL logical replication (`pgoutput` plugin). Operates without custom triggers, audit tables, or polling loops.
- **Hybrid Logical Clock (HLC)**: Combines physical wall clock time with Lamport logical counters. Preserves strict causal ordering across distributed devices without synchronized system clocks.
- **Field-Level Last-Write-Wins (LWW)**: Edits to different columns of the same row merge automatically without data loss. Concurrent edits to the same column resolve deterministically using monotonic HLC timestamps.
- **Transaction-Aware Delta Streaming**: Groups atomic database operations into single transaction payloads, preventing partial state reads on client devices.
- **Persistent Offline Mutation Queue**: Stores operations in a local SQLite queue table (`_syncloom_mutations`) during network disconnects and replays them in FIFO sequence upon reconnecting.
- **Single-Binary Go Server & Web Studio**: Zero-dependency backend serving WebSocket replication streams alongside an embedded React 19 monitoring studio.
- **Interactive Conflict Sandbox**: Studio includes a two-peer simulator to test offline network partitions, trigger concurrent collisions, and watch CRDT convergence live.

---

## Screenshots

| Studio Overview & Latency Gauge | Interactive 2-Peer Conflict Simulator |
| :---: | :---: |
| ![Studio Overview](docs/images/syncloom-1.png) | ![Conflict Simulator](docs/images/syncloom-2.png) |

| Conflict Resolution Audit Log | Table Synchronization Matrix |
| :---: | :---: |
| ![Conflict Audit](docs/images/syncloom-3.png) | ![Table Matrix](docs/images/syncloom-4.png) |

---

## Architecture

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

## Performance Benchmarks

Measured on a standard developer workstation (AMD Ryzen / Go 1.23 runtime):

| Metric | Result | Target SLA |
| :--- | :--- | :--- |
| **Throughput** | **921,675 ops/sec** | > 50,000 ops/sec |
| **Average Merge Latency** | **1.08 µs (0.0011 ms)** | < 100 µs |
| **End-to-End WebSocket Propagation** | **1.25 ms** | < 20 ms |
| **Memory Footprint (Idle)** | **18 MB** | < 50 MB |
| **Client Local Read/Write** | **0.02 ms (0ms UI tier)** | < 1 ms |

---

## Quickstart

### 1. Download and Run SyncLoom Server

Run with built-in standalone demo mode:

```bash
# Clone repository
git clone https://github.com/alexandrmotologa/syncloom.git
cd syncloom

# Build binary
go build -o syncloom.exe ./cmd/syncloom

# Start in demo mode on port 9330
./syncloom.exe serve --demo --port 9330
```

Open `http://localhost:9330` in your browser to view the live studio and conflict simulator.

### 2. Connect to PostgreSQL in Production

Configure PostgreSQL `wal_level = logical` in `postgresql.conf` and create a publication:

```sql
CREATE PUBLICATION syncloom_pub FOR ALL TABLES;
ALTER TABLE tasks REPLICA IDENTITY FULL;
```

Start SyncLoom pointing to your database:

```bash
./syncloom.exe serve \
  --pg-dsn "postgres://postgres:password@localhost:5432/mydb?sslmode=disable" \
  --port 9330
```

---

## Client SDK Integration

Install the TypeScript package:

```bash
npm install @syncloom/client
```

### React 19 Local-First Hook Example

```tsx
import React, { useState } from 'react';
import { SyncLoomClient, useSyncQuery, useSyncMutation, useSyncStatus } from '@syncloom/client';

const client = new SyncLoomClient({
  url: 'ws://localhost:9330/ws',
});

export function TaskApp() {
  // Instant 0ms local read from SQLite, reactive to incoming WebSocket deltas
  const { data: tasks } = useSyncQuery(client, 'tasks');
  const { insert, update, remove } = useSyncMutation(client);
  const status = useSyncStatus(client);
  const [title, setTitle] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    await insert('tasks', { title, status: 'todo' });
    setTitle('');
  };

  return (
    <div>
      <div>Sync Status: {status.connected ? 'Online' : 'Offline'} ({status.pendingMutations} queued)</div>

      <form onSubmit={handleCreate}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task..." />
        <button type="submit">Add (0ms)</button>
      </form>

      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <span>{task.title}</span>
            <button onClick={() => update('tasks', task.id, { status: 'done' })}>Complete</button>
            <button onClick={() => remove('tasks', task.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## CLI Reference

```
Usage:
  syncloom [command]

Available Commands:
  serve       Start the SyncLoom synchronization server and embedded Web Studio
  init        Generate PostgreSQL DDL configuration script for logical replication
  bench       Run synthetic high-throughput CRDT and delta broadcast benchmark
  version     Print SyncLoom version information

Flags:
  -p, --port int       HTTP and WebSocket port (default 9330)
      --pg-dsn string  PostgreSQL connection string
      --slot string    Logical replication slot name (default "syncloom_slot")
      --pub string     Publication name (default "syncloom_pub")
      --demo           Force standalone mode with built-in embedded CDC and demo data
      --node-id string Unique node identifier for Hybrid Logical Clock
```

---

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md)
- [CRDT & HLC Mathematical Specification](docs/CRDT_SPEC.md)
- [PostgreSQL CDC Setup Guide](docs/PG_CDC_SETUP.md)
- [TypeScript SDK Reference](docs/SDK_GUIDE.md)

---

## License

MIT License. Copyright (c) 2026 Alexandr Motologa.
