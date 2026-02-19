import { useState, useEffect } from 'react'
import { ShieldAlert, AlertTriangle, XCircle, ArrowLeft } from 'lucide-react'
import { clsx } from 'clsx'

interface DeprecationRule {
  group: string
  version: string
  kind: string
  replacementGroup: string
  replacementVersion: string
  removedInVersion: string
  deprecatedInVersion: string
  migrationGuide: string
}

interface DeprecationFinding {
  rule: DeprecationRule
  severity: string
}

interface DeprecationScanResult {
  clusterVersion: string
  findings: DeprecationFinding[]
  totalDeprecated: number
  totalRemoved: number
  scanTimestamp: string
}

interface DeprecatedAPIsViewProps {
  onBack?: () => void
}

export function DeprecatedAPIsView({ onBack }: DeprecatedAPIsViewProps) {
  const [result, setResult] = useState<DeprecationScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/scanner/deprecated')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch')
        return r.json()
      })
      .then((data: DeprecationScanResult) => setResult(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-theme-text-tertiary text-sm">
        Scanning for deprecated APIs...
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-4 mt-4 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
        {error}
      </div>
    )
  }

  if (!result) return null

  const total = result.totalDeprecated + result.totalRemoved

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-theme-border">
        {onBack && (
          <button
            onClick={onBack}
            className="text-theme-text-tertiary hover:text-theme-text-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <ShieldAlert className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-semibold text-theme-text-primary">Deprecated API Usage</h2>
        {result.clusterVersion && (
          <span className="text-xs text-theme-text-tertiary">
            Cluster: {result.clusterVersion}
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 px-4 py-3">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-red-400 font-medium">
            Already Removed
          </div>
          <div className="text-xl font-bold text-red-400 mt-0.5 tabular-nums">
            {result.totalRemoved}
          </div>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-400 font-medium">
            Deprecated
          </div>
          <div className="text-xl font-bold text-amber-400 mt-0.5 tabular-nums">
            {result.totalDeprecated}
          </div>
        </div>
        <div className="rounded-lg border border-theme-border bg-theme-surface/50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-theme-text-tertiary font-medium">
            Total
          </div>
          <div className="text-xl font-bold text-theme-text-primary mt-0.5 tabular-nums">
            {total}
          </div>
        </div>
      </div>

      {/* Findings */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {result.findings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-theme-text-tertiary text-sm">
            <ShieldAlert className="w-8 h-8 text-green-500 mb-2" />
            No deprecated APIs detected
          </div>
        ) : (
          <div className="space-y-2">
            {result.findings.map((finding, i) => {
              const isRemoved = finding.severity === 'removed'
              const isExpanded = expandedIndex === i
              const apiId = finding.rule.group
                ? `${finding.rule.group}/${finding.rule.version}`
                : finding.rule.version
              const replacementId = finding.rule.replacementGroup
                ? `${finding.rule.replacementGroup}/${finding.rule.replacementVersion}`
                : finding.rule.replacementVersion

              return (
                <button
                  key={`${finding.rule.group}-${finding.rule.version}-${finding.rule.kind}`}
                  onClick={() => setExpandedIndex(isExpanded ? null : i)}
                  className={clsx(
                    'w-full rounded-md border px-3 py-2 text-left transition-colors',
                    isRemoved
                      ? 'border-red-500/20 bg-red-500/5 hover:bg-red-500/10'
                      : 'border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isRemoved ? (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-xs font-mono text-theme-text-primary">
                      {apiId} {finding.rule.kind}
                    </span>
                    <span className={clsx(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      isRemoved ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    )}>
                      {isRemoved ? `Removed in ${finding.rule.removedInVersion}` : `Deprecated in ${finding.rule.deprecatedInVersion}`}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 space-y-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
                      {replacementId && (
                        <div className="text-theme-text-secondary">
                          <span className="text-theme-text-tertiary">Replacement:</span>{' '}
                          <span className="font-mono">{replacementId} {finding.rule.kind}</span>
                        </div>
                      )}
                      <div className="text-theme-text-secondary">
                        <span className="text-theme-text-tertiary">Removed in:</span>{' '}
                        Kubernetes {finding.rule.removedInVersion}
                      </div>
                      {finding.rule.migrationGuide && (
                        <div className="text-theme-text-tertiary mt-1">
                          {finding.rule.migrationGuide}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
