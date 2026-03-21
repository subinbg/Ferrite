import { Plus, X } from 'lucide-react'
import { useTabsStore } from '../../stores/tabs'

export function EditorTabs(): JSX.Element {
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const setActiveTab = useTabsStore((s) => s.setActiveTab)
  const closeTab = useTabsStore((s) => s.closeTab)
  const openTab = useTabsStore((s) => s.openTab)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '32px',
        backgroundColor: 'var(--background)',
        borderBottom: '1px solid var(--border)',
        overflow: 'hidden',
        flexShrink: 0
      }}
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '0 10px',
            height: '100%',
            fontSize: '11px',
            cursor: 'pointer',
            borderRight: '1px solid var(--border)',
            backgroundColor: tab.id === activeTabId ? 'var(--accent)' : 'transparent',
            color: tab.id === activeTabId ? 'var(--foreground)' : 'var(--muted-foreground)',
            whiteSpace: 'nowrap',
            userSelect: 'none'
          }}
        >
          {tab.isDirty && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary)',
                flexShrink: 0
              }}
            />
          )}
          <span>{tab.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              padding: '1px',
              display: 'flex',
              marginLeft: '4px',
              borderRadius: '2px'
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}

      <button
        onClick={() => openTab()}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--muted-foreground)',
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center'
        }}
        title="New Query (Cmd+N)"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
