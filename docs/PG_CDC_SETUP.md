# PostgreSQL CDC Setup Guide

This guide covers configuring PostgreSQL for native logical replication with SyncLoom.

## 1. Prerequisites

PostgreSQL 14 or higher with superuser or replication privileges.

## 2. Server Configuration

Ensure your `postgresql.conf` contains the following parameters:

```ini
# postgresql.conf
wal_level = logical
max_replication_slots = 10
max_wal_senders = 10
```

If you change `wal_level`, you must restart PostgreSQL:

```bash
# Ubuntu / Debian
sudo systemctl restart postgresql

# Windows
Restart-Service postgresql-x64-14
```

## 3. Dedicated Replication User

Create a dedicated role for SyncLoom with replication rights:

```sql
CREATE ROLE syncloom_user WITH REPLICATION LOGIN PASSWORD 'your_secure_password';

GRANT USAGE ON SCHEMA public TO syncloom_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO syncloom_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO syncloom_user;
```

## 4. Publication Setup

Create a publication that exports changes to SyncLoom:

```sql
-- Publish all tables
CREATE PUBLICATION syncloom_pub FOR ALL TABLES;

-- Or publish specific tables
-- CREATE PUBLICATION syncloom_pub FOR TABLE tasks, projects, comments;
```

## 5. Replica Identity

To ensure PostgreSQL emits complete column values on updates and deletes, set the replica identity to `FULL` on synchronized tables:

```sql
ALTER TABLE tasks REPLICA IDENTITY FULL;
ALTER TABLE projects REPLICA IDENTITY FULL;
```

## 6. Optional CRDT Metadata Column

For column-level Last-Write-Wins tracking, add an optional JSONB column to your synchronized tables:

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS _syncloom_meta JSONB DEFAULT '{}'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS _syncloom_meta JSONB DEFAULT '{}'::jsonb;
```

## 7. Starting SyncLoom

Start the SyncLoom server pointing to your PostgreSQL instance:

```bash
syncloom serve \
  --pg-dsn "postgres://syncloom_user:your_secure_password@localhost:5432/mydb?sslmode=disable" \
  --port 9330
```
