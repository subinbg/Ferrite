import { useState } from 'react'
import { X, Database, Play, Square, Loader2, Save, Zap } from 'lucide-react'
import { useConnectConnection, useDisconnectConnection, useUpdateConnection, useTestConnection } from '../../api/connections'
import type { Connection } from '../../types/connection'

interface Props {
  connection: Connection
  onClose: () => void
}

export function ConnectionDetail({ connection, onClose }: Props) {
  const [name, setName] = useState(connection.name)
  const [color, setColor] = useState(connection.color || '#3b82f6')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const connectMutation = useConnectConnection()
  const disconnectMutation = useDisconnectConnection()
  const updateMutation = useUpdateConnection()
  const testMutation = useTestConnection()
  const isLoading = connectMutation.isPending || disconnectMutation.isPending

  const hasChanges = name !== connection.name || color !== (connection.color || '#3b82f6')

  const handleToggle = () => {
    setConnectError(null)
    if (connection.connected) {
      disconnectMutation.mutate(connection.id)
    } else {
      connectMutation.mutate(connection.id, {
        onError: (err: Error) => setConnectError(err.message),
      })
    }
  }

  const handleTest = async () => {
    setTestResult(null)
    try {
      const result = await testMutation.mutateAsync(connection.id)
      setTestResult(result)
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message })
    }
  }

  const handleSave = () => {
    updateMutation.mutate(
      { id: connection.id, data: { name, color } },
      { onSuccess: onClose }
    )
  }

  return (
    <div style={overlayStyle} className="animate-fade-in">
      <div style={dialogStyle} className="animate-slide-up">
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={16} style={{ color: color }} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Connection Details</span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: connection.connected ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
              color: connection.connected ? 'var(--success)' : 'var(--muted-foreground)',
              fontWeight: 500,
            }}>
              {connection.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        {/* Editable + read-only fields */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Editable: Name */}
          <div style={rowStyle}>
            <span style={labelStyle}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>

          {/* Editable: Color */}
          <div style={rowStyle}>
            <span style={labelStyle}>Color</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ ...inputStyle, width: 32, height: 26, padding: 2, cursor: 'pointer' }} />
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{color}</span>
            </div>
          </div>

          <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '4px 0' }} />

          {/* Read-only fields */}
          <Row label="Type" value={connection.dialect === 'postgresql' ? 'PostgreSQL' : 'SQLite'} />
          {connection.host && <Row label="Host" value={connection.host} />}
          {connection.port && <Row label="Port" value={String(connection.port)} />}
          {connection.database_name && <Row label="Database" value={connection.database_name} />}
          {connection.username && <Row label="Username" value={connection.username} />}
          <Row label="SSL Mode" value={connection.ssl_mode} />
          <Row label="Created" value={formatDate(connection.created_at)} />
          <Row label="Updated" value={formatDate(connection.updated_at)} />
          <Row label="ID" value={connection.id} mono />
        </div>

        {/* Test / Connect status */}
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {testMutation.isPending && (
            <div style={{ ...statusStyle, backgroundColor: 'var(--accent)', color: 'var(--muted-foreground)' }}>
              <Loader2 size={12} className="animate-spin" /> Testing connection...
            </div>
          )}
          {testResult && (
            <div style={{
              ...statusStyle,
              backgroundColor: testResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: testResult.ok ? 'var(--success)' : 'var(--destructive)',
              border: `1px solid ${testResult.ok ? 'var(--success)' : 'var(--destructive)'}`,
            }}>
              {testResult.ok ? testResult.message : `Connection failed: ${testResult.message}`}
            </div>
          )}
          {connectError && (
            <div style={{ ...statusStyle, backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--destructive)', border: '1px solid var(--destructive)' }}>
              Connection failed: {connectError}
            </div>
          )}
          {isLoading && !connection.connected && (
            <div style={{ ...statusStyle, backgroundColor: 'var(--accent)', color: 'var(--muted-foreground)' }}>
              <Loader2 size={12} className="animate-spin" /> Connecting...
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button onClick={handleTest} disabled={testMutation.isPending || isLoading} style={testBtnStyle}>
            {testMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            Test
          </button>
          <button onClick={handleToggle} disabled={isLoading} style={connection.connected ? stopBtnStyle : playBtnStyle}>
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : connection.connected ? (
              <Square size={13} style={{ fill: 'currentColor' }} />
            ) : (
              <Play size={14} style={{ fill: 'currentColor' }} />
            )}
            {connection.connected ? 'Disconnect' : 'Connect'}
          </button>
          <div style={{ flex: 1 }} />
          {hasChanges && (
            <button onClick={handleSave} disabled={updateMutation.isPending} style={saveBtnStyle}>
              <Save size={13} /> Save
            </button>
          )}
          <button onClick={onClose} style={secondaryBtnStyle}>Close</button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={{ ...valueStyle, fontFamily: mono ? 'monospace' : 'inherit', fontSize: mono ? '11px' : '12px' }}>{value}</span>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + 'Z')
    return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const dialogStyle: React.CSSProperties = { backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '12px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)' }
const footerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderTop: '1px solid var(--border)' }
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px', display: 'flex' }

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px' }
const labelStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500, minWidth: '70px', flexShrink: 0 }
const valueStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--foreground)', wordBreak: 'break-all' }
const inputStyle: React.CSSProperties = { flex: 1, backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--foreground)', outline: 'none' }

const playBtnStyle: React.CSSProperties = { backgroundColor: 'var(--success)', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }
const stopBtnStyle: React.CSSProperties = { backgroundColor: 'var(--destructive)', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }
const saveBtnStyle: React.CSSProperties = { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }
const secondaryBtnStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }
const testBtnStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }
const statusStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', wordBreak: 'break-word' as const }
