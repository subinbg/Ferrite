import { useState, useEffect } from 'react'
import { Play, Lightbulb, Loader2, Download, Save } from 'lucide-react'
import { useTabsStore } from '../../stores/tabs'
import { useResultsStore } from '../../stores/results'
import { useConnections, useConnectConnection } from '../../api/connections'
import { useExecuteQuery, useExplainQuery } from '../../api/queries'
import { ExportDialog } from '../results/ExportDialog'
import { SaveDialog } from '../history/SaveDialog'
import { BindVariablesDialog, extractBindVariables } from './BindVariablesDialog'

export function EditorToolbar(): JSX.Element {
  const [showExport, setShowExport] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [showBindVars, setShowBindVars] = useState<'execute' | 'explain' | null>(null)
  const activeTabId = useTabsStore((s) => s.activeTabId)

  useEffect(() => {
    const handler = () => setShowSave(true)
    window.addEventListener('ferrite:save-query', handler)
    return () => window.removeEventListener('ferrite:save-query', handler)
  }, [])

  const tabs = useTabsStore((s) => s.tabs)
  const updateTabConnection = useTabsStore((s) => s.updateTabConnection)
  const updateTabBindVariables = useTabsStore((s) => s.updateTabBindVariables)
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const { data: connections } = useConnections()
  const connectMutation = useConnectConnection()
  const executeMutation = useExecuteQuery()
  const explainMutation = useExplainQuery()

  const setExecuting = useResultsStore((s) => s.setExecuting)
  const setQueryResult = useResultsStore((s) => s.setQueryResult)
  const setExplainResult = useResultsStore((s) => s.setExplainResult)
  const setError = useResultsStore((s) => s.setError)
  const result = useResultsStore((s) => s.getResult(activeTabId ?? ''))

  const ensureConnected = async (connectionId: string): Promise<boolean> => {
    const conn = connections?.find((c) => c.id === connectionId)
    if (!conn) return false
    if (conn.connected) return true
    try {
      await connectMutation.mutateAsync(connectionId)
      return true
    } catch (err: any) {
      setError(activeTab!.id, `Connection failed: ${err.message}`)
      return false
    }
  }

  const executeWithBinds = async (bindValues: Record<string, string>) => {
    if (!activeTab?.connectionId) return
    // Save bind values to tab store for reuse
    updateTabBindVariables(activeTab.id, bindValues)
    setShowBindVars(null)
    setExecuting(activeTab.id, true)

    if (!(await ensureConnected(activeTab.connectionId))) return

    // Convert string values to JSON values (try to parse numbers/booleans)
    const bindVariables: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(bindValues)) {
      bindVariables[k] = parseBindValue(v)
    }

    try {
      const qr = await executeMutation.mutateAsync({
        connection_id: activeTab.connectionId,
        sql: activeTab.sql,
        bind_variables: bindVariables,
      })
      setQueryResult(activeTab.id, qr)
    } catch (err: any) {
      setError(activeTab.id, err.message)
    }
  }

  const explainWithBinds = async (bindValues: Record<string, string>) => {
    if (!activeTab?.connectionId) return
    updateTabBindVariables(activeTab.id, bindValues)
    setShowBindVars(null)
    setExecuting(activeTab.id, true)

    if (!(await ensureConnected(activeTab.connectionId))) return

    const bindVariables: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(bindValues)) {
      bindVariables[k] = parseBindValue(v)
    }

    try {
      const er = await explainMutation.mutateAsync({
        connection_id: activeTab.connectionId,
        sql: activeTab.sql,
        bind_variables: bindVariables,
      })
      setExplainResult(activeTab.id, er)
    } catch (err: any) {
      setError(activeTab.id, err.message)
    }
  }

  const handleRun = () => {
    if (!activeTab?.connectionId || !activeTab.sql.trim()) return
    const params = extractBindVariables(activeTab.sql)
    if (params.length > 0) {
      setShowBindVars('execute')
    } else {
      executeWithBinds({})
    }
  }

  const handleExplain = () => {
    if (!activeTab?.connectionId || !activeTab.sql.trim()) return
    const params = extractBindVariables(activeTab.sql)
    if (params.length > 0) {
      setShowBindVars('explain')
    } else {
      explainWithBinds({})
    }
  }

  if (!activeTab) return <div style={barStyle} />

  const allConns = connections ?? []
  const bindParams = activeTab.sql ? extractBindVariables(activeTab.sql) : []

  return (
    <div style={barStyle}>
      <select
        value={activeTab.connectionId ?? ''}
        onChange={(e) => updateTabConnection(activeTab.id, e.target.value)}
        style={selectStyle}
      >
        <option value="">Select connection...</option>
        {allConns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.connected ? '\u25CF ' : '\u25CB '}{c.name}
          </option>
        ))}
      </select>

      <div style={sepStyle} />

      <button onClick={handleRun} disabled={result.isExecuting || !activeTab.connectionId} style={btnStyle} title="Execute (Cmd+Enter)">
        {result.isExecuting ? <Loader2 size={13} /> : <Play size={13} />}
        Run
      </button>
      <button onClick={handleExplain} disabled={result.isExecuting || !activeTab.connectionId} style={btnStyle} title="Explain (Cmd+Shift+Enter)">
        <Lightbulb size={13} />
        Explain
      </button>

      <div style={sepStyle} />

      <button onClick={() => setShowExport(true)} disabled={!activeTab.connectionId || !activeTab.sql.trim()} style={btnStyle} title="Export results">
        <Download size={13} /> Export
      </button>
      <button onClick={() => setShowSave(true)} disabled={!activeTab.sql.trim()} style={btnStyle} title="Save query (Cmd+S)">
        <Save size={13} /> Save
      </button>

      {showExport && activeTab.connectionId && (
        <ExportDialog connectionId={activeTab.connectionId} sql={activeTab.sql} onClose={() => setShowExport(false)} />
      )}
      {showSave && (
        <SaveDialog connectionId={activeTab.connectionId} sql={activeTab.sql} onClose={() => setShowSave(false)} />
      )}
      {showBindVars && (
        <BindVariablesDialog
          paramNames={bindParams}
          initialValues={activeTab.bindVariables}
          onExecute={showBindVars === 'execute' ? executeWithBinds : explainWithBinds}
          onCancel={() => setShowBindVars(null)}
        />
      )}
    </div>
  )
}

/** Try to parse a string value as number/boolean/null, fallback to string */
function parseBindValue(v: string): unknown {
  if (v === '') return null
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null') return null
  const num = Number(v)
  if (!isNaN(num) && v.trim() !== '') return num
  return v
}

const barStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)', height: '34px', flexShrink: 0 }
const selectStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', color: 'var(--foreground)', outline: 'none', maxWidth: '200px' }
const btnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', color: 'var(--foreground)', cursor: 'pointer' }
const sepStyle: React.CSSProperties = { width: '1px', height: '16px', backgroundColor: 'var(--border)' }
