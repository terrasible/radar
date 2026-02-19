package scanner

import (
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/labels"
)

func init() {
	Register(&crashLoopBackOffRule{})
	Register(&pendingPodRule{})
	Register(&evictedPodRule{})
	Register(&failedJobsRule{})
	Register(&hpaAtMaxRule{})
}

// --- REL-001: CrashLoopBackOff pods ---

type crashLoopBackOffRule struct{}

func (r *crashLoopBackOffRule) ID() string        { return "REL-001" }
func (r *crashLoopBackOffRule) Name() string       { return "CrashLoopBackOff pods" }
func (r *crashLoopBackOffRule) Category() Category { return CategoryReliability }
func (r *crashLoopBackOffRule) Severity() Severity { return SeverityCritical }

func (r *crashLoopBackOffRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		for _, cs := range pod.Status.ContainerStatuses {
			if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Pod",
					Namespace:   pod.Namespace,
					Name:        pod.Name,
					Container:   cs.Name,
					Message:     fmt.Sprintf("Container %q is in CrashLoopBackOff (restart count: %d)", cs.Name, cs.RestartCount),
					Remediation: "Check container logs for errors: kubectl logs -n " + pod.Namespace + " " + pod.Name + " -c " + cs.Name,
				})
			}
		}
	}
	return findings
}

// --- REL-002: Pending pods longer than 5 minutes ---

type pendingPodRule struct{}

func (r *pendingPodRule) ID() string        { return "REL-002" }
func (r *pendingPodRule) Name() string       { return "Pending pods" }
func (r *pendingPodRule) Category() Category { return CategoryReliability }
func (r *pendingPodRule) Severity() Severity { return SeverityWarning }

func (r *pendingPodRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	now := time.Now()
	var findings []Finding
	for _, pod := range pods {
		if pod.Status.Phase != corev1.PodPending {
			continue
		}
		age := now.Sub(pod.CreationTimestamp.Time)
		if age < 5*time.Minute {
			continue
		}
		message := fmt.Sprintf("Pod has been Pending for %s", formatDuration(age))
		// Try to get scheduling reason
		for _, cond := range pod.Status.Conditions {
			if cond.Type == corev1.PodScheduled && cond.Status == corev1.ConditionFalse && cond.Message != "" {
				message += ": " + cond.Message
				break
			}
		}
		findings = append(findings, Finding{
			RuleID:      r.ID(),
			RuleName:    r.Name(),
			Category:    r.Category(),
			Severity:    r.Severity(),
			Kind:        "Pod",
			Namespace:   pod.Namespace,
			Name:        pod.Name,
			Message:     message,
			Remediation: "Check node resources, taints/tolerations, and resource requests",
		})
	}
	return findings
}

// --- REL-003: Evicted pods ---

type evictedPodRule struct{}

func (r *evictedPodRule) ID() string        { return "REL-003" }
func (r *evictedPodRule) Name() string       { return "Evicted pods" }
func (r *evictedPodRule) Category() Category { return CategoryReliability }
func (r *evictedPodRule) Severity() Severity { return SeverityInfo }

func (r *evictedPodRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		if pod.Status.Reason == "Evicted" {
			message := "Pod was evicted"
			if pod.Status.Message != "" {
				message += ": " + pod.Status.Message
			}
			findings = append(findings, Finding{
				RuleID:      r.ID(),
				RuleName:    r.Name(),
				Category:    r.Category(),
				Severity:    r.Severity(),
				Kind:        "Pod",
				Namespace:   pod.Namespace,
				Name:        pod.Name,
				Message:     message,
				Remediation: "Clean up evicted pods and investigate node resource pressure",
			})
		}
	}
	return findings
}

// --- REL-004: Jobs with high failure count ---

type failedJobsRule struct{}

func (r *failedJobsRule) ID() string        { return "REL-004" }
func (r *failedJobsRule) Name() string       { return "Jobs with high failure count" }
func (r *failedJobsRule) Category() Category { return CategoryReliability }
func (r *failedJobsRule) Severity() Severity { return SeverityWarning }

func (r *failedJobsRule) Check(ctx *ScanContext) []Finding {
	jobLister := ctx.Cache.Jobs()
	if jobLister == nil {
		return nil
	}

	var findings []Finding
	if len(ctx.Namespaces) == 1 {
		jobs, err := jobLister.Jobs(ctx.Namespaces[0]).List(labels.Everything())
		if err != nil {
			return nil
		}
		for _, job := range jobs {
			if job.Status.Failed > 3 {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Job",
					Namespace:   job.Namespace,
					Name:        job.Name,
					Message:     fmt.Sprintf("Job has %d failed attempts", job.Status.Failed),
					Remediation: "Check job pod logs for errors and review backoffLimit configuration",
				})
			}
		}
	} else if len(ctx.Namespaces) > 1 {
		for _, ns := range ctx.Namespaces {
			jobs, err := jobLister.Jobs(ns).List(labels.Everything())
			if err != nil {
				continue
			}
			for _, job := range jobs {
				if job.Status.Failed > 3 {
					findings = append(findings, Finding{
						RuleID:      r.ID(),
						RuleName:    r.Name(),
						Category:    r.Category(),
						Severity:    r.Severity(),
						Kind:        "Job",
						Namespace:   job.Namespace,
						Name:        job.Name,
						Message:     fmt.Sprintf("Job has %d failed attempts", job.Status.Failed),
						Remediation: "Check job pod logs for errors and review backoffLimit configuration",
					})
				}
			}
		}
	} else {
		jobs, err := jobLister.List(labels.Everything())
		if err != nil {
			return nil
		}
		for _, job := range jobs {
			if job.Status.Failed > 3 {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Job",
					Namespace:   job.Namespace,
					Name:        job.Name,
					Message:     fmt.Sprintf("Job has %d failed attempts", job.Status.Failed),
					Remediation: "Check job pod logs for errors and review backoffLimit configuration",
				})
			}
		}
	}
	return findings
}

// --- REL-005: HPA at max replicas ---

type hpaAtMaxRule struct{}

func (r *hpaAtMaxRule) ID() string        { return "REL-005" }
func (r *hpaAtMaxRule) Name() string       { return "HPA at max replicas" }
func (r *hpaAtMaxRule) Category() Category { return CategoryReliability }
func (r *hpaAtMaxRule) Severity() Severity { return SeverityWarning }

func (r *hpaAtMaxRule) Check(ctx *ScanContext) []Finding {
	hpaLister := ctx.Cache.HorizontalPodAutoscalers()
	if hpaLister == nil {
		return nil
	}

	hpas, err := hpaLister.List(labels.Everything())
	if err != nil {
		return nil
	}

	var findings []Finding
	for _, hpa := range hpas {
		// Filter by namespace if specified
		if len(ctx.Namespaces) > 0 {
			found := false
			for _, ns := range ctx.Namespaces {
				if ns == hpa.Namespace {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}

		if hpa.Status.CurrentReplicas >= hpa.Spec.MaxReplicas && hpa.Spec.MaxReplicas > 0 {
			findings = append(findings, Finding{
				RuleID:      r.ID(),
				RuleName:    r.Name(),
				Category:    r.Category(),
				Severity:    r.Severity(),
				Kind:        "HorizontalPodAutoscaler",
				Namespace:   hpa.Namespace,
				Name:        hpa.Name,
				Message:     fmt.Sprintf("HPA %q is at max replicas (%d/%d)", hpa.Name, hpa.Status.CurrentReplicas, hpa.Spec.MaxReplicas),
				Remediation: "Consider increasing maxReplicas or optimizing the workload to reduce resource usage",
			})
		}
	}
	return findings
}

// --- Helpers ---

func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}
