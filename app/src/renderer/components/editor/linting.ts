import { monaco } from '../../lib/monaco-setup'

let lintTimer: ReturnType<typeof setTimeout> | null = null

export function setupLinting(editor: monaco.editor.IStandaloneCodeEditor): () => void {
  const lint = () => {
    const model = editor.getModel()
    if (!model) return

    const sql = model.getValue().trim()
    if (!sql) {
      monaco.editor.setModelMarkers(model, 'ferrite', [])
      return
    }

    // Basic SQL validation heuristics
    const markers: monaco.editor.IMarkerData[] = []

    // Check for unclosed quotes
    let inSingle = false
    let inDouble = false
    const lines = sql.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (let j = 0; j < line.length; j++) {
        const ch = line[j]
        if (ch === "'" && !inDouble) inSingle = !inSingle
        if (ch === '"' && !inSingle) inDouble = !inDouble
      }
    }
    if (inSingle) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: 'Unclosed single quote',
        startLineNumber: lines.length,
        startColumn: 1,
        endLineNumber: lines.length,
        endColumn: lines[lines.length - 1].length + 1
      })
    }
    if (inDouble) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: 'Unclosed double quote',
        startLineNumber: lines.length,
        startColumn: 1,
        endLineNumber: lines.length,
        endColumn: lines[lines.length - 1].length + 1
      })
    }

    // Check for unmatched parentheses
    let parenDepth = 0
    for (let i = 0; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '(') parenDepth++
        if (ch === ')') parenDepth--
        if (parenDepth < 0) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: 'Unexpected closing parenthesis',
            startLineNumber: i + 1,
            startColumn: 1,
            endLineNumber: i + 1,
            endColumn: lines[i].length + 1
          })
          parenDepth = 0
        }
      }
    }
    if (parenDepth > 0) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `${parenDepth} unclosed parenthesis(es)`,
        startLineNumber: lines.length,
        startColumn: 1,
        endLineNumber: lines.length,
        endColumn: lines[lines.length - 1].length + 1
      })
    }

    monaco.editor.setModelMarkers(model, 'ferrite', markers)
  }

  const onChange = () => {
    if (lintTimer) clearTimeout(lintTimer)
    lintTimer = setTimeout(lint, 500)
  }

  const disposable = editor.onDidChangeModelContent(onChange)
  // Initial lint
  lint()

  return () => {
    disposable.dispose()
    if (lintTimer) clearTimeout(lintTimer)
  }
}
