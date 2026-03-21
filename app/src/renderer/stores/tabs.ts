import { create } from 'zustand'

export interface QueryTab {
  id: string
  title: string
  connectionId: string | null
  sql: string
  bindVariables: Record<string, string>
  isDirty: boolean
}

interface TabsState {
  tabs: QueryTab[]
  activeTabId: string | null
  openTab: (connectionId?: string | null, initialSql?: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabSql: (id: string, sql: string) => void
  updateTabConnection: (id: string, connectionId: string) => void
}

let nextTabNum = 1

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (connectionId = null, initialSql = '') => {
    const id = crypto.randomUUID()
    const title = `Query ${nextTabNum++}`
    const tab: QueryTab = {
      id,
      title,
      connectionId,
      sql: initialSql,
      bindVariables: {},
      isDirty: false
    }
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id
    }))
  },

  closeTab: (id) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (activeTabId === id) {
        const idx = s.tabs.findIndex((t) => t.id === id)
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null
      }
      return { tabs, activeTabId }
    })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabSql: (id, sql) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, sql, isDirty: true } : t))
    })),

  updateTabConnection: (id, connectionId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, connectionId } : t))
    }))
}))
