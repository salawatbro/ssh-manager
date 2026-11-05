package domain

import (
	"slices"
	"strings"
)

// Security check ids. Settings.SecurityIgnored stores them.
const (
	CheckPasswordServers = "password-servers"
	CheckKeysTouchID     = "keys-touch-id"
	CheckKeyAge          = "key-age"
	CheckRSAKeys         = "rsa-keys"
	CheckProdTwoFactor   = "prod-two-factor"
	CheckAppLock         = "app-lock"
	CheckIdleLock        = "idle-lock"
	CheckKnownHosts      = "known-hosts"
	CheckAgentSocket     = "agent-socket"
	CheckJumpKeys        = "jump-keys"
)

// SecurityCheckIDs lists every check in the order the report shows them.
var SecurityCheckIDs = []string{
	CheckPasswordServers, CheckKeysTouchID, CheckKeyAge, CheckRSAKeys, CheckProdTwoFactor,
	CheckAppLock, CheckIdleLock, CheckKnownHosts, CheckAgentSocket, CheckJumpKeys,
}

// SplitCheckIDs parses a comma-separated list, keeping known ids once each.
func SplitCheckIDs(csv string) []string {
	var out []string
	for _, id := range strings.Split(csv, ",") {
		id = strings.TrimSpace(id)
		if slices.Contains(SecurityCheckIDs, id) && !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	return out
}

// JoinCheckIDs is SplitCheckIDs' inverse, in report order.
func JoinCheckIDs(ids []string) string {
	var out []string
	for _, id := range SecurityCheckIDs {
		if slices.Contains(ids, id) {
			out = append(out, id)
		}
	}
	return strings.Join(out, ",")
}
