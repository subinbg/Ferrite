import { create } from 'zustand'
import type { QueryResult, ExplainResult } from '../types/query'

interface TabResult {
  queryResult: QueryResult | null
  explainResult: ExplainResult | null
  error: string | null
  isExecuting: boolean
  activeResultTab: 'results' | 'explain' | 'messages'
}

interface ResultsState {
  results: Record<string, TabResult>
  getResult: (tabId: string) => TabResult
  setExecuting: (tabId: string, executing: boolean) => void
  setQueryResult: (tabId: string, result: QueryResult) => void
  setExplainResult: (tabId: string, result: ExplainResult) => void
  setError: (tabId: string, error: string) => void
  setActiveResultTab: (tabId: string, tab: 'results' | 'explain' | 'messages') => void
  clearResult: (tabId: string) => void
}

const defaultResult: TabResult = {
  queryResult: null,
  explainResult: null,
  error: null,
  isExecuting: false,
  activeResultTab: 'results'
}

export const useResultsStore = create<ResultsState>((set, get) => ({
  results: {},

  getResult: (tabId) => get().results[tabId] ?? defaultResult,

  setExecuting: (tabId, executing) =>
    set((s) => ({
      results: {
        ...s.results,
        [tabId]: { ...(s.results[tabId] ?? defaultResult), isExecuting: executing, error: null }
      }
    })),

  setQueryResult: (tabId, result) =>
    set((s) => ({
      results: {
        ...s.results,
        [tabId]: {
          ...(s.results[tabId] ?? defaultResult),
          queryResult: result,
          isExecuting: false,
          error: null,
          activeResultTab: 'results'
        }
      }
    })),

  setExplainResult: (tabId, result) =>
    set((s) => ({
      results: {
        ...s.results,
        [tabId]: {
          ...(s.results[tabId] ?? defaultResult),
          explainResult: result,
          isExecuting: false,
          error: null,
          activeResultTab: 'explain'
        }
      }
    })),

  setError: (tabId, error) =>
    set((s) => ({
      results: {
        ...s.results,
        [tabId]: {
          ...(s.results[tabId] ?? defaultResult),
          isExecuting: false,
          error,
          activeResultTab: 'messages'
        }
      }
    })),

  setActiveResultTab: (tabId, tab) =>
    set((s) => ({
      results: {
        ...s.results,
        [tabId]: { ...(s.results[tabId] ?? defaultResult), activeResultTab: tab }
      }
    })),

  clearResult: (tabId) =>
    set((s) => ({
      results: { ...s.results, [tabId]: defaultResult }
    }))
}))
