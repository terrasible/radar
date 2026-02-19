import { AlertTriangle } from 'lucide-react'

interface DeprecationScanResult {
  clusterVersion: string
  findings: Array<{
    rule: {
      group: string
      version: string
      kind: string
    }
    severity: string
  }>
  totalDeprecated: number
  totalRemoved: number
}

interface DeprecatedAPIBannerProps {
  data: DeprecationScanResult
  onNavigate: () => void
}

export function DeprecatedAPIBanner({ data, onNavigate }: DeprecatedAPIBannerProps) {
  const total = data.totalDeprecated + data.totalRemoved
  if (total === 0) return null

  return (
    <button
      onClick={onNavigate}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition-colors text-left"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">
          {total} deprecated API{total !== 1 ? 's' : ''} detected
        </span>
        {data.clusterVersion && (
          <span className="text-xs text-amber-400/70 ml-2">
            (cluster {data.clusterVersion})
          </span>
        )}
        {data.totalRemoved > 0 && (
          <span className="text-xs text-red-400 ml-2">
            {data.totalRemoved} already removed
          </span>
        )}
      </div>
      <span className="text-xs font-medium text-amber-400 hover:text-amber-300 shrink-0">
        View details
      </span>
    </button>
  )
}
