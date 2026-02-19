import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Bot, AlertCircle, Settings, Sparkles, Clock, Plus, Trash2, X } from 'lucide-react'
import { clsx } from 'clsx'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { streamChat, useAIProviders, useSetAIProvider } from '../../api/ai'
import type { ChatMessage as ChatMessageType, ResourceContext, ViewContext, ToolCallEvent, ToolResultEvent } from '../../api/ai'
import { useChatHistory } from '../../hooks/useChatHistory'
import type { DisplayMessage } from '../../hooks/useChatHistory'

interface ChatTabProps {
  resourceContext?: ResourceContext
  viewContext?: ViewContext
  initialMessage?: string
}

function getSuggestedQuestions(
  resourceContext?: ResourceContext,
  viewContext?: ViewContext
): string[] {
  const kind = resourceContext?.kind?.toLowerCase()
  const name = resourceContext?.name

  if (kind && name) {
    switch (kind) {
      case 'pod':
      case 'pods':
        return [
          `Why is ${name} failing?`,
          `Show logs for ${name}`,
          `What events happened for ${name}?`,
          `Check resource usage for ${name}`,
        ]
      case 'deployment':
      case 'deployments':
        return [
          `What's the status of ${name}?`,
          `Are all replicas healthy for ${name}?`,
          `Show recent events for ${name}`,
          `List pods for ${name}`,
        ]
      case 'service':
      case 'services':
        return [
          `What pods does ${name} route to?`,
          `Show the topology around ${name}`,
          `Any issues with ${name}?`,
          `What endpoints does ${name} have?`,
        ]
      default:
        return [
          `Tell me about ${kind} ${name}`,
          `Show events for ${name}`,
          `What's the current status of ${name}?`,
          `Any issues with ${name}?`,
        ]
    }
  }

  const page = viewContext?.page?.toLowerCase()
  if (page) {
    if (page.includes('topology'))
      return ['Show overall cluster topology', 'Any unhealthy resources?', 'What services are exposed?', 'Show traffic flow']
    if (page.includes('helm'))
      return ['What Helm releases are installed?', 'Any failed Helm releases?', 'Show cluster dashboard', 'List namespaces']
    if (page.includes('timeline'))
      return ['Show recent warning events', 'What changed in the last hour?', 'Any failing pods?', 'Show cluster health']
  }

  return [
    "What's the health of my cluster?",
    'Show failing pods',
    'List recent warning events',
    'What namespaces are running?',
  ]
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ChatTab({ resourceContext, viewContext, initialMessage }: ChatTabProps) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialSentRef = useRef(false)
  const historyRef = useRef<HTMLDivElement>(null)

  const history = useChatHistory()
  const messages = history.activeConversation?.messages ?? []

  const { data: providers, isLoading: loadingProviders, error: providerError } = useAIProviders()
  const setProvider = useSetAIProvider()

  const hasProvider = providers?.providers?.some(p => p.active && p.available)
  const activeProvider = providers?.providers?.find(p => p.active)

  // Auto-create a conversation if none exists
  useEffect(() => {
    if (hasProvider && !history.activeId) {
      history.createConversation({ resourceContext, viewContext })
    }
  }, [hasProvider, history.activeId])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close history dropdown when clicking outside
  useEffect(() => {
    if (!showHistory) return
    const handleClick = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showHistory])

  // Reset initialSentRef when initialMessage changes (e.g., new "Ask AI" click)
  const prevInitialMessageRef = useRef(initialMessage)
  useEffect(() => {
    if (initialMessage && initialMessage !== prevInitialMessageRef.current) {
      initialSentRef.current = false
      prevInitialMessageRef.current = initialMessage
    }
  }, [initialMessage])

  // Send initial message if provided (only once per unique message)
  useEffect(() => {
    if (initialMessage && !initialSentRef.current && hasProvider) {
      initialSentRef.current = true
      handleSend(initialMessage)
    }
  }, [initialMessage, hasProvider])

  const handleSend = useCallback(async (content: string) => {
    if (isStreaming) return

    // Ensure we have an active conversation
    let currentId = history.activeId
    if (!currentId) {
      currentId = history.createConversation({ resourceContext, viewContext })
    }

    const userMsg: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    }

    const assistantMsg: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
    }

    history.addMessage(userMsg)
    history.addMessage(assistantMsg)
    history.setStreaming(true)
    setIsStreaming(true)

    // Build chat messages for API (all previous messages + new user message)
    const chatMessages: ChatMessageType[] = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content },
    ]

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      for await (const event of streamChat(
        { messages: chatMessages, context: resourceContext, viewContext },
        controller.signal
      )) {
        // Handle tool call events
        if ('type' in event && event.type === 'tool_call') {
          const toolEvent = event as ToolCallEvent
          history.updateLastMessage(last => ({
            ...last,
            toolCalls: [...(last.toolCalls || []), {
              id: toolEvent.toolCallId,
              name: toolEvent.name,
              arguments: toolEvent.arguments,
            }],
          }))
          continue
        }

        // Handle tool result events
        if ('type' in event && event.type === 'tool_result') {
          const resultEvent = event as ToolResultEvent
          history.updateLastMessage(last => ({
            ...last,
            toolCalls: last.toolCalls?.map(tc =>
              tc.id === resultEvent.toolCallId
                ? { ...tc, result: resultEvent.content, isError: resultEvent.isError }
                : tc
            ),
          }))
          continue
        }

        // Handle content chunks
        if ('content' in event && event.content) {
          history.updateLastMessage(last => ({
            ...last,
            content: last.content + event.content,
          }))
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User stopped generation
      } else {
        history.updateLastMessage(last => ({
          ...last,
          content: last.content
            ? `${last.content}\n\n---\n*Error: ${err.message}*`
            : `*Error: ${err.message}*`,
        }))
      }
    } finally {
      setIsStreaming(false)
      history.finalizeStreaming()
      abortControllerRef.current = null
    }
  }, [messages, isStreaming, resourceContext, viewContext, history])

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const handleNewChat = useCallback(() => {
    if (isStreaming) return
    history.createConversation({ resourceContext, viewContext })
    setShowHistory(false)
  }, [isStreaming, resourceContext, viewContext, history])

  const handleSwitchConversation = useCallback((id: string) => {
    if (isStreaming) return
    history.setActiveId(id)
    setShowHistory(false)
  }, [isStreaming, history])

  // No provider configured - show setup guidance
  if (!loadingProviders && !hasProvider && !providerError) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6">
        <Bot className="w-10 h-10 mb-3 text-slate-500" />
        <p className="text-sm font-medium text-slate-300 mb-2">AI Chat Not Configured</p>
        <p className="text-xs text-center max-w-md mb-4">
          Start Radar with an AI provider flag to enable chat:
        </p>
        <div className="bg-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 space-y-1 max-w-lg">
          <p className="text-slate-500"># OpenAI</p>
          <p>radar --ai-provider openai --ai-api-key sk-...</p>
          <p className="text-slate-500 mt-2"># Anthropic</p>
          <p>radar --ai-provider anthropic --ai-api-key sk-ant-...</p>
          <p className="text-slate-500 mt-2"># Ollama (local, no key needed)</p>
          <p>radar --ai-provider ollama</p>
          <p className="text-slate-500 mt-2"># Or use environment variables</p>
          <p>export OPENAI_API_KEY=sk-... && radar</p>
        </div>
      </div>
    )
  }

  // Provider error
  if (providerError) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6">
        <AlertCircle className="w-10 h-10 mb-3 text-red-400" />
        <p className="text-sm font-medium text-red-300 mb-2">Failed to load AI providers</p>
        <p className="text-xs text-center">{(providerError as Error).message}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Bot className="w-3.5 h-3.5" />
          <span>{activeProvider?.name || 'AI'}</span>
          {providers?.activeModel && (
            <>
              <span className="text-slate-600">/</span>
              <span className="text-slate-500">{providers.activeModel}</span>
            </>
          )}
          {resourceContext?.kind && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300 text-[10px]">
              {resourceContext.kind}: {resourceContext.namespace}/{resourceContext.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            disabled={isStreaming}
            className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-700 disabled:opacity-50"
            title="New conversation"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <div className="relative" ref={historyRef}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={clsx(
                'p-1 rounded hover:bg-slate-700',
                showHistory ? 'text-slate-300 bg-slate-700' : 'text-slate-500 hover:text-slate-300'
              )}
              title="Chat history"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
            {showHistory && (
              <ConversationList
                conversations={history.conversations}
                activeId={history.activeId}
                onSelect={handleSwitchConversation}
                onDelete={history.deleteConversation}
                onClearAll={history.clearAll}
                onNew={handleNewChat}
              />
            )}
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-700"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && providers && (
        <div className="px-3 py-2 bg-slate-800/80 border-b border-slate-700 space-y-2">
          <div className="text-xs text-slate-400 font-medium">Provider</div>
          <div className="flex flex-wrap gap-1">
            {providers.providers.map(p => (
              <button
                key={p.name}
                onClick={() => {
                  if (p.available) {
                    setProvider.mutate({ provider: p.name })
                  }
                }}
                disabled={!p.available}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  p.active
                    ? 'bg-blue-600 text-white'
                    : p.available
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                {p.name}
                {!p.available && ' (unavailable)'}
              </button>
            ))}
          </div>
          {activeProvider?.models && activeProvider.models.length > 0 && (
            <>
              <div className="text-xs text-slate-400 font-medium mt-1">Model</div>
              <div className="flex flex-wrap gap-1">
                {activeProvider.models.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setProvider.mutate({ provider: activeProvider.name, model: m.id })}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      providers.activeModel === m.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
        {messages.length === 0 ? (
          <EmptyState
            resourceContext={resourceContext}
            viewContext={viewContext}
            onSuggestionClick={handleSend}
          />
        ) : (
          <>
            {messages.map((msg, idx) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                toolCalls={msg.toolCalls}
                isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        isLoading={isStreaming}
        disabled={!hasProvider}
        placeholder={
          !hasProvider
            ? 'No AI provider configured...'
            : resourceContext?.kind
              ? `Ask about ${resourceContext.kind} ${resourceContext.name}...`
              : undefined
        }
      />
    </div>
  )
}

function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onClearAll,
  onNew,
}: {
  conversations: { id: string; title: string; updatedAt: number; messages: any[] }[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onClearAll: () => void
  onNew: () => void
}) {
  return (
    <div className="absolute right-0 top-full mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <span className="text-xs font-medium text-slate-300">Chat History</span>
        <button
          onClick={onNew}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          + New
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600">
        {conversations.length === 0 ? (
          <p className="px-3 py-4 text-xs text-slate-500 text-center">No conversations yet</p>
        ) : (
          conversations.map(c => (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 cursor-pointer group',
                c.id === activeId
                  ? 'bg-slate-700/50'
                  : 'hover:bg-slate-700/30'
              )}
            >
              <div className="flex-1 min-w-0">
                <p className={clsx(
                  'text-xs truncate',
                  c.id === activeId ? 'text-slate-200' : 'text-slate-400'
                )}>
                  {c.title}
                </p>
                <p className="text-[10px] text-slate-600">
                  {c.messages.length} msgs &middot; {formatRelativeTime(c.updatedAt)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(c.id)
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 hover:bg-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
      {conversations.length > 1 && (
        <div className="border-t border-slate-700 px-3 py-1.5">
          <button
            onClick={onClearAll}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-red-400"
          >
            <Trash2 className="w-3 h-3" />
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({
  resourceContext,
  viewContext,
  onSuggestionClick,
}: {
  resourceContext?: ResourceContext
  viewContext?: ViewContext
  onSuggestionClick: (text: string) => void
}) {
  const suggestions = useMemo(
    () => getSuggestedQuestions(resourceContext, viewContext),
    [resourceContext, viewContext]
  )

  return (
    <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6">
      <Bot className="w-8 h-8 mb-2 text-slate-600" />
      <p className="text-sm mb-1">Ask me anything about your cluster</p>
      <p className="text-xs text-slate-600 mb-4">
        I can query pods, logs, events, metrics, and topology directly
      </p>
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {suggestions.map(q => (
          <button
            key={q}
            onClick={() => onSuggestionClick(q)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-800/50
              text-xs text-slate-300 hover:bg-slate-700 hover:text-slate-100 hover:border-slate-600
              transition-colors"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
