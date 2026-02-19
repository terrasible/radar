package scanner

import "testing"

func TestParseK8sVersion(t *testing.T) {
	tests := []struct {
		input     string
		wantMajor int
		wantMinor int
		wantErr   bool
	}{
		{"v1.28.3", 1, 28, false},
		{"v1.25.0", 1, 25, false},
		{"1.22.0", 1, 22, false},
		{"v1.25.0-gke.1234", 1, 25, false},
		{"v1.28.0-eks.1", 1, 28, false},
		{"v1.27.3+k3s1", 1, 27, false},
		{"v1.16", 1, 16, false},
		{"1.29", 1, 29, false},
		{"", 0, 0, true},
		{"invalid", 0, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			major, minor, err := parseK8sVersion(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseK8sVersion(%q) err = %v, wantErr = %v", tt.input, err, tt.wantErr)
			}
			if !tt.wantErr {
				if major != tt.wantMajor {
					t.Errorf("parseK8sVersion(%q) major = %d, want %d", tt.input, major, tt.wantMajor)
				}
				if minor != tt.wantMinor {
					t.Errorf("parseK8sVersion(%q) minor = %d, want %d", tt.input, minor, tt.wantMinor)
				}
			}
		})
	}
}

func TestIsVersionGTE(t *testing.T) {
	tests := []struct {
		cluster string
		target  string
		want    bool
	}{
		{"v1.28.3", "1.22", true},
		{"v1.28.3", "1.28", true},
		{"v1.28.3", "1.29", false},
		{"v1.16.0", "1.16", true},
		{"v1.16.0", "1.22", false},
		{"v1.25.0-gke.1234", "1.25", true},
		{"v1.25.0-gke.1234", "1.26", false},
		{"invalid", "1.22", false},
		{"v1.28.0", "invalid", false},
	}

	for _, tt := range tests {
		name := tt.cluster + "_gte_" + tt.target
		t.Run(name, func(t *testing.T) {
			got := isVersionGTE(tt.cluster, tt.target)
			if got != tt.want {
				t.Errorf("isVersionGTE(%q, %q) = %v, want %v", tt.cluster, tt.target, got, tt.want)
			}
		})
	}
}

func TestDeprecationRulesIntegrity(t *testing.T) {
	for i, rule := range deprecationRules {
		if rule.Group == "" && rule.Version == "" {
			t.Errorf("Rule %d: Group and Version are both empty", i)
		}
		if rule.Kind == "" {
			t.Errorf("Rule %d: Kind is empty", i)
		}
		if rule.RemovedInVersion == "" {
			t.Errorf("Rule %d (%s/%s %s): RemovedInVersion is empty", i, rule.Group, rule.Version, rule.Kind)
		}
		if rule.DeprecatedInVersion == "" {
			t.Errorf("Rule %d (%s/%s %s): DeprecatedInVersion is empty", i, rule.Group, rule.Version, rule.Kind)
		}
		if rule.MigrationGuide == "" {
			t.Errorf("Rule %d (%s/%s %s): MigrationGuide is empty", i, rule.Group, rule.Version, rule.Kind)
		}
		// Verify removed version is parseable
		_, _, err := parseK8sVersion("v" + rule.RemovedInVersion)
		if err != nil {
			t.Errorf("Rule %d (%s/%s %s): RemovedInVersion %q is not parseable: %v",
				i, rule.Group, rule.Version, rule.Kind, rule.RemovedInVersion, err)
		}
		// Verify deprecated version is parseable
		_, _, err = parseK8sVersion("v" + rule.DeprecatedInVersion)
		if err != nil {
			t.Errorf("Rule %d (%s/%s %s): DeprecatedInVersion %q is not parseable: %v",
				i, rule.Group, rule.Version, rule.Kind, rule.DeprecatedInVersion, err)
		}
	}
}
