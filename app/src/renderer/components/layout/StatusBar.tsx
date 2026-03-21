import { useConnections } from '../../api/connections'
import { useTabsStore } from '../../stores/tabs'
import { useResultsStore } from '../../stores/results'

export function StatusBar(): JSX.Element {
  const { data: connections } = useConnections()
  const connectedCount = connections?.filter((c) => c.connected).length ?? 0
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const tabs = useTabsStore((s) => s.tabs)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const result = useResultsStore((s) => s.getResult(activeTabId ?? ''))

  const activeConn = connections?.find((c) => c.id === activeTab?.connectionId)

  return (
    <div style={barStyle}>
      <span>
        {connectedCount > 0
          ? `${connectedCount} connection${connectedCount > 1 ? 's' : ''} active`
          : 'No active connections'}
      </span>

      {activeConn && (
        <>
          <Dot />
          <span>{activeConn.name}</span>
        </>
      )}

      <div style={{ flex: 1 }} />

      {result.queryResult && (
        <span>
          {result.queryResult.row_count} rows | {result.queryResult.duration_ms}ms
        </span>
      )}

      {result.isExecuting && <span>Executing...</span>}
    </div>
  )
}

function Dot(): JSX.Element {
  return <span style={{ color: 'var(--border)' }}>|</span>
}

const barStyle: React.CSSProperties = {
  height: 24,
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  backgroundColor: 'var(--accent)',
  borderTop: '1px solid var(--border)',
  fontSize: 11,
  color: 'var(--muted-foreground)',
  gap: 8,
  flexShrink: 0,
}
