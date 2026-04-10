import { useState } from 'react'
import { Database, Plus, PlugZap, Activity, Bookmark } from 'lucide-react'
import { useConnections } from '../../api/connections'
import { ConnectionForm } from '../sidebar/ConnectionForm'
import { ConnectionTree } from '../sidebar/ConnectionTree'
import { ActivityPanel } from '../history/ActivityPanel'
import { SavedQueries } from '../history/SavedQueries'
import { useLayoutStore } from '../../stores/layout'

type SidebarTab = 'explorer' | 'history' | 'saved'

export function Sidebar(): JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const { data: connections, isLoading } = useConnections()
  const sidebarTab = useLayoutStore((s) => s.sidebarTab)
  const setSidebarTab = useLayoutStore((s) => s.setSidebarTab)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--background)' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <TabButton active={sidebarTab === 'explorer'} onClick={() => setSidebarTab('explorer')} title="Explorer">
          <Database size={14} />
        </TabButton>
        <TabButton active={sidebarTab === 'history'} onClick={() => setSidebarTab('history')} title="Activity">
          <Activity size={14} />
        </TabButton>
        <TabButton active={sidebarTab === 'saved'} onClick={() => setSidebarTab('saved')} title="Saved Queries">
          <Bookmark size={14} />
        </TabButton>

        {/* Spacer + Add button (only in explorer tab) */}
        <div style={{ flex: 1 }} />
        {sidebarTab === 'explorer' && (
          <button onClick={() => setShowForm(true)} style={addBtnStyle} title="Add Connection">
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {sidebarTab === 'explorer' && (
          <div style={{ height: '100%', overflow: 'auto' }}>
            {isLoading && <div style={msgStyle}>Loading...</div>}
            {connections && connections.length === 0 && (
              <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <PlugZap size={28} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', margin: 0 }}>No connections yet</p>
                <button onClick={() => setShowForm(true)} style={primaryBtnStyle}>
                  <Plus size={14} /> Add Connection
                </button>
              </div>
            )}
            {connections && connections.length > 0 && <ConnectionTree connections={connections} />}
          </div>
        )}
        {sidebarTab === 'history' && <ActivityPanel />}
        {sidebarTab === 'saved' && <SavedQueries />}
      </div>

      {showForm && <ConnectionForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

function TabButton({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
        cursor: 'pointer',
        color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {children}
    </button>
  )
}

const msgStyle: React.CSSProperties = { padding: '12px', fontSize: '12px', color: 'var(--muted-foreground)' }
const addBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '8px', display: 'flex', alignItems: 'center' }
const primaryBtnStyle: React.CSSProperties = { width: '100%', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }
