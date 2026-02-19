package scanner

import (
	"log"
	"os/exec"
)

// ExternalScanner is the interface for external scanning tool integrations.
type ExternalScanner interface {
	Name() string
	Available() bool
	Scan(ctx *ScanContext) []Finding
}

var externalScanners = []ExternalScanner{
	&trivyScanner{},
	&polarisScanner{},
	&kubeScoreScanner{},
}

// runExternalScanners discovers and runs available external scanners.
func runExternalScanners(ctx *ScanContext) []Finding {
	var allFindings []Finding
	for _, scanner := range externalScanners {
		if !scanner.Available() {
			continue
		}
		log.Printf("[scanner] Running external scanner: %s", scanner.Name())
		findings := scanner.Scan(ctx)
		for i := range findings {
			findings[i].Source = scanner.Name()
		}
		allFindings = append(allFindings, findings...)
	}
	return allFindings
}

// --- Trivy stub ---

type trivyScanner struct{}

func (s *trivyScanner) Name() string    { return "trivy" }
func (s *trivyScanner) Available() bool { _, err := exec.LookPath("trivy"); return err == nil }
func (s *trivyScanner) Scan(_ *ScanContext) []Finding {
	log.Printf("[scanner] trivy integration not implemented yet")
	return nil
}

// --- Polaris stub ---

type polarisScanner struct{}

func (s *polarisScanner) Name() string    { return "polaris" }
func (s *polarisScanner) Available() bool { _, err := exec.LookPath("polaris"); return err == nil }
func (s *polarisScanner) Scan(_ *ScanContext) []Finding {
	log.Printf("[scanner] polaris integration not implemented yet")
	return nil
}

// --- kube-score stub ---

type kubeScoreScanner struct{}

func (s *kubeScoreScanner) Name() string { return "kube-score" }
func (s *kubeScoreScanner) Available() bool {
	_, err := exec.LookPath("kube-score")
	return err == nil
}
func (s *kubeScoreScanner) Scan(_ *ScanContext) []Finding {
	log.Printf("[scanner] kube-score integration not implemented yet")
	return nil
}
