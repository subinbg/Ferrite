import { useState } from 'react'
import { X, Download, Loader2 } from 'lucide-react'
import { downloadExport } from '../../api/export'

interface Props {
  connectionId: string
  sql: string
  onClose: () => void
}

export function ExportDialog({ connectionId, sql, onClose }: Props) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    try {
      await downloadExport(connectionId, sql)
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
          <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
            Export the current query results as a JSON file.
          </p>

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
            Export JSON
          </button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const dialogStyle: React.CSSProperties = { backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '12px', width: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)' }
const footerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: '1px solid var(--border)' }
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px', display: 'flex' }
const primaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }
const secondaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }
