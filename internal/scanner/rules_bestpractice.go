package scanner

import (
	"fmt"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	"k8s.io/apimachinery/pkg/labels"
)

func init() {
	Register(&missingProbesRule{})
	Register(&latestImageTagRule{})
	Register(&singleReplicaRule{})
	Register(&missingLabelsRule{})
	Register(&missingAntiAffinityRule{})
}

// --- BP-001: Missing health probes ---

type missingProbesRule struct{}

func (r *missingProbesRule) ID() string        { return "BP-001" }
func (r *missingProbesRule) Name() string       { return "Missing health probes" }
func (r *missingProbesRule) Category() Category { return CategoryBestPractice }
func (r *missingProbesRule) Severity() Severity { return SeverityWarning }

func (r *missingProbesRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		for _, c := range pod.Spec.Containers {
			// Skip init containers (they are in InitContainers, not Containers)
			if c.ReadinessProbe == nil && c.LivenessProbe == nil {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Pod",
					Namespace:   pod.Namespace,
					Name:        pod.Name,
					Container:   c.Name,
					Message:     fmt.Sprintf("Container %q has no readiness or liveness probe", c.Name),
					Remediation: "Add readinessProbe and livenessProbe to ensure proper health checking and traffic routing",
				})
			}
		}
	}
	return findings
}

// --- BP-002: Using :latest image tag ---

type latestImageTagRule struct{}

func (r *latestImageTagRule) ID() string        { return "BP-002" }
func (r *latestImageTagRule) Name() string       { return "Using :latest image tag" }
func (r *latestImageTagRule) Category() Category { return CategoryBestPractice }
func (r *latestImageTagRule) Severity() Severity { return SeverityWarning }

func (r *latestImageTagRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		for _, c := range pod.Spec.Containers {
			if isLatestOrNoTag(c.Image) {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Pod",
					Namespace:   pod.Namespace,
					Name:        pod.Name,
					Container:   c.Name,
					Message:     fmt.Sprintf("Container %q uses image %q with :latest or no tag", c.Name, c.Image),
					Remediation: "Use a specific image tag or digest for reproducible deployments",
				})
			}
		}
	}
	return findings
}

func isLatestOrNoTag(image string) bool {
	// Handle digest-based images (always pinned)
	if strings.Contains(image, "@sha256:") {
		return false
	}
	// Check for explicit :latest
	if strings.HasSuffix(image, ":latest") {
		return true
	}
	// No tag at all (e.g., "nginx" without ":tag")
	parts := strings.Split(image, "/")
	lastPart := parts[len(parts)-1]
	return !strings.Contains(lastPart, ":")
}

// --- BP-003: Single-replica deployment ---

type singleReplicaRule struct{}

func (r *singleReplicaRule) ID() string        { return "BP-003" }
func (r *singleReplicaRule) Name() string       { return "Single-replica deployment" }
func (r *singleReplicaRule) Category() Category { return CategoryBestPractice }
func (r *singleReplicaRule) Severity() Severity { return SeverityInfo }

func (r *singleReplicaRule) Check(ctx *ScanContext) []Finding {
	deps := listDeployments(ctx)
	hpaTargets := getHPATargets(ctx)

	var findings []Finding
	for _, dep := range deps {
		replicas := int32(1)
		if dep.Spec.Replicas != nil {
			replicas = *dep.Spec.Replicas
		}
		if replicas != 1 {
			continue
		}
		// Skip if HPA manages this deployment
		key := dep.Namespace + "/" + dep.Name
		if hpaTargets[key] {
			continue
		}
		findings = append(findings, Finding{
			RuleID:      r.ID(),
			RuleName:    r.Name(),
			Category:    r.Category(),
			Severity:    r.Severity(),
			Kind:        "Deployment",
			Namespace:   dep.Namespace,
			Name:        dep.Name,
			Message:     "Deployment has only 1 replica, creating a single point of failure",
			Remediation: "Increase replicas to at least 2 for high availability, or add an HPA",
		})
	}
	return findings
}

// --- BP-004: Missing labels ---

type missingLabelsRule struct{}

func (r *missingLabelsRule) ID() string        { return "BP-004" }
func (r *missingLabelsRule) Name() string       { return "Missing recommended labels" }
func (r *missingLabelsRule) Category() Category { return CategoryBestPractice }
func (r *missingLabelsRule) Severity() Severity { return SeverityInfo }

func (r *missingLabelsRule) Check(ctx *ScanContext) []Finding {
	deps := listDeployments(ctx)
	var findings []Finding
	for _, dep := range deps {
		tplLabels := dep.Spec.Template.Labels
		if tplLabels == nil {
			tplLabels = make(map[string]string)
		}
		_, hasApp := tplLabels["app"]
		_, hasAppName := tplLabels["app.kubernetes.io/name"]
		if !hasApp && !hasAppName {
			findings = append(findings, Finding{
				RuleID:      r.ID(),
				RuleName:    r.Name(),
				Category:    r.Category(),
				Severity:    r.Severity(),
				Kind:        "Deployment",
				Namespace:   dep.Namespace,
				Name:        dep.Name,
				Message:     fmt.Sprintf("Deployment %q pod template is missing 'app' or 'app.kubernetes.io/name' label", dep.Name),
				Remediation: "Add recommended Kubernetes labels (app.kubernetes.io/name, app.kubernetes.io/version) to pod templates",
			})
		}
	}
	return findings
}

// --- BP-005: Missing anti-affinity for HA ---

type missingAntiAffinityRule struct{}

func (r *missingAntiAffinityRule) ID() string        { return "BP-005" }
func (r *missingAntiAffinityRule) Name() string       { return "Missing anti-affinity for HA" }
func (r *missingAntiAffinityRule) Category() Category { return CategoryBestPractice }
func (r *missingAntiAffinityRule) Severity() Severity { return SeverityInfo }

func (r *missingAntiAffinityRule) Check(ctx *ScanContext) []Finding {
	deps := listDeployments(ctx)
	var findings []Finding
	for _, dep := range deps {
		replicas := int32(1)
		if dep.Spec.Replicas != nil {
			replicas = *dep.Spec.Replicas
		}
		if replicas <= 1 {
			continue
		}
		affinity := dep.Spec.Template.Spec.Affinity
		if affinity == nil || affinity.PodAntiAffinity == nil {
			findings = append(findings, Finding{
				RuleID:      r.ID(),
				RuleName:    r.Name(),
				Category:    r.Category(),
				Severity:    r.Severity(),
				Kind:        "Deployment",
				Namespace:   dep.Namespace,
				Name:        dep.Name,
				Message:     fmt.Sprintf("Deployment %q has %d replicas but no pod anti-affinity rules", dep.Name, replicas),
				Remediation: "Add podAntiAffinity to spread replicas across nodes for better fault tolerance",
			})
		}
	}
	return findings
}

// --- Helpers ---

func listDeployments(ctx *ScanContext) []*appsv1.Deployment {
	depLister := ctx.Cache.Deployments()
	if depLister == nil {
		return nil
	}
	if len(ctx.Namespaces) == 1 {
		deps, err := depLister.Deployments(ctx.Namespaces[0]).List(labels.Everything())
		if err != nil {
			return nil
		}
		return deps
	}
	if len(ctx.Namespaces) > 1 {
		var result []*appsv1.Deployment
		for _, ns := range ctx.Namespaces {
			deps, err := depLister.Deployments(ns).List(labels.Everything())
			if err != nil {
				continue
			}
			result = append(result, deps...)
		}
		return result
	}
	deps, err := depLister.List(labels.Everything())
	if err != nil {
		return nil
	}
	return deps
}

// getHPATargets returns a set of "namespace/name" keys for deployments targeted by an HPA.
func getHPATargets(ctx *ScanContext) map[string]bool {
	targets := make(map[string]bool)
	hpaLister := ctx.Cache.HorizontalPodAutoscalers()
	if hpaLister == nil {
		return targets
	}
	hpas, err := hpaLister.List(labels.Everything())
	if err != nil {
		return targets
	}
	for _, hpa := range hpas {
		if hpa.Spec.ScaleTargetRef.Kind == "Deployment" {
			key := hpa.Namespace + "/" + hpa.Spec.ScaleTargetRef.Name
			targets[key] = true
		}
	}
	return targets
}
