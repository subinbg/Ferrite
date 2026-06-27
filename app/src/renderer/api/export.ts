export async function downloadExport(connectionId: string, sql: string): Promise<void> {
  if (window.ferrite?.downloadExport) {
    const result = await window.ferrite.downloadExport({
      connection_id: connectionId,
      sql
    })
    triggerDownload(new Blob([toArrayBuffer(result.bytes)], { type: result.contentType }), result.filename)
    return
  }

  const serverUrl = window.location.origin

  const response = await fetch(`${serverUrl}/api/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      connection_id: connectionId,
      sql
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Export failed: HTTP ${response.status}`)
  }

  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition')
  const filename = disposition?.match(/filename="(.+)"/)?.[1] ?? 'export.json'

  triggerDownload(blob, filename)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
