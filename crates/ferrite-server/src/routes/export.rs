use axum::{
    Json,
    extract::State,
    http::{StatusCode, header},
    response::IntoResponse,
};
use ferrite_core::types::export::{ExportFormat, ExportRequest};
use ferrite_export::{csv_export, excel_export, json_export};

use crate::state::AppState;

pub async fn export_data(
    State(state): State<AppState>,
    Json(req): Json<ExportRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Execute the query to get data
    let pool_mgr = state.pool_manager.read().await;
    let driver = pool_mgr
        .get(&req.connection_id)
        .ok_or((StatusCode::BAD_REQUEST, "Not connected".to_string()))?;

    let result = driver
        .execute(
            &req.sql,
            &std::collections::HashMap::new(),
            1_000_000,
            0,
            120,
        )
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let delimiter_byte = req
        .options
        .delimiter
        .as_deref()
        .and_then(|d| d.as_bytes().first().copied())
        .unwrap_or(b',');

    let include_headers = req.options.include_headers.unwrap_or(true);
    let sheet_name = req
        .options
        .sheet_name
        .clone()
        .unwrap_or_else(|| "Query Results".to_string());

    let (bytes, content_type, filename) = match req.format {
        ExportFormat::Csv => {
            let opts = csv_export::CsvOptions {
                delimiter: delimiter_byte,
                include_headers,
            };
            let data = csv_export::export_csv(&result, &opts)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            (data, "text/csv; charset=utf-8", "export.csv")
        }
        ExportFormat::Json => {
            let data = json_export::export_json(&result, &json_export::JsonFormat::Array)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            (data, "application/json", "export.json")
        }
        ExportFormat::JsonLines => {
            let data = json_export::export_json(&result, &json_export::JsonFormat::Lines)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            (data, "application/x-ndjson", "export.jsonl")
        }
        ExportFormat::Excel => {
            let opts = excel_export::ExcelOptions { sheet_name };
            let data = excel_export::export_excel(&result, &opts)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            (
                data,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "export.xlsx",
            )
        }
    };

    let disposition = format!("attachment; filename=\"{filename}\"");
    Ok((
        [
            (header::CONTENT_TYPE, content_type.to_string()),
            (header::CONTENT_DISPOSITION, disposition),
        ],
        bytes,
    ))
}
