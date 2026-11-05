package service

import (
	"fmt"
	"net"
	"path/filepath"
	"strconv"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

// maxIdleLockMinutes is the longest idle wait the idle-lock check accepts.
const maxIdleLockMinutes = 30

func newCheck(id string) SecurityCheck {
	return SecurityCheck{ID: id, Items: []SecurityItem{}, Notes: []string{}}
}

func pass(c SecurityCheck, title, detail string) SecurityCheck {
	c.OK, c.Title, c.Detail = true, title, detail
	return c
}

func checkPasswordServers(f *securityFacts) SecurityCheck {
	c := newCheck(domain.CheckPasswordServers)
	bad := filterServers(f.servers, func(s domain.Server) bool { return s.AuthType == domain.AuthPassword })
	if len(bad) == 0 {
		return pass(c, "Servers sign in with keys", orNone(len(f.servers), "No servers yet.", "No server signs in with a password."))
	}
	c.Items = serverItems(bad)
	if len(bad) == 1 {
		c.Title = bad[0].Name + " signs in with a password"
		c.Detail = "Zish can put a key on it for you and switch it to the key. The old password stays in Keychain until you remove it."
		return c
	}
	c.Title = fmt.Sprintf("%d servers sign in with a password", len(bad))
	c.Detail = "Zish can put a key on them for you and switch them to it. The old passwords stay in Keychain until you remove them."
	return c
}

func checkKeysTouchID(f *securityFacts) SecurityCheck {
	c := newCheck(domain.CheckKeysTouchID)
	bad := filterKeys(f.keys, func(k domain.AgentKey) bool { return !k.RequireConfirm })
	if len(bad) == 0 {
		return pass(c, "Keys ask for Touch ID", orNone(len(f.keys), "No Zish keys yet.", "Every Zish key asks before it signs."))
	}
	c.Items = keyItems(bad)
	if len(bad) == 1 {
		c.Title = bad[0].Name + " signs without Touch ID"
		c.Detail = "Any app that reaches the agent socket can use this key without asking you."
		c.Notes = append(c.Notes, usedByNote(f.servers, bad[0].ID))
		return c
	}
	c.Title = fmt.Sprintf("%d keys sign without Touch ID", len(bad))
	c.Detail = "Any app that reaches the agent socket can use these keys without asking you."
	return c
}

func checkKeyAge(f *securityFacts) SecurityCheck {
	c := newCheck(domain.CheckKeyAge)
	days := f.settings.RotateReminderDays
	if days <= 0 {
		return pass(c, "Keys are fresh", "The reminder to rotate keys is off.")
	}
	limit := reminderText(days)
	bad := filterKeys(f.keys, func(k domain.AgentKey) bool {
		return !k.CreatedAt.IsZero() && ageDays(k.CreatedAt, f.now) >= days
	})
	if len(bad) == 0 {
		return pass(c, "Keys are fresh", orNone(len(f.keys), "No Zish keys yet.", "Every key is younger than "+limit+"."))
	}
	c.Items = keyItems(bad)
	if len(bad) == 1 {
		k := bad[0]
		c.Title = k.Name + " is " + ageText(ageDays(k.CreatedAt, f.now))
		c.Detail = "Make a fresh ed25519 key, install it where " + k.Name + " is used, then retire the old one."
		c.Notes = append(c.Notes, keyTypeText(k), "created "+k.CreatedAt.Format("Jan 2006"))
		return c
	}
	c.Title = fmt.Sprintf("%d keys are older than %s", len(bad), limit)
	c.Detail = "Make fresh ed25519 keys, install them where the old ones are used, then retire the old ones."
	return c
}

func checkRSAKeys(f *securityFacts) SecurityCheck {
	c := newCheck(domain.CheckRSAKeys)
	bad := filterKeys(f.keys, func(k domain.AgentKey) bool { return k.Type == "ssh-rsa" })
	if len(bad) == 0 {
		if len(f.keys) == 0 {
			return pass(c, "No RSA keys", "No Zish keys yet.")
		}
		title := "No RSA keys"
		if len(filterKeys(f.keys, func(k domain.AgentKey) bool { return k.Type != "ssh-ed25519" })) == 0 {
			title = "Zish keys are ed25519"
		}
		return pass(c, title, joinNames(keyNames(f.keys), 3)+".")
	}
	c.Items = keyItems(bad)
	if len(bad) == 1 {
		c.Title = bad[0].Name + " is an RSA key"
		c.Detail = "ed25519 keys are smaller and faster, and OpenSSH makes them by default. Make one and move the servers that use " + bad[0].Name + " to it."
		c.Notes = append(c.Notes, keyTypeText(bad[0]), usedByNote(f.servers, bad[0].ID))
		return c
	}
	c.Title = fmt.Sprintf("%d keys are RSA", len(bad))
	c.Detail = "ed25519 keys are smaller and faster, and OpenSSH makes them by default. Make one and move these keys' servers to it."
	return c
}

func checkProdTwoFactor(f *securityFacts) SecurityCheck {
	c := newCheck(domain.CheckProdTwoFactor)
	prod := filterServers(f.servers, func(s domain.Server) bool { return s.Environment == domain.EnvProd })
	bad := filterServers(prod, func(s domain.Server) bool { return !s.TwoFactor })
	switch {
	case len(prod) == 0:
		return pass(c, "Two-factor on production", "No server is marked PROD.")
	case len(bad) == 0 && len(prod) == 1:
		return pass(c, "Two-factor on production", prod[0].Name+" fills a code.")
	case len(bad) == 0:
		return pass(c, "Two-factor on production", fmt.Sprintf("All %d production servers fill a code.", len(prod)))
	}
	c.Items = serverItems(bad)
	if len(bad) == 1 {
		c.Title = bad[0].Name + " has no two-factor"
		c.Detail = "It is marked PROD, yet a stolen key or password is all it takes to sign in. Turn on two-factor on the server, then add its secret here so Zish fills the code."
		return c
	}
	c.Title = fmt.Sprintf("%d production servers have no two-factor", len(bad))
	c.Detail = "They are marked PROD, yet a stolen key or password is all it takes to sign in. Turn on two-factor on each, then add the secrets here so Zish fills the codes."
	return c
}

func checkAppLock(f *securityFacts) SecurityCheck {
	c := newCheck(domain.CheckAppLock)
	s := f.settings
	switch {
	case !f.hasPin:
		c.Title = "App Lock is off"
		c.Detail = "Anyone at your Mac can open Zish and connect to your servers. Set a PIN and unlock with Touch ID."
	case !s.LockEnabled:
		c.Title = "App Lock is off"
		c.Detail = "You have a PIN, but Zish doesn't ask for it. Turn on Require unlock."
	case !s.LockUseBiometrics:
		c.Title = "App Lock doesn't use Touch ID"
		c.Detail = "Touch ID makes unlocking quick, so a short idle lock stays easy to live with."
	default:
		return pass(c, "App Lock with Touch ID", "Zish asks for Touch ID or your PIN before it opens.")
	}
	return c
}

func checkIdleLock(f *securityFacts) SecurityCheck {
	c := newCheck(domain.CheckIdleLock)
	s := f.settings
	switch {
	case !f.hasPin || !s.LockEnabled:
		c.Title = "Zish never locks by itself"
		c.Detail = "Turn on App Lock so Zish locks after a few idle minutes."
	case !s.LockIdleEnabled:
		c.Title = "Zish doesn't lock when idle"
		c.Detail = "A Mac left open keeps Zish open too. Lock it after 10 idle minutes."
	case s.LockIdleMinutes > maxIdleLockMinutes:
		c.Title = fmt.Sprintf("Zish waits %d minutes before it locks", s.LockIdleMinutes)
		c.Detail = "A Mac left open keeps Zish open that long. 10 minutes is a safer wait."
	default:
		return pass(c, "Idle lock", "Locks after "+plural(s.LockIdleMinutes, "minute", "minutes")+" idle.")
	}
	return c
}

func checkKnownHosts(f *securityFacts) SecurityCheck {
	c := newCheck(domain.CheckKnownHosts)
	bad := filterServers(f.servers, func(s domain.Server) bool {
		return !f.known(net.JoinHostPort(s.Host, strconv.Itoa(s.Port)))
	})
	switch {
	case len(f.servers) == 0:
		return pass(c, "Host keys are checked", "No servers yet.")
	case len(bad) == 0 && len(f.servers) == 1:
		return pass(c, "Host keys are checked", f.servers[0].Name+" is in ~/.ssh/known_hosts.")
	case len(bad) == 0:
		return pass(c, "Host keys are checked", fmt.Sprintf("All %d servers are in ~/.ssh/known_hosts.", len(f.servers)))
	}
	c.Items = serverItems(bad)
	if len(bad) == 1 {
		c.Title = bad[0].Name + " isn't in known_hosts"
		c.Detail = "ssh shows its key the first time you connect and asks you to trust it. Check the fingerprint with whoever runs the server before you say yes."
		return c
	}
	c.Title = fmt.Sprintf("%d servers aren't in known_hosts", len(bad))
	c.Detail = "ssh shows each key the first time you connect and asks you to trust it. Check the fingerprints with whoever runs the servers before you say yes."
	return c
}

func checkAgentSocket(f *securityFacts) SecurityCheck {
	c := newCheck(domain.CheckAgentSocket)
	sf := f.socket
	if !sf.served {
		return pass(c, "Agent socket is off", "Only Zish itself signs with your keys.")
	}
	name := filepath.Base(sf.path)
	recreate := " Turn the agent off and on in Settings › Keys to make it again."
	switch {
	case sf.statErr != nil:
		c.Title = "Zish can't check " + name
		c.Detail = "Its permissions couldn't be read." + recreate
		return c
	case !sf.isSocket:
		c.Title = name + " isn't a socket"
		c.Detail = "Something replaced the agent's socket." + recreate
		return c
	case !sf.mine:
		c.Title = name + " belongs to another user"
		c.Detail = "Another account owns the agent's socket." + recreate
		return c
	case sf.perm&0o077 != 0:
		c.Title = name + " is open to other users"
		c.Detail = "Other accounts on this Mac could ask it to sign." + recreate
		c.Notes = append(c.Notes, fmt.Sprintf("mode %04o", sf.perm))
		return c
	}
	return pass(c, "Agent socket is yours only", fmt.Sprintf("%s is %04o and checks the caller's user id.", name, sf.perm))
}

func checkJumpKeys(f *securityFacts) SecurityCheck {
	c := newCheck(domain.CheckJumpKeys)
	behind := map[string][]string{} // jump id → names of the servers it leads to
	for _, s := range f.servers {
		if s.JumpID != nil {
			behind[*s.JumpID] = append(behind[*s.JumpID], s.Name)
		}
	}
	jumps := filterServers(f.servers, func(s domain.Server) bool { return len(behind[s.ID]) > 0 })
	bad := filterServers(jumps, func(s domain.Server) bool { return s.AuthType == domain.AuthPassword })
	switch {
	case len(jumps) == 0:
		return pass(c, "Jump hosts use keys", "No server goes through a jump host.")
	case len(bad) == 0 && len(jumps) == 1:
		return pass(c, "Jump hosts use keys", jumps[0].Name+" reaches "+joinNames(sortedNames(behind[jumps[0].ID]), 1)+" without a password.")
	case len(bad) == 0:
		return pass(c, "Jump hosts use keys", fmt.Sprintf("All %d jump hosts sign in with keys.", len(jumps)))
	}
	c.Items = serverItems(bad)
	if len(bad) == 1 {
		c.Title = "Jump host " + bad[0].Name + " uses a password"
		c.Detail = "Every server behind it depends on that password. Move it to a key so the whole route signs in with keys."
		c.Notes = append(c.Notes, "leads to "+plural(len(behind[bad[0].ID]), "server", "servers"))
		return c
	}
	c.Title = fmt.Sprintf("%d jump hosts use a password", len(bad))
	c.Detail = "Every server behind them depends on those passwords. Move them to keys so each route signs in with keys."
	return c
}

func ageDays(created, now time.Time) int {
	if now.Before(created) {
		return 0
	}
	return int(now.Sub(created).Hours() / 24)
}
