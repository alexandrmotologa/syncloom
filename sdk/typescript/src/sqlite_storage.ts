import { Mutation, StorageAdapter } from './types.js';

interface StoredRow {
  data: Record<string, any>;
  colMeta: Record<string, string>;
  deleted: boolean;
}

/**
 * High-performance in-memory storage adapter with instant 0ms access.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private tables: Map<string, Map<string, StoredRow>> = new Map();
  private mutations: Map<string, Mutation> = new Map();

  async get(table: string, pk: string): Promise<Record<string, any> | null> {
    const tbl = this.tables.get(table);
    if (!tbl) return null;
    const row = tbl.get(pk);
    if (!row || row.deleted) return null;
    return { ...row.data };
  }

  async getAll(table: string): Promise<Record<string, any>[]> {
    const tbl = this.tables.get(table);
    if (!tbl) return [];
    const results: Record<string, any>[] = [];
    for (const row of tbl.values()) {
      if (!row.deleted) {
        results.push({ ...row.data });
      }
    }
    return results;
  }

  async set(table: string, pk: string, data: Record<string, any>, colMeta: Record<string, string>): Promise<void> {
    let tbl = this.tables.get(table);
    if (!tbl) {
      tbl = new Map();
      this.tables.set(table, tbl);
    }

    const existing = tbl.get(pk);
    const mergedData = existing ? { ...existing.data, ...data } : { ...data };
    const mergedMeta = existing ? { ...existing.colMeta, ...colMeta } : { ...colMeta };

    tbl.set(pk, {
      data: mergedData,
      colMeta: mergedMeta,
      deleted: false,
    });
  }

  async delete(table: string, pk: string): Promise<void> {
    const tbl = this.tables.get(table);
    if (!tbl) return;
    const existing = tbl.get(pk);
    if (existing) {
      existing.deleted = true;
    }
  }

  async getPendingMutations(): Promise<Mutation[]> {
    return Array.from(this.mutations.values())
      .filter((m) => m.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async addMutation(mutation: Mutation): Promise<void> {
    this.mutations.set(mutation.id, { ...mutation });
  }

  async removeMutation(id: string): Promise<void> {
    this.mutations.delete(id);
  }

  async updateMutationStatus(id: string, status: 'pending' | 'applied' | 'rejected'): Promise<void> {
    const m = this.mutations.get(id);
    if (m) {
      m.status = status;
    }
  }

  /**
   * Directly read internal column metadata for a row.
   */
  getColMeta(table: string, pk: string): Record<string, string> {
    const tbl = this.tables.get(table);
    if (!tbl) return {};
    const row = tbl.get(pk);
    return row ? { ...row.colMeta } : {};
  }
}

/**
 * SQLite Driver Interface for OPFS Wasm in web browsers and React Native SQLite.
 */
export interface SQLiteDriver {
  exec(sql: string, params?: any[]): Promise<any[]>;
}

/**
 * Persistent SQLite storage adapter using standard SQLite tables:
 * - Local data tables: user data
 * - `_syncloom_meta`: stores column HLC metadata
 * - `_syncloom_mutations`: offline FIFO mutation queue
 */
export class SQLiteStorageAdapter implements StorageAdapter {
  constructor(private driver: SQLiteDriver) {}

  async init(): Promise<void> {
    await this.driver.exec(`
      CREATE TABLE IF NOT EXISTS _syncloom_meta (
        table_name TEXT NOT NULL,
        primary_key TEXT NOT NULL,
        col_meta TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (table_name, primary_key)
      );
    `);

    await this.driver.exec(`
      CREATE TABLE IF NOT EXISTS _syncloom_mutations (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        primary_key TEXT NOT NULL,
        operation TEXT NOT NULL,
        columns TEXT NOT NULL,
        col_meta TEXT NOT NULL,
        hlc TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  async get(table: string, pk: string): Promise<Record<string, any> | null> {
    const rows = await this.driver.exec(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [pk]);
    return rows.length > 0 ? rows[0] : null;
  }

  async getAll(table: string): Promise<Record<string, any>[]> {
    return await this.driver.exec(`SELECT * FROM ${table}`);
  }

  async set(table: string, pk: string, data: Record<string, any>, colMeta: Record<string, string>): Promise<void> {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(',');
    const values = Object.values(data);

    // Upsert into table
    await this.driver.exec(
      `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`,
      values
    );

    // Update metadata table
    await this.driver.exec(
      `INSERT OR REPLACE INTO _syncloom_meta (table_name, primary_key, col_meta, deleted) VALUES (?, ?, ?, 0)`,
      [table, pk, JSON.stringify(colMeta)]
    );
  }

  async delete(table: string, pk: string): Promise<void> {
    await this.driver.exec(`DELETE FROM ${table} WHERE id = ?`, [pk]);
    await this.driver.exec(
      `UPDATE _syncloom_meta SET deleted = 1 WHERE table_name = ? AND primary_key = ?`,
      [table, pk]
    );
  }

  async getPendingMutations(): Promise<Mutation[]> {
    const rows = await this.driver.exec(
      `SELECT * FROM _syncloom_mutations WHERE status = 'pending' ORDER BY created_at ASC`
    );
    return rows.map((r) => ({
      id: r.id,
      table: r.table_name,
      primaryKey: r.primary_key,
      operation: r.operation,
      columns: JSON.parse(r.columns),
      colMeta: JSON.parse(r.col_meta),
      hlc: r.hlc,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  async addMutation(mutation: Mutation): Promise<void> {
    await this.driver.exec(
      `INSERT OR REPLACE INTO _syncloom_mutations 
       (id, table_name, primary_key, operation, columns, col_meta, hlc, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mutation.id,
        mutation.table,
        mutation.primaryKey,
        mutation.operation,
        JSON.stringify(mutation.columns),
        JSON.stringify(mutation.colMeta),
        mutation.hlc,
        mutation.status,
        mutation.createdAt,
      ]
    );
  }

  async removeMutation(id: string): Promise<void> {
    await this.driver.exec(`DELETE FROM _syncloom_mutations WHERE id = ?`, [id]);
  }

  async updateMutationStatus(id: string, status: 'pending' | 'applied' | 'rejected'): Promise<void> {
    await this.driver.exec(`UPDATE _syncloom_mutations SET status = ? WHERE id = ?`, [status, id]);
  }
}
