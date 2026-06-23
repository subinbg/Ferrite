import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useVaultStatus } from './api/auth'
import { AppLayout } from './components/layout/AppLayout'
import { EditorPanel } from './components/layout/EditorPanel'
import { UnlockDialog } from './components/layout/UnlockDialog'
import { useTabsStore } from './stores/tabs'
import { useLayoutStore } from './stores/layout'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1
    }
  }
})

function AppContent() {
  const { data: vaultStatus, isLoading, error } = useVaultStatus()
  const openTab = useTabsStore((s) => s.openTab)
  const closeTab = useTabsStore((s) => s.closeTab)
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar)

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'n') {
        e.preventDefault()
        openTab()
      }
      if (mod && e.key === 'w') {
        e.preventDefault()
        const activeId = useTabsStore.getState().activeTabId
        if (activeId) closeTab(activeId)
      }
      if (mod && e.key === 'e') {
        e.preventDefault()
        toggleSidebar()
      }
      if (mod && e.key === 's') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('ferrite:save-query'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openTab, closeTab, toggleSidebar])

  if (isLoading) {
    return (
      <div style={centerStyle}>
        <p style={{ color: 'var(--muted-foreground)' }}>Connecting to server...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={centerStyle}>
        <p style={{ color: 'var(--destructive)' }}>
          Failed to connect to server: {(error as Error).message}
        </p>
      </div>
    )
  }

  if (vaultStatus && !vaultStatus.unlocked) {
    return <UnlockDialog status={vaultStatus} />
  }

  return (
    <AppLayout>
      <EditorPanel />
    </AppLayout>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%'
}

export default App
