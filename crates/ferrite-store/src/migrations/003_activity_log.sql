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
