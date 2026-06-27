use crate::FerriteError;
use crate::types::query::ColumnMeta;
use futures::{Stream, TryStreamExt};
use sqlx::{Column, Database, Row, TypeInfo};
use std::collections::HashMap;
use std::sync::LazyLock;

#[derive(Clone, Copy)]
pub enum LiteralStyle {
    Postgres,
    Mysql,
    Sqlite,
}

static BIND_RE: LazyLock<regex_lite::Regex> =
    LazyLock::new(|| regex_lite::Regex::new(r":([a-zA-Z_][a-zA-Z0-9_]*)").unwrap());

/// Replace `:name` bind variables with literal SQL values (DataGrip-style text substitution).
/// `::` casts are left untouched. Single quotes are escaped via `''` (standard SQL escaping).
pub fn process_bind_variables(
    sql: &str,
    binds: &HashMap<String, serde_json::Value>,
    style: LiteralStyle,
) -> Result<String, FerriteError> {
    if binds.is_empty() {
        return Ok(sql.to_string());
    }

    let mut result = sql.to_string();
    let mut replacements = Vec::new();

    for cap in BIND_RE.captures_iter(sql) {
        let full_match = cap.get(0).unwrap();
        // Skip `::` casts (PostgreSQL); harmless to skip for SQLite too.
        if full_match.start() > 0 && sql.as_bytes()[full_match.start() - 1] == b':' {
            continue;
        }
        if let Some(value) = binds.get(&cap[1]) {
            replacements.push((full_match.range(), json_to_sql_literal(value, style)));
        }
    }

    // Apply in reverse to preserve byte offsets.
    for (range, replacement) in replacements.into_iter().rev() {
        result.replace_range(range, &replacement);
    }

    Ok(result)
}

/// Convert a JSON value to a safe SQL literal for the given dialect.
pub fn json_to_sql_literal(value: &serde_json::Value, style: LiteralStyle) -> String {
    let quote = |s: &str| match style {
        // MySQL treats backslash as an escape character by default, so escape it as well.
        LiteralStyle::Mysql => format!("'{}'", s.replace('\\', "\\\\").replace('\'', "''")),
        _ => format!("'{}'", s.replace('\'', "''")),
    };
    match value {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(b) => match style {
            LiteralStyle::Postgres => if *b { "TRUE" } else { "FALSE" }.to_string(),
            LiteralStyle::Mysql | LiteralStyle::Sqlite => if *b { "1" } else { "0" }.to_string(),
        },
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => quote(s),
        serde_json::Value::Array(arr) => match style {
            LiteralStyle::Postgres => {
                let items: Vec<String> =
                    arr.iter().map(|v| json_to_sql_literal(v, style)).collect();
                format!("ARRAY[{}]", items.join(", "))
            }
            LiteralStyle::Mysql | LiteralStyle::Sqlite => quote(&value.to_string()),
        },
        serde_json::Value::Object(_) => match style {
            LiteralStyle::Postgres => format!("{}::jsonb", quote(&value.to_string())),
            LiteralStyle::Mysql | LiteralStyle::Sqlite => quote(&value.to_string()),
        },
    }
}

/// Drive a row stream, applying offset/limit windowing and capturing column metadata.
/// Returns `(columns, windowed_rows, rows_seen, truncated)`. `truncated` is set when more
/// rows exist beyond `offset + limit`.
pub async fn collect_rows<DB, S, F>(
    mut stream: S,
    limit: usize,
    offset: usize,
    row_to_json: F,
) -> Result<(Vec<ColumnMeta>, Vec<Vec<serde_json::Value>>, usize, bool), FerriteError>
where
    DB: Database,
    S: Stream<Item = Result<DB::Row, sqlx::Error>> + Unpin,
    F: Fn(&DB::Row) -> Vec<serde_json::Value>,
{
    let max_seen = offset.saturating_add(limit).saturating_add(1);
    let mut columns: Option<Vec<ColumnMeta>> = None;
    let mut data_rows = Vec::new();
    let mut seen = 0usize;
    let mut truncated = false;

    while let Some(row) = stream
        .try_next()
        .await
        .map_err(|e| FerriteError::Database(e.to_string()))?
    {
        if columns.is_none() {
            columns = Some(
                row.columns()
                    .iter()
                    .map(|c| ColumnMeta {
                        name: c.name().to_string(),
                        data_type: c.type_info().name().to_string(),
                        nullable: true,
                    })
                    .collect(),
            );
        }

        if seen >= offset && data_rows.len() < limit {
            data_rows.push(row_to_json(&row));
        }

        seen += 1;
        if seen >= max_seen {
            truncated = true;
            break;
        }
    }

    Ok((columns.unwrap_or_default(), data_rows, seen, truncated))
}
