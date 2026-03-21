import { monaco } from '../../lib/monaco-setup'

export function registerFerriteThemes(): void {
  monaco.editor.defineTheme('ferrite-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'c084fc', fontStyle: 'bold' },     // purple - SELECT, FROM, WHERE
      { token: 'operator.sql', foreground: 'f472b6', fontStyle: 'bold' },// pink - IS, NULL, NOT, IN, EXISTS
      { token: 'operator', foreground: '93c5fd' },                       // blue - =, <, >, ::
      { token: 'predefined', foreground: 'fb923c' },                     // orange - COUNT, NOW, COALESCE
      { token: 'type', foreground: '67e8f9' },                           // cyan - INTEGER, TEXT, UUID
      { token: 'string', foreground: '86efac' },                         // green
      { token: 'string.escape', foreground: '4ade80' },                  // brighter green
      { token: 'number', foreground: 'fbbf24' },                         // amber
      { token: 'number.float', foreground: 'fbbf24' },
      { token: 'number.hex', foreground: 'fbbf24' },
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },   // gray
      { token: 'variable', foreground: 'f97316' },                       // bright orange - :param, $1
      { token: 'identifier', foreground: 'e4e4e7' },                     // foreground
      { token: 'identifier.quote', foreground: '7dd3fc' },               // light blue - "quoted_name"
      { token: 'delimiter', foreground: '71717a' },                      // dim - ; , ( )
    ],
    colors: {
      'editor.background': '#0f0f11',
      'editor.foreground': '#e4e4e7',
      'editor.lineHighlightBackground': '#18181b',
      'editor.selectionBackground': '#3b82f640',
      'editor.inactiveSelectionBackground': '#3b82f620',
      'editorCursor.foreground': '#3b82f6',
      'editorWhitespace.foreground': '#27272a',
      'editorIndentGuide.background': '#27272a',
      'editorIndentGuide.activeBackground': '#3b82f640',
      'editorLineNumber.foreground': '#52525b',
      'editorLineNumber.activeForeground': '#a1a1aa',
      'editorGutter.background': '#0f0f11',
      'editorBracketMatch.background': '#3b82f620',
      'editorBracketMatch.border': '#3b82f660',
      'editorWidget.background': '#18181b',
      'editorWidget.border': '#27272a',
      'editorSuggestWidget.background': '#1c1c20',
      'editorSuggestWidget.border': '#3f3f46',
      'editorSuggestWidget.foreground': '#e4e4e7',
      'editorSuggestWidget.highlightForeground': '#60a5fa',
      'editorSuggestWidget.selectedBackground': '#2e2e33',
      'editorSuggestWidget.selectedForeground': '#ffffff',
      'editorSuggestWidget.focusHighlightForeground': '#60a5fa',
      'editorHoverWidget.background': '#1c1c20',
      'editorHoverWidget.border': '#3f3f46',
      'editorHoverWidget.foreground': '#e4e4e7',
      'list.hoverBackground': '#27272a',
      'list.focusBackground': '#2e2e33',
      'list.highlightForeground': '#60a5fa',
      'input.background': '#18181b',
      'input.border': '#27272a',
      'input.foreground': '#e4e4e7',
      'scrollbarSlider.background': '#27272a80',
      'scrollbarSlider.hoverBackground': '#3f3f46',
      'scrollbarSlider.activeBackground': '#52525b',
    }
  })

  monaco.editor.defineTheme('ferrite-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '6d28d9', fontStyle: 'bold' },     // darker purple
      { token: 'operator.sql', foreground: 'be185d', fontStyle: 'bold' },// darker pink
      { token: 'operator', foreground: '1d4ed8' },                       // darker blue
      { token: 'predefined', foreground: 'c2410c' },                     // dark orange (functions)
      { token: 'type', foreground: '0e7490' },                           // darker cyan
      { token: 'string', foreground: '15803d' },                         // darker green
      { token: 'string.escape', foreground: '166534' },
      { token: 'number', foreground: '92400e' },                         // dark amber
      { token: 'number.float', foreground: '92400e' },
      { token: 'number.hex', foreground: '92400e' },
      { token: 'comment', foreground: '71717a', fontStyle: 'italic' },   // darker gray
      { token: 'variable', foreground: 'c2410c', fontStyle: 'bold' },    // dark orange - :param
      { token: 'identifier', foreground: '09090b' },                     // near black
      { token: 'identifier.quote', foreground: '0c4a6e' },              // dark blue
      { token: 'delimiter', foreground: '71717a' },                      // medium gray
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#09090b',
      'editor.lineHighlightBackground': '#f0f0f3',
      'editor.selectionBackground': '#2563eb30',
      'editor.inactiveSelectionBackground': '#2563eb18',
      'editorCursor.foreground': '#2563eb',
      'editorWhitespace.foreground': '#d4d4d8',
      'editorIndentGuide.background': '#d4d4d8',
      'editorLineNumber.foreground': '#71717a',
      'editorLineNumber.activeForeground': '#27272a',
      'editorGutter.background': '#fafafb',
      'editor.selectionHighlightBackground': '#2563eb18',
      'editorBracketMatch.background': '#2563eb20',
      'editorBracketMatch.border': '#2563eb50',
      'editorWidget.background': '#f0f0f3',
      'editorWidget.border': '#d4d4d8',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#c4c4cc',
      'editorSuggestWidget.foreground': '#09090b',
      'editorSuggestWidget.highlightForeground': '#1d4ed8',
      'editorSuggestWidget.selectedBackground': '#dbeafe',
      'editorSuggestWidget.selectedForeground': '#09090b',
      'editorSuggestWidget.focusHighlightForeground': '#1d4ed8',
      'editorHoverWidget.background': '#ffffff',
      'editorHoverWidget.border': '#c4c4cc',
      'editorHoverWidget.foreground': '#09090b',
      'list.hoverBackground': '#f0f0f3',
      'list.focusBackground': '#dbeafe',
      'list.focusForeground': '#09090b',
      'list.highlightForeground': '#1d4ed8',
      'input.background': '#f0f0f3',
      'input.border': '#d4d4d8',
      'input.foreground': '#09090b',
      'scrollbarSlider.background': '#d4d4d880',
      'scrollbarSlider.hoverBackground': '#a1a1aa',
      'scrollbarSlider.activeBackground': '#71717a',
    }
  })
}
