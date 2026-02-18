import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Bot, AlertCircle, Settings, Sparkles } from 'lucide-react'
import { ChatMessage } from './ChatMessage'
import type { ToolCallInfo } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { streamChat, useAIProviders, useSetAIProvider } from '../../api/ai'
import type { ChatMessage as ChatMessageType, ResourceContext, ViewContext, ToolCallEvent, ToolResultEvent } from '../../api/ai'

interface ChatTabProps {
  resourceContext?: ResourceContext
  viewContext?: ViewContext
  initialMessage?: string
}

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallInfo[]
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

let messageIdCounter = 0

export function ChatTab({ resourceContext, viewContext, initialMessage }: ChatTabProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialSentRef = useRef(false)

  const { data: providers, isLoading: loadingProviders, error: providerError } = useAIProviders()
  const setProvider = useSetAIProvider()

  const hasProvider = providers?.providers?.some(p => p.active && p.available)
  const activeProvider = providers?.providers?.find(p => p.active)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send initial message if provided (only once)
  useEffect(() => {
    if (initialMessage && !initialSentRef.current && hasProvider) {
      initialSentRef.current = true
      handleSend(initialMessage)
    }
  }, [initialMessage, hasProvider])

  const handleSend = useCallback(async (content: string) => {
    if (isStreaming) return

    const userMsg: DisplayMessage = {
      id: `msg-${++messageIdCounter}`,
      role: 'user',
      content,
    }

    const assistantMsg: DisplayMessage = {
      id: `msg-${++messageIdCounter}`,
      role: 'assistant',
      content: '',
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
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
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last && last.role === 'assistant') {
              const existingCalls = last.toolCalls || []
              updated[updated.length - 1] = {
                ...last,
                toolCalls: [...existingCalls, {
                  id: toolEvent.toolCallId,
                  name: toolEvent.name,
                  arguments: toolEvent.arguments,
                }],
              }
            }
            return updated
          })
          continue
        }

        // Handle tool result events
        if ('type' in event && event.type === 'tool_result') {
          const resultEvent = event as ToolResultEvent
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last && last.role === 'assistant' && last.toolCalls) {
              const updatedCalls = last.toolCalls.map(tc =>
                tc.id === resultEvent.toolCallId
                  ? { ...tc, result: resultEvent.content, isError: resultEvent.isError }
                  : tc
              )
              updated[updated.length - 1] = { ...last, toolCalls: updatedCalls }
            }
            return updated
          })
          continue
        }

        // Handle content chunks
        if ('content' in event && event.content) {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + event.content }
            }
            return updated
          })
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User stopped generation
      } else {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant') {
            const errorText = last.content
              ? `${last.content}\n\n---\n*Error: ${err.message}*`
              : `*Error: ${err.message}*`
            updated[updated.length - 1] = { ...last, content: errorText }
          }
          return updated
        })
      }
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [messages, isStreaming, resourceContext, viewContext])

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

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
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-700"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
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
