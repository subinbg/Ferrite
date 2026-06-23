import { useRef, useEffect, useCallback, useMemo } from 'react'
import { monaco } from '../../lib/monaco-setup'
import { useTabsStore } from '../../stores/tabs'
import { useResultsStore } from '../../stores/results'
import { useExecuteQuery, useExplainQuery } from '../../api/queries'
import { useFullSchema } from '../../api/schema'
import { useThemeStore } from '../../stores/theme'
import { setSchemaContext, registerCompletionProvider, type SchemaContext } from './completion'
import { setupLinting } from './linting'
import { registerFerriteThemes } from './theme'
import { registerSqlTokenizer } from './tokenizer'

// Global flag: register language features ONCE, AFTER first editor creation, NEVER dispose
let languageFeaturesRegistered = false

function ensureLanguageFeatures(): void {
  if (languageFeaturesRegistered) return
  languageFeaturesRegistered = true

  // Order: tokenizer → themes → completion (tokenizer must override Monaco's lazy-loaded built-in)
  registerSqlTokenizer()
  registerFerriteThemes()
  registerCompletionProvider()
  console.log('[Ferrite] Language features registered (tokenizer + themes + completion)')
}

// Track per-tab models so undo history is preserved
const tabModels = new Map<string, monaco.editor.ITextModel>()

function getOrCreateModel(tabId: string, initialValue: string): monaco.editor.ITextModel {
  let model = tabModels.get(tabId)
  if (model && !model.isDisposed()) {
    return model
  }
  model = monaco.editor.createModel(initialValue, 'sql')
  tabModels.set(tabId, model)
  return model
}

export function SqlEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  const activeTabId = useTabsStore((s) => s.activeTabId)
  const tabs = useTabsStore((s) => s.tabs)
  const updateTabSql = useTabsStore((s) => s.updateTabSql)
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const executeMutation = useExecuteQuery()
  const explainMutation = useExplainQuery()
  const setExecuting = useResultsStore((s) => s.setExecuting)
  const setQueryResult = useResultsStore((s) => s.setQueryResult)
  const setExplainResult = useResultsStore((s) => s.setExplainResult)
  const setError = useResultsStore((s) => s.setError)

  // Schema for autocomplete — fetch whenever a connection is selected on the tab
  const connectedId = activeTab?.connectionId ?? null
  const { data: fullSchema, error: schemaError } = useFullSchema(connectedId)

  const schemaContext = useMemo((): SchemaContext | null => {
    if (!fullSchema) return null
    return {
      tables: fullSchema.tables,
      columnsByTable: fullSchema.columns_by_table,
    }
  }, [fullSchema])

  // Update global schema ref on every render
  setSchemaContext(schemaContext)

  // Log for debugging
  console.log('[Ferrite] Schema state:', {
    connectedId,
    tables: fullSchema?.tables?.length ?? 0,
    columns: Object.keys(fullSchema?.columns_by_table ?? {}).length,
    schemaError: schemaError ? String(schemaError) : null,
  })

  // Execute/explain handlers via refs
  const executeRef = useRef<() => void>(() => {})
  const explainRef = useRef<() => void>(() => {})

  executeRef.current = useCallback(async () => {
    if (!activeTab?.connectionId) return
    const sql = editorRef.current?.getValue()?.trim()
    if (!sql) return
    setExecuting(activeTab.id, true)
    try {
      const qr = await executeMutation.mutateAsync({ connection_id: activeTab.connectionId, sql })
      setQueryResult(activeTab.id, qr)
    } catch (err: any) {
      setError(activeTab.id, err.message)
    }
  }, [activeTab?.id, activeTab?.connectionId])

  explainRef.current = useCallback(async () => {
    if (!activeTab?.connectionId) return
    const sql = editorRef.current?.getValue()?.trim()
    if (!sql) return
    setExecuting(activeTab.id, true)
    try {
      const er = await explainMutation.mutateAsync({ connection_id: activeTab.connectionId, sql })
      setExplainResult(activeTab.id, er)
    } catch (err: any) {
      setError(activeTab.id, err.message)
    }
  }, [activeTab?.id, activeTab?.connectionId])

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return

    const editor = monaco.editor.create(containerRef.current, {
      theme: `ferrite-${resolvedTheme}`,
      language: 'sql',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
      fontLigatures: true,
      lineHeight: 20,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 8, bottom: 8 },
      renderLineHighlight: 'line',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      automaticLayout: true,
      wordWrap: 'on',
      tabSize: 2,
      autoIndent: 'full',
      formatOnPaste: true,
      formatOnType: true,
      suggest: {
        showKeywords: true,
        showSnippets: false,
        insertMode: 'replace',
        filterGraceful: true,
      },
      quickSuggestions: {
        other: true,
        strings: false,
        comments: false,
      },
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'currentDocument',
      acceptSuggestionOnEnter: 'on',
    })

    editorRef.current = editor

    // Register language features AFTER editor creation (so Monaco has initialized the SQL language)
    // This only runs once globally — the provider is never disposed
    ensureLanguageFeatures()

    const cleanupLinting = setupLinting(editor)

    editor.addAction({
      id: 'ferrite.execute',
      label: 'Execute Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => { executeRef.current() }
    })
    editor.addAction({
      id: 'ferrite.explain',
      label: 'Explain Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: () => { explainRef.current() }
    })

    return () => {
      // Only dispose the editor and linting — NOT the completion provider (it's global)
      cleanupLinting()
      editor.dispose()
      editorRef.current = null
    }
  }, [])

  // Switch Monaco theme
  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(`ferrite-${resolvedTheme}`)
    }
  }, [resolvedTheme])

  // Switch model when active tab changes
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !activeTab) return

    const model = getOrCreateModel(activeTab.id, activeTab.sql)
    if (editor.getModel() !== model) {
      editor.setModel(model)
    }

    const disposable = model.onDidChangeContent(() => {
      updateTabSql(activeTab.id, model.getValue())
    })

    editor.focus()

    return () => {
      disposable.dispose()
    }
  }, [activeTabId])

  if (!activeTab) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>
        Open a query tab to start
      </div>
    )
  }

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}
