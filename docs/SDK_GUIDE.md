# SyncLoom Client SDK Guide

The `@syncloom/client` SDK provides local-first data synchronization for web, Node.js, and mobile applications.

## Installation

```bash
npm install @syncloom/client
```

## Basic Usage

```typescript
import { SyncLoomClient } from '@syncloom/client';

// Initialize client
const client = new SyncLoomClient({
  url: 'ws://localhost:9330/ws',
  nodeId: 'user-laptop-1',
  autoSync: true,
});

// 0ms instant local insert
const newTask = await client.insert('tasks', {
  title: 'Implement Local-First SQLite',
  status: 'in_progress',
  priority: 'urgent',
});

// 0ms instant local query
const allTasks = await client.query('tasks', (t) => t.status === 'in_progress');

// 0ms instant local update (updates only specific fields)
await client.update('tasks', newTask.id, {
  status: 'done',
});

// Subscribe to real-time table deltas
const unsubscribe = client.subscribeTable('tasks', (table, pk, data) => {
  console.log('Record updated in table:', table, pk, data);
});
```

## React 19 Integration

The SDK includes React 19 hooks designed for zero-latency UI updates.

```tsx
import React, { useState } from 'react';
import { SyncLoomClient, useSyncQuery, useSyncMutation, useSyncStatus } from '@syncloom/client';

const client = new SyncLoomClient({
  url: 'ws://localhost:9330/ws',
});

export function TaskList() {
  const { data: tasks, loading } = useSyncQuery(client, 'tasks');
  const { insert, update, remove } = useSyncMutation(client);
  const status = useSyncStatus(client);
  const [newTitle, setNewTitle] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await insert('tasks', { title: newTitle, status: 'todo' });
    setNewTitle('');
  };

  return (
    <div>
      <header>
        <span>Status: {status.connected ? 'Online' : 'Offline'}</span>
        <span>Pending Sync: {status.pendingMutations}</span>
      </header>

      <form onSubmit={handleCreate}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New task..."
        />
        <button type="submit">Add Task</button>
      </form>

      {loading ? (
        <p>Loading local database...</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <span>{task.title}</span>
              <button onClick={() => update('tasks', task.id, { status: 'done' })}>
                Mark Done
              </button>
              <button onClick={() => remove('tasks', task.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

## Offline Queue Behavior

When network connectivity is unavailable:
1. `insert`, `update`, and `delete` execute immediately against local storage (0ms).
2. Mutations are added to an internal queue table (`_syncloom_mutations`).
3. The UI continues to read and write normally with zero spinners.
4. When connectivity resumes, the queue flushes operations in FIFO order to the server.
5. In the event of concurrent edits on other devices, field-level CRDT Last-Write-Wins merges changes automatically.
