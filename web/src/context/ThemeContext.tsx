import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type Theme = 'dark' | 'light' | 'nord' | 'dracula' | 'catppuccin' | 'rose-pine' | 'solarized-dark'

export interface ThemeMeta {
  label: string
  baseScheme: 'dark' | 'light'
  colors: { base: string; surface: string; accent: string; text: string }
}

export const THEMES: Theme[] = ['dark', 'light', 'nord', 'dracula', 'catppuccin', 'rose-pine', 'solarized-dark']

export const THEME_META: Record<Theme, ThemeMeta> = {
  dark: {
    label: 'Dark',
    baseScheme: 'dark',
    colors: { base: '#0f172a', surface: '#1e293b', accent: '#2D7AFF', text: '#f8fafc' },
  },
  light: {
    label: 'Light',
    baseScheme: 'light',
    colors: { base: '#f8fafc', surface: '#ffffff', accent: '#2D7AFF', text: '#0f172a' },
  },
  nord: {
    label: 'Nord',
    baseScheme: 'dark',
    colors: { base: '#2E3440', surface: '#3B4252', accent: '#88C0D0', text: '#ECEFF4' },
  },
  dracula: {
    label: 'Dracula',
    baseScheme: 'dark',
    colors: { base: '#282A36', surface: '#44475A', accent: '#BD93F9', text: '#F8F8F2' },
  },
  catppuccin: {
    label: 'Catppuccin',
    baseScheme: 'dark',
    colors: { base: '#1E1E2E', surface: '#313244', accent: '#CBA6F7', text: '#CDD6F4' },
  },
  'rose-pine': {
    label: 'Rose Pine',
    baseScheme: 'dark',
    colors: { base: '#191724', surface: '#1F1D2E', accent: '#C4A7E7', text: '#E0DEF4' },
  },
  'solarized-dark': {
    label: 'Solarized',
    baseScheme: 'dark',
    colors: { base: '#002B36', surface: '#073642', accent: '#268BD2', text: '#839496' },
  },
}

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = 'radar-theme'

function isValidTheme(value: string): value is Theme {
  return THEMES.includes(value as Theme)
}

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored && isValidTheme(stored)) {
      return stored
    }
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light'
    }
  }
  return 'dark'
}

function applyTheme(theme: Theme) {
  const meta = THEME_META[theme]
  document.documentElement.setAttribute('data-theme', meta.baseScheme)
  document.documentElement.setAttribute('data-color-theme', theme)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
  }

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    const handleChange = (e: MediaQueryListEvent) => {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (!stored) {
        setThemeState(e.matches ? 'light' : 'dark')
      }
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
