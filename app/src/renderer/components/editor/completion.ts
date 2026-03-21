import { monaco } from '../../lib/monaco-setup'
import type { TableInfo, ColumnInfo } from '../../types/schema'

export interface SchemaContext {
  tables: TableInfo[]
  columnsByTable: Record<string, ColumnInfo[]>
}

// ---- Module-level schema ref, updated by SqlEditor on every render ----
let currentSchema: SchemaContext | null = null

export function setSchemaContext(schema: SchemaContext | null): void {
  currentSchema = schema
}

// ---- SQL keywords ----
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN',
  'LIKE', 'ILIKE', 'IS', 'NULL', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'INNER',
  'OUTER', 'FULL', 'CROSS', 'UNION', 'ALL', 'INTERSECT', 'EXCEPT',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
  'ALTER', 'DROP', 'INDEX', 'VIEW', 'TRIGGER', 'FUNCTION',
  'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING', 'LIMIT', 'OFFSET',
  'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT',
  'CONSTRAINT', 'CASCADE', 'RESTRICT',
  'TEXT', 'INTEGER', 'BOOLEAN', 'TIMESTAMP', 'DATE', 'NUMERIC', 'SERIAL',
  'VARCHAR', 'BIGINT', 'SMALLINT', 'REAL', 'FLOAT', 'JSON', 'JSONB', 'UUID',
  'TRUE', 'FALSE', 'WITH', 'RECURSIVE', 'RETURNING', 'LATERAL',
  'EXPLAIN', 'ANALYZE', 'VERBOSE', 'FORMAT',
]

// ---- Global registration (called once from monaco-setup.ts) ----
let registered = false

export function registerCompletionProvider(): void {
  if (registered) return
  registered = true

  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ':'],

    provideCompletionItems(
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ): monaco.languages.CompletionList {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      )

      console.log('[Ferrite] Completion called:', { word: word.word, hasSchema: currentSchema !== null, tables: currentSchema?.tables?.length ?? 0 })

      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      })

      const suggestions: monaco.languages.CompletionItem[] = []
      const schema = currentSchema

      // 1) After a dot: table.column completion
      const dotMatch = textUntilPosition.match(/(\w+)\.\w*$/)
      if (dotMatch && schema) {
        const tableName = dotMatch[1].toLowerCase()
        const columns = schema.columnsByTable[tableName] ?? []
        for (const col of columns) {
          suggestions.push({
            label: col.name,
            kind: monaco.languages.CompletionItemKind.Field,
            detail: `${col.data_type}${col.is_nullable ? '?' : ''}${col.is_primary_key ? ' PK' : ''}`,
            insertText: col.name,
            range
          })
        }
        return { suggestions }
      }

      // 2) After colon: bind variable completion
      if (textUntilPosition.match(/:(\w*)$/)) {
        const allBinds = new Set<string>()
        const re = /:([a-zA-Z_]\w*)/g
        let m
        const fullText = model.getValue()
        while ((m = re.exec(fullText)) !== null) {
          allBinds.add(m[1])
        }
        for (const name of allBinds) {
          suggestions.push({
            label: `:${name}`,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: 'bind variable',
            insertText: name,
            range
          })
        }
        return { suggestions }
      }

      // 3) SQL keywords — always present, Monaco does the fuzzy filtering
      for (const kw of SQL_KEYWORDS) {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
          sortText: '0_' + kw,
        })
      }

      // 4) Table names
      if (schema) {
        for (const table of schema.tables) {
          suggestions.push({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Struct,
            detail: `table${table.estimated_row_count != null ? ` (~${table.estimated_row_count})` : ''}`,
            insertText: table.name,
            range,
            sortText: '1_' + table.name,
          })
        }

        // 5) All column names from all tables
        const seen = new Set<string>()
        for (const [tableName, columns] of Object.entries(schema.columnsByTable)) {
          for (const col of columns) {
            if (seen.has(col.name)) continue
            seen.add(col.name)
            suggestions.push({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: `${tableName}.${col.data_type}${col.is_primary_key ? ' PK' : ''}`,
              insertText: col.name,
              range,
              sortText: '2_' + col.name,
            })
          }
        }
      }

      return { suggestions }
    }
  })
}
