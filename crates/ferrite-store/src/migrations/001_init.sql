CREATE TABLE IF NOT EXISTS connections (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    dialect         TEXT NOT NULL,
    host            TEXT,
    port            INTEGER,
    database_name   TEXT,
    username        TEXT,
    password_enc    BLOB,
    password_nonce  BLOB,
    ssl_mode        TEXT DEFAULT 'prefer',
    color           TEXT,
    sort_order      INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS query_history (
    id              TEXT PRIMARY KEY,
    connection_id   TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    sql_text        TEXT NOT NULL,
    dialect         TEXT NOT NULL,
    status          TEXT NOT NULL,
    error_message   TEXT,
    row_count       INTEGER,
    duration_ms     INTEGER,
    executed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS query_versions (
    id              TEXT PRIMARY KEY,
    connection_id   TEXT REFERENCES connections(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    sql_text        TEXT NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    parent_id       TEXT REFERENCES query_versions(id) ON DELETE SET NULL,
    label           TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bind_variable_sets (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    connection_id   TEXT REFERENCES connections(id) ON DELETE SET NULL,
    variables       TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_connection ON query_history(connection_id);
CREATE INDEX IF NOT EXISTS idx_history_executed_at ON query_history(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_versions_connection ON query_versions(connection_id);
CREATE INDEX IF NOT EXISTS idx_versions_title ON query_versions(title);
CREATE INDEX IF NOT EXISTS idx_versions_parent ON query_versions(parent_id);
