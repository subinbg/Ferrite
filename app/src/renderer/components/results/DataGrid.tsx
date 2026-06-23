import { useMemo } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community'
import type { QueryResult } from '../../types/query'
import { useThemeStore } from '../../stores/theme'

ModuleRegistry.registerModules([AllCommunityModule])

const darkTheme = themeQuartz.withParams({
  backgroundColor: '#0f0f11',
  foregroundColor: '#e4e4e7',
  headerBackgroundColor: '#18181b',
  headerFontSize: 12,
  fontSize: 12,
  rowHoverColor: '#18181b',
  selectedRowBackgroundColor: '#27272a',
  borderColor: '#27272a',
  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
  oddRowBackgroundColor: '#0f0f11',
  cellHorizontalPaddingScale: 0.8,
  headerColumnResizeHandleColor: '#3b82f6',
  rangeSelectionBackgroundColor: '#3b82f630',
  rangeSelectionBorderColor: '#3b82f6',
})

const lightTheme = themeQuartz.withParams({
  backgroundColor: '#ffffff',
  foregroundColor: '#09090b',
  headerBackgroundColor: '#eaeaee',
  headerFontSize: 12,
  headerFontWeight: 600,
  fontSize: 12,
  rowHoverColor: '#f0f0f3',
  selectedRowBackgroundColor: '#dbeafe',
  borderColor: '#d4d4d8',
  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
  oddRowBackgroundColor: '#fafafb',
  cellHorizontalPaddingScale: 0.8,
  headerColumnResizeHandleColor: '#2563eb',
})

interface Props {
  result: QueryResult
}

export function DataGrid({ result }: Props) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const gridTheme = resolvedTheme === 'dark' ? darkTheme : lightTheme
  const columnDefs: ColDef[] = useMemo(
    () =>
      result.columns.map((col) => ({
        field: col.name,
        headerName: col.name,
        headerTooltip: `${col.type}${col.nullable ? ' (nullable)' : ''}`,
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 80,
        cellStyle: (params: { value: unknown }) =>
          params.value === null
            ? { color: '#6b7280', fontStyle: 'italic' }
            : undefined,
        valueFormatter: (params: { value: unknown }) => {
          if (params.value === null) return 'NULL'
          if (typeof params.value === 'object') return JSON.stringify(params.value)
          return String(params.value)
        },
      })),
    [result.columns]
  )

  const rowData = useMemo(
    () =>
      result.rows.map((row) => {
        const obj: Record<string, unknown> = {}
        result.columns.forEach((col, i) => {
          obj[col.name] = row[i]
        })
        return obj
      }),
    [result.rows, result.columns]
  )

  if (result.columns.length === 0) {
    return (
      <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--muted-foreground)' }}>
        Query executed successfully. No rows returned.
      </div>
    )
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <AgGridReact
        theme={gridTheme}
        columnDefs={columnDefs}
        rowData={rowData}
        enableCellTextSelection={true}
        ensureDomOrder={true}
        suppressColumnVirtualisation={false}
        rowBuffer={20}
        animateRows={false}
        defaultColDef={{
          sortable: true,
          resizable: true,
          filter: true,
        }}
      />
    </div>
  )
}
