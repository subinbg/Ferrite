import { useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { useUpdateVersion } from '../../api/versions'
import { useConnections } from '../../api/connections'
import type { QueryVersion } from '../../types/history'

interface Props {
  version: QueryVersion
  onClose: () => void
}

export function EditVersionDialog({ version, onClose }: Props): JSX.Element {
  const [title, setTitle] = useState(version.title)
  const [label, setLabel] = useState(version.label ?? '')
  const [notes, setNotes] = useState(version.notes ?? '')
  const updateMutation = useUpdateVersion()
  const { data: connections } = useConnections()

  const connName = connections?.find((c) => c.id === version.connection_id)?.name ?? '—'

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      id: version.id,
      title: title !== version.title ? title : undefined,
      label: label.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <div style={overlayStyle} className="animate-fade-in">
      <div style={dialogStyle} className="animate-slide-up">
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Edit Saved Query</span>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Label">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. production, v2.0" style={inputStyle} />
          </Field>
          <Field label="Notes / Memo">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe what this query does, when to use it..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <InfoRow label="Version" value={`v${version.version}`} />
            <InfoRow label="Connection" value={connName} />
            <InfoRow label="Created" value={formatDate(version.created_at)} />
            <InfoRow label="ID" value={version.id} mono />
          </div>

          <div style={{ backgroundColor: 'var(--accent)', borderRadius: '4px', padding: '8px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--muted-foreground)', maxHeight: '80px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {version.sql_text}
          </div>
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={handleSave} disabled={!title.trim() || updateMutation.isPending} style={primaryBtnStyle}>
            {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
      <span style={{ color: 'var(--muted-foreground)', minWidth: '70px' }}>{label}</span>
      <span style={{ color: 'var(--foreground)', fontFamily: mono ? 'monospace' : 'inherit', fontSize: mono ? '10px' : '11px', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + 'Z')
    return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const dialogStyle: React.CSSProperties = { backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '12px', width: '460px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)' }
const footerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: '1px solid var(--border)' }
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px', display: 'flex' }
const inputStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: 'var(--foreground)', outline: 'none', width: '100%' }
const primaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }
const secondaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }
