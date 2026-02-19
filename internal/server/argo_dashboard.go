package server

import (
	"net/http"
	"sort"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/skyhook-io/radar/internal/k8s"
)

// ArgoDashboardResponse is the full ArgoCD dashboard payload
type ArgoDashboardResponse struct {
	Summary      ArgoDashboardSummary `json:"summary"`
	Applications []ArgoDashboardApp   `json:"applications"`
}

// ArgoDashboardSummary aggregates health and sync counts across all Applications
type ArgoDashboardSummary struct {
	Total        int            `json:"total"`
	HealthCounts map[string]int `json:"healthCounts"`
	SyncCounts   map[string]int `json:"syncCounts"`
	Suspended    int            `json:"suspended"`
}

// ArgoDashboardApp represents a single ArgoCD Application for the dashboard
type ArgoDashboardApp struct {
	Name             string                   `json:"name"`
	Namespace        string                   `json:"namespace"`
	SyncStatus       string                   `json:"syncStatus"`
	HealthStatus     string                   `json:"healthStatus"`
	RepoURL          string                   `json:"repoURL,omitempty"`
	Path             string                   `json:"path,omitempty"`
	TargetRevision   string                   `json:"targetRevision,omitempty"`
	Chart            string                   `json:"chart,omitempty"`
	DestServer       string                   `json:"destServer,omitempty"`
	DestNamespace    string                   `json:"destNamespace,omitempty"`
	AutoSync         bool                     `json:"autoSync"`
	Prune            bool                     `json:"prune,omitempty"`
	SelfHeal         bool                     `json:"selfHeal,omitempty"`
	OperationPhase   string                   `json:"operationPhase,omitempty"`
	OperationMessage string                   `json:"operationMessage,omitempty"`
	LastSyncTime     string                   `json:"lastSyncTime,omitempty"`
	ResourceCount    int                      `json:"resourceCount"`
	Resources        []ArgoDashboardResource  `json:"resources,omitempty"`
	Conditions       []ArgoDashboardCondition `json:"conditions,omitempty"`
	Age              string                   `json:"age"`
	CreatedAt        string                   `json:"createdAt"`
}

// ArgoDashboardResource represents a single managed resource within an ArgoCD Application
type ArgoDashboardResource struct {
	Group     string `json:"group,omitempty"`
	Kind      string `json:"kind"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
	Health    string `json:"health,omitempty"`
	Sync      string `json:"sync,omitempty"`
}

// ArgoDashboardCondition represents a condition on an ArgoCD Application
type ArgoDashboardCondition struct {
	Type    string `json:"type"`
	Message string `json:"message,omitempty"`
}

// DashboardArgoSummary is the compact ArgoCD summary embedded in the main dashboard response
type DashboardArgoSummary struct {
	Total        int                `json:"total"`
	Healthy      int                `json:"healthy"`
	OutOfSync    int                `json:"outOfSync"`
	Degraded     int                `json:"degraded"`
	Applications []DashboardArgoApp `json:"applications"`
}

// DashboardArgoApp is a minimal application representation for the main dashboard card
type DashboardArgoApp struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	SyncStatus   string `json:"syncStatus"`
	HealthStatus string `json:"healthStatus"`
}

// handleArgoDashboard returns the full ArgoCD dashboard data
func (s *Server) handleArgoDashboard(w http.ResponseWriter, r *http.Request) {
	if !s.requireConnected(w) {
		return
	}

	namespaces := parseNamespaces(r.URL.Query())

	apps, ok := s.listArgoApplications(namespaces)
	if !ok {
		// ArgoCD not installed — return empty response
		s.writeJSON(w, ArgoDashboardResponse{
			Summary: ArgoDashboardSummary{
				Total:        0,
				HealthCounts: map[string]int{},
				SyncCounts:   map[string]int{},
			},
			Applications: []ArgoDashboardApp{},
		})
		return
	}

	now := time.Now()
	summary := ArgoDashboardSummary{
		HealthCounts: map[string]int{},
		SyncCounts:   map[string]int{},
	}

	dashApps := make([]ArgoDashboardApp, 0, len(apps))

	for _, app := range apps {
		da := s.extractArgoApp(app, now)
		dashApps = append(dashApps, da)

		summary.Total++
		summary.HealthCounts[da.HealthStatus]++
		summary.SyncCounts[da.SyncStatus]++
	}

	// Count suspended by looking at health status
	summary.Suspended = summary.HealthCounts["Suspended"]

	// Sort: degraded/progressing first, then by name
	sort.SliceStable(dashApps, func(i, j int) bool {
		pi := argoSortPriority(dashApps[i].HealthStatus)
		pj := argoSortPriority(dashApps[j].HealthStatus)
		if pi != pj {
			return pi < pj
		}
		return dashApps[i].Name < dashApps[j].Name
	})

	s.writeJSON(w, ArgoDashboardResponse{
		Summary:      summary,
		Applications: dashApps,
	})
}

// listArgoApplications returns all ArgoCD Application unstructured objects,
// filtered by namespace. Returns (nil, false) if ArgoCD CRD is not installed.
func (s *Server) listArgoApplications(namespaces []string) ([]*unstructured.Unstructured, bool) {
	resourceDiscovery := k8s.GetResourceDiscovery()
	if resourceDiscovery == nil {
		return nil, false
	}

	gvr, ok := resourceDiscovery.GetGVRWithGroup("Application", "argoproj.io")
	if !ok {
		return nil, false
	}

	dynamicCache := k8s.GetDynamicResourceCache()
	if dynamicCache == nil {
		return nil, false
	}

	namespace := ""
	if len(namespaces) == 1 {
		namespace = namespaces[0]
	}

	applications, err := dynamicCache.List(gvr, namespace)
	if err != nil {
		return nil, false
	}

	// If multiple namespaces are specified, filter
	if len(namespaces) > 1 {
		nsSet := make(map[string]bool, len(namespaces))
		for _, ns := range namespaces {
			nsSet[ns] = true
		}
		filtered := make([]*unstructured.Unstructured, 0, len(applications))
		for _, app := range applications {
			if nsSet[app.GetNamespace()] {
				filtered = append(filtered, app)
			}
		}
		applications = filtered
	}

	return applications, true
}

// extractArgoApp extracts dashboard-relevant fields from an unstructured ArgoCD Application
func (s *Server) extractArgoApp(app *unstructured.Unstructured, now time.Time) ArgoDashboardApp {
	name := app.GetName()
	ns := app.GetNamespace()

	spec, _, _ := unstructured.NestedMap(app.Object, "spec")
	status, _, _ := unstructured.NestedMap(app.Object, "status")

	// Source fields
	repoURL, _ := nestedString(spec, "source", "repoURL")
	path, _ := nestedString(spec, "source", "path")
	targetRevision, _ := nestedString(spec, "source", "targetRevision")
	chart, _ := nestedString(spec, "source", "chart")

	// Destination fields
	destServer, _ := nestedString(spec, "destination", "server")
	if destServer == "" {
		destServer, _ = nestedString(spec, "destination", "name")
	}
	destNamespace, _ := nestedString(spec, "destination", "namespace")

	// Sync policy
	autoSync := false
	prune := false
	selfHeal := false
	if spec != nil {
		automated, found, _ := unstructured.NestedMap(spec, "syncPolicy", "automated")
		if found && automated != nil {
			autoSync = true
			if v, ok := automated["prune"].(bool); ok {
				prune = v
			}
			if v, ok := automated["selfHeal"].(bool); ok {
				selfHeal = v
			}
		}
	}

	// Status: sync + health
	syncStatus := "Unknown"
	healthStatus := "Unknown"
	if status != nil {
		if s, ok := nestedString(status, "sync", "status"); ok {
			syncStatus = s
		}
		if h, ok := nestedString(status, "health", "status"); ok {
			healthStatus = h
		}
	}

	// Operation state
	operationPhase := ""
	operationMessage := ""
	lastSyncTime := ""
	if status != nil {
		if p, ok := nestedString(status, "operationState", "phase"); ok {
			operationPhase = p
		}
		if m, ok := nestedString(status, "operationState", "message"); ok {
			operationMessage = truncate(m, 200)
		}
		if t, ok := nestedString(status, "operationState", "finishedAt"); ok {
			lastSyncTime = t
		}
	}

	// Resources
	var resources []ArgoDashboardResource
	if status != nil {
		if rawResources, found, _ := unstructured.NestedSlice(status, "resources"); found {
			for _, raw := range rawResources {
				if m, ok := raw.(map[string]interface{}); ok {
					res := ArgoDashboardResource{}
					if v, ok := m["group"].(string); ok {
						res.Group = v
					}
					if v, ok := m["kind"].(string); ok {
						res.Kind = v
					}
					if v, ok := m["namespace"].(string); ok {
						res.Namespace = v
					}
					if v, ok := m["name"].(string); ok {
						res.Name = v
					}
					if healthMap, ok := m["health"].(map[string]interface{}); ok {
						if v, ok := healthMap["status"].(string); ok {
							res.Health = v
						}
					}
					if v, ok := m["status"].(string); ok {
						res.Sync = v
					}
					resources = append(resources, res)
				}
			}
		}
	}

	// Conditions
	var conditions []ArgoDashboardCondition
	if status != nil {
		if rawConditions, found, _ := unstructured.NestedSlice(status, "conditions"); found {
			for _, raw := range rawConditions {
				if m, ok := raw.(map[string]interface{}); ok {
					cond := ArgoDashboardCondition{}
					if v, ok := m["type"].(string); ok {
						cond.Type = v
					}
					if v, ok := m["message"].(string); ok {
						cond.Message = truncate(v, 200)
					}
					conditions = append(conditions, cond)
				}
			}
		}
	}

	// Age
	createdAt := app.GetCreationTimestamp().Time
	age := formatAge(now.Sub(createdAt))

	return ArgoDashboardApp{
		Name:             name,
		Namespace:        ns,
		SyncStatus:       syncStatus,
		HealthStatus:     healthStatus,
		RepoURL:          repoURL,
		Path:             path,
		TargetRevision:   targetRevision,
		Chart:            chart,
		DestServer:       destServer,
		DestNamespace:    destNamespace,
		AutoSync:         autoSync,
		Prune:            prune,
		SelfHeal:         selfHeal,
		OperationPhase:   operationPhase,
		OperationMessage: operationMessage,
		LastSyncTime:     lastSyncTime,
		ResourceCount:    len(resources),
		Resources:        resources,
		Conditions:       conditions,
		Age:              age,
		CreatedAt:        createdAt.Format(time.RFC3339),
	}
}

// nestedString extracts a string from a nested map path.
// Returns ("", false) if the path doesn't exist or isn't a string.
func nestedString(obj map[string]interface{}, fields ...string) (string, bool) {
	current := obj
	for i, field := range fields {
		if current == nil {
			return "", false
		}
		if i == len(fields)-1 {
			if v, ok := current[field].(string); ok {
				return v, true
			}
			return "", false
		}
		next, ok := current[field].(map[string]interface{})
		if !ok {
			return "", false
		}
		current = next
	}
	return "", false
}

// argoSortPriority returns a numeric priority for sorting (lower = first)
func argoSortPriority(healthStatus string) int {
	switch healthStatus {
	case "Degraded":
		return 0
	case "Missing":
		return 1
	case "Progressing":
		return 2
	case "Suspended":
		return 3
	case "Unknown":
		return 4
	case "Healthy":
		return 5
	default:
		return 6
	}
}

// getDashboardArgoSummary returns a compact ArgoCD summary for the main dashboard.
// Returns nil if ArgoCD is not installed.
func (s *Server) getDashboardArgoSummary(namespace string) *DashboardArgoSummary {
	var namespaces []string
	if namespace != "" {
		namespaces = []string{namespace}
	}

	apps, ok := s.listArgoApplications(namespaces)
	if !ok || len(apps) == 0 {
		return nil
	}

	now := time.Now()
	result := &DashboardArgoSummary{}
	result.Total = len(apps)

	// Take top 6 applications (sorted: degraded first)
	type appEntry struct {
		da   ArgoDashboardApp
		prio int
	}
	entries := make([]appEntry, 0, len(apps))

	for _, app := range apps {
		da := s.extractArgoApp(app, now)

		switch da.HealthStatus {
		case "Healthy":
			result.Healthy++
		case "Degraded":
			result.Degraded++
		}
		if da.SyncStatus == "OutOfSync" {
			result.OutOfSync++
		}

		entries = append(entries, appEntry{
			da:   da,
			prio: argoSortPriority(da.HealthStatus),
		})
	}

	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].prio != entries[j].prio {
			return entries[i].prio < entries[j].prio
		}
		return entries[i].da.Name < entries[j].da.Name
	})

	limit := 6
	if len(entries) < limit {
		limit = len(entries)
	}

	result.Applications = make([]DashboardArgoApp, 0, limit)
	for _, e := range entries[:limit] {
		result.Applications = append(result.Applications, DashboardArgoApp{
			Name:         e.da.Name,
			Namespace:    e.da.Namespace,
			SyncStatus:   e.da.SyncStatus,
			HealthStatus: e.da.HealthStatus,
		})
	}

	return result
}

