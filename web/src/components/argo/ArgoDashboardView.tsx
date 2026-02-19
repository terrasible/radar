import { useState, useEffect, useCallback } from 'react'
import { GitBranch, Search, ChevronDown, ChevronRight, RefreshCw, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { HealthStatusBadge, SyncStatusBadge } from '../gitops/GitOpsStatusBadge'
import { GitOpsActions } from '../gitops/GitOpsActions'
import { ManagedResourcesList } from '../gitops/ManagedResourcesList'
import type { SyncStatus, GitOpsHealthStatus, ManagedResource } from '../../types/gitops'

interface ArgoDashboardResponse {
  summary: {
    total: number
    healthCounts: Record<string, number>
    syncCounts: Record<string, number>
    suspended: number
  }
  applications: ArgoDashboardApp[]
}

interface ArgoDashboardApp {
  name: string
  namespace: string
  syncStatus: string
  healthStatus: string
  repoURL?: string
  path?: string
  targetRevision?: string
  chart?: string
  destServer?: string
  destNamespace?: string
  autoSync: boolean
  prune?: boolean
  selfHeal?: boolean
  operationPhase?: string
  operationMessage?: string
  lastSyncTime?: string
  resourceCount: number
  resources?: Array<{
    group?: string
    kind: string
    namespace?: string
    name: string
    health?: string
    sync?: string
  }>
  conditions?: Array<{
    type: string
    message?: string
  }>
  age: string
  createdAt: string
}

type HealthFilter = 'all' | 'Healthy' | 'Degraded' | 'Progressing' | 'Suspended' | 'Missing' | 'Unknown'
type SyncFilter = 'all' | 'Synced' | 'OutOfSync' | 'Unknown'

export function ArgoDashboardView() {
  const [data, setData] = useState<ArgoDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')
  const [syncFilter, setSyncFilter] = useState<SyncFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set())
  const [syncingApps, setSyncingApps] = useState<Set<string>>(new Set())
  const [suspendingApps, setSuspendingApps] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/argo/dashboard')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const toggleExpand = (key: string) => {
    setExpandedApps(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSync = async (namespace: string, name: string) => {
    const key = `${namespace}/${name}`
    setSyncingApps(prev => new Set(prev).add(key))
    try {
      await fetch(`/api/argo/applications/${namespace}/${name}/sync`, { method: 'POST' })
      setTimeout(fetchData, 1000)
    } finally {
      setSyncingApps(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const handleSuspend = async (namespace: string, name: string) => {
    const key = `${namespace}/${name}`
    setSuspendingApps(prev => new Set(prev).add(key))
    try {
      await fetch(`/api/argo/applications/${namespace}/${name}/suspend`, { method: 'POST' })
      setTimeout(fetchData, 1000)
    } finally {
      setSuspendingApps(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const handleResume = async (namespace: string, name: string) => {
    const key = `${namespace}/${name}`
    setSuspendingApps(prev => new Set(prev).add(key))
    try {
      await fetch(`/api/argo/applications/${namespace}/${name}/resume`, { method: 'POST' })
      setTimeout(fetchData, 1000)
    } finally {
      setSuspendingApps(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-theme-text-tertiary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-theme-text-tertiary">
        <p className="text-sm">Failed to load ArgoCD dashboard</p>
        <button onClick={fetchData} className="text-xs text-blue-400 hover:text-blue-300">
          Retry
        </button>
      </div>
    )
  }

  if (!data || data.summary.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-theme-text-tertiary">
        <GitBranch className="w-8 h-8" />
        <p className="text-sm">No ArgoCD Applications found</p>
        <p className="text-xs">ArgoCD may not be installed in this cluster</p>
      </div>
    )
  }

  const filtered = data.applications.filter(app => {
    if (healthFilter !== 'all' && app.healthStatus !== healthFilter) return false
    if (syncFilter !== 'all' && app.syncStatus !== syncFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return app.name.toLowerCase().includes(q) || app.namespace.toLowerCase().includes(q)
    }
    return true
  })

  const summary = data.summary

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-theme-text-primary">ArgoCD Applications</h2>
          <span className="text-xs bg-purple-500/10 px-1.5 py-0.5 rounded text-purple-400">
            {summary.total}
          </span>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-theme-text-secondary hover:text-theme-text-primary rounded hover:bg-theme-elevated transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 px-4 py-3 shrink-0">
        <SummaryCard label="Total" value={summary.total} color="text-theme-text-primary" />
        <SummaryCard label="Healthy" value={summary.healthCounts['Healthy'] || 0} color="text-green-400" />
        <SummaryCard label="Out of Sync" value={summary.syncCounts['OutOfSync'] || 0} color="text-orange-400" />
        <SummaryCard label="Suspended" value={summary.suspended} color="text-yellow-400" />
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-theme-border shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-theme-text-tertiary" />
          <input
            type="text"
            placeholder="Search applications..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-theme-elevated border border-theme-border rounded text-theme-text-primary placeholder:text-theme-text-tertiary focus:outline-none focus:border-purple-500/50"
          />
        </div>
        <select
          value={healthFilter}
          onChange={e => setHealthFilter(e.target.value as HealthFilter)}
          className="text-xs bg-theme-elevated border border-theme-border rounded px-2 py-1.5 text-theme-text-secondary focus:outline-none focus:border-purple-500/50"
        >
          <option value="all">All Health</option>
          <option value="Healthy">Healthy</option>
          <option value="Degraded">Degraded</option>
          <option value="Progressing">Progressing</option>
          <option value="Suspended">Suspended</option>
          <option value="Missing">Missing</option>
          <option value="Unknown">Unknown</option>
        </select>
        <select
          value={syncFilter}
          onChange={e => setSyncFilter(e.target.value as SyncFilter)}
          className="text-xs bg-theme-elevated border border-theme-border rounded px-2 py-1.5 text-theme-text-secondary focus:outline-none focus:border-purple-500/50"
        >
          <option value="all">All Sync</option>
          <option value="Synced">Synced</option>
          <option value="OutOfSync">OutOfSync</option>
          <option value="Unknown">Unknown</option>
        </select>
      </div>

      {/* Application Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-theme-bg z-10">
            <tr className="text-xs text-theme-text-tertiary border-b border-theme-border">
              <th className="text-left px-4 py-2 font-medium w-8"></th>
              <th className="text-left px-2 py-2 font-medium">Name</th>
              <th className="text-left px-2 py-2 font-medium">Health</th>
              <th className="text-left px-2 py-2 font-medium">Sync</th>
              <th className="text-left px-2 py-2 font-medium">Destination</th>
              <th className="text-left px-2 py-2 font-medium hidden lg:table-cell">Source</th>
              <th className="text-left px-2 py-2 font-medium hidden md:table-cell">Last Synced</th>
              <th className="text-left px-2 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(app => {
              const key = `${app.namespace}/${app.name}`
              const isExpanded = expandedApps.has(key)
              const isSyncing = syncingApps.has(key)
              const isSuspending = suspendingApps.has(key)

              return (
                <AppRow
                  key={key}
                  app={app}
                  isExpanded={isExpanded}
                  isSyncing={isSyncing}
                  isSuspending={isSuspending}
                  onToggleExpand={() => toggleExpand(key)}
                  onSync={() => handleSync(app.namespace, app.name)}
                  onSuspend={() => handleSuspend(app.namespace, app.name)}
                  onResume={() => handleResume(app.namespace, app.name)}
                />
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center py-12 text-xs text-theme-text-tertiary">
            No applications match the current filters
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-theme-border bg-theme-surface/50 px-4 py-3">
      <div className="text-[11px] text-theme-text-tertiary">{label}</div>
      <div className={clsx('text-2xl font-bold', color)}>{value}</div>
    </div>
  )
}

function AppRow({
  app,
  isExpanded,
  isSyncing,
  isSuspending,
  onToggleExpand,
  onSync,
  onSuspend,
  onResume,
}: {
  app: ArgoDashboardApp
  isExpanded: boolean
  isSyncing: boolean
  isSuspending: boolean
  onToggleExpand: () => void
  onSync: () => void
  onSuspend: () => void
  onResume: () => void
}) {
  const destDisplay = app.destNamespace
    ? `${app.destNamespace}`
    : app.destServer || '-'

  const sourceDisplay = app.chart
    ? `chart: ${app.chart}`
    : app.path
    ? app.path
    : app.repoURL
    ? truncateUrl(app.repoURL)
    : '-'

  const lastSyncDisplay = app.lastSyncTime
    ? formatRelativeTime(app.lastSyncTime)
    : '-'

  return (
    <>
      <tr className="border-b border-theme-border/50 hover:bg-theme-elevated/30 transition-colors">
        <td className="px-4 py-2">
          <button onClick={onToggleExpand} className="text-theme-text-tertiary hover:text-theme-text-secondary">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </td>
        <td className="px-2 py-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-theme-text-primary">{app.name}</span>
            <span className="text-[11px] text-theme-text-tertiary">{app.namespace}</span>
          </div>
        </td>
        <td className="px-2 py-2">
          <HealthStatusBadge health={app.healthStatus as GitOpsHealthStatus} />
        </td>
        <td className="px-2 py-2">
          <SyncStatusBadge sync={app.syncStatus as SyncStatus} suspended={!app.autoSync && app.healthStatus === 'Suspended'} />
        </td>
        <td className="px-2 py-2">
          <span className="text-xs text-theme-text-secondary">{destDisplay}</span>
        </td>
        <td className="px-2 py-2 hidden lg:table-cell">
          <span className="text-xs text-theme-text-tertiary truncate max-w-[200px] block" title={app.repoURL}>
            {sourceDisplay}
          </span>
        </td>
        <td className="px-2 py-2 hidden md:table-cell">
          <span className="text-xs text-theme-text-tertiary">{lastSyncDisplay}</span>
        </td>
        <td className="px-2 py-2">
          <GitOpsActions
            tool="argo"
            suspended={!app.autoSync && app.healthStatus === 'Suspended'}
            onSync={onSync}
            onSuspend={app.autoSync ? onSuspend : undefined}
            onResume={!app.autoSync ? onResume : undefined}
            isSyncing={isSyncing}
            isSuspending={isSuspending}
            size="sm"
          />
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-theme-border/50">
          <td colSpan={8} className="px-8 py-3 bg-theme-elevated/20">
            <AppExpandedDetails app={app} />
          </td>
        </tr>
      )}
    </>
  )
}

function AppExpandedDetails({ app }: { app: ArgoDashboardApp }) {
  const managedResources: ManagedResource[] = (app.resources || []).map(r => ({
    group: r.group || '',
    kind: r.kind,
    namespace: r.namespace || '',
    name: r.name,
    health: (r.health || 'Unknown') as GitOpsHealthStatus,
    sync: r.sync === 'Synced' ? 'Synced' as SyncStatus : r.sync === 'OutOfSync' ? 'OutOfSync' as SyncStatus : undefined,
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Source Details */}
      <div>
        <h4 className="text-xs font-medium text-theme-text-secondary mb-2">Source</h4>
        <div className="space-y-1 text-xs">
          {app.repoURL && (
            <div className="flex gap-2">
              <span className="text-theme-text-tertiary w-20 shrink-0">Repo:</span>
              <span className="text-theme-text-secondary truncate" title={app.repoURL}>{app.repoURL}</span>
            </div>
          )}
          {app.path && (
            <div className="flex gap-2">
              <span className="text-theme-text-tertiary w-20 shrink-0">Path:</span>
              <span className="text-theme-text-secondary">{app.path}</span>
            </div>
          )}
          {app.targetRevision && (
            <div className="flex gap-2">
              <span className="text-theme-text-tertiary w-20 shrink-0">Revision:</span>
              <span className="text-theme-text-secondary">{app.targetRevision}</span>
            </div>
          )}
          {app.chart && (
            <div className="flex gap-2">
              <span className="text-theme-text-tertiary w-20 shrink-0">Chart:</span>
              <span className="text-theme-text-secondary">{app.chart}</span>
            </div>
          )}
        </div>

        <h4 className="text-xs font-medium text-theme-text-secondary mt-3 mb-2">Sync Policy</h4>
        <div className="space-y-1 text-xs">
          <div className="flex gap-2">
            <span className="text-theme-text-tertiary w-20 shrink-0">Auto-Sync:</span>
            <span className={app.autoSync ? 'text-green-400' : 'text-theme-text-tertiary'}>
              {app.autoSync ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {app.autoSync && (
            <>
              <div className="flex gap-2">
                <span className="text-theme-text-tertiary w-20 shrink-0">Prune:</span>
                <span className={app.prune ? 'text-green-400' : 'text-theme-text-tertiary'}>
                  {app.prune ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-theme-text-tertiary w-20 shrink-0">Self-Heal:</span>
                <span className={app.selfHeal ? 'text-green-400' : 'text-theme-text-tertiary'}>
                  {app.selfHeal ? 'Yes' : 'No'}
                </span>
              </div>
            </>
          )}
        </div>

        {app.conditions && app.conditions.length > 0 && (
          <>
            <h4 className="text-xs font-medium text-theme-text-secondary mt-3 mb-2">Conditions</h4>
            <div className="space-y-1">
              {app.conditions.map((cond, i) => (
                <div key={i} className="text-xs">
                  <span className="text-orange-400 font-medium">{cond.type}</span>
                  {cond.message && <span className="text-theme-text-tertiary ml-1">{cond.message}</span>}
                </div>
              ))}
            </div>
          </>
        )}

        {app.operationPhase && (
          <>
            <h4 className="text-xs font-medium text-theme-text-secondary mt-3 mb-2">Last Operation</h4>
            <div className="space-y-1 text-xs">
              <div className="flex gap-2">
                <span className="text-theme-text-tertiary w-20 shrink-0">Phase:</span>
                <span className={clsx(
                  app.operationPhase === 'Succeeded' ? 'text-green-400' :
                  app.operationPhase === 'Failed' || app.operationPhase === 'Error' ? 'text-red-400' :
                  app.operationPhase === 'Running' ? 'text-blue-400' : 'text-theme-text-secondary'
                )}>{app.operationPhase}</span>
              </div>
              {app.operationMessage && (
                <div className="flex gap-2">
                  <span className="text-theme-text-tertiary w-20 shrink-0">Message:</span>
                  <span className="text-theme-text-tertiary">{app.operationMessage}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Managed Resources */}
      <div>
        {managedResources.length > 0 ? (
          <ManagedResourcesList
            resources={managedResources}
            showHealth
            title="Managed Resources"
            maxVisible={20}
          />
        ) : (
          <div className="text-xs text-theme-text-tertiary">
            {app.resourceCount} managed resources
          </div>
        )}
      </div>
    </div>
  )
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\.git$/, '')
    return path.length > 40 ? '...' + path.slice(-37) : path
  } catch {
    return url.length > 40 ? '...' + url.slice(-37) : url
  }
}

function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    if (diffMs < 0) return 'just now'

    const seconds = Math.floor(diffMs / 1000)
    if (seconds < 60) return `${seconds}s ago`

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`

    const days = Math.floor(hours / 24)
    return `${days}d ago`
  } catch {
    return timestamp
  }
}
