package service

import (
	"fmt"
	"slices"
	"strings"

	"github.com/salawat/sshmgr/internal/domain"
)

func filterServers(list []domain.Server, keep func(domain.Server) bool) []domain.Server {
	var out []domain.Server
	for _, s := range list {
		if keep(s) {
			out = append(out, s)
		}
	}
	slices.SortFunc(out, func(a, b domain.Server) int { return byName(a.Name, b.Name) })
	return out
}

func filterKeys(list []domain.AgentKey, keep func(domain.AgentKey) bool) []domain.AgentKey {
	var out []domain.AgentKey
	for _, k := range list {
		if keep(k) {
			out = append(out, k)
		}
	}
	slices.SortFunc(out, func(a, b domain.AgentKey) int { return byName(a.Name, b.Name) })
	return out
}

func byName(a, b string) int {
	if c := strings.Compare(strings.ToLower(a), strings.ToLower(b)); c != 0 {
		return c
	}
	return strings.Compare(a, b)
}

func serverItems(list []domain.Server) []SecurityItem {
	out := make([]SecurityItem, 0, len(list))
	for _, s := range list {
		out = append(out, SecurityItem{Kind: SecurityItemServer, ID: s.ID, Name: s.Name})
	}
	return out
}

func keyItems(list []domain.AgentKey) []SecurityItem {
	out := make([]SecurityItem, 0, len(list))
	for _, k := range list {
		out = append(out, SecurityItem{Kind: SecurityItemKey, ID: k.ID, Name: k.Name})
	}
	return out
}

func keyNames(list []domain.AgentKey) []string {
	names := make([]string, 0, len(list))
	for _, k := range filterKeys(list, func(domain.AgentKey) bool { return true }) {
		names = append(names, k.Name)
	}
	return names
}

func sortedNames(names []string) []string {
	out := slices.Clone(names)
	slices.SortFunc(out, byName)
	return out
}

// joinNames is "a", "a and b", "a, b and c", or "a, b and 3 more" past limit.
func joinNames(names []string, limit int) string {
	if len(names) > limit {
		return strings.Join(names[:limit], ", ") + fmt.Sprintf(" and %d more", len(names)-limit)
	}
	if len(names) < 2 {
		return strings.Join(names, "")
	}
	return strings.Join(names[:len(names)-1], ", ") + " and " + names[len(names)-1]
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}

// orNone picks the empty-state text when there is nothing to check.
func orNone(count int, none, some string) string {
	if count == 0 {
		return none
	}
	return some
}

func usedByNote(servers []domain.Server, keyID string) string {
	n := len(filterServers(servers, func(s domain.Server) bool {
		return s.AuthType == domain.AuthZishKey && s.AgentKeyID != nil && *s.AgentKeyID == keyID
	}))
	if n == 0 {
		return "no servers use it"
	}
	return "used by " + plural(n, "server", "servers")
}

// reminderText is the rotation reminder as a person says it: "1 year".
func reminderText(days int) string {
	switch {
	case days%365 == 0:
		return plural(days/365, "year", "years")
	case days%30 == 0:
		return plural(days/30, "month", "months")
	}
	return plural(days, "day", "days")
}

// ageText matches the Keys page's key age: "8 months old", "2 years old".
func ageText(days int) string {
	switch {
	case days < 14:
		return plural(days, "day", "days") + " old"
	case days < 60:
		return plural(days/7, "week", "weeks") + " old"
	case days < 365:
		return plural(days/30, "month", "months") + " old"
	}
	return plural(days/365, "year", "years") + " old"
}

var curveNames = map[string]string{
	"ecdsa-sha2-nistp256": "P-256",
	"ecdsa-sha2-nistp384": "P-384",
	"ecdsa-sha2-nistp521": "P-521",
}

// keyTypeText matches the Keys page's keyTypeLabel.
func keyTypeText(k domain.AgentKey) string {
	switch {
	case k.Type == "ssh-ed25519":
		return "Ed25519"
	case curveNames[k.Type] != "":
		return "ECDSA " + curveNames[k.Type]
	case k.Type == "ssh-rsa" && k.Bits > 0:
		return fmt.Sprintf("RSA %d", k.Bits)
	case k.Type == "ssh-rsa":
		return "RSA"
	}
	return k.Type
}
