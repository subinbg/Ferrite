use ferrite_core::types::query::QueryResult;

pub enum JsonFormat {
    Array,
    Lines,
}

pub fn export_json(result: &QueryResult, format: &JsonFormat) -> Result<Vec<u8>, anyhow::Error> {
    let col_names: Vec<&str> = result.columns.iter().map(|c| c.name.as_str()).collect();

    match format {
        JsonFormat::Array => {
            let objects: Vec<serde_json::Value> = result
                .rows
                .iter()
                .map(|row| row_to_object(&col_names, row))
                .collect();
            Ok(serde_json::to_vec_pretty(&objects)?)
        }
        JsonFormat::Lines => {
            let mut buf = Vec::new();
            for row in &result.rows {
                let obj = row_to_object(&col_names, row);
                serde_json::to_writer(&mut buf, &obj)?;
                buf.push(b'\n');
            }
            Ok(buf)
        }
    }
}

fn row_to_object(columns: &[&str], row: &[serde_json::Value]) -> serde_json::Value {
    let mut map = serde_json::Map::with_capacity(columns.len());
    for (i, col) in columns.iter().enumerate() {
        let val = row.get(i).cloned().unwrap_or(serde_json::Value::Null);
        map.insert(col.to_string(), val);
    }
    serde_json::Value::Object(map)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ferrite_core::types::query::{ColumnMeta, QueryResult};
    use uuid::Uuid;

    fn sample_result() -> QueryResult {
        QueryResult {
            execution_id: Uuid::new_v4(),
            columns: vec![
                ColumnMeta { name: "id".into(), data_type: "int4".into(), nullable: false },
                ColumnMeta { name: "name".into(), data_type: "text".into(), nullable: true },
            ],
            rows: vec![
                vec![serde_json::json!(1), serde_json::json!("Alice")],
                vec![serde_json::json!(2), serde_json::Value::Null],
            ],
            row_count: 2,
            total_count: Some(2),
            duration_ms: 5,
            truncated: false,
        }
    }

    #[test]
    fn test_json_array() {
        let out = export_json(&sample_result(), &JsonFormat::Array).unwrap();
        let parsed: Vec<serde_json::Value> = serde_json::from_slice(&out).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0]["name"], "Alice");
        assert_eq!(parsed[1]["name"], serde_json::Value::Null);
    }

    #[test]
    fn test_json_lines() {
        let out = export_json(&sample_result(), &JsonFormat::Lines).unwrap();
        let s = String::from_utf8(out).unwrap();
        let lines: Vec<&str> = s.trim().split('\n').collect();
        assert_eq!(lines.len(), 2);
    }
}
