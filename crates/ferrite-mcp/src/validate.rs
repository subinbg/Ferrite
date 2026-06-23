use sqlparser::ast::Statement;
use sqlparser::dialect::PostgreSqlDialect;
use sqlparser::parser::Parser;

/// Validates that a SQL string is strictly read-only using AST analysis.
/// Returns Ok(()) if safe, Err(reason) if blocked.
pub fn validate_readonly_sql(sql: &str) -> Result<(), String> {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return Err("Empty query".to_string());
    }

    let dialect = PostgreSqlDialect {};
    let statements =
        Parser::parse_sql(&dialect, trimmed).map_err(|e| format!("SQL parse error: {e}"))?;

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

    #[test]
    fn test_select_allowed() {
        assert!(validate_readonly_sql("SELECT 1").is_ok());
        assert!(validate_readonly_sql("SELECT * FROM users WHERE id = 1").is_ok());
        assert!(validate_readonly_sql("select count(*) from orders").is_ok());
        assert!(validate_readonly_sql("WITH cte AS (SELECT 1) SELECT * FROM cte").is_ok());
        assert!(validate_readonly_sql("EXPLAIN SELECT * FROM users").is_ok());
        assert!(validate_readonly_sql("SELECT * FROM users;").is_ok());
    }

    #[test]
    fn test_mutations_blocked() {
        assert!(validate_readonly_sql("INSERT INTO users VALUES (1)").is_err());
        assert!(validate_readonly_sql("UPDATE users SET name = 'x'").is_err());
        assert!(validate_readonly_sql("DELETE FROM users").is_err());
        assert!(validate_readonly_sql("DROP TABLE users").is_err());
        assert!(validate_readonly_sql("ALTER TABLE users ADD col int").is_err());
        assert!(validate_readonly_sql("CREATE TABLE foo (id int)").is_err());
        assert!(validate_readonly_sql("TRUNCATE users").is_err());
        assert!(validate_readonly_sql("GRANT ALL ON users TO public").is_err());
    }

    #[test]
    fn test_multi_statement_blocked() {
        assert!(validate_readonly_sql("SELECT 1; INSERT INTO users VALUES (1)").is_err());
    }

    #[test]
    fn test_dangerous_functions_blocked() {
        assert!(validate_readonly_sql("SELECT pg_sleep(10)").is_err());
        assert!(validate_readonly_sql("SELECT dblink('host=evil', 'SELECT 1')").is_err());
        assert!(validate_readonly_sql("SELECT pg_read_file('/etc/passwd')").is_err());
        assert!(validate_readonly_sql("SELECT pg_terminate_backend(123)").is_err());
    }

    #[test]
    fn test_empty_blocked() {
        assert!(validate_readonly_sql("").is_err());
        assert!(validate_readonly_sql("   ").is_err());
    }

    #[test]
    fn test_complex_select_allowed() {
        assert!(validate_readonly_sql(
            "SELECT u.id, u.name, COUNT(o.id) FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name HAVING COUNT(o.id) > 5 ORDER BY u.name LIMIT 10"
        ).is_ok());
    }

    #[test]
    fn test_set_blocked() {
        assert!(validate_readonly_sql("SET search_path TO public").is_err());
    }

    #[test]
    fn test_transaction_blocked() {
        assert!(validate_readonly_sql("BEGIN").is_err());
        assert!(validate_readonly_sql("COMMIT").is_err());
    }
}
