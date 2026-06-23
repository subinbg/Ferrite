import { useState } from 'react'
import { X, Download, Loader2 } from 'lucide-react'
import { downloadExport } from '../../api/export'
import type { ExportFormat } from '../../types/export'

interface Props {
  connectionId: string
  sql: string
  onClose: () => void
}

export function ExportDialog({ connectionId, sql, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [delimiter, setDelimiter] = useState(',')
  const [includeHeaders, setIncludeHeaders] = useState(true)
  const [sheetName, setSheetName] = useState('Query Results')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    try {
      await downloadExport(connectionId, sql, format, {
        delimiter: format === 'csv' ? delimiter : undefined,
        include_headers: format === 'csv' ? includeHeaders : undefined,
        sheet_name: format === 'excel' ? sheetName : undefined
      })
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={overlayStyle} className="animate-fade-in">
      <div style={dialogStyle} className="animate-slide-up">
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Export Data</span>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Format selector */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['csv', 'json', 'jsonlines', 'excel'] as ExportFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                style={{
                  ...chipStyle,
                  backgroundColor: format === f ? 'var(--primary)' : 'var(--accent)',
                  color: format === f ? 'var(--primary-foreground)' : 'var(--foreground)',
                  border: format === f ? 'none' : '1px solid var(--border)',
                }}
              >
                {f === 'jsonlines' ? 'JSON Lines' : f.toUpperCase()}
              </button>
            ))}
          </div>

          {/* CSV options */}
          {format === 'csv' && (
            <>
              <Field label="Delimiter">
                <select
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                  style={inputStyle}
                >
                  <option value=",">Comma (,)</option>
                  <option value="&#9;">Tab (\t)</option>
                  <option value=";">Semicolon (;)</option>
                  <option value="|">Pipe (|)</option>
                </select>
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeHeaders}
                  onChange={(e) => setIncludeHeaders(e.target.checked)}
                />
                Include column headers
              </label>
            </>
          )}

          {/* Excel options */}
          {format === 'excel' && (
            <Field label="Sheet Name">
              <input
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                style={inputStyle}
              />
            </Field>
          )}

          {error && (
            <div style={{ fontSize: '12px', color: 'var(--destructive)', padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)' }}>
              {error}
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={handleExport} disabled={exporting} style={primaryBtnStyle}>
            {exporting ? <Loader2 size={14} /> : <Download size={14} />}
            Export
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  )
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const dialogStyle: React.CSSProperties = { backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '12px', width: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)' }
const footerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: '1px solid var(--border)' }
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px', display: 'flex' }
const inputStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: 'var(--foreground)', outline: 'none', width: '100%' }
const chipStyle: React.CSSProperties = { borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }
const primaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }
const secondaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }
