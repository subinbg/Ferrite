use ferrite_core::types::query::QueryResult;

pub struct CsvOptions {
    pub delimiter: u8,
    pub include_headers: bool,
}

impl Default for CsvOptions {
    fn default() -> Self {
        Self {
            delimiter: b',',
            include_headers: true,
        }
    }
}

pub fn export_csv(result: &QueryResult, options: &CsvOptions) -> Result<Vec<u8>, anyhow::Error> {
    let mut wtr = csv::WriterBuilder::new()
        .delimiter(options.delimiter)
        .from_writer(Vec::new());

    if options.include_headers {
        let headers: Vec<&str> = result.columns.iter().map(|c| c.name.as_str()).collect();
        wtr.write_record(&headers)?;
    }

    for row in &result.rows {
        let fields: Vec<String> = row.iter().map(json_value_to_string).collect();
        wtr.write_record(&fields)?;
    }

    wtr.flush()?;
    Ok(wtr.into_inner()?)
}

fn json_value_to_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
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
                ColumnMeta {
                    name: "id".into(),
                    data_type: "int4".into(),
                    nullable: false,
                },
                ColumnMeta {
                    name: "name".into(),
                    data_type: "text".into(),
                    nullable: true,
                },
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
    fn test_csv_default() {
        let csv = export_csv(&sample_result(), &CsvOptions::default()).unwrap();
        let s = String::from_utf8(csv).unwrap();
        assert!(s.starts_with("id,name\n"));
        assert!(s.contains("1,Alice\n"));
        assert!(s.contains("2,\n"));
    }

    #[test]
    fn test_csv_tab_delimited() {
        let csv = export_csv(
            &sample_result(),
            &CsvOptions {
                delimiter: b'\t',
                include_headers: true,
            },
        )
        .unwrap();
        let s = String::from_utf8(csv).unwrap();
        assert!(s.contains("id\tname\n"));
    }
}
