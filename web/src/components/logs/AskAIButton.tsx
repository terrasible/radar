import { useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { useOpenChat } from '../dock/DockContext'

interface AskAIButtonProps {
  resourceContext: { kind: string; namespace: string; name: string }
  getLogContent: (maxLines: number) => string
  disabled?: boolean
}

export function AskAIButton({ resourceContext, getLogContent, disabled }: AskAIButtonProps) {
  const openChat = useOpenChat()

  const handleClick = useCallback(() => {
    const logContent = getLogContent(100)
    const initialMessage = `I need help analyzing these logs from ${resourceContext.kind} ${resourceContext.namespace}/${resourceContext.name}:\n\n\`\`\`\n${logContent}\n\`\`\`\n\nWhat issues do you see? Are there any errors, warnings, or patterns that need attention?`

    openChat({
      resourceContext,
      initialMessage,
    })
  }, [resourceContext, getLogContent, openChat])

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-full shadow-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
    >
      <Sparkles className="w-3.5 h-3.5" />
      Ask AI
    </button>
  )
}
