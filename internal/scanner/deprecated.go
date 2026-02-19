package scanner

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"time"

	"github.com/skyhook-io/radar/internal/k8s"
)

// DeprecationRule represents a known deprecated Kubernetes API.
type DeprecationRule struct {
	Group              string `json:"group"`
	Version            string `json:"version"`
	Kind               string `json:"kind"`
	ReplacementGroup   string `json:"replacementGroup"`
	ReplacementVersion string `json:"replacementVersion"`
	RemovedInVersion   string `json:"removedInVersion"`
	DeprecatedInVersion string `json:"deprecatedInVersion"`
	MigrationGuide     string `json:"migrationGuide"`
}

// DeprecationFinding represents a finding from deprecated API scanning.
type DeprecationFinding struct {
	Rule     DeprecationRule `json:"rule"`
	Severity string          `json:"severity"` // "removed" or "deprecated"
}

// DeprecationScanResult is the result of scanning for deprecated APIs.
type DeprecationScanResult struct {
	ClusterVersion  string               `json:"clusterVersion"`
	Findings        []DeprecationFinding `json:"findings"`
	TotalDeprecated int                  `json:"totalDeprecated"`
	TotalRemoved    int                  `json:"totalRemoved"`
	ScanTimestamp   string               `json:"scanTimestamp"`
}

// Static database of deprecated Kubernetes APIs
var deprecationRules = []DeprecationRule{
	// Removed in 1.16
	{
		Group: "extensions", Version: "v1beta1", Kind: "Deployment",
		ReplacementGroup: "apps", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.9", RemovedInVersion: "1.16",
		MigrationGuide: "Migrate to apps/v1 Deployment. Update apiVersion and ensure spec.selector is set.",
	},
	{
		Group: "extensions", Version: "v1beta1", Kind: "DaemonSet",
		ReplacementGroup: "apps", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.9", RemovedInVersion: "1.16",
		MigrationGuide: "Migrate to apps/v1 DaemonSet.",
	},
	{
		Group: "extensions", Version: "v1beta1", Kind: "StatefulSet",
		ReplacementGroup: "apps", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.9", RemovedInVersion: "1.16",
		MigrationGuide: "Migrate to apps/v1 StatefulSet.",
	},
	{
		Group: "extensions", Version: "v1beta1", Kind: "ReplicaSet",
		ReplacementGroup: "apps", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.9", RemovedInVersion: "1.16",
		MigrationGuide: "Migrate to apps/v1 ReplicaSet.",
	},
	{
		Group: "apps", Version: "v1beta1", Kind: "Deployment",
		ReplacementGroup: "apps", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.9", RemovedInVersion: "1.16",
		MigrationGuide: "Migrate to apps/v1 Deployment.",
	},
	{
		Group: "apps", Version: "v1beta2", Kind: "Deployment",
		ReplacementGroup: "apps", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.9", RemovedInVersion: "1.16",
		MigrationGuide: "Migrate to apps/v1 Deployment.",
	},
	// Removed in 1.22
	{
		Group: "extensions", Version: "v1beta1", Kind: "Ingress",
		ReplacementGroup: "networking.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.14", RemovedInVersion: "1.22",
		MigrationGuide: "Migrate to networking.k8s.io/v1 Ingress. Update pathType and backend syntax.",
	},
	{
		Group: "networking.k8s.io", Version: "v1beta1", Kind: "Ingress",
		ReplacementGroup: "networking.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.19", RemovedInVersion: "1.22",
		MigrationGuide: "Migrate to networking.k8s.io/v1 Ingress. Ensure pathType is specified.",
	},
	{
		Group: "rbac.authorization.k8s.io", Version: "v1beta1", Kind: "ClusterRole",
		ReplacementGroup: "rbac.authorization.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.17", RemovedInVersion: "1.22",
		MigrationGuide: "Migrate to rbac.authorization.k8s.io/v1.",
	},
	{
		Group: "rbac.authorization.k8s.io", Version: "v1beta1", Kind: "ClusterRoleBinding",
		ReplacementGroup: "rbac.authorization.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.17", RemovedInVersion: "1.22",
		MigrationGuide: "Migrate to rbac.authorization.k8s.io/v1.",
	},
	{
		Group: "rbac.authorization.k8s.io", Version: "v1beta1", Kind: "Role",
		ReplacementGroup: "rbac.authorization.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.17", RemovedInVersion: "1.22",
		MigrationGuide: "Migrate to rbac.authorization.k8s.io/v1.",
	},
	{
		Group: "rbac.authorization.k8s.io", Version: "v1beta1", Kind: "RoleBinding",
		ReplacementGroup: "rbac.authorization.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.17", RemovedInVersion: "1.22",
		MigrationGuide: "Migrate to rbac.authorization.k8s.io/v1.",
	},
	// Removed in 1.25
	{
		Group: "batch", Version: "v1beta1", Kind: "CronJob",
		ReplacementGroup: "batch", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.21", RemovedInVersion: "1.25",
		MigrationGuide: "Migrate to batch/v1 CronJob.",
	},
	{
		Group: "policy", Version: "v1beta1", Kind: "PodSecurityPolicy",
		ReplacementGroup: "", ReplacementVersion: "",
		DeprecatedInVersion: "1.21", RemovedInVersion: "1.25",
		MigrationGuide: "PodSecurityPolicy is removed. Migrate to Pod Security Admission (PSA) or a policy engine like Kyverno/OPA Gatekeeper.",
	},
	{
		Group: "policy", Version: "v1beta1", Kind: "PodDisruptionBudget",
		ReplacementGroup: "policy", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.21", RemovedInVersion: "1.25",
		MigrationGuide: "Migrate to policy/v1 PodDisruptionBudget.",
	},
	// Removed in 1.26
	{
		Group: "autoscaling", Version: "v2beta1", Kind: "HorizontalPodAutoscaler",
		ReplacementGroup: "autoscaling", ReplacementVersion: "v2",
		DeprecatedInVersion: "1.23", RemovedInVersion: "1.26",
		MigrationGuide: "Migrate to autoscaling/v2 HorizontalPodAutoscaler.",
	},
	// Removed in 1.29
	{
		Group: "flowcontrol.apiserver.k8s.io", Version: "v1beta1", Kind: "FlowSchema",
		ReplacementGroup: "flowcontrol.apiserver.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.26", RemovedInVersion: "1.29",
		MigrationGuide: "Migrate to flowcontrol.apiserver.k8s.io/v1.",
	},
	{
		Group: "flowcontrol.apiserver.k8s.io", Version: "v1beta1", Kind: "PriorityLevelConfiguration",
		ReplacementGroup: "flowcontrol.apiserver.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.26", RemovedInVersion: "1.29",
		MigrationGuide: "Migrate to flowcontrol.apiserver.k8s.io/v1.",
	},
	{
		Group: "flowcontrol.apiserver.k8s.io", Version: "v1beta2", Kind: "FlowSchema",
		ReplacementGroup: "flowcontrol.apiserver.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.26", RemovedInVersion: "1.29",
		MigrationGuide: "Migrate to flowcontrol.apiserver.k8s.io/v1.",
	},
	{
		Group: "flowcontrol.apiserver.k8s.io", Version: "v1beta2", Kind: "PriorityLevelConfiguration",
		ReplacementGroup: "flowcontrol.apiserver.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.26", RemovedInVersion: "1.29",
		MigrationGuide: "Migrate to flowcontrol.apiserver.k8s.io/v1.",
	},
	// Removed in 1.32
	{
		Group: "flowcontrol.apiserver.k8s.io", Version: "v1beta3", Kind: "FlowSchema",
		ReplacementGroup: "flowcontrol.apiserver.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.29", RemovedInVersion: "1.32",
		MigrationGuide: "Migrate to flowcontrol.apiserver.k8s.io/v1.",
	},
	{
		Group: "flowcontrol.apiserver.k8s.io", Version: "v1beta3", Kind: "PriorityLevelConfiguration",
		ReplacementGroup: "flowcontrol.apiserver.k8s.io", ReplacementVersion: "v1",
		DeprecatedInVersion: "1.29", RemovedInVersion: "1.32",
		MigrationGuide: "Migrate to flowcontrol.apiserver.k8s.io/v1.",
	},
}

// ScanDeprecatedAPIs scans for deprecated API versions served by the cluster.
func ScanDeprecatedAPIs(ctx context.Context) (*DeprecationScanResult, error) {
	discovery := k8s.GetResourceDiscovery()
	if discovery == nil {
		return nil, fmt.Errorf("resource discovery not initialized")
	}

	resources, err := discovery.GetAPIResources()
	if err != nil {
		return nil, fmt.Errorf("failed to get API resources: %w", err)
	}

	// Build a set of served APIs: "group/version/kind"
	served := make(map[string]bool)
	for _, r := range resources {
		key := r.Group + "/" + r.Version + "/" + r.Kind
		served[key] = true
	}

	// Get cluster version
	clusterVersion := ""
	info, err := k8s.GetClusterInfo(ctx)
	if err == nil && info != nil {
		clusterVersion = info.KubernetesVersion
	}

	_, clusterMinor, _ := parseK8sVersion(clusterVersion)

	result := &DeprecationScanResult{
		ClusterVersion: clusterVersion,
		Findings:       []DeprecationFinding{},
		ScanTimestamp:  time.Now().UTC().Format(time.RFC3339),
	}

	for _, rule := range deprecationRules {
		key := rule.Group + "/" + rule.Version + "/" + rule.Kind
		if !served[key] {
			continue
		}

		_, removedMinor, err := parseK8sVersion("v" + rule.RemovedInVersion)
		if err != nil {
			log.Printf("[scanner] Failed to parse removed version %q: %v", rule.RemovedInVersion, err)
			continue
		}

		severity := "deprecated"
		if clusterMinor > 0 && clusterMinor >= removedMinor {
			severity = "removed"
			result.TotalRemoved++
		} else {
			result.TotalDeprecated++
		}

		result.Findings = append(result.Findings, DeprecationFinding{
			Rule:     rule,
			Severity: severity,
		})
	}

	return result, nil
}

// k8sVersionRegex matches Kubernetes version strings like "v1.28.3", "1.25.0-gke.1234"
var k8sVersionRegex = regexp.MustCompile(`v?(\d+)\.(\d+)`)

// parseK8sVersion extracts major and minor version from a Kubernetes version string.
func parseK8sVersion(s string) (int, int, error) {
	matches := k8sVersionRegex.FindStringSubmatch(s)
	if matches == nil {
		return 0, 0, fmt.Errorf("cannot parse kubernetes version: %q", s)
	}
	major, err := strconv.Atoi(matches[1])
	if err != nil {
		return 0, 0, fmt.Errorf("invalid major version: %w", err)
	}
	minor, err := strconv.Atoi(matches[2])
	if err != nil {
		return 0, 0, fmt.Errorf("invalid minor version: %w", err)
	}
	return major, minor, nil
}

// isVersionGTE checks if the cluster version is >= the target version.
// Target format is "1.22" (without the "v" prefix).
func isVersionGTE(clusterVersion, target string) bool {
	_, clusterMinor, err := parseK8sVersion(clusterVersion)
	if err != nil {
		return false
	}
	_, targetMinor, err := parseK8sVersion(target)
	if err != nil {
		return false
	}
	return clusterMinor >= targetMinor
}
