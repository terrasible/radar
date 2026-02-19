package scanner

import (
	"log"
	"sort"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/labels"

	"github.com/skyhook-io/radar/internal/k8s"
)

// Scan runs all matching rules against the cluster and returns findings.
func Scan(opts ScanOptions) (*ScanResult, error) {
	cache := k8s.GetResourceCache()
	if cache == nil {
		return &ScanResult{
			Findings:  []Finding{},
			Summary:   buildSummary(nil, 0, 0),
			ScannedAt: time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	start := time.Now()

	ctx := &ScanContext{
		Cache:      cache,
		Namespaces: opts.Namespaces,
	}

	// Filter rules by requested categories
	categorySet := make(map[Category]bool)
	for _, c := range opts.Categories {
		categorySet[c] = true
	}

	// Filter rules by requested severities
	severitySet := make(map[Severity]bool)
	for _, s := range opts.Severities {
		severitySet[s] = true
	}

	rules := GetRules()
	var allFindings []Finding

	for _, rule := range rules {
		if len(categorySet) > 0 && !categorySet[rule.Category()] {
			continue
		}
		if len(severitySet) > 0 && !severitySet[rule.Severity()] {
			continue
		}

		findings := rule.Check(ctx)
		if findings != nil {
			allFindings = append(allFindings, findings...)
		}
	}

	// Run external scanners if requested
	if opts.IncludeExternal {
		extFindings := runExternalScanners(ctx)
		allFindings = append(allFindings, extFindings...)
	}

	// Filter by kind if specified
	if len(opts.Kinds) > 0 {
		kindSet := make(map[string]bool)
		for _, k := range opts.Kinds {
			kindSet[k] = true
		}
		var filtered []Finding
		for _, f := range allFindings {
			if kindSet[f.Kind] {
				filtered = append(filtered, f)
			}
		}
		allFindings = filtered
	}

	// Sort: critical first, then warning, then info
	sort.SliceStable(allFindings, func(i, j int) bool {
		return severityOrder(allFindings[i].Severity) < severityOrder(allFindings[j].Severity)
	})

	duration := time.Since(start)
	resourceCount := countScannedResources(cache, opts.Namespaces)

	if allFindings == nil {
		allFindings = []Finding{}
	}

	return &ScanResult{
		Findings:  allFindings,
		Summary:   buildSummary(allFindings, resourceCount, duration),
		ScannedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// countScannedResources counts the total resources that were inspected.
func countScannedResources(cache *k8s.ResourceCache, namespaces []string) int {
	count := 0
	ns := ""
	if len(namespaces) == 1 {
		ns = namespaces[0]
	}

	if podLister := cache.Pods(); podLister != nil {
		if ns != "" {
			if pods, err := podLister.Pods(ns).List(labels.Everything()); err == nil {
				count += len(pods)
			}
		} else {
			if pods, err := podLister.List(labels.Everything()); err == nil {
				count += len(pods)
			}
		}
	}
	if depLister := cache.Deployments(); depLister != nil {
		if ns != "" {
			if deps, err := depLister.Deployments(ns).List(labels.Everything()); err == nil {
				count += len(deps)
			}
		} else {
			if deps, err := depLister.List(labels.Everything()); err == nil {
				count += len(deps)
			}
		}
	}
	if ssLister := cache.StatefulSets(); ssLister != nil {
		if ns != "" {
			if ss, err := ssLister.StatefulSets(ns).List(labels.Everything()); err == nil {
				count += len(ss)
			}
		} else {
			if ss, err := ssLister.List(labels.Everything()); err == nil {
				count += len(ss)
			}
		}
	}
	if dsLister := cache.DaemonSets(); dsLister != nil {
		if ns != "" {
			if ds, err := dsLister.DaemonSets(ns).List(labels.Everything()); err == nil {
				count += len(ds)
			}
		} else {
			if ds, err := dsLister.List(labels.Everything()); err == nil {
				count += len(ds)
			}
		}
	}
	if jobLister := cache.Jobs(); jobLister != nil {
		if ns != "" {
			if jobs, err := jobLister.Jobs(ns).List(labels.Everything()); err == nil {
				count += len(jobs)
			}
		} else {
			if jobs, err := jobLister.List(labels.Everything()); err == nil {
				count += len(jobs)
			}
		}
	}
	return count
}

// listPods returns pods respecting namespace filter.
func listPods(ctx *ScanContext) []*corev1.Pod {
	podLister := ctx.Cache.Pods()
	if podLister == nil {
		return nil
	}

	if len(ctx.Namespaces) == 1 {
		pods, err := podLister.Pods(ctx.Namespaces[0]).List(labels.Everything())
		if err != nil {
			log.Printf("[scanner] Failed to list pods in %s: %v", ctx.Namespaces[0], err)
			return nil
		}
		return pods
	}

	if len(ctx.Namespaces) > 1 {
		var result []*corev1.Pod
		for _, ns := range ctx.Namespaces {
			pods, err := podLister.Pods(ns).List(labels.Everything())
			if err != nil {
				continue
			}
			result = append(result, pods...)
		}
		return result
	}

	pods, err := podLister.List(labels.Everything())
	if err != nil {
		log.Printf("[scanner] Failed to list all pods: %v", err)
		return nil
	}
	return pods
}
