import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { User, Bot, ChevronDown, ChevronRight, Wrench, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'

export interface ToolCallInfo {
  id: string
  name: string
  arguments: string
  result?: string
  isError?: boolean
}

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  toolCalls?: ToolCallInfo[]
}

export const ChatMessage = memo(function ChatMessage({ role, content, isStreaming, toolCalls }: ChatMessageProps) {
  const isUser = role === 'user'

  return (
    <div className={clsx('flex gap-3 px-4 py-3', isUser ? 'bg-slate-800/50' : 'bg-slate-900')}>
      <div className={clsx(
        'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
        isUser ? 'bg-blue-600' : 'bg-emerald-600'
      )}>
        {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="text-xs text-slate-400 mb-1 font-medium">
          {isUser ? 'You' : 'AI Assistant'}
        </div>

        {/* Tool calls section */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="mb-2 space-y-1">
            {toolCalls.map(tc => (
              <ToolCallBlock key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {isUser ? (
          <div className="text-sm text-slate-200 whitespace-pre-wrap break-words">{content}</div>
        ) : (
          <div className="text-sm text-slate-200 prose prose-invert prose-sm max-w-none
            prose-p:my-1 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1
            prose-headings:text-slate-100 prose-code:text-emerald-300
            prose-pre:bg-slate-800 prose-pre:border prose-pre:border-slate-700
            prose-a:text-blue-400 prose-strong:text-slate-100
            break-words overflow-hidden">
            <ReactMarkdown>{content || (isStreaming ? '...' : '')}</ReactMarkdown>
            {isStreaming && content && (
              <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}
      </div>
    </div>
  )
})

function ToolCallBlock({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false)

  const toolLabel = formatToolName(toolCall.name)
  let argsSummary = ''
  try {
    const args = JSON.parse(toolCall.arguments)
    const parts: string[] = []
    for (const [k, v] of Object.entries(args)) {
      if (v) parts.push(`${k}=${v}`)
    }
    argsSummary = parts.join(', ')
  } catch {
    argsSummary = toolCall.arguments
  }

  return (
    <div className="rounded border border-slate-700 bg-slate-800/50 text-xs overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-700/50 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-slate-500 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
        }
        <Wrench className="w-3 h-3 text-amber-400 flex-shrink-0" />
        <span className="text-amber-300 font-medium">{toolLabel}</span>
        {argsSummary && (
          <span className="text-slate-500 truncate">({argsSummary})</span>
        )}
        {toolCall.isError && (
          <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 ml-auto" />
        )}
        {toolCall.result !== undefined && !toolCall.isError && (
          <span className="text-emerald-500 ml-auto flex-shrink-0">done</span>
        )}
        {toolCall.result === undefined && (
          <span className="text-amber-400 ml-auto flex-shrink-0 animate-pulse">running...</span>
        )}
      </button>

      {expanded && toolCall.result !== undefined && (
        <div className="px-2.5 py-2 border-t border-slate-700 max-h-60 overflow-auto">
          <ToolResultContent
            name={toolCall.name}
            result={toolCall.result}
            isError={toolCall.isError}
          />
        </div>
      )}
    </div>
  )
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatToolResult(result: string): string {
  try {
    const parsed = JSON.parse(result)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return result
  }
}

// ============================================================================
// Rich tool result rendering
// ============================================================================

function ToolResultContent({ name, result, isError }: { name: string; result: string; isError?: boolean }) {
  if (isError) {
    return <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-all text-red-300">{result}</pre>
  }

  try {
    const parsed = JSON.parse(result)

    switch (name) {
      case 'list_resources':
        return <ResourceListResult data={parsed} />
      case 'list_namespaces':
        return <NamespaceListResult data={parsed} />
      case 'get_dashboard':
        return <DashboardResult data={parsed} />
      case 'get_pod_logs':
        return <LogsResult data={parsed} />
      case 'get_events':
        return <EventsResult data={parsed} />
      default:
        return <DefaultResult result={result} />
    }
  } catch {
    return <DefaultResult result={result} />
  }
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || ''
  const color = s.includes('running') || s.includes('active') || s === 'true' || s === 'ready' || s === 'available' || s === 'complete'
    ? 'bg-emerald-900/50 text-emerald-300'
    : s.includes('pending') || s.includes('waiting') || s === 'progressing'
      ? 'bg-amber-900/50 text-amber-300'
      : s.includes('fail') || s.includes('error') || s.includes('crash') || s === 'false'
        ? 'bg-red-900/50 text-red-300'
        : 'bg-slate-700 text-slate-300'

  return <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', color)}>{status}</span>
}

function ResourceListResult({ data }: { data: any }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <p className="text-[11px] text-slate-400">No resources found</p>
  }

  // Auto-detect columns from first item (max 6)
  const allKeys = Object.keys(data[0])
  const columns = allKeys.slice(0, 6)

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-slate-700">
          {columns.map(col => (
            <th key={col} className="text-left px-1.5 py-1 text-slate-400 font-medium capitalize">
              {col.replace(/([A-Z])/g, ' $1').trim()}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.slice(0, 50).map((row: any, i: number) => (
          <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
            {columns.map(col => {
              const val = String(row[col] ?? '')
              const isStatus = col.toLowerCase().includes('status') || col.toLowerCase().includes('phase') || col.toLowerCase() === 'ready'
              const isName = col.toLowerCase() === 'name'
              return (
                <td key={col} className={clsx('px-1.5 py-1', isName ? 'text-blue-300' : 'text-slate-300')}>
                  {isStatus ? <StatusBadge status={val} /> : val}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function NamespaceListResult({ data }: { data: any }) {
  const namespaces = Array.isArray(data) ? data : data?.namespaces
  if (!Array.isArray(namespaces) || namespaces.length === 0) {
    return <p className="text-[11px] text-slate-400">No namespaces found</p>
  }

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-slate-700">
          <th className="text-left px-1.5 py-1 text-slate-400 font-medium">Name</th>
          <th className="text-left px-1.5 py-1 text-slate-400 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {namespaces.map((ns: any, i: number) => {
          const name = typeof ns === 'string' ? ns : ns.name
          const status = typeof ns === 'string' ? 'Active' : (ns.status || 'Active')
          return (
            <tr key={i} className="border-b border-slate-800">
              <td className="px-1.5 py-1 text-blue-300">{name}</td>
              <td className="px-1.5 py-1"><StatusBadge status={status} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function DashboardResult({ data }: { data: any }) {
  return (
    <div className="space-y-2 text-[11px]">
      {data.cluster && (
        <div>
          <span className="text-slate-400">Cluster:</span>{' '}
          <span className="text-slate-200">{data.cluster.name || data.cluster.cluster}</span>
          {data.cluster.platform && <span className="text-slate-500 ml-1">({data.cluster.platform})</span>}
          {(data.cluster.version || data.cluster.kubernetesVersion) && (
            <span className="text-slate-500 ml-1">v{data.cluster.version || data.cluster.kubernetesVersion}</span>
          )}
        </div>
      )}

      {data.health && (
        <div className="flex gap-3">
          {data.health.healthy != null && (
            <span className="text-emerald-300">{data.health.healthy} healthy</span>
          )}
          {data.health.warning != null && data.health.warning > 0 && (
            <span className="text-amber-300">{data.health.warning} warning</span>
          )}
          {data.health.critical != null && data.health.critical > 0 && (
            <span className="text-red-300">{data.health.critical} critical</span>
          )}
        </div>
      )}

      {data.problems && data.problems.length > 0 && (
        <div>
          <p className="text-slate-400 font-medium mb-1">Problems:</p>
          {data.problems.slice(0, 10).map((p: any, i: number) => (
            <div key={i} className="flex items-start gap-1 ml-1">
              <AlertCircle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-slate-300">{p.resource || p.name}: {p.reason || p.message}</span>
            </div>
          ))}
        </div>
      )}

      {data.resourceCounts && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(data.resourceCounts).map(([kind, count]) => (
            <span key={kind} className="text-slate-400">
              {kind}: <span className="text-slate-200">{String(count)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function LogsResult({ data }: { data: any }) {
  const logs = typeof data === 'string' ? data : (data?.logs || data?.content || JSON.stringify(data, null, 2))
  return (
    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-all font-mono text-slate-300">
      {logs.split('\n').map((line: string, i: number) => {
        const isError = /error|fatal|panic|exception|fail/i.test(line)
        const isWarning = /warn/i.test(line)
        return (
          <span key={i} className={clsx(isError ? 'text-red-300' : isWarning ? 'text-amber-300' : '')}>
            {line}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}

function EventsResult({ data }: { data: any }) {
  const events = Array.isArray(data) ? data : (data?.events || [])
  if (!Array.isArray(events) || events.length === 0) {
    return <p className="text-[11px] text-slate-400">No events found</p>
  }

  return (
    <div className="space-y-1 text-[11px]">
      {events.slice(0, 20).map((e: any, i: number) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className={clsx(
            'px-1 py-0.5 rounded text-[10px] font-medium flex-shrink-0',
            e.type === 'Warning' ? 'bg-amber-900/50 text-amber-300' : 'bg-slate-700 text-slate-400'
          )}>
            {e.type || 'Info'}
          </span>
          <span className="text-slate-400 flex-shrink-0">{e.reason}:</span>
          <span className="text-slate-300">{e.message}</span>
          {e.count > 1 && <span className="text-slate-500 flex-shrink-0">x{e.count}</span>}
        </div>
      ))}
    </div>
  )
}

function DefaultResult({ result }: { result: string }) {
  return (
    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-all text-slate-300">
      {formatToolResult(result)}
    </pre>
  )
}
