import { useTabsStore } from '../../stores/tabs'
import { useResultsStore } from '../../stores/results'
import { DataGrid } from './DataGrid'
import { ExplainView } from './ExplainView'

export function ResultPanel(): JSX.Element {
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const result = useResultsStore((s) => s.getResult(activeTabId ?? ''))
  const setActiveResultTab = useResultsStore((s) => s.setActiveResultTab)

  if (!activeTabId) return <div />

  const tabs: { key: typeof result.activeResultTab; label: string }[] = [
    { key: 'results', label: `Results${result.queryResult ? ` (${result.queryResult.row_count})` : ''}` },
    { key: 'explain', label: 'Explain' },
    { key: 'messages', label: result.error ? 'Messages (!)' : 'Messages' }
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--background)' }}>
      {/* Result tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '28px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveResultTab(activeTabId, tab.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab.key === result.activeResultTab ? '2px solid var(--primary)' : '2px solid transparent',
              padding: '0 12px',
              height: '100%',
              fontSize: '11px',
              cursor: 'pointer',
              color: tab.key === result.activeResultTab ? 'var(--foreground)' : 'var(--muted-foreground)'
            }}
          >
            {tab.label}
          </button>
        ))}

        {/* Status info */}
        {result.queryResult && (
          <span style={{ marginLeft: 'auto', paddingRight: '12px', fontSize: '10px', color: 'var(--muted-foreground)' }}>
            {result.queryResult.row_count} rows in {result.queryResult.duration_ms}ms
            {result.queryResult.truncated && ' (truncated)'}
          </span>
        )}
      </div>

      {/* Result content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {result.isExecuting && (
          <div style={centerStyle}>
            <span style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>Executing...</span>
          </div>
        )}

        {!result.isExecuting && result.activeResultTab === 'results' && (
          result.queryResult ? (
            <DataGrid result={result.queryResult} />
          ) : (
            <div style={centerStyle}>
              <span style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>
                Run a query to see results
              </span>
            </div>
          )
        )}

        {!result.isExecuting && result.activeResultTab === 'explain' && (
          result.explainResult ? (
            <ExplainView result={result.explainResult} />
          ) : (
            <div style={centerStyle}>
              <span style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>
                Run Explain to see the query plan
              </span>
            </div>
          )
        )}

        {!result.isExecuting && result.activeResultTab === 'messages' && (
          <div style={{ padding: '12px 16px', fontSize: '12px' }}>
            {result.error ? (
              <pre style={{ color: 'var(--destructive)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 }}>
                {result.error}
              </pre>
            ) : (
              <span style={{ color: 'var(--muted-foreground)' }}>No messages</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%'
}
