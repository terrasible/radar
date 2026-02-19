import { useState, useEffect } from 'react'
import { ShieldCheck, ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'

interface ScanSummary {
  totalFindings: number
  bySeverity: Record<string, number>
  byCategory: Record<string, number>
  resourcesScanned: number
  duration: string
}

interface ScannerDashboardCardProps {
  onNavigate: () => void
}

export function ScannerDashboardCard({ onNavigate }: ScannerDashboardCardProps) {
  const [summary, setSummary] = useState<ScanSummary | null>(null)

  useEffect(() => {
    fetch('/api/scanner/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSummary(data)
      })
      .catch(() => {})
  }, [])

  if (!summary) return null

  const hasCritical = (summary.bySeverity['critical'] ?? 0) > 0
  const hasWarning = (summary.bySeverity['warning'] ?? 0) > 0
  const borderColor = hasCritical
    ? 'border-red-500/30 hover:border-red-500/60'
    : hasWarning
      ? 'border-amber-500/30 hover:border-amber-500/60'
      : 'border-green-500/30 hover:border-green-500/60'
  const accentColor = hasCritical ? 'text-red-500' : hasWarning ? 'text-amber-500' : 'text-green-500'

  const total = summary.totalFindings

  return (
    <button
      onClick={onNavigate}
      className={clsx(
        'group h-[260px] rounded-lg border-[3px] bg-theme-surface/50 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(0,0,0,0.12)] transition-all duration-200 text-left cursor-pointer',
        borderColor
      )}
    >
      <div className="flex flex-col h-full w-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-theme-border">
          <div className="flex items-center gap-2">
            <ShieldCheck className={clsx('w-4 h-4', accentColor)} />
            <span className={clsx('text-sm font-semibold', accentColor)}>Resource Scanner</span>
            {total > 0 && (
              <span className={clsx('text-[11px] px-1.5 py-0.5 rounded', hasCritical ? 'bg-red-500/10 text-red-500' : hasWarning ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500')}>
                {total}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-4">
          {/* Severity distribution bar */}
          {total > 0 ? (
            <>
              <div className="flex items-center gap-3 w-full">
                <div className="flex-1 h-3 rounded-full overflow-hidden bg-theme-hover flex">
                  {(summary.bySeverity['critical'] ?? 0) > 0 && (
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${((summary.bySeverity['critical'] ?? 0) / total) * 100}%` }}
                    />
                  )}
                  {(summary.bySeverity['warning'] ?? 0) > 0 && (
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${((summary.bySeverity['warning'] ?? 0) / total) * 100}%` }}
                    />
                  )}
                  {(summary.bySeverity['info'] ?? 0) > 0 && (
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${((summary.bySeverity['info'] ?? 0) / total) * 100}%` }}
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4 w-full">
                <CategoryRow label="Security" count={summary.byCategory['security'] ?? 0} color="text-orange-400" dotColor="bg-orange-500" />
                <CategoryRow label="Cost" count={summary.byCategory['cost'] ?? 0} color="text-emerald-400" dotColor="bg-emerald-500" />
                <CategoryRow label="Best Practice" count={summary.byCategory['best-practice'] ?? 0} color="text-blue-400" dotColor="bg-blue-500" />
                <CategoryRow label="Reliability" count={summary.byCategory['reliability'] ?? 0} color="text-purple-400" dotColor="bg-purple-500" />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center text-theme-text-tertiary">
              <ShieldCheck className="w-8 h-8 text-green-500 mb-2" />
              <span className="text-xs">No issues found</span>
            </div>
          )}
        </div>

        <div className="px-4 py-1.5 border-t border-theme-border flex items-center justify-end">
          <span className={clsx(
            'flex items-center gap-1.5 text-xs font-medium transition-colors',
            accentColor
          )}>
            View Scanner
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </button>
  )
}

function CategoryRow({ label, count, color, dotColor }: {
  label: string
  count: number
  color: string
  dotColor: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={clsx('w-2 h-2 rounded-full shrink-0', dotColor)} />
      <span className="text-xs text-theme-text-secondary flex-1">{label}</span>
      <span className={clsx('text-sm font-semibold tabular-nums', count > 0 ? color : 'text-theme-text-tertiary')}>
        {count}
      </span>
    </div>
  )
}
