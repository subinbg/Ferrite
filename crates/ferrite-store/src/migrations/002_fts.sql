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
