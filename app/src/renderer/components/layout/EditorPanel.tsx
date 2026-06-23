import { useState, useRef, useCallback } from 'react'
import { EditorTabs } from '../editor/EditorTabs'
import { EditorToolbar } from '../editor/EditorToolbar'
import { SqlEditor } from '../editor/SqlEditor'
import { ResultPanel } from '../results/ResultPanel'
import { useTabsStore } from '../../stores/tabs'
import { useConnections } from '../../api/connections'
import { ConnectionForm } from '../sidebar/ConnectionForm'
import { Database, Plus, Terminal } from 'lucide-react'

export function EditorPanel() {
  const tabs = useTabsStore((s) => s.tabs)
  const openTab = useTabsStore((s) => s.openTab)
  const { data: connections } = useConnections()
  const [showConnForm, setShowConnForm] = useState(false)

  const hasConnections = connections && connections.length > 0
  const hasConnected = connections?.some((c) => c.connected)

  if (tabs.length === 0) {
    return (
      <div style={emptyContainerStyle}>
        <div style={emptyCardStyle}>
          <Terminal size={32} style={{ color: 'var(--primary)', marginBottom: 4 }} />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
            Welcome to Ferrite
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '4px 0 16px', textAlign: 'center', lineHeight: '1.5' }}>
            {!hasConnections
              ? 'Add a database connection to get started.'
              : !hasConnected
                ? 'Connect to a database, then open a query tab.'
                : 'Open a new query tab to start writing SQL.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {!hasConnections && (
              <button onClick={() => setShowConnForm(true)} style={primaryBtnStyle}>
                <Database size={14} />
                Add Connection
              </button>
            )}
            {hasConnections && (
              <button onClick={() => openTab()} style={hasConnected ? primaryBtnStyle : secondaryBtnStyle}>
                <Plus size={14} />
                New Query
              </button>
            )}
          </div>
          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted-foreground)', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
            <span><Kbd>Cmd+N</Kbd> New query tab</span>
            <span><Kbd>Cmd+Enter</Kbd> Execute query</span>
            <span><Kbd>Cmd+E</Kbd> Toggle sidebar</span>
          </div>
        </div>
        {showConnForm && <ConnectionForm onClose={() => setShowConnForm(false)} />}
      </div>
    )
  }

  return <EditorWithResults />
}

function EditorWithResults() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [editorHeight, setEditorHeight] = useState<number | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()

    const onMouseMove = (ev: MouseEvent) => {
      const relY = ev.clientY - containerRect.top
      const clamped = Math.max(80, Math.min(containerRect.height - 80, relY))
      setEditorHeight(clamped)
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <EditorTabs />
      <EditorToolbar />
      {/* Flex area for editor + results */}
      <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* SQL editor */}
        <div style={{ height: editorHeight ?? '55%', flexShrink: 0, overflow: 'hidden' }}>
          <SqlEditor />
        </div>
        {/* Drag handle */}
        <div onMouseDown={onDragStart} style={hDividerStyle} />
        {/* Results */}
        <div style={{ flex: 1, minHeight: 60, overflow: 'hidden' }}>
          <ResultPanel />
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{ display: 'inline-block', padding: '1px 5px', fontSize: 10, fontFamily: 'inherit', backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--foreground)', marginRight: 4 }}>
      {children}
    </kbd>
  )
}

const hDividerStyle: React.CSSProperties = {
  height: 4,
  cursor: 'row-resize',
  backgroundColor: 'var(--border)',
  flexShrink: 0,
}

const emptyContainerStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const emptyCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '32px 40px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  backgroundColor: 'var(--accent)',
}

const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--primary)',
  color: 'var(--primary-foreground)',
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const secondaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 12,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}
