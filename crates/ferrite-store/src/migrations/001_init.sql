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

CREATE VIRTUAL TABLE IF NOT EXISTS query_history_fts USING fts5(
    sql_text,
    content='query_history',
    content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS history_ai AFTER INSERT ON query_history BEGIN
    INSERT INTO query_history_fts(rowid, sql_text) VALUES (new.rowid, new.sql_text);
END;

CREATE TRIGGER IF NOT EXISTS history_ad AFTER DELETE ON query_history BEGIN
    INSERT INTO query_history_fts(query_history_fts, rowid, sql_text) VALUES('delete', old.rowid, old.sql_text);
END;

CREATE TRIGGER IF NOT EXISTS history_au AFTER UPDATE ON query_history BEGIN
    INSERT INTO query_history_fts(query_history_fts, rowid, sql_text) VALUES('delete', old.rowid, old.sql_text);
    INSERT INTO query_history_fts(rowid, sql_text) VALUES (new.rowid, new.sql_text);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS query_versions_fts USING fts5(
    title,
    sql_text,
    label,
    notes,
    content='query_versions',
    content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS versions_ai AFTER INSERT ON query_versions BEGIN
    INSERT INTO query_versions_fts(rowid, title, sql_text, label, notes)
    VALUES (new.rowid, new.title, new.sql_text, new.label, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS versions_ad AFTER DELETE ON query_versions BEGIN
    INSERT INTO query_versions_fts(query_versions_fts, rowid, title, sql_text, label, notes)
    VALUES('delete', old.rowid, old.title, old.sql_text, old.label, old.notes);
END;

CREATE TRIGGER IF NOT EXISTS versions_au AFTER UPDATE ON query_versions BEGIN
    INSERT INTO query_versions_fts(query_versions_fts, rowid, title, sql_text, label, notes)
    VALUES('delete', old.rowid, old.title, old.sql_text, old.label, old.notes);
    INSERT INTO query_versions_fts(rowid, title, sql_text, label, notes)
    VALUES (new.rowid, new.title, new.sql_text, new.label, new.notes);
END;

CREATE TABLE IF NOT EXISTS activity_log (
    id              TEXT PRIMARY KEY,
    activity_type   TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'ui',
    connection_id   TEXT,
    tool_name       TEXT,
    request_text    TEXT NOT NULL,
    request_params  TEXT,
    status          TEXT NOT NULL,
    error_message   TEXT,
    result_summary  TEXT,
    row_count       INTEGER,
    duration_ms     INTEGER,
    executed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_source ON activity_log(source);
CREATE INDEX IF NOT EXISTS idx_activity_executed_at ON activity_log(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_connection ON activity_log(connection_id);

CREATE VIRTUAL TABLE IF NOT EXISTS activity_log_fts USING fts5(
    request_text, tool_name, result_summary,
    content='activity_log', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS activity_ai AFTER INSERT ON activity_log BEGIN
    INSERT INTO activity_log_fts(rowid, request_text, tool_name, result_summary)
    VALUES (new.rowid, new.request_text, new.tool_name, new.result_summary);
END;

CREATE TRIGGER IF NOT EXISTS activity_ad AFTER DELETE ON activity_log BEGIN
    INSERT INTO activity_log_fts(activity_log_fts, rowid, request_text, tool_name, result_summary)
    VALUES('delete', old.rowid, old.request_text, old.tool_name, old.result_summary);
END;
