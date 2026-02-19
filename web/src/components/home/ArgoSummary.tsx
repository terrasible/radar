import { GitBranch, ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'

interface ArgoSummaryData {
  total: number
  healthy: number
  outOfSync: number
  degraded: number
  applications: Array<{
    name: string
    namespace: string
    syncStatus: string
    healthStatus: string
  }>
}

interface ArgoSummaryProps {
  data: ArgoSummaryData
  onNavigate: () => void
}

function getHealthDot(health: string): string {
  switch (health) {
    case 'Healthy':
      return 'bg-green-500'
    case 'Degraded':
      return 'bg-red-500'
    case 'Progressing':
      return 'bg-blue-500'
    case 'Suspended':
      return 'bg-yellow-500'
    case 'Missing':
      return 'bg-orange-500'
    default:
      return 'bg-theme-text-tertiary'
  }
}

function getSyncBadgeClass(sync: string): string {
  switch (sync) {
    case 'Synced':
      return 'bg-green-500/10 text-green-500'
    case 'OutOfSync':
      return 'bg-orange-500/10 text-orange-500'
    default:
      return 'bg-theme-elevated text-theme-text-tertiary'
  }
}

export function ArgoSummary({ data, onNavigate }: ArgoSummaryProps) {
  return (
    <button
      onClick={onNavigate}
      className="group h-[260px] rounded-lg border-[3px] border-purple-500/30 bg-theme-surface/50 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(0,0,0,0.12)] hover:border-purple-500/60 transition-all duration-200 text-left cursor-pointer"
    >
      <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-theme-border">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-semibold text-purple-500">ArgoCD</span>
          {data.total > 0 && (
            <span className="text-[11px] bg-purple-500/10 px-1.5 py-0.5 rounded text-purple-500">
              {data.total}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {data.applications.length === 0 ? (
          <div className="flex items-center justify-center h-full py-4 text-xs text-theme-text-tertiary">
            No ArgoCD applications found
          </div>
        ) : (
          <div className="divide-y divide-theme-border">
            {data.applications.map((app) => (
              <div
                key={`${app.namespace}/${app.name}`}
                className="flex items-center justify-between px-3 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', getHealthDot(app.healthStatus))} />
                  <span className="text-xs text-theme-text-primary truncate">{app.name}</span>
                  <span className="text-[10px] text-theme-text-tertiary">{app.namespace}</span>
                </div>
                <div className="flex items-center gap-1.5 ml-2 min-w-0">
                  <span className={clsx('text-[10px] px-1 py-0.5 rounded shrink-0', getSyncBadgeClass(app.syncStatus))}>
                    {app.syncStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-1.5 border-t border-theme-border flex items-center justify-between">
        <span className="text-[10px] text-theme-text-tertiary">
          {data.total > data.applications.length ? `+${data.total - data.applications.length} more` : ''}
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-purple-500 group-hover:text-purple-400 transition-colors">
          Open ArgoCD
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      </div>
    </button>
  )
}
