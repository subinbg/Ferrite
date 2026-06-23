import { useState } from 'react'
import { X, Zap, Loader2, FolderOpen } from 'lucide-react'
import { useCreateConnection, useTestConnection } from '../../api/connections'
import type { DatabaseDialect } from '../../types/connection'

interface Props {
  onClose: () => void
}

export function ConnectionForm({ onClose }: Props) {
  const [name, setName] = useState('')
  const [dialect, setDialect] = useState<DatabaseDialect>('postgresql')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('5432')
  const [dbName, setDbName] = useState('')
  const [username, setUsername] = useState('postgres')
  const [password, setPassword] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [savedId, setSavedId] = useState<string | null>(null)
  const createMutation = useCreateConnection()
  const testMutation = useTestConnection()

  const getFormData = () => ({
    name: name || 'Untitled',
    dialect,
    host: dialect === 'postgresql' ? (host || 'localhost') : undefined,
    port: dialect === 'postgresql' ? (parseInt(port) || 5432) : undefined,
    database_name: dbName || undefined,
    username: dialect === 'postgresql' ? (username || 'postgres') : undefined,
    password: dialect === 'postgresql' ? (password || undefined) : undefined,
    color
  })

  const handleTest = async () => {
    setTestResult(null)
    try {
      // Save first if not yet saved, then test
      let connId = savedId
      if (!connId) {
        const conn = await createMutation.mutateAsync(getFormData())
        connId = conn.id
        setSavedId(conn.id)
      }
      const result = await testMutation.mutateAsync(connId)
      setTestResult(result)
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message })
    }
  }

  const handleSave = async () => {
    try {
      // Only create if not already saved by Test
      if (!savedId) {
        await createMutation.mutateAsync(getFormData())
      }
      onClose()
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message })
    }
  }

  const handlePickSqliteFile = async () => {
    const filePath = await window.ferrite?.pickSqliteFile?.()
    if (filePath) {
      setDbName(filePath)
    }
  }

  const isSqlite = dialect === 'sqlite'

  return (
    <div style={overlayStyle} className="animate-fade-in">
      <div style={dialogStyle} className="animate-slide-up">
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>New Connection</span>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Database"
              style={inputStyle}
            />
          </Field>

          <Field label="Type">
            <select
              value={dialect}
              onChange={(e) => {
                setDialect(e.target.value as DatabaseDialect)
                if (e.target.value === 'sqlite') setPort('')
              }}
              style={inputStyle}
            >
              <option value="postgresql">PostgreSQL</option>
              <option value="sqlite">SQLite</option>
            </select>
          </Field>

          {!isSqlite && (
            <>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Field label="Host" style={{ flex: 1 }}>
                  <input value={host} onChange={(e) => setHost(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Port" style={{ width: '80px' }}>
                  <input value={port} onChange={(e) => setPort(e.target.value)} style={inputStyle} />
                </Field>
              </div>
              <Field label="Username">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </>
          )}

          <Field label={isSqlite ? 'Database File Path' : 'Database'}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder={isSqlite ? '/path/to/database.db' : 'postgres'}
                style={inputStyle}
              />
              {isSqlite && (
                <button
                  type="button"
                  onClick={handlePickSqliteFile}
                  style={iconBtnStyle}
                  title="Browse for SQLite database"
                >
                  <FolderOpen size={14} />
                </button>
              )}
            </div>
          </Field>

          <Field label="Color">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ ...inputStyle, height: '32px', padding: '2px' }}
            />
          </Field>

          {/* Test status */}
          {(testMutation.isPending || createMutation.isPending) && !testResult && (
            <div style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '12px', backgroundColor: 'var(--accent)', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader2 size={12} className="animate-spin" /> Testing connection...
            </div>
          )}
          {testResult && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                backgroundColor: testResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: testResult.ok ? 'var(--success)' : 'var(--destructive)',
                border: `1px solid ${testResult.ok ? 'var(--success)' : 'var(--destructive)'}`,
                wordBreak: 'break-word'
              }}
            >
              {testResult.ok ? testResult.message : `Connection failed: ${testResult.message}`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button
            onClick={handleTest}
            disabled={testMutation.isPending || createMutation.isPending}
            style={secondaryBtnStyle}
          >
            {testMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Test Connection
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={secondaryBtnStyle}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={createMutation.isPending}
            style={primaryBtnStyle}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  style
}: {
  label: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
}

const dialogStyle: React.CSSProperties = {
  backgroundColor: 'var(--background)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  width: '420px',
  maxHeight: '85vh',
  overflow: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px',
  borderBottom: '1px solid var(--border)'
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px 16px',
  borderTop: '1px solid var(--border)'
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--muted-foreground)',
  padding: '4px',
  display: 'flex'
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '13px',
  color: 'var(--foreground)',
  outline: 'none',
  width: '100%'
}

const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--primary)',
  color: 'var(--primary-foreground)',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 16px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
}

const secondaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent)',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '6px 12px',
  fontSize: '12px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
}

const iconBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  width: '34px',
  height: '32px',
  padding: 0,
  flexShrink: 0,
  justifyContent: 'center'
}
