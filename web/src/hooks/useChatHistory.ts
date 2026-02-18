import { useState, useCallback, useRef } from 'react'
import type { ResourceContext, ViewContext } from '../api/ai'
import type { ToolCallInfo } from '../components/dock/ChatMessage'

// ============================================================================
// Types
// ============================================================================

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallInfo[]
}

export interface ChatConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: DisplayMessage[]
  resourceContext?: ResourceContext
  viewContext?: ViewContext
}

// ============================================================================
// localStorage helpers (following useFavorites.ts pattern)
// ============================================================================

const STORAGE_KEY = 'radar-chat-conversations'
const MAX_CONVERSATIONS = 50

function loadConversations(): ChatConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore parse errors
  }
  return []
}

function saveConversations(convos: ChatConversation[]) {
  try {
    // Prune to max, keeping newest
    const pruned = convos.length > MAX_CONVERSATIONS
      ? convos.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS)
      : convos
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned))
  } catch {
    // ignore storage errors (quota, private mode, etc.)
  }
}

function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim()
  if (trimmed.length <= 50) return trimmed
  return trimmed.slice(0, 47) + '...'
}

// ============================================================================
// Hook
// ============================================================================

export function useChatHistory() {
  const [conversations, setConversations] = useState<ChatConversation[]>(loadConversations)
  const [activeId, setActiveId] = useState<string | null>(() => {
    const loaded = loadConversations()
    return loaded.length > 0 ? loaded[0].id : null
  })
  // Track whether we're currently streaming so we can defer persistence
  const isStreamingRef = useRef(false)

  const activeConversation = conversations.find(c => c.id === activeId) ?? null

  const createConversation = useCallback((opts?: {
    resourceContext?: ResourceContext
    viewContext?: ViewContext
  }): string => {
    const id = crypto.randomUUID()
    const newConvo: ChatConversation = {
      id,
      title: 'New conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      resourceContext: opts?.resourceContext,
      viewContext: opts?.viewContext,
    }

    setConversations(prev => {
      const next = [newConvo, ...prev]
      saveConversations(next)
      return next
    })
    setActiveId(id)
    return id
  }, [])

  const addMessage = useCallback((msg: DisplayMessage) => {
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id !== activeId) return c
        const isFirstUserMessage = c.messages.length === 0 && msg.role === 'user'
        return {
          ...c,
          messages: [...c.messages, msg],
          updatedAt: Date.now(),
          title: isFirstUserMessage ? generateTitle(msg.content) : c.title,
        }
      })
      if (!isStreamingRef.current) {
        saveConversations(updated)
      }
      return updated
    })
  }, [activeId])

  const updateLastMessage = useCallback((updater: (msg: DisplayMessage) => DisplayMessage) => {
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id !== activeId || c.messages.length === 0) return c
        const msgs = [...c.messages]
        msgs[msgs.length - 1] = updater(msgs[msgs.length - 1])
        return { ...c, messages: msgs, updatedAt: Date.now() }
      })
      // Don't persist during streaming — wait for finalize
      return updated
    })
  }, [activeId])

  const finalizeStreaming = useCallback(() => {
    isStreamingRef.current = false
    setConversations(prev => {
      saveConversations(prev)
      return prev
    })
  }, [])

  const setStreaming = useCallback((streaming: boolean) => {
    isStreamingRef.current = streaming
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
      saveConversations(next)
      return next
    })
    if (activeId === id) {
      setConversations(prev => {
        setActiveId(prev.length > 0 ? prev[0].id : null)
        return prev
      })
    }
  }, [activeId])

  const clearAll = useCallback(() => {
    setConversations([])
    setActiveId(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  return {
    conversations,
    activeId,
    activeConversation,
    setActiveId,
    createConversation,
    addMessage,
    updateLastMessage,
    finalizeStreaming,
    setStreaming,
    deleteConversation,
    clearAll,
  }
}
