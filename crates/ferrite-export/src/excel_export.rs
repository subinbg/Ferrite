use ferrite_core::types::query::QueryResult;
use rust_xlsxwriter::{Format, Workbook};

pub struct ExcelOptions {
    pub sheet_name: String,
}

impl Default for ExcelOptions {
    fn default() -> Self {
        Self {
            sheet_name: "Query Results".to_string(),
        }
    }
}

pub fn export_excel(
    result: &QueryResult,
    options: &ExcelOptions,
) -> Result<Vec<u8>, anyhow::Error> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name(&options.sheet_name)?;

    let header_fmt = Format::new().set_bold();

    // Write headers
    for (col, meta) in result.columns.iter().enumerate() {
        sheet.write_string_with_format(0, col as u16, &meta.name, &header_fmt)?;
    }

    // Write data rows
    for (row_idx, row) in result.rows.iter().enumerate() {
        let xlsx_row = (row_idx + 1) as u32;
        for (col_idx, val) in row.iter().enumerate() {
            let col = col_idx as u16;
            match val {
                serde_json::Value::Null => {} // Leave blank
                serde_json::Value::Bool(b) => {
                    sheet.write_boolean(xlsx_row, col, *b)?;
                }
                serde_json::Value::Number(n) => {
                    if let Some(f) = n.as_f64() {
                        sheet.write_number(xlsx_row, col, f)?;
                    } else {
                        sheet.write_string(xlsx_row, col, &n.to_string())?;
                    }
                }
                serde_json::Value::String(s) => {
                    sheet.write_string(xlsx_row, col, s)?;
                }
                other => {
                    sheet.write_string(xlsx_row, col, &other.to_string())?;
                }
            }
        }
    }

    // Auto-fit columns based on header length (rough estimate)
    for (col, meta) in result.columns.iter().enumerate() {
        let width = (meta.name.len() as f64 * 1.2).max(8.0).min(50.0);
        sheet.set_column_width(col as u16, width)?;
    }

    let buf = workbook.save_to_buffer()?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ferrite_core::types::query::{ColumnMeta, QueryResult};
    use uuid::Uuid;

    #[test]
    fn test_excel_export() {
        let result = QueryResult {
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
        };

        let buf = export_excel(&result, &ExcelOptions::default()).unwrap();
        // XLSX files start with PK zip header
        assert_eq!(&buf[0..2], b"PK");
        assert!(buf.len() > 100);
    }
}
