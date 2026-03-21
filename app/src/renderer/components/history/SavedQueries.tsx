import { useState } from 'react'
import { Search, FileText, Tag, Trash2 } from 'lucide-react'
import { useVersions, useDeleteVersion } from '../../api/versions'
import { useTabsStore } from '../../stores/tabs'
import type { QueryVersion } from '../../types/history'

export function SavedQueries(): JSX.Element {
  const [search, setSearch] = useState('')
  const { data: versions, isLoading } = useVersions(search || undefined)
  const deleteMutation = useDeleteVersion()
  const openTab = useTabsStore((s) => s.openTab)

  const handleLoad = (v: QueryVersion) => {
    openTab(v.connection_id, v.sql_text)
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteMutation.mutate(id)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px' }}>
          <Search size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved queries..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '11px', color: 'var(--foreground)' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {isLoading && <div style={msgStyle}>Loading...</div>}
        {versions && versions.length === 0 && (
          <div style={msgStyle}>
            No saved queries yet.
            <br />
            <span style={{ fontSize: '10px' }}>Use Cmd+S to save the current query.</span>
          </div>
        )}
        {versions?.map((v) => (
          <div
            key={v.id}
            onClick={() => handleLoad(v)}
            style={entryStyle}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.title}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>v{v.version}</span>
              <button onClick={(e) => handleDelete(e, v.id)} style={iconBtnStyle} title="Delete">
                <Trash2 size={11} />
              </button>
            </div>
            {v.label && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', paddingLeft: '18px' }}>
                <Tag size={9} style={{ color: 'var(--warning)' }} />
                <span style={{ fontSize: '10px', color: 'var(--warning)' }}>{v.label}</span>
              </div>
            )}
            <div style={{ paddingLeft: '18px', marginTop: '1px', fontSize: '10px', color: 'var(--muted-foreground)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.sql_text.split('\n')[0].slice(0, 60)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const msgStyle: React.CSSProperties = { padding: '16px', fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center' }
const entryStyle: React.CSSProperties = { padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }
const iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '2px', display: 'flex' }
