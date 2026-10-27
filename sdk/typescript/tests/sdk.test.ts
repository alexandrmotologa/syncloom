import test from 'node:test';
import assert from 'node:assert';
import { HybridLogicalClock } from '../src/hlc.js';
import { MemoryStorageAdapter } from '../src/sqlite_storage.js';
import { SyncLoomClient } from '../src/client.js';
import { RowDelta } from '../src/types.js';

test('HybridLogicalClock - Monotonicity and Ordering', () => {
  const clock = new HybridLogicalClock('client-test');
  const t1 = clock.now();
  const t2 = clock.now();

  assert.strictEqual(HybridLogicalClock.compare(t1, t2), -1, 't1 should be before t2');
  assert.strictEqual(HybridLogicalClock.compare(t2, t1), 1, 't2 should be after t1');
  assert.strictEqual(HybridLogicalClock.compare(t1, t1), 0, 't1 should equal t1');

  const parsed = HybridLogicalClock.parseStatic(t1);
  assert.strictEqual(parsed.nodeId, 'client-test');
  assert(parsed.millis > 0);

  // Update with future timestamp
  const future = `HLC-${Date.now() + 10000}-0005@remote-node`;
  const tUpdated = clock.update(future);
  assert.strictEqual(HybridLogicalClock.compare(tUpdated, future), 1, 'updated clock must be after remote future');
});

test('MemoryStorageAdapter - CRUD Operations', async () => {
  const storage = new MemoryStorageAdapter();

  await storage.set('tasks', 'task-1', { id: 'task-1', title: 'Test Task' }, { title: 'HLC-100-0000@node' });
  const row = await storage.get('tasks', 'task-1');
  assert.strictEqual(row?.title, 'Test Task');

  const all = await storage.getAll('tasks');
  assert.strictEqual(all.length, 1);

  await storage.delete('tasks', 'task-1');
  const deleted = await storage.get('tasks', 'task-1');
  assert.strictEqual(deleted, null);
});

test('SyncLoomClient - Local 0ms Writes and Field-Level CRDT Merge', async () => {
  const storage = new MemoryStorageAdapter();
  const client = new SyncLoomClient({
    url: 'ws://localhost:9330/ws',
    nodeId: 'client-local',
    storage,
    autoSync: false, // Unit test mode without live network socket
  });

  // 1. Insert local task
  const inserted = await client.insert('tasks', {
    id: 'task-100',
    title: 'Local First Task',
    status: 'todo',
    assignee: 'Alex',
  });
  assert.strictEqual(inserted.title, 'Local First Task');

  // 2. Query returns immediately
  const tasks = await client.query('tasks');
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].id, 'task-100');

  // 3. Status shows 1 pending mutation in queue
  const status = await client.getStatus();
  assert.strictEqual(status.pendingMutations, 1);

  // 4. Remote delta arrives updating ONLY 'status' with a newer timestamp
  const remoteHLC = `HLC-${Date.now() + 5000}-0001@remote-server`;
  const remoteDelta: RowDelta = {
    id: 'remote-delta-1',
    table: 'tasks',
    primaryKey: 'task-100',
    operation: 'UPDATE',
    columns: { status: 'in_progress' },
    colMeta: { status: remoteHLC },
    timestamp: remoteHLC,
    nodeId: 'remote-server',
    createdAt: Date.now(),
  };

  // Directly call internal private method via cast to test CRDT merge
  await (client as any).applyRemoteDelta(remoteDelta);

  // 5. Verify non-conflicting fields merged: 'title' and 'assignee' intact, 'status' updated!
  const merged = await client.get('tasks', 'task-100');
  assert.strictEqual(merged?.title, 'Local First Task', 'local title must be preserved');
  assert.strictEqual(merged?.assignee, 'Alex', 'local assignee must be preserved');
  assert.strictEqual(merged?.status, 'in_progress', 'status must be merged from remote');

  client.close();
});
