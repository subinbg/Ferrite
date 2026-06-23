import { useState } from 'react'
import { Search, CheckCircle2, XCircle, Clock, Trash2, Calendar } from 'lucide-react'
import { useHistory, useDeleteHistory } from '../../api/queries'
import { useTabsStore } from '../../stores/tabs'
import type { HistoryEntry } from '../../types/query'

export function HistoryPanel() {
  const [search, setSearch] = useState('')
  const { data: entries, isLoading } = useHistory(undefined, search || undefined)
  const openTab = useTabsStore((s) => s.openTab)
  const deleteMutation = useDeleteHistory()

  const handleLoad = (entry: HistoryEntry) => {
    openTab(entry.connection_id, entry.sql_text)
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteMutation.mutate(id)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search */}
      <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px' }}>
          <Search size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search history..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '11px', color: 'var(--foreground)' }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {isLoading && <div style={msgStyle}>Loading...</div>}
        {entries && entries.length === 0 && <div style={msgStyle}>No history yet</div>}
        {entries?.map((entry) => (
          <div
            key={entry.id}
            onClick={() => handleLoad(entry)}
            style={entryStyle}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {/* Row 1: status icon + SQL preview + delete */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {entry.status === 'success' ? (
                <CheckCircle2 size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
              ) : (
                <XCircle size={12} style={{ color: 'var(--destructive)', flexShrink: 0 }} />
              )}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', fontFamily: 'monospace' }}>
                {entry.sql_text.split('\n')[0].slice(0, 80)}
              </span>
              <button
                onClick={(e) => handleDelete(e, entry.id)}
                style={deleteBtnStyle}
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
            </div>

            {/* Row 2: duration, rows, full datetime */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', paddingLeft: '18px', flexWrap: 'wrap' }}>
              {entry.duration_ms != null && (
                <span style={metaStyle}>
                  <Clock size={9} style={{ flexShrink: 0 }} />
                  {entry.duration_ms}ms
                </span>
              )}
              {entry.row_count != null && (
                <span style={metaStyle}>{entry.row_count} rows</span>
              )}
              <span style={metaStyle}>
                <Calendar size={9} style={{ flexShrink: 0 }} />
                {formatDateTime(entry.executed_at)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso + 'Z')
    const date = d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    return `${date} ${time}`
  } catch {
    return iso
  }
}

const msgStyle: React.CSSProperties = { padding: '16px', fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center' }
const entryStyle: React.CSSProperties = { padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }
const metaStyle: React.CSSProperties = { fontSize: '10px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '2px' }
const deleteBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '2px', display: 'flex', flexShrink: 0, borderRadius: '3px' }
