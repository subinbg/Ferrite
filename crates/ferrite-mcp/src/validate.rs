use ferrite_core::types::connection::DatabaseDialect;
use sqlparser::ast::Statement;
use sqlparser::dialect::{Dialect, PostgreSqlDialect, SQLiteDialect};
use sqlparser::parser::Parser;

/// Validates that a SQL string is strictly read-only using AST analysis, parsing with the
/// grammar of the target dialect. Returns Ok(()) if safe, Err(reason) if blocked.
pub fn validate_readonly_sql(sql: &str, dialect: DatabaseDialect) -> Result<(), String> {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return Err("Empty query".to_string());
    }

    let parser_dialect: Box<dyn Dialect> = match dialect {
        DatabaseDialect::PostgreSQL => Box::new(PostgreSqlDialect {}),
        DatabaseDialect::SQLite => Box::new(SQLiteDialect {}),
    };
    let statements = Parser::parse_sql(parser_dialect.as_ref(), trimmed)
        .map_err(|e| format!("SQL parse error: {e}"))?;

    if statements.is_empty() {
        return Err("Empty query".to_string());
    }

    for stmt in &statements {
        match stmt {
            Statement::Query(_) => {}
            Statement::Explain { .. } => {}
            other => {
                return Err(format!(
                    "Blocked: {} — only SELECT, WITH, and EXPLAIN are allowed",
                    statement_type_name(other)
                ));
            }
        }
    }

    // Post-parse: block dangerous functions even in valid SELECT queries
    let upper = sql.to_uppercase();
    for func in [
        "PG_SLEEP",
        "PG_TERMINATE_BACKEND",
        "PG_CANCEL_BACKEND",
        "PG_READ_FILE",
        "PG_READ_BINARY_FILE",
        "PG_WRITE_FILE",
        "PG_RELOAD_CONF",
        "PG_ROTATE_LOGFILE",
        "LO_IMPORT",
        "LO_EXPORT",
        "LO_UNLINK",
        "DBLINK",
        "DBLINK_EXEC",
        "DBLINK_CONNECT",
    ] {
        if upper.contains(func) {
            return Err(format!("Blocked function: {func}"));
        }
    }

    Ok(())
}

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
        _ => "unsupported statement",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pg(sql: &str) -> Result<(), String> {
        validate_readonly_sql(sql, DatabaseDialect::PostgreSQL)
    }

    #[test]
    fn test_select_allowed() {
        assert!(pg("SELECT 1").is_ok());
        assert!(pg("SELECT * FROM users WHERE id = 1").is_ok());
        assert!(pg("select count(*) from orders").is_ok());
        assert!(pg("WITH cte AS (SELECT 1) SELECT * FROM cte").is_ok());
        assert!(pg("EXPLAIN SELECT * FROM users").is_ok());
        assert!(pg("SELECT * FROM users;").is_ok());
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
        assert!(validate_readonly_sql("SELECT * FROM t", DatabaseDialect::SQLite).is_ok());
        assert!(validate_readonly_sql("DELETE FROM t", DatabaseDialect::SQLite).is_err());
        assert!(
            validate_readonly_sql("PRAGMA table_info(t)", DatabaseDialect::SQLite).is_err()
        );
    }
}
