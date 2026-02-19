package scanner

import (
	"testing"
	"time"
)

func TestSeverityOrder(t *testing.T) {
	tests := []struct {
		severity Severity
		want     int
	}{
		{SeverityCritical, 0},
		{SeverityWarning, 1},
		{SeverityInfo, 2},
		{Severity("unknown"), 3},
	}

	for _, tt := range tests {
		t.Run(string(tt.severity), func(t *testing.T) {
			got := severityOrder(tt.severity)
			if got != tt.want {
				t.Errorf("severityOrder(%q) = %d, want %d", tt.severity, got, tt.want)
			}
		})
	}

	// Verify ordering: critical < warning < info
	if severityOrder(SeverityCritical) >= severityOrder(SeverityWarning) {
		t.Error("critical should have lower order than warning")
	}
	if severityOrder(SeverityWarning) >= severityOrder(SeverityInfo) {
		t.Error("warning should have lower order than info")
	}
}

func TestBuildSummary(t *testing.T) {
	findings := []Finding{
		{Severity: SeverityCritical, Category: CategorySecurity},
		{Severity: SeverityCritical, Category: CategoryReliability},
		{Severity: SeverityWarning, Category: CategorySecurity},
		{Severity: SeverityWarning, Category: CategoryCost},
		{Severity: SeverityInfo, Category: CategoryBestPractice},
	}

	summary := buildSummary(findings, 42, 123*time.Millisecond)

	if summary.TotalFindings != 5 {
		t.Errorf("TotalFindings = %d, want 5", summary.TotalFindings)
	}
	if summary.ResourcesScanned != 42 {
		t.Errorf("ResourcesScanned = %d, want 42", summary.ResourcesScanned)
	}
	if summary.BySeverity[SeverityCritical] != 2 {
		t.Errorf("BySeverity[critical] = %d, want 2", summary.BySeverity[SeverityCritical])
	}
	if summary.BySeverity[SeverityWarning] != 2 {
		t.Errorf("BySeverity[warning] = %d, want 2", summary.BySeverity[SeverityWarning])
	}
	if summary.BySeverity[SeverityInfo] != 1 {
		t.Errorf("BySeverity[info] = %d, want 1", summary.BySeverity[SeverityInfo])
	}
	if summary.ByCategory[CategorySecurity] != 2 {
		t.Errorf("ByCategory[security] = %d, want 2", summary.ByCategory[CategorySecurity])
	}
	if summary.ByCategory[CategoryCost] != 1 {
		t.Errorf("ByCategory[cost] = %d, want 1", summary.ByCategory[CategoryCost])
	}
	if summary.ByCategory[CategoryBestPractice] != 1 {
		t.Errorf("ByCategory[best-practice] = %d, want 1", summary.ByCategory[CategoryBestPractice])
	}
	if summary.ByCategory[CategoryReliability] != 1 {
		t.Errorf("ByCategory[reliability] = %d, want 1", summary.ByCategory[CategoryReliability])
	}
}

func TestBuildSummaryEmpty(t *testing.T) {
	summary := buildSummary(nil, 0, 0)

	if summary.TotalFindings != 0 {
		t.Errorf("TotalFindings = %d, want 0", summary.TotalFindings)
	}
	// All severity and category counts should be 0
	for sev, count := range summary.BySeverity {
		if count != 0 {
			t.Errorf("BySeverity[%s] = %d, want 0", sev, count)
		}
	}
	for cat, count := range summary.ByCategory {
		if count != 0 {
			t.Errorf("ByCategory[%s] = %d, want 0", cat, count)
		}
	}
}

func TestIsLatestOrNoTag(t *testing.T) {
	tests := []struct {
		image string
		want  bool
	}{
		{"nginx:latest", true},
		{"nginx", true},
		{"nginx:1.21", false},
		{"myregistry.io/nginx", true},
		{"myregistry.io/nginx:latest", true},
		{"myregistry.io/nginx:1.0", false},
		{"nginx@sha256:abc123", false},
		{"gcr.io/project/app:v1.2.3", false},
	}

	for _, tt := range tests {
		t.Run(tt.image, func(t *testing.T) {
			got := isLatestOrNoTag(tt.image)
			if got != tt.want {
				t.Errorf("isLatestOrNoTag(%q) = %v, want %v", tt.image, got, tt.want)
			}
		})
	}
}
