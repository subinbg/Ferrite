import { useState } from 'react'
import { X, Database, Play, Square, Loader2, Save } from 'lucide-react'
import { useConnectConnection, useDisconnectConnection, useUpdateConnection } from '../../api/connections'
import type { Connection } from '../../types/connection'

interface Props {
  connection: Connection
  onClose: () => void
}

export function ConnectionDetail({ connection, onClose }: Props): JSX.Element {
  const [name, setName] = useState(connection.name)
  const [color, setColor] = useState(connection.color || '#3b82f6')
  const connectMutation = useConnectConnection()
  const disconnectMutation = useDisconnectConnection()
  const updateMutation = useUpdateConnection()
  const isLoading = connectMutation.isPending || disconnectMutation.isPending

  const hasChanges = name !== connection.name || color !== (connection.color || '#3b82f6')

  const handleToggle = () => {
    if (connection.connected) {
      disconnectMutation.mutate(connection.id)
    } else {
      connectMutation.mutate(connection.id)
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

        {/* Footer */}
        <div style={footerStyle}>
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
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
