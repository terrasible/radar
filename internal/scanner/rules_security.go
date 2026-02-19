package scanner

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/labels"

	"github.com/skyhook-io/radar/internal/k8s"
)

func init() {
	Register(&runAsNonRootRule{})
	Register(&privilegedContainerRule{})
	Register(&readOnlyRootFSRule{})
	Register(&hostNamespaceRule{})
	Register(&capabilitiesNotDroppedRule{})
	Register(&noSeccompRule{})
	Register(&secretsAsEnvRule{})
	Register(&defaultServiceAccountRule{})
	Register(&missingNetworkPolicyRule{})
}

// --- SEC-001: runAsNonRoot not set ---

type runAsNonRootRule struct{}

func (r *runAsNonRootRule) ID() string        { return "SEC-001" }
func (r *runAsNonRootRule) Name() string       { return "Container running as root" }
func (r *runAsNonRootRule) Category() Category { return CategorySecurity }
func (r *runAsNonRootRule) Severity() Severity { return SeverityWarning }

func (r *runAsNonRootRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		podRunAsNonRoot := pod.Spec.SecurityContext != nil && pod.Spec.SecurityContext.RunAsNonRoot != nil && *pod.Spec.SecurityContext.RunAsNonRoot
		for _, c := range pod.Spec.Containers {
			containerRunAsNonRoot := c.SecurityContext != nil && c.SecurityContext.RunAsNonRoot != nil && *c.SecurityContext.RunAsNonRoot
			if !podRunAsNonRoot && !containerRunAsNonRoot {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Pod",
					Namespace:   pod.Namespace,
					Name:        pod.Name,
					Container:   c.Name,
					Message:     fmt.Sprintf("Container %q does not set runAsNonRoot", c.Name),
					Remediation: "Set securityContext.runAsNonRoot: true on the container or pod spec",
				})
			}
		}
	}
	return findings
}

// --- SEC-002: Privileged container ---

type privilegedContainerRule struct{}

func (r *privilegedContainerRule) ID() string        { return "SEC-002" }
func (r *privilegedContainerRule) Name() string       { return "Privileged container" }
func (r *privilegedContainerRule) Category() Category { return CategorySecurity }
func (r *privilegedContainerRule) Severity() Severity { return SeverityCritical }

func (r *privilegedContainerRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		for _, c := range pod.Spec.Containers {
			if c.SecurityContext != nil && c.SecurityContext.Privileged != nil && *c.SecurityContext.Privileged {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Pod",
					Namespace:   pod.Namespace,
					Name:        pod.Name,
					Container:   c.Name,
					Message:     fmt.Sprintf("Container %q is running in privileged mode", c.Name),
					Remediation: "Remove securityContext.privileged: true unless absolutely required",
				})
			}
		}
	}
	return findings
}

// --- SEC-003: Missing readOnlyRootFilesystem ---

type readOnlyRootFSRule struct{}

func (r *readOnlyRootFSRule) ID() string        { return "SEC-003" }
func (r *readOnlyRootFSRule) Name() string       { return "Missing readOnlyRootFilesystem" }
func (r *readOnlyRootFSRule) Category() Category { return CategorySecurity }
func (r *readOnlyRootFSRule) Severity() Severity { return SeverityInfo }

func (r *readOnlyRootFSRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		for _, c := range pod.Spec.Containers {
			if c.SecurityContext == nil || c.SecurityContext.ReadOnlyRootFilesystem == nil || !*c.SecurityContext.ReadOnlyRootFilesystem {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Pod",
					Namespace:   pod.Namespace,
					Name:        pod.Name,
					Container:   c.Name,
					Message:     fmt.Sprintf("Container %q does not have a read-only root filesystem", c.Name),
					Remediation: "Set securityContext.readOnlyRootFilesystem: true and use emptyDir volumes for writable paths",
				})
			}
		}
	}
	return findings
}

// --- SEC-004: hostNetwork/hostPID/hostIPC ---

type hostNamespaceRule struct{}

func (r *hostNamespaceRule) ID() string        { return "SEC-004" }
func (r *hostNamespaceRule) Name() string       { return "Host namespace sharing" }
func (r *hostNamespaceRule) Category() Category { return CategorySecurity }
func (r *hostNamespaceRule) Severity() Severity { return SeverityCritical }

func (r *hostNamespaceRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		if pod.Spec.HostNetwork {
			findings = append(findings, Finding{
				RuleID:      r.ID(),
				RuleName:    r.Name(),
				Category:    r.Category(),
				Severity:    r.Severity(),
				Kind:        "Pod",
				Namespace:   pod.Namespace,
				Name:        pod.Name,
				Message:     "Pod has hostNetwork enabled",
				Remediation: "Disable hostNetwork unless required for host-level networking",
			})
		}
		if pod.Spec.HostPID {
			findings = append(findings, Finding{
				RuleID:      r.ID(),
				RuleName:    r.Name(),
				Category:    r.Category(),
				Severity:    r.Severity(),
				Kind:        "Pod",
				Namespace:   pod.Namespace,
				Name:        pod.Name,
				Message:     "Pod has hostPID enabled",
				Remediation: "Disable hostPID to prevent access to host process namespace",
			})
		}
		if pod.Spec.HostIPC {
			findings = append(findings, Finding{
				RuleID:      r.ID(),
				RuleName:    r.Name(),
				Category:    r.Category(),
				Severity:    r.Severity(),
				Kind:        "Pod",
				Namespace:   pod.Namespace,
				Name:        pod.Name,
				Message:     "Pod has hostIPC enabled",
				Remediation: "Disable hostIPC to prevent access to host IPC namespace",
			})
		}
	}
	return findings
}

// --- SEC-005: Capabilities not dropped ---

type capabilitiesNotDroppedRule struct{}

func (r *capabilitiesNotDroppedRule) ID() string        { return "SEC-005" }
func (r *capabilitiesNotDroppedRule) Name() string       { return "Capabilities not dropped" }
func (r *capabilitiesNotDroppedRule) Category() Category { return CategorySecurity }
func (r *capabilitiesNotDroppedRule) Severity() Severity { return SeverityWarning }

func (r *capabilitiesNotDroppedRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		for _, c := range pod.Spec.Containers {
			if c.SecurityContext == nil || c.SecurityContext.Capabilities == nil || !hasDropAll(c.SecurityContext.Capabilities.Drop) {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Pod",
					Namespace:   pod.Namespace,
					Name:        pod.Name,
					Container:   c.Name,
					Message:     fmt.Sprintf("Container %q does not drop ALL capabilities", c.Name),
					Remediation: "Add securityContext.capabilities.drop: [\"ALL\"] and only add back required capabilities",
				})
			}
		}
	}
	return findings
}

func hasDropAll(caps []corev1.Capability) bool {
	for _, c := range caps {
		if c == "ALL" {
			return true
		}
	}
	return false
}

// --- SEC-006: No seccomp profile ---

type noSeccompRule struct{}

func (r *noSeccompRule) ID() string        { return "SEC-006" }
func (r *noSeccompRule) Name() string       { return "No seccomp profile" }
func (r *noSeccompRule) Category() Category { return CategorySecurity }
func (r *noSeccompRule) Severity() Severity { return SeverityInfo }

func (r *noSeccompRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		podHasSeccomp := pod.Spec.SecurityContext != nil && pod.Spec.SecurityContext.SeccompProfile != nil
		if !podHasSeccomp {
			// Check if any container has a seccomp profile
			allContainersHaveSeccomp := true
			for _, c := range pod.Spec.Containers {
				if c.SecurityContext == nil || c.SecurityContext.SeccompProfile == nil {
					allContainersHaveSeccomp = false
					break
				}
			}
			if !allContainersHaveSeccomp {
				findings = append(findings, Finding{
					RuleID:      r.ID(),
					RuleName:    r.Name(),
					Category:    r.Category(),
					Severity:    r.Severity(),
					Kind:        "Pod",
					Namespace:   pod.Namespace,
					Name:        pod.Name,
					Message:     "Pod does not have a seccomp profile configured",
					Remediation: "Set spec.securityContext.seccompProfile.type to RuntimeDefault or Localhost",
				})
			}
		}
	}
	return findings
}

// --- SEC-007: Secrets as env vars ---

type secretsAsEnvRule struct{}

func (r *secretsAsEnvRule) ID() string        { return "SEC-007" }
func (r *secretsAsEnvRule) Name() string       { return "Secrets as environment variables" }
func (r *secretsAsEnvRule) Category() Category { return CategorySecurity }
func (r *secretsAsEnvRule) Severity() Severity { return SeverityWarning }

func (r *secretsAsEnvRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		for _, c := range pod.Spec.Containers {
			for _, envFrom := range c.EnvFrom {
				if envFrom.SecretRef != nil {
					findings = append(findings, Finding{
						RuleID:      r.ID(),
						RuleName:    r.Name(),
						Category:    r.Category(),
						Severity:    r.Severity(),
						Kind:        "Pod",
						Namespace:   pod.Namespace,
						Name:        pod.Name,
						Container:   c.Name,
						Message:     fmt.Sprintf("Container %q mounts secret %q as environment variables via envFrom", c.Name, envFrom.SecretRef.Name),
						Remediation: "Use volume-mounted secrets instead of environment variables for better security",
					})
				}
			}
			for _, env := range c.Env {
				if env.ValueFrom != nil && env.ValueFrom.SecretKeyRef != nil {
					findings = append(findings, Finding{
						RuleID:      r.ID(),
						RuleName:    r.Name(),
						Category:    r.Category(),
						Severity:    r.Severity(),
						Kind:        "Pod",
						Namespace:   pod.Namespace,
						Name:        pod.Name,
						Container:   c.Name,
						Message:     fmt.Sprintf("Container %q exposes secret key %q/%q as env var %q", c.Name, env.ValueFrom.SecretKeyRef.Name, env.ValueFrom.SecretKeyRef.Key, env.Name),
						Remediation: "Use volume-mounted secrets instead of environment variables for better security",
					})
				}
			}
		}
	}
	return findings
}

// --- SEC-008: Default service account ---

type defaultServiceAccountRule struct{}

func (r *defaultServiceAccountRule) ID() string        { return "SEC-008" }
func (r *defaultServiceAccountRule) Name() string       { return "Default service account" }
func (r *defaultServiceAccountRule) Category() Category { return CategorySecurity }
func (r *defaultServiceAccountRule) Severity() Severity { return SeverityInfo }

func (r *defaultServiceAccountRule) Check(ctx *ScanContext) []Finding {
	pods := listPods(ctx)
	var findings []Finding
	for _, pod := range pods {
		sa := pod.Spec.ServiceAccountName
		if sa == "" || sa == "default" {
			findings = append(findings, Finding{
				RuleID:      r.ID(),
				RuleName:    r.Name(),
				Category:    r.Category(),
				Severity:    r.Severity(),
				Kind:        "Pod",
				Namespace:   pod.Namespace,
				Name:        pod.Name,
				Message:     "Pod uses the default service account",
				Remediation: "Create a dedicated service account with minimal RBAC permissions",
			})
		}
	}
	return findings
}

// --- SEC-009: Missing NetworkPolicies ---

type missingNetworkPolicyRule struct{}

func (r *missingNetworkPolicyRule) ID() string        { return "SEC-009" }
func (r *missingNetworkPolicyRule) Name() string       { return "Missing NetworkPolicies" }
func (r *missingNetworkPolicyRule) Category() Category { return CategorySecurity }
func (r *missingNetworkPolicyRule) Severity() Severity { return SeverityWarning }

func (r *missingNetworkPolicyRule) Check(ctx *ScanContext) []Finding {
	cache := ctx.Cache
	nsLister := cache.Namespaces()
	if nsLister == nil {
		return nil
	}

	namespaces, err := nsLister.List(labels.Everything())
	if err != nil {
		return nil
	}

	// Check NetworkPolicies via dynamic cache
	dynamicCache := k8s.GetDynamicResourceCache()
	discovery := k8s.GetResourceDiscovery()
	if dynamicCache == nil || discovery == nil {
		return nil
	}

	npGVR, ok := discovery.GetGVR("NetworkPolicy")
	if !ok {
		return nil
	}

	// Only check if the informer is synced to avoid blocking
	if !dynamicCache.IsSynced(npGVR) {
		return nil
	}

	var findings []Finding
	for _, ns := range namespaces {
		// Skip system namespaces
		if isSystemNamespace(ns.Name) {
			continue
		}

		// Filter by requested namespaces
		if len(ctx.Namespaces) > 0 {
			found := false
			for _, reqNs := range ctx.Namespaces {
				if reqNs == ns.Name {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}

		policies, err := dynamicCache.List(npGVR, ns.Name)
		if err != nil || len(policies) == 0 {
			findings = append(findings, Finding{
				RuleID:      r.ID(),
				RuleName:    r.Name(),
				Category:    r.Category(),
				Severity:    r.Severity(),
				Kind:        "Namespace",
				Namespace:   ns.Name,
				Name:        ns.Name,
				Message:     fmt.Sprintf("Namespace %q has no NetworkPolicies", ns.Name),
				Remediation: "Create NetworkPolicies to restrict traffic between pods",
			})
		}
	}
	return findings
}

func isSystemNamespace(ns string) bool {
	switch ns {
	case "kube-system", "kube-public", "kube-node-lease", "default":
		return true
	}
	return false
}
