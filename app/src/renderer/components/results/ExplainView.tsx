import type { ExplainResult } from '../../types/query'

interface Props {
  result: ExplainResult
}

export function ExplainView({ result }: Props) {
  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Summary */}
      {(result.summary.total_cost !== null || result.summary.execution_time_ms !== null) && (
        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginBottom: '12px',
            fontSize: '12px'
          }}
        >
          {result.summary.total_cost !== null && (
            <div>
              <span style={{ color: 'var(--muted-foreground)' }}>Cost: </span>
              <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>
                {result.summary.total_cost.toFixed(2)}
              </span>
            </div>
          )}
          {result.summary.execution_time_ms !== null && (
            <div>
              <span style={{ color: 'var(--muted-foreground)' }}>Execution: </span>
              <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>
                {result.summary.execution_time_ms.toFixed(2)}ms
              </span>
            </div>
          )}
        </div>
      )}

      {/* Raw plan */}
      <pre
        style={{
          backgroundColor: 'var(--accent)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '12px',
          fontSize: '11px',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
          color: 'var(--foreground)',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          margin: 0
        }}
      >
        {JSON.stringify(result.raw_plan, null, 2)}
      </pre>
    </div>
  )
}
