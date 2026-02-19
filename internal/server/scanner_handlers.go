package server

import (
	"net/http"
	"strings"

	"github.com/skyhook-io/radar/internal/scanner"
)

// handleScannerResults returns all scan findings, optionally filtered.
func (s *Server) handleScannerResults(w http.ResponseWriter, r *http.Request) {
	if !s.requireConnected(w) {
		return
	}

	opts := parseScanOptions(r)
	result, err := scanner.Scan(opts)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.writeJSON(w, result)
}

// handleScannerSummary returns only the scan summary (counts).
func (s *Server) handleScannerSummary(w http.ResponseWriter, r *http.Request) {
	if !s.requireConnected(w) {
		return
	}

	opts := parseScanOptions(r)
	result, err := scanner.Scan(opts)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.writeJSON(w, result.Summary)
}

// handleScannerRun triggers a fresh scan (POST, same output as results).
func (s *Server) handleScannerRun(w http.ResponseWriter, r *http.Request) {
	if !s.requireConnected(w) {
		return
	}

	opts := parseScanOptions(r)
	result, err := scanner.Scan(opts)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.writeJSON(w, result)
}

// handleDeprecatedAPIs returns deprecated API detection results.
func (s *Server) handleDeprecatedAPIs(w http.ResponseWriter, r *http.Request) {
	if !s.requireConnected(w) {
		return
	}

	result, err := scanner.ScanDeprecatedAPIs(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	s.writeJSON(w, result)
}

// parseScanOptions extracts scan filter options from query parameters.
func parseScanOptions(r *http.Request) scanner.ScanOptions {
	opts := scanner.ScanOptions{}

	if ns := r.URL.Query().Get("namespaces"); ns != "" {
		opts.Namespaces = strings.Split(ns, ",")
	} else if ns := r.URL.Query().Get("namespace"); ns != "" {
		opts.Namespaces = []string{ns}
	}

	if cat := r.URL.Query().Get("category"); cat != "" {
		opts.Categories = []scanner.Category{scanner.Category(cat)}
	}

	if sev := r.URL.Query().Get("severity"); sev != "" {
		opts.Severities = []scanner.Severity{scanner.Severity(sev)}
	}

	if kind := r.URL.Query().Get("kind"); kind != "" {
		opts.Kinds = []string{kind}
	}

	if r.URL.Query().Get("external") == "true" {
		opts.IncludeExternal = true
	}

	return opts
}
