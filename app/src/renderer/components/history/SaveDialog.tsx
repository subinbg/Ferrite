import { useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { useCreateVersion } from '../../api/versions'

interface Props {
  connectionId: string | null
  sql: string
  onClose: () => void
}

export function SaveDialog({ connectionId, sql, onClose }: Props): JSX.Element {
  const [title, setTitle] = useState('')
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const createMutation = useCreateVersion()

  const handleSave = async () => {
    if (!title.trim()) return
    await createMutation.mutateAsync({
      connection_id: connectionId ?? undefined,
      title: title.trim(),
      sql_text: sql,
      label: label.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <div style={overlayStyle} className="animate-fade-in">
      <div style={dialogStyle} className="animate-slide-up">
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Save Query</span>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. User activity report" autoFocus style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. production, v1.0" style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'monospace', padding: '6px 8px', backgroundColor: 'var(--accent)', borderRadius: '4px', maxHeight: '60px', overflow: 'hidden' }}>
            {sql.split('\n')[0].slice(0, 100)}{sql.length > 100 ? '...' : ''}
          </div>
        </div>
        <div style={footerStyle}>
          <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={handleSave} disabled={!title.trim() || createMutation.isPending} style={primaryBtnStyle}>
            {createMutation.isPending ? <Loader2 size={14} /> : <Save size={14} />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const dialogStyle: React.CSSProperties = { backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '12px', width: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)' }
const footerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: '1px solid var(--border)' }
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px', display: 'flex' }
const inputStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: 'var(--foreground)', outline: 'none', width: '100%' }
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' }
const labelStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500 }
const primaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }
const secondaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }
