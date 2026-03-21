import { create } from 'zustand'

interface LayoutState {
  sidebarOpen: boolean
  sidebarTab: 'explorer' | 'history' | 'saved'
  toggleSidebar: () => void
  setSidebarTab: (tab: 'explorer' | 'history' | 'saved') => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: true,
  sidebarTab: 'explorer',
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarTab: (tab) => set({ sidebarTab: tab })
}))
