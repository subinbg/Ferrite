use crate::types::connection::DatabaseDialect;
use sqlparser::ast::{Query, SetExpr, Statement};
use sqlparser::dialect::{Dialect, PostgreSqlDialect, SQLiteDialect};
use sqlparser::parser::Parser;
use sqlparser::tokenizer::{Token, Tokenizer};

/// Validate that `sql` is strictly read-only, parsing with the grammar of the target
/// dialect. Returns `Ok(())` if safe, `Err(reason)` if blocked.
pub fn validate_readonly_sql(sql: &str, dialect: DatabaseDialect) -> Result<(), String> {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return Err("Empty query".to_string());
    }

    let parser_dialect = dialect_impl(dialect);

    let statements = Parser::parse_sql(parser_dialect.as_ref(), trimmed)
        .map_err(|e| format!("SQL parse error: {e}"))?;

    // Exactly one statement — reject empty and multi-statement payloads.
    match statements.as_slice() {
        [] => return Err("Empty query".to_string()),
        [_only] => {}
        _ => {
            return Err(
                "Blocked: multiple statements — submit a single read-only query".to_string(),
            );
        }
    }

    // Structural (dialect-agnostic) analysis of the statement tree.
    check_statement_readonly(&statements[0])?;

    // Per-dialect dangerous-function blocklist, matched against actual function calls
    // (identifier immediately followed by `(`) rather than a raw substring scan.
    check_blocked_functions(parser_dialect.as_ref(), trimmed, dialect)?;

    Ok(())
}

fn dialect_impl(dialect: DatabaseDialect) -> Box<dyn Dialect> {
    match dialect {
        DatabaseDialect::PostgreSQL => Box::new(PostgreSqlDialect {}),
        DatabaseDialect::SQLite => Box::new(SQLiteDialect {}),
    }
}

/// The top-level statement must be a read-only query or a non-executing EXPLAIN of one.
fn check_statement_readonly(stmt: &Statement) -> Result<(), String> {
    match stmt {
        Statement::Query(query) => check_query_readonly(query),
        Statement::Explain {
            analyze, statement, ..
        } => {
            // EXPLAIN ANALYZE actually runs the statement, so it is never read-only.
            if *analyze {
                return Err("Blocked: EXPLAIN ANALYZE executes the statement".to_string());
            }
            // Only allow explaining an otherwise read-only statement.
            check_statement_readonly(statement)
        }
        other => Err(format!(
            "Blocked: {} — only SELECT, WITH, and EXPLAIN are allowed",
            statement_type_name(other)
        )),
    }
}

/// A query is read-only only if its CTEs, body, and clauses are all read-only.
fn check_query_readonly(query: &Query) -> Result<(), String> {
    // Data-modifying CTEs (e.g. `WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x`)
    // are a real read-only bypass in PostgreSQL — validate every CTE body recursively.
    if let Some(with) = &query.with {
        for cte in &with.cte_tables {
            check_query_readonly(&cte.query)?;
        }
    }

    // Row-locking clauses (FOR UPDATE / FOR SHARE / ...) take write-intent locks.
    if !query.locks.is_empty() {
        return Err("Blocked: row-locking clause (FOR UPDATE/SHARE) is not read-only".to_string());
    }

    check_setexpr_readonly(&query.body)
}

fn check_setexpr_readonly(body: &SetExpr) -> Result<(), String> {
    match body {
        SetExpr::Select(select) => {
            // `SELECT ... INTO new_table` materializes a table (PostgreSQL/T-SQL).
            if select.into.is_some() {
                return Err("Blocked: SELECT ... INTO creates a table".to_string());
            }
            Ok(())
        }
        SetExpr::Query(inner) => check_query_readonly(inner),
        SetExpr::SetOperation { left, right, .. } => {
            check_setexpr_readonly(left)?;
            check_setexpr_readonly(right)
        }
        SetExpr::Values(_) | SetExpr::Table(_) => Ok(()),
        // Insert/Update/Delete/Merge (and any future write forms) are blocked by default.
        _ => Err("Blocked: data-modifying statement is not allowed inside a query".to_string()),
    }
}

/// Reject calls to dangerous built-in functions. A function call is an identifier token
/// immediately followed by `(`, so string literals and bare column references that merely
/// share a name with a blocked function are not flagged.
fn check_blocked_functions(
    dialect: &dyn Dialect,
    sql: &str,
    db: DatabaseDialect,
) -> Result<(), String> {
    let tokens = Tokenizer::new(dialect, sql)
        .tokenize()
        .map_err(|e| format!("SQL tokenize error: {e}"))?;

    let significant: Vec<&Token> = tokens
        .iter()
        .filter(|t| !matches!(t, Token::Whitespace(_)))
        .collect();

    for pair in significant.windows(2) {
        if let (Token::Word(word), Token::LParen) = (pair[0], pair[1]) {
            let name = word.value.to_ascii_lowercase();
            if is_blocked_function(&name, db) {
                return Err(format!("Blocked function: {}", word.value));
            }
        }
    }

    Ok(())
}

fn is_blocked_function(name: &str, db: DatabaseDialect) -> bool {
    match db {
        DatabaseDialect::PostgreSQL => PG_BLOCKED_FUNCTIONS.contains(&name),
        DatabaseDialect::SQLite => SQLITE_BLOCKED_FUNCTIONS.contains(&name),
    }
}

/// PostgreSQL functions that sleep, touch the filesystem, manage the server, or reach
/// other hosts — none of which belong in a read-only query.
const PG_BLOCKED_FUNCTIONS: &[&str] = &[
    "pg_sleep",
    "pg_terminate_backend",
    "pg_cancel_backend",
    "pg_read_file",
    "pg_read_binary_file",
    "pg_write_file",
    "pg_reload_conf",
    "pg_rotate_logfile",
    "pg_ls_dir",
    "pg_stat_file",
    "pg_read_server_files",
    "lo_import",
    "lo_export",
    "lo_unlink",
    "dblink",
    "dblink_exec",
    "dblink_connect",
    "set_config",
];

/// SQLite functions that load native code or touch the filesystem.
const SQLITE_BLOCKED_FUNCTIONS: &[&str] = &[
    "load_extension",
    "writefile",
    "readfile",
    "edit",
    "fts3_tokenizer",
];

fn statement_type_name(stmt: &Statement) -> &'static str {
    match stmt {
        Statement::Insert(_) => "INSERT",
        Statement::Update { .. } => "UPDATE",
        Statement::Delete(_) => "DELETE",
        Statement::Drop { .. } => "DROP",
        Statement::AlterTable { .. } => "ALTER TABLE",
        Statement::CreateTable { .. } => "CREATE TABLE",
        Statement::CreateView { .. } => "CREATE VIEW",
        Statement::CreateIndex(_) => "CREATE INDEX",
        Statement::Truncate { .. } => "TRUNCATE",
        Statement::Grant { .. } => "GRANT",
        Statement::Revoke { .. } => "REVOKE",
        Statement::Copy { .. } => "COPY",
        Statement::Set(_) => "SET",
        Statement::Call(_) => "CALL",
        Statement::StartTransaction { .. } => "START TRANSACTION",
        Statement::Commit { .. } => "COMMIT",
        Statement::Rollback { .. } => "ROLLBACK",
        Statement::Pragma { .. } => "PRAGMA",
        _ => "unsupported statement",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pg(sql: &str) -> Result<(), String> {
        validate_readonly_sql(sql, DatabaseDialect::PostgreSQL)
    }

    fn sqlite(sql: &str) -> Result<(), String> {
        validate_readonly_sql(sql, DatabaseDialect::SQLite)
    }

    #[test]
    fn test_select_allowed() {
        assert!(pg("SELECT 1").is_ok());
        assert!(pg("SELECT * FROM users WHERE id = 1").is_ok());
        assert!(pg("select count(*) from orders").is_ok());
        assert!(pg("WITH cte AS (SELECT 1) SELECT * FROM cte").is_ok());
        assert!(pg("EXPLAIN SELECT * FROM users").is_ok());
        assert!(pg("SELECT * FROM users;").is_ok());
        assert!(pg("SELECT a FROM t UNION SELECT b FROM u").is_ok());
    }

    #[test]
    fn test_mutations_blocked() {
        assert!(pg("INSERT INTO users VALUES (1)").is_err());
        assert!(pg("UPDATE users SET name = 'x'").is_err());
        assert!(pg("DELETE FROM users").is_err());
        assert!(pg("DROP TABLE users").is_err());
        assert!(pg("ALTER TABLE users ADD col int").is_err());
        assert!(pg("CREATE TABLE foo (id int)").is_err());
        assert!(pg("TRUNCATE users").is_err());
        assert!(pg("GRANT ALL ON users TO public").is_err());
    }

    #[test]
    fn test_multi_statement_blocked() {
        assert!(pg("SELECT 1; INSERT INTO users VALUES (1)").is_err());
    }

    #[test]
    fn test_dangerous_functions_blocked() {
        assert!(pg("SELECT pg_sleep(10)").is_err());
        assert!(pg("SELECT dblink('host=evil', 'SELECT 1')").is_err());
        assert!(pg("SELECT pg_read_file('/etc/passwd')").is_err());
        assert!(pg("SELECT pg_terminate_backend(123)").is_err());
        assert!(pg("SELECT PG_SLEEP(1)").is_err());
        assert!(pg("SELECT set_config('x', 'y', false)").is_err());
    }

    #[test]
    fn test_function_check_is_precise() {
        // A bare column reference that merely shares a name with a blocked function is fine.
        assert!(pg("SELECT pg_sleep FROM t").is_ok());
        assert!(pg("SELECT 1 AS pg_read_file").is_ok());
        // A string literal containing a blocked name is not a function call.
        assert!(pg("SELECT 'pg_read_file is scary'").is_ok());
    }

    #[test]
    fn test_data_modifying_cte_blocked() {
        assert!(pg("WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x").is_err());
        assert!(pg("WITH x AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM x").is_err());
        assert!(pg("WITH x AS (UPDATE t SET a = 1 RETURNING *) SELECT * FROM x").is_err());
    }

    #[test]
    fn test_select_into_blocked() {
        assert!(pg("SELECT * INTO new_table FROM users").is_err());
    }

    #[test]
    fn test_locking_clause_blocked() {
        assert!(pg("SELECT * FROM t FOR UPDATE").is_err());
        assert!(pg("SELECT * FROM t FOR SHARE").is_err());
    }

    #[test]
    fn test_explain_analyze_blocked() {
        assert!(pg("EXPLAIN ANALYZE SELECT * FROM t").is_err());
        assert!(pg("EXPLAIN ANALYZE DELETE FROM t").is_err());
        // Plain EXPLAIN of a non-query is also rejected.
        assert!(pg("EXPLAIN INSERT INTO t VALUES (1)").is_err());
    }

    #[test]
    fn test_empty_blocked() {
        assert!(pg("").is_err());
        assert!(pg("   ").is_err());
    }

    #[test]
    fn test_complex_select_allowed() {
        assert!(pg(
            "SELECT u.id, u.name, COUNT(o.id) FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name HAVING COUNT(o.id) > 5 ORDER BY u.name LIMIT 10"
        ).is_ok());
    }

    #[test]
    fn test_set_blocked() {
        assert!(pg("SET search_path TO public").is_err());
    }

    #[test]
    fn test_transaction_blocked() {
        assert!(pg("BEGIN").is_err());
        assert!(pg("COMMIT").is_err());
    }

    #[test]
    fn test_sqlite_dialect() {
        assert!(sqlite("SELECT * FROM t").is_ok());
        assert!(sqlite("DELETE FROM t").is_err());
        assert!(sqlite("PRAGMA table_info(t)").is_err());
        assert!(sqlite("SELECT load_extension('evil.so')").is_err());
    }
}
