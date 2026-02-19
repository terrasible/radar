import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, RefreshCw, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { clsx } from 'clsx'

interface ScanFinding {
  ruleId: string
  ruleName: string
  category: string
  severity: string
  kind: string
  namespace: string
  name: string
  message: string
  remediation: string
  container?: string
  source?: string
}

interface ScanSummary {
  totalFindings: number
  bySeverity: Record<string, number>
  byCategory: Record<string, number>
  resourcesScanned: number
  duration: string
}

interface ScanResult {
  findings: ScanFinding[]
  summary: ScanSummary
  scannedAt: string
}

const severities = ['all', 'critical', 'warning', 'info'] as const

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
    case 'warning':
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
    case 'info':
      return <Info className="w-3.5 h-3.5 text-blue-400" />
    default:
      return null
  }
}

function getSeverityBadgeClass(severity: string) {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/10 text-red-500'
    case 'warning':
      return 'bg-amber-500/10 text-amber-500'
    case 'info':
      return 'bg-blue-500/10 text-blue-400'
    default:
      return 'bg-theme-elevated text-theme-text-secondary'
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'security':
      return 'Security'
    case 'cost':
      return 'Cost'
    case 'best-practice':
      return 'Best Practice'
    case 'reliability':
      return 'Reliability'
    default:
      return category
  }
}

export function ScannerView() {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [activeSeverity, setActiveSeverity] = useState<string>('all')

  const fetchResults = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/scanner/results')
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: resp.statusText }))
        throw new Error(data.error || resp.statusText)
      }
      const data: ScanResult = await resp.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scan results')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchResults()
  }, [fetchResults])

  const filteredFindings = result?.findings.filter((f) => {
    if (activeCategory !== 'all' && f.category !== activeCategory) return false
    if (activeSeverity !== 'all' && f.severity !== activeSeverity) return false
    return true
  }) ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-theme-text-primary">Resource Scanner</h2>
          {result && (
            <span className="text-xs text-theme-text-tertiary">
              {result.summary.totalFindings} findings across {result.summary.resourcesScanned} resources
            </span>
          )}
        </div>
        <button
          onClick={fetchResults}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
          Scan Now
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {result && (
        <div className="grid grid-cols-4 gap-3 px-4 py-3">
          {(['security', 'cost', 'best-practice', 'reliability'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? 'all' : cat)}
              className={clsx(
                'rounded-lg border px-3 py-2 text-left transition-all',
                activeCategory === cat
                  ? 'border-blue-500/50 bg-blue-500/10'
                  : 'border-theme-border bg-theme-surface/50 hover:border-theme-border-hover'
              )}
            >
              <div className="text-[10px] uppercase tracking-wider text-theme-text-tertiary font-medium">
                {getCategoryLabel(cat)}
              </div>
              <div className="text-xl font-bold text-theme-text-primary mt-0.5 tabular-nums">
                {result.summary.byCategory[cat] ?? 0}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Severity filter */}
      <div className="flex items-center gap-1 px-4 pb-2">
        {severities.map((sev) => (
          <button
            key={sev}
            onClick={() => setActiveSeverity(activeSeverity === sev ? 'all' : sev)}
            className={clsx(
              'px-2 py-1 rounded text-xs font-medium transition-colors',
              activeSeverity === sev
                ? sev === 'critical'
                  ? 'bg-red-500/20 text-red-400'
                  : sev === 'warning'
                    ? 'bg-amber-500/20 text-amber-400'
                    : sev === 'info'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-theme-elevated text-theme-text-primary'
                : 'text-theme-text-tertiary hover:text-theme-text-secondary'
            )}
          >
            {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
            {sev !== 'all' && result && (
              <span className="ml-1 tabular-nums">({result.summary.bySeverity[sev] ?? 0})</span>
            )}
          </button>
        ))}
      </div>

      {/* Findings table */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {loading && !result ? (
          <div className="flex items-center justify-center h-32 text-theme-text-tertiary text-sm">
            Scanning...
          </div>
        ) : filteredFindings.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-theme-text-tertiary text-sm">
            {result ? 'No findings match the current filters' : 'No scan results yet'}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredFindings.map((finding, i) => (
              <div
                key={`${finding.ruleId}-${finding.namespace}-${finding.name}-${finding.container || ''}-${i}`}
                className="rounded-md border border-theme-border bg-theme-surface/50 px-3 py-2"
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">{getSeverityIcon(finding.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', getSeverityBadgeClass(finding.severity))}>
                        {finding.severity}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-theme-elevated text-theme-text-secondary font-mono">
                        {finding.ruleId}
                      </span>
                      <span className="text-xs text-theme-text-secondary">
                        {finding.kind}/{finding.namespace}/{finding.name}
                        {finding.container && <span className="text-theme-text-tertiary"> ({finding.container})</span>}
                      </span>
                      {finding.source && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                          {finding.source}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-theme-text-primary mt-1">{finding.message}</div>
                    <div className="text-[11px] text-theme-text-tertiary mt-0.5">{finding.remediation}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
