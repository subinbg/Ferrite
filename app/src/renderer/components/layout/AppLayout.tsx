import { useRef, useCallback } from 'react'
import { Sun, Moon, PanelLeftClose, PanelLeft } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { useLayoutStore } from '../../stores/layout'
import { useThemeStore } from '../../stores/theme'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen)
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const setTheme = useThemeStore((s) => s.setTheme)
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarRef.current?.offsetWidth ?? 240

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(500, startWidth + ev.clientX - startX))
      if (sidebarRef.current) sidebarRef.current.style.width = `${newWidth}px`
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const toggleTheme = () => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Title bar */}
      <div className="titlebar-drag" style={titleBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={toggleSidebar} className="titlebar-no-drag" style={titleBtnStyle} title="Toggle sidebar (Cmd+E)">
            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
          </button>
          <span>Ferrite</span>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={toggleTheme} className="titlebar-no-drag" style={titleBtnStyle} title="Toggle theme">
          {resolvedTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {sidebarOpen && (
          <>
            <div ref={sidebarRef} style={{ width: 240, flexShrink: 0, overflow: 'hidden' }}>
              <Sidebar />
            </div>
            <div onMouseDown={onDragStart} style={dividerStyle} />
          </>
        )}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>

      <StatusBar />
    </div>
  )
}

const titleBarStyle: React.CSSProperties = {
  height: 38,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 80,
  paddingRight: 12,
  backgroundColor: 'var(--background)',
  borderBottom: '1px solid var(--border)',
  fontSize: 12,
  color: 'var(--muted-foreground)',
  fontWeight: 500,
  flexShrink: 0,
}

const titleBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--muted-foreground)',
  padding: '4px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
}

const dividerStyle: React.CSSProperties = {
  width: 4,
  cursor: 'col-resize',
  backgroundColor: 'var(--border)',
  flexShrink: 0,
}
