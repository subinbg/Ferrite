import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Database,
  Table2,
  Columns3,
  Key,
  Play,
  Square,
  Trash2,
  Settings,
  Loader2
} from 'lucide-react'
import {
  useConnectConnection,
  useDisconnectConnection,
  useDeleteConnection
} from '../../api/connections'
import { useTables, useColumns } from '../../api/schema'
import type { Connection } from '../../types/connection'
import type { TableInfo, ColumnInfo } from '../../types/schema'
import { useTabsStore } from '../../stores/tabs'
import { ConnectionDetail } from './ConnectionDetail'

// Persist expand state across sidebar tab switches (module-level, survives unmount)
const expandedConnections = new Set<string>()
const expandedTables = new Set<string>()

export function ConnectionTree({ connections }: { connections: Connection[] }): JSX.Element {
  return (
    <div>
      {connections.map((conn) => (
        <ConnectionNode key={conn.id} connection={conn} />
      ))}
    </div>
  )
}

function ConnectionNode({ connection }: { connection: Connection }): JSX.Element {
  const [expanded, setExpandedState] = useState(() => expandedConnections.has(connection.id))
  const [showDetail, setShowDetail] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const connectMutation = useConnectConnection()
  const disconnectMutation = useDisconnectConnection()
  const deleteMutation = useDeleteConnection()
  const openTab = useTabsStore((s) => s.openTab)

  const isLoading = connectMutation.isPending || disconnectMutation.isPending

  const setExpanded = (v: boolean) => {
    setExpandedState(v)
    if (v) expandedConnections.add(connection.id)
    else expandedConnections.delete(connection.id)
  }

  const handleToggleConnection = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConnectError(null)
    if (connection.connected) {
      disconnectMutation.mutate(connection.id)
    } else {
      connectMutation.mutate(connection.id, {
        onError: (err: Error) => setConnectError(err.message),
      })
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Delete "${connection.name}"?`)) {
      deleteMutation.mutate(connection.id)
    }
  }

  return (
    <div>
      <div
        onClick={() => {
          if (connection.connected) setExpanded(!expanded)
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '5px 8px',
          gap: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          color: 'var(--foreground)',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        {connection.connected ? (
          expanded ? <ChevronDown size={14} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} style={{ flexShrink: 0 }} />
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}
        <Database
          size={14}
          style={{
            flexShrink: 0,
            color: connection.color || (connection.connected ? 'var(--success)' : 'var(--muted-foreground)')
          }}
        />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {connection.name}
        </span>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '1px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleToggleConnection}
            disabled={isLoading}
            style={iconBtnStyle}
            title={connection.connected ? 'Disconnect' : 'Connect'}
          >
            {isLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : connection.connected ? (
              <Square size={11} style={{ color: 'var(--destructive)', fill: 'var(--destructive)' }} />
            ) : (
              <Play size={12} style={{ color: 'var(--success)', fill: 'var(--success)' }} />
            )}
          </button>
          <button onClick={() => setShowDetail(true)} style={iconBtnStyle} title="Connection details">
            <Settings size={12} />
          </button>
          <button onClick={handleDelete} style={iconBtnStyle} title="Delete">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {isLoading && !connection.connected && (
        <div style={{ padding: '4px 12px 6px 28px', fontSize: '10px', color: 'var(--muted-foreground)' }}>
          Connecting...
        </div>
      )}
      {connectError && (
        <div style={{ padding: '4px 12px 6px 28px', fontSize: '10px', color: 'var(--destructive)', lineHeight: '1.4', wordBreak: 'break-word' }}>
          Connection failed: {connectError}
        </div>
      )}
      {expanded && connection.connected && <TablesSubtree connectionId={connection.id} />}
      {showDetail && <ConnectionDetail connection={connection} onClose={() => setShowDetail(false)} />}
    </div>
  )
}

function TablesSubtree({ connectionId }: { connectionId: string }): JSX.Element {
  const { data: tables, isLoading } = useTables(connectionId, 'public')

  if (isLoading) {
    return <div style={{ ...indentStyle, color: 'var(--muted-foreground)' }}>Loading tables...</div>
  }

  if (!tables || tables.length === 0) {
    return <div style={{ ...indentStyle, color: 'var(--muted-foreground)' }}>No tables</div>
  }

  return (
    <div>
      {tables.map((table) => (
        <TableNode key={table.name} connectionId={connectionId} table={table} />
      ))}
    </div>
  )
}

function TableNode({
  connectionId,
  table
}: {
  connectionId: string
  table: TableInfo
}): JSX.Element {
  const tableKey = `${connectionId}:${table.name}`
  const [expanded, setExpandedState] = useState(() => expandedTables.has(tableKey))
  const openTab = useTabsStore((s) => s.openTab)

  const setExpanded = (v: boolean) => {
    setExpandedState(v)
    if (v) expandedTables.add(tableKey)
    else expandedTables.delete(tableKey)
  }

  const handleDoubleClick = () => {
    openTab(connectionId)
    // The store will create a new tab; we could pre-fill SQL later
  }

  return (
    <div>
      <div
        onClick={() => setExpanded(!expanded)}
        onDoubleClick={handleDoubleClick}
        style={{
          ...indentStyle,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        {expanded ? <ChevronDown size={14} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} style={{ flexShrink: 0 }} />}
        <Table2 size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span>{table.name}</span>
        {table.estimated_row_count !== null && (
          <span style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>
            ~{table.estimated_row_count.toLocaleString()}
          </span>
        )}
      </div>
      {expanded && <ColumnsSubtree connectionId={connectionId} table={table.name} />}
    </div>
  )
}

function ColumnsSubtree({
  connectionId,
  table
}: {
  connectionId: string
  table: string
}): JSX.Element {
  const { data: columns, isLoading } = useColumns(connectionId, 'public', table)

  if (isLoading) {
    return (
      <div style={{ ...deepIndentStyle, color: 'var(--muted-foreground)' }}>Loading columns...</div>
    )
  }

  if (!columns || columns.length === 0) {
    return <div style={{ ...deepIndentStyle, color: 'var(--muted-foreground)' }}>No columns</div>
  }

  return (
    <div>
      {columns.map((col) => (
        <div
          key={col.name}
          style={{
            ...deepIndentStyle,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          {col.is_primary_key ? (
            <Key size={14} style={{ color: '#eab308', flexShrink: 0 }} />
          ) : (
            <Columns3 size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          )}
          <span>{col.name}</span>
          <span style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>
            {col.data_type}
            {col.is_nullable ? '?' : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--muted-foreground)',
  padding: '2px',
  display: 'flex',
  alignItems: 'center'
}

const indentStyle: React.CSSProperties = {
  paddingLeft: '28px',
  paddingRight: '8px',
  paddingTop: '3px',
  paddingBottom: '3px',
  fontSize: '12px',
  userSelect: 'none'
}

const deepIndentStyle: React.CSSProperties = {
  paddingLeft: '48px',
  paddingRight: '8px',
  paddingTop: '2px',
  paddingBottom: '2px',
  fontSize: '11px',
  userSelect: 'none'
}
