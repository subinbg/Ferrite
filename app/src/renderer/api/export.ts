import type { ExportFormat } from '../types/export'

interface ExportOptions {
  delimiter?: string
  include_headers?: boolean
  sheet_name?: string
}

export async function downloadExport(
  connectionId: string,
  sql: string,
  format: ExportFormat,
  options: ExportOptions = {}
): Promise<void> {
  const { serverUrl, token } = window.ferrite || {
    serverUrl: 'http://127.0.0.1:3000',
    token: ''
  }

  const response = await fetch(`${serverUrl}/api/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      connection_id: connectionId,
      sql,
      format,
      options
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Export failed: HTTP ${response.status}`)
  }

  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition')
  const filename = disposition?.match(/filename="(.+)"/)?.[1] ?? `export.${format}`

  // Trigger browser download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
