import { useRef, useEffect, useCallback, useMemo } from 'react'
import { monaco } from '../../lib/monaco-setup'
import { useTabsStore } from '../../stores/tabs'
import { useResultsStore } from '../../stores/results'
import { useExecuteQuery, useExplainQuery } from '../../api/queries'
import { useConnections } from '../../api/connections'
import { useFullSchema } from '../../api/schema'
import { useThemeStore } from '../../stores/theme'
import { createCompletionProvider, type SchemaContext } from './completion'
import { setupLinting } from './linting'
import { registerFerriteThemes } from './theme'
import { registerSqlTokenizer } from './tokenizer'

// Register themes + tokenizer once
let themesRegistered = false

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

export function SqlEditor(): JSX.Element {
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

  // Schema for autocomplete — only fetch when connection is active
  const connectedId = activeTab?.connectionId ?? null
  const { data: connections } = useConnections()
  const isConnected = connections?.some((c) => c.id === connectedId && c.connected) ?? false
  const { data: fullSchema } = useFullSchema(connectedId, isConnected)

  const schemaContext = useMemo((): SchemaContext | null => {
    if (!fullSchema) return null
    return {
      tables: fullSchema.tables,
      columnsByTable: fullSchema.columns_by_table,
    }
  }, [fullSchema])

  const schemaRef = useRef(schemaContext)
  schemaRef.current = schemaContext

  // Execute handler
  const handleExecute = useCallback(async () => {
    if (!activeTab?.connectionId) return
    const sql = editorRef.current?.getValue()?.trim()
    if (!sql) return
    setExecuting(activeTab.id, true)
    try {
      const qr = await executeMutation.mutateAsync({
        connection_id: activeTab.connectionId,
        sql
      })
      setQueryResult(activeTab.id, qr)
    } catch (err: any) {
      setError(activeTab.id, err.message)
    }
  }, [activeTab?.id, activeTab?.connectionId])

  const handleExplain = useCallback(async () => {
    if (!activeTab?.connectionId) return
    const sql = editorRef.current?.getValue()?.trim()
    if (!sql) return
    setExecuting(activeTab.id, true)
    try {
      const er = await explainMutation.mutateAsync({
        connection_id: activeTab.connectionId,
        sql
      })
      setExplainResult(activeTab.id, er)
    } catch (err: any) {
      setError(activeTab.id, err.message)
    }
  }, [activeTab?.id, activeTab?.connectionId])

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return

    // Register themes once (before editor creation is fine for themes)
    if (!themesRegistered) {
      registerFerriteThemes()
      themesRegistered = true
    }

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
        showKeywords: false,
        showSnippets: false,
        insertMode: 'replace',
        filterGraceful: true,
      },
      quickSuggestions: {
        other: true,
        strings: false,
        comments: false
      },
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'currentDocument',
      acceptSuggestionOnEnter: 'on'
    })

    editorRef.current = editor

    // Register tokenizer AFTER editor creation — Monaco lazy-loads built-in SQL
    // when the editor is created, so we must override it afterward.
    registerSqlTokenizer()

    // Re-apply tokenizer to all existing models
    for (const model of monaco.editor.getModels()) {
      if (model.getLanguageId() === 'sql') {
        monaco.editor.setModelLanguage(model, 'sql')
      }
    }

    // Register completion provider
    const completionDisposable = monaco.languages.registerCompletionItemProvider(
      'sql',
      createCompletionProvider(() => schemaRef.current)
    )

    // Setup linting
    const cleanupLinting = setupLinting(editor)

    // Keybindings
    editor.addAction({
      id: 'ferrite.execute',
      label: 'Execute Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => { handleExecute() }
    })

    editor.addAction({
      id: 'ferrite.explain',
      label: 'Explain Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: () => { handleExplain() }
    })

    return () => {
      completionDisposable.dispose()
      cleanupLinting()
      editor.dispose()
      editorRef.current = null
    }
  }, []) // Mount once

  // Switch Monaco theme when app theme changes
  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(`ferrite-${resolvedTheme}`)
    }
  }, [resolvedTheme])

  // Update execute/explain handlers when tab changes (via refs would be better, but actions are re-registered)
  const executeRef = useRef(handleExecute)
  executeRef.current = handleExecute
  const explainRef = useRef(handleExplain)
  explainRef.current = handleExplain

  // Switch model when active tab changes
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !activeTab) return

    const model = getOrCreateModel(activeTab.id, activeTab.sql)
    if (editor.getModel() !== model) {
      editor.setModel(model)
    }

    // Ensure the model has the sql language set (for tokenizer + completions)
    if (model.getLanguageId() !== 'sql') {
      monaco.editor.setModelLanguage(model, 'sql')
    }

    // Sync model changes back to store
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
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted-foreground)',
          fontSize: '13px'
        }}
      >
        Open a query tab to start
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', width: '100%' }}
    />
  )
}
