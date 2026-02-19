package scanner

import "sync"

var (
	globalRegistry []Rule
	registryMu     sync.RWMutex
)

// Register adds a rule to the global registry. Called from init() functions.
func Register(rule Rule) {
	registryMu.Lock()
	defer registryMu.Unlock()
	globalRegistry = append(globalRegistry, rule)
}

// GetRules returns a copy of all registered rules.
func GetRules() []Rule {
	registryMu.RLock()
	defer registryMu.RUnlock()
	result := make([]Rule, len(globalRegistry))
	copy(result, globalRegistry)
	return result
}
