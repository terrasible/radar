package scanner

import (
	"time"

	"github.com/skyhook-io/radar/internal/k8s"
)

// Severity represents the severity level of a finding.
type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityWarning  Severity = "warning"
	SeverityInfo     Severity = "info"
)

// Category represents the category of a finding.
type Category string

const (
	CategorySecurity     Category = "security"
	CategoryCost         Category = "cost"
	CategoryBestPractice Category = "best-practice"
	CategoryReliability  Category = "reliability"
)

// Finding represents a single scan finding.
type Finding struct {
	RuleID      string   `json:"ruleId"`
	RuleName    string   `json:"ruleName"`
	Category    Category `json:"category"`
	Severity    Severity `json:"severity"`
	Kind        string   `json:"kind"`
	Namespace   string   `json:"namespace"`
	Name        string   `json:"name"`
	Message     string   `json:"message"`
	Remediation string   `json:"remediation"`
	Container   string   `json:"container,omitempty"`
	Source      string   `json:"source,omitempty"`
}

// ScanSummary contains aggregate statistics from a scan.
type ScanSummary struct {
	TotalFindings    int              `json:"totalFindings"`
	BySeverity       map[Severity]int `json:"bySeverity"`
	ByCategory       map[Category]int `json:"byCategory"`
	ResourcesScanned int              `json:"resourcesScanned"`
	Duration         string           `json:"duration"`
}

// ScanResult is the complete result of a scan.
type ScanResult struct {
	Findings  []Finding   `json:"findings"`
	Summary   ScanSummary `json:"summary"`
	ScannedAt string      `json:"scannedAt"`
}

// Rule is the interface that all scanner rules must implement.
type Rule interface {
	ID() string
	Name() string
	Category() Category
	Severity() Severity
	Check(ctx *ScanContext) []Finding
}

// ScanContext provides access to cluster resources for rule checks.
type ScanContext struct {
	Cache      *k8s.ResourceCache
	Namespaces []string // empty = all namespaces
}

// ScanOptions configures which rules to run and what to scan.
type ScanOptions struct {
	Namespaces      []string   `json:"namespaces,omitempty"`
	Categories      []Category `json:"categories,omitempty"`
	Severities      []Severity `json:"severities,omitempty"`
	Kinds           []string   `json:"kinds,omitempty"`
	IncludeExternal bool       `json:"includeExternal,omitempty"`
}

// severityOrder returns a numeric ordering for severity (lower = more severe).
func severityOrder(s Severity) int {
	switch s {
	case SeverityCritical:
		return 0
	case SeverityWarning:
		return 1
	case SeverityInfo:
		return 2
	default:
		return 3
	}
}

// buildSummary creates a ScanSummary from findings.
func buildSummary(findings []Finding, resourceCount int, duration time.Duration) ScanSummary {
	bySeverity := map[Severity]int{
		SeverityCritical: 0,
		SeverityWarning:  0,
		SeverityInfo:     0,
	}
	byCategory := map[Category]int{
		CategorySecurity:     0,
		CategoryCost:         0,
		CategoryBestPractice: 0,
		CategoryReliability:  0,
	}

	for _, f := range findings {
		bySeverity[f.Severity]++
		byCategory[f.Category]++
	}

	return ScanSummary{
		TotalFindings:    len(findings),
		BySeverity:       bySeverity,
		ByCategory:       byCategory,
		ResourcesScanned: resourceCount,
		Duration:         duration.String(),
	}
}
