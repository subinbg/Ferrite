import { useState } from 'react'
import {
  Search, CheckCircle2, XCircle, Clock, Calendar, Trash2,
  ChevronDown, ChevronRight, Database, Cpu
} from 'lucide-react'
import { useActivities, useDeleteActivity } from '../../api/activities'
import { useConnections } from '../../api/connections'
import { useTabsStore } from '../../stores/tabs'
import type { Activity } from '../../types/activity'

type TypeFilter = 'all' | 'query' | 'mcp_tool'

const TYPE_CONFIGS: Record<string, { label: string; color: string; bgColor: string }> = {
  query: { label: 'SQL', color: 'var(--primary)', bgColor: 'rgba(59,130,246,0.15)' },
  mcp_tool: { label: 'MCP', color: '#a855f7', bgColor: 'rgba(168,85,247,0.15)' },
}

export function ActivityPanel(): JSX.Element {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const apiType = typeFilter === 'all' ? undefined : typeFilter
  const { data: activities, isLoading } = useActivities(apiType, undefined, search || undefined)
  const { data: connections } = useConnections()
  const deleteMutation = useDeleteActivity()
  const openTab = useTabsStore((s) => s.openTab)

  const getConnName = (id: string | null) =>
    id ? connections?.find((c) => c.id === id)?.name ?? null : null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Filter bar */}
      <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Type filter chips */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['all', 'query', 'mcp_tool'] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                ...chipStyle,
                backgroundColor: typeFilter === t ? 'var(--primary)' : 'var(--accent)',
                color: typeFilter === t ? 'var(--primary-foreground)' : 'var(--foreground)',
                border: typeFilter === t ? 'none' : '1px solid var(--border)',
              }}
            >
              {t === 'all' ? 'All' : t === 'query' ? 'Queries' : 'MCP Tools'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px' }}>
          <Search size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activity..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '11px', color: 'var(--foreground)' }}
          />
        </div>
      </div>

      {/* Activity list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {isLoading && <div style={msgStyle}>Loading...</div>}
        {activities && activities.length === 0 && <div style={msgStyle}>No activity yet</div>}
        {activities?.map((a) => (
          <ActivityEntry
            key={a.id}
            activity={a}
            connName={getConnName(a.connection_id)}
            onDelete={() => deleteMutation.mutate(a.id)}
            onLoadSql={a.activity_type === 'query' ? () => openTab(a.connection_id, a.request_text) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

function ActivityEntry({
  activity: a,
  connName,
  onDelete,
  onLoadSql,
}: {
  activity: Activity
  connName: string | null
  onDelete: () => void
  onLoadSql?: () => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const typeConfig = TYPE_CONFIGS[a.activity_type] ?? { label: a.activity_type, color: 'var(--muted-foreground)', bgColor: 'var(--accent)' }

  return (
    <div
      style={entryStyle}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {/* Row 1: type badge + status + title + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Type badge */}
        <span style={{ ...badgeStyle, color: typeConfig.color, backgroundColor: typeConfig.bgColor }}>
          {typeConfig.label}
        </span>

        {/* Status icon */}
        {a.status === 'success' ? (
          <CheckCircle2 size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
        ) : (
          <XCircle size={12} style={{ color: 'var(--destructive)', flexShrink: 0 }} />
        )}

        {/* Title */}
        <span
          style={{ flex: 1, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: onLoadSql ? 'pointer' : 'default' }}
          onClick={onLoadSql}
          title={onLoadSql ? 'Click to load in editor' : undefined}
        >
          {a.activity_type === 'mcp_tool' ? (
            <>
              <span style={{ fontWeight: 600 }}>{a.tool_name}</span>
              <span style={{ color: 'var(--muted-foreground)', marginLeft: '4px' }}>
                {a.request_text.length > 40 ? a.request_text.slice(0, 40) + '...' : a.request_text}
              </span>
            </>
          ) : (
            <span style={{ fontFamily: 'monospace' }}>
              {a.request_text.split('\n')[0].slice(0, 60)}
            </span>
          )}
        </span>

        {/* Actions */}
        <button onClick={() => setExpanded(!expanded)} style={iconBtnStyle} title="Details">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} style={iconBtnStyle} title="Delete">
          <Trash2 size={11} />
        </button>
      </div>

      {/* Row 2: metadata */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', paddingLeft: '4px', flexWrap: 'wrap' }}>
        {/* Source badge */}
        <span style={{ ...sourceBadgeStyle }}>
          {a.source === 'mcp' ? <Cpu size={8} /> : <Database size={8} />}
          {a.source.toUpperCase()}
        </span>

        {a.duration_ms != null && (
          <span style={metaStyle}><Clock size={9} />{a.duration_ms}ms</span>
        )}
        {a.row_count != null && (
          <span style={metaStyle}>{a.row_count} rows</span>
        )}
        {connName && (
          <span style={metaStyle}><Database size={9} />{connName}</span>
        )}
        <span style={metaStyle}><Calendar size={9} />{formatDateTime(a.executed_at)}</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: '6px', padding: '6px 8px', backgroundColor: 'var(--accent)', borderRadius: '4px', fontSize: '10px' }}>
          {a.request_params && (
            <div style={{ marginBottom: '4px' }}>
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>Params: </span>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: 'var(--foreground)' }}>
                {formatJson(a.request_params)}
              </pre>
            </div>
          )}
          {a.result_summary && (
            <div style={{ marginBottom: '4px' }}>
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>Result: </span>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: 'var(--foreground)', maxHeight: '120px', overflow: 'auto' }}>
                {a.result_summary}
              </pre>
            </div>
          )}
          {a.error_message && (
            <div>
              <span style={{ color: 'var(--destructive)', fontWeight: 500 }}>Error: </span>
              <span style={{ color: 'var(--destructive)' }}>{a.error_message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso + 'Z')
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

function formatJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}

const msgStyle: React.CSSProperties = { padding: '16px', fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center' }
const entryStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--border)' }
const chipStyle: React.CSSProperties = { borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 500, cursor: 'pointer', border: 'none' }
const badgeStyle: React.CSSProperties = { fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', flexShrink: 0, letterSpacing: '0.5px' }
const sourceBadgeStyle: React.CSSProperties = { fontSize: '9px', fontWeight: 500, padding: '1px 4px', borderRadius: '3px', backgroundColor: 'var(--accent)', color: 'var(--muted-foreground)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '2px' }
const metaStyle: React.CSSProperties = { fontSize: '10px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '2px' }
const iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '2px', display: 'flex', flexShrink: 0, borderRadius: '3px' }
