import { create } from 'zustand'

type Theme = 'dark' | 'light' | 'system'

function resolve(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

interface ThemeState {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  setTheme: (t: Theme) => void
}

const initial = (localStorage.getItem('ferrite-theme') as Theme) || 'dark'

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  resolvedTheme: resolve(initial),

  setTheme: (theme) => {
    const resolvedTheme = resolve(theme)
    localStorage.setItem('ferrite-theme', theme)
    document.documentElement.className = `theme-${resolvedTheme}`
    set({ theme, resolvedTheme })
  },
}))

// Apply on load
document.documentElement.className = `theme-${resolve(initial)}`
