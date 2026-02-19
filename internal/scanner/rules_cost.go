package scanner

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
)

func init() {
	Register(&noResourceRequestsRule{})
	Register(&overProvisionedRule{})
	Register(&underProvisionedRule{})
}

// --- COST-001: No resource requests or limits ---

type noResourceRequestsRule struct{}

func (r *noResourceRequestsRule) ID() string        { return "COST-001" }
func (r *noResourceRequestsRule) Name() string       { return "No resource requests/limits" }
func (r *noResourceRequestsRule) Category() Category { return CategoryCost }
func (r *noResourceRequestsRule) Severity() Severity { return SeverityWarning }

func (r *noResourceRequestsRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		// Skip completed/failed pods
		if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			continue
		}
		for _, c := range pod.Spec.Containers {
			hasRequests := c.Resources.Requests != nil && (c.Resources.Requests.Cpu() != nil && !c.Resources.Requests.Cpu().IsZero() ||
				c.Resources.Requests.Memory() != nil && !c.Resources.Requests.Memory().IsZero())
			hasLimits := c.Resources.Limits != nil && (c.Resources.Limits.Cpu() != nil && !c.Resources.Limits.Cpu().IsZero() ||
				c.Resources.Limits.Memory() != nil && !c.Resources.Limits.Memory().IsZero())

			if !hasRequests && !hasLimits {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Pod",
					Namespace:   pod.Namespace,
					Name:        pod.Name,
					Container:   c.Name,
					Message:     fmt.Sprintf("Container %q has no resource requests or limits set", c.Name),
					Remediation: "Set resource requests and limits to enable proper scheduling and prevent resource contention",
				})
			} else if !hasRequests {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Pod",
					Namespace:   pod.Namespace,
					Name:        pod.Name,
					Container:   c.Name,
					Message:     fmt.Sprintf("Container %q has no resource requests set", c.Name),
					Remediation: "Set resource requests to enable proper pod scheduling and cluster capacity planning",
				})
			}
		}
	}
	return findings
}

// --- COST-002: Over-provisioned ---

type overProvisionedRule struct{}

func (r *overProvisionedRule) ID() string        { return "COST-002" }
func (r *overProvisionedRule) Name() string       { return "Over-provisioned resources" }
func (r *overProvisionedRule) Category() Category { return CategoryCost }
func (r *overProvisionedRule) Severity() Severity { return SeverityInfo }

func (r *overProvisionedRule) Check(ctx *ScanContext) []Finding {
	// TODO: Implement metrics-based over-provisioning detection.
	// This requires comparing actual CPU/memory usage from MetricsHistory
	// against resource requests. Skip for now if metrics are unavailable.
	return nil
}

// --- COST-003: Under-provisioned ---

type underProvisionedRule struct{}

func (r *underProvisionedRule) ID() string        { return "COST-003" }
func (r *underProvisionedRule) Name() string       { return "Under-provisioned resources" }
func (r *underProvisionedRule) Category() Category { return CategoryCost }
func (r *underProvisionedRule) Severity() Severity { return SeverityWarning }

func (r *underProvisionedRule) Check(ctx *ScanContext) []Finding {
	// TODO: Implement metrics-based under-provisioning detection.
	// This requires comparing actual CPU/memory usage from MetricsHistory
	// against resource limits. Skip for now if metrics are unavailable.
	return nil
}
