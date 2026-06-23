import { useState } from 'react'
import { Search, FileText, Tag, Trash2, Pencil, Calendar, Database } from 'lucide-react'
import { useVersions, useDeleteVersion } from '../../api/versions'
import { useConnections } from '../../api/connections'
import { useTabsStore } from '../../stores/tabs'
import { EditVersionDialog } from './EditVersionDialog'
import type { QueryVersion } from '../../types/history'

export function SavedQueries() {
  const [search, setSearch] = useState('')
  const { data: versions, isLoading } = useVersions(search || undefined)
  const { data: connections } = useConnections()
  const deleteMutation = useDeleteVersion()
  const openTab = useTabsStore((s) => s.openTab)
  const [editingVersion, setEditingVersion] = useState<QueryVersion | null>(null)

  const handleLoad = (v: QueryVersion) => {
    openTab(v.connection_id, v.sql_text)
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteMutation.mutate(id)
  }

  const handleEdit = (e: React.MouseEvent, v: QueryVersion) => {
    e.stopPropagation()
    setEditingVersion(v)
  }

  const getConnName = (id: string | null) =>
    id ? connections?.find((c) => c.id === id)?.name ?? null : null

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
        {versions?.map((v) => {
          const connName = getConnName(v.connection_id)
          return (
            <div
              key={v.id}
              onClick={() => handleLoad(v)}
              style={entryStyle}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {/* Row 1: title + version + actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.title}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', flexShrink: 0 }}>v{v.version}</span>
                <button onClick={(e) => handleEdit(e, v)} style={iconBtnStyle} title="Edit"><Pencil size={11} /></button>
                <button onClick={(e) => handleDelete(e, v.id)} style={iconBtnStyle} title="Delete"><Trash2 size={11} /></button>
              </div>

              {/* Row 2: label */}
              {v.label && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', paddingLeft: '18px' }}>
                  <Tag size={9} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', color: 'var(--warning)' }}>{v.label}</span>
                </div>
              )}

              {/* Row 3: notes preview */}
              {v.notes && (
                <div style={{ paddingLeft: '18px', marginTop: '1px', fontSize: '10px', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.notes.split('\n')[0].slice(0, 80)}
                </div>
              )}

              {/* Row 4: metadata */}
              <div style={{ paddingLeft: '18px', marginTop: '3px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {connName && (
                  <span style={metaStyle}><Database size={9} style={{ flexShrink: 0 }} />{connName}</span>
                )}
                <span style={metaStyle}><Calendar size={9} style={{ flexShrink: 0 }} />{formatDate(v.created_at)}</span>
              </div>

              {/* Row 5: SQL preview */}
              <div style={{ paddingLeft: '18px', marginTop: '2px', fontSize: '10px', color: 'var(--muted-foreground)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.sql_text.split('\n')[0].slice(0, 60)}
              </div>
            </div>
          )
        })}
      </div>

      {editingVersion && (
        <EditVersionDialog version={editingVersion} onClose={() => setEditingVersion(null)} />
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + 'Z')
    return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return iso }
}

const msgStyle: React.CSSProperties = { padding: '16px', fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center' }
const entryStyle: React.CSSProperties = { padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }
const iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '2px', display: 'flex', flexShrink: 0, borderRadius: '3px' }
const metaStyle: React.CSSProperties = { fontSize: '10px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '3px' }
