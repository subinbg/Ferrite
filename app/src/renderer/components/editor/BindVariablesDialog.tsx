import { useState, useEffect } from 'react'
import { X, Play, ClipboardPaste } from 'lucide-react'

interface Props {
  paramNames: string[]
  initialValues: Record<string, string>
  onExecute: (values: Record<string, string>) => void
  onCancel: () => void
}

export function BindVariablesDialog({ paramNames, initialValues, onExecute, onCancel }: Props): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const name of paramNames) {
      v[name] = initialValues[name] ?? ''
    }
    return v
  })
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)

  const setValue = (name: string, val: string) => {
    setValues((prev) => ({ ...prev, [name]: val }))
  }

  const handlePaste = () => {
    setPasteError(null)
    try {
      const parsed = JSON.parse(pasteText)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setPasteError('Expected a JSON object, e.g. {"id": "123", "name": "test"}')
        return
      }
      const newValues: Record<string, string> = { ...values }
      for (const [k, v] of Object.entries(parsed)) {
        if (paramNames.includes(k)) {
          newValues[k] = String(v)
        }
      }
      setValues(newValues)
      setPasteMode(false)
    } catch {
      setPasteError('Invalid JSON')
    }
  }

  const handleExecute = () => {
    onExecute(values)
  }

  return (
    <div style={overlayStyle} className="animate-fade-in">
      <div style={dialogStyle} className="animate-slide-up">
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Bind Variables</span>
          <button onClick={onCancel} style={closeBtnStyle}><X size={16} /></button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!pasteMode ? (
            <>
              {paramNames.map((name) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={labelStyle}>:{name}</label>
                  <input
                    value={values[name] ?? ''}
                    onChange={(e) => setValue(name, e.target.value)}
                    placeholder={`Value for :${name}`}
                    style={inputStyle}
                  />
                </div>
              ))}
              <button onClick={() => setPasteMode(true)} style={pasteBtnStyle}>
                <ClipboardPaste size={13} /> Paste from JSON
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                Paste a JSON object. Keys matching your bind variables will be filled in.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'{"id": "123", "name": "test"}'}
                rows={6}
                autoFocus
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
              />
              {pasteError && (
                <div style={{ fontSize: '11px', color: 'var(--destructive)' }}>{pasteError}</div>
              )}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={handlePaste} style={primaryBtnStyle}>Apply</button>
                <button onClick={() => setPasteMode(false)} style={secondaryBtnStyle}>Cancel</button>
              </div>
            </>
          )}
        </div>

        <div style={footerStyle}>
          <button onClick={onCancel} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={handleExecute} style={runBtnStyle}>
            <Play size={13} style={{ fill: 'currentColor' }} /> Execute
          </button>
        </div>
      </div>
    </div>
  )
}

/** Extract :param_name patterns from SQL (ignoring string literals and comments) */
export function extractBindVariables(sql: string): string[] {
  // Simple extraction — strip single-quoted strings and comments first
  const stripped = sql
    .replace(/'[^']*'/g, '')        // remove 'string literals'
    .replace(/--.*$/gm, '')         // remove -- comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove /* block comments */

  const matches = new Set<string>()
  const re = /:([a-zA-Z_]\w*)/g
  let m
  while ((m = re.exec(stripped)) !== null) {
    // Skip PostgreSQL casts like ::text
    const before = stripped[m.index - 1]
    if (before === ':') continue
    matches.add(m[1])
  }
  return [...matches]
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const dialogStyle: React.CSSProperties = { backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '12px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)' }
const footerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: '1px solid var(--border)' }
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px', display: 'flex' }
const labelStyle: React.CSSProperties = { fontSize: '12px', fontFamily: 'monospace', color: 'var(--warning)', fontWeight: 600, minWidth: '90px', flexShrink: 0 }
const inputStyle: React.CSSProperties = { flex: 1, backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px 8px', fontSize: '12px', color: 'var(--foreground)', outline: 'none', width: '100%' }
const primaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }
const secondaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }
const runBtnStyle: React.CSSProperties = { backgroundColor: 'var(--success)', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }
const pasteBtnStyle: React.CSSProperties = { background: 'none', border: '1px dashed var(--border)', borderRadius: '6px', padding: '8px', fontSize: '11px', color: 'var(--muted-foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }
