package agent

import (
	"context"
	"strings"

	"golang.org/x/crypto/ssh"
	sshagent "golang.org/x/crypto/ssh/agent"

	"github.com/salawat/sshmgr/internal/domain"
)

// signRequest is one signature request with its context.
type signRequest struct {
	pub   ssh.PublicKey
	data  []byte
	flags sshagent.SignatureFlags
	// client is who asked; host is where the signature goes.
	client ClientInfo
	host   Host
	// verified: a session-bind for this very session proves host.
	verified  bool
	forwarded bool
}

func (c *Core) sign(r signRequest) (*ssh.Signature, error) {
	if r.client.InProcess {
		r.host, r.verified = r.client.Target, true
	}
	t, err := c.find(r.pub)
	if err != nil {
		return nil, err
	}
	ev := c.event(t, r)
	if c.protoLocked() {
		ev.Outcome, ev.Detail = domain.SignDenied, "Agent locked with ssh-add -x"
		c.record(ev)
		return nil, errAgentLocked
	}
	appLocked := c.lock != nil && c.lock.Locked()
	ev.Outcome = domain.SignAllowed
	if (appLocked || t.confirm) && !c.authorize(t, r, appLocked, &ev) {
		c.record(ev)
		return nil, errRefused
	}
	signer, err := c.signerFor(t, appLocked)
	if err == nil {
		var sig *ssh.Signature
		if sig, err = signWithFlags(signer, r.data, r.flags); err == nil {
			c.record(ev)
			if t.keyID != "" {
				_ = c.src.Touch(t.keyID, c.now())
			}
			return sig, nil
		}
	}
	ev.Outcome, ev.Detail = domain.SignError, err.Error()
	c.record(ev)
	return nil, err
}

// authorize settles a signature that needs the user: an open approval for
// this app and key covers it, else the user is asked. It sets ev's outcome.
func (c *Core) authorize(t target, r signRequest, appLocked bool, ev *domain.AgentSignEvent) bool {
	// A stack approval named its servers when it was given, so it covers a
	// production server too.
	if !appLocked && c.coveredByLaunch(t, r, ev) {
		return true
	}
	grantable := !appLocked && r.client.Holder.bindable() && !c.prodProtected(t, r)
	if grantable && c.coveredBy(t, r, ev) {
		return true
	}
	if c.conf == nil {
		ev.Outcome, ev.Detail = domain.SignDenied, "No confirmation prompt is available"
		return false
	}
	release, ok := c.enqueue()
	if !ok {
		ev.Outcome, ev.Detail = domain.SignDenied, "busy"
		return false
	}
	defer release()
	// The prompt this request queued behind may have opened an approval for it.
	if grantable && c.coveredBy(t, r, ev) {
		return true
	}
	c.mu.Lock()
	gen := c.gen
	c.mu.Unlock()
	d, detail := c.ask(ConfirmRequest{
		KeyName: t.name, Fingerprint: t.fp, Client: r.client, Destination: r.host.Name, Host: r.host,
		Forwarded: r.forwarded, Locked: appLocked, Grantable: grantable,
	})
	if !d.Allow {
		ev.Outcome, ev.Detail = domain.SignDenied, detail
		if appLocked {
			ev.Outcome = domain.SignLocked
		}
		return false
	}
	ev.Outcome = domain.SignConfirmed
	if grantable {
		c.addGrant(t, r.client, d.Length, gen)
	}
	return true
}

func (c *Core) coveredBy(t target, r signRequest, ev *domain.AgentSignEvent) bool {
	g := c.useGrant(r.client.Holder, t.fp)
	if g == nil {
		return false
	}
	ev.Outcome, ev.Detail = domain.SignGranted, g.detail()
	return true
}

// prodProtected reports whether "Always ask again for production servers"
// keeps this request out of approvals. Only a destination a session-bind
// proves can clear a key that also signs in to a production server.
func (c *Core) prodProtected(t target, r signRequest) bool {
	c.mu.Lock()
	never, hosts := c.neverProd, c.hosts
	c.mu.Unlock()
	if never == nil || !never() {
		return false
	}
	if r.host.Env == string(domain.EnvProd) {
		return true
	}
	if r.verified {
		return false
	}
	return t.keyID != "" && hosts != nil && hosts.KeyOnProd(t.keyID)
}

// enqueue takes the one prompt slot, waiting behind at most
// maxPendingConfirms-1 others; past that it fails at once.
func (c *Core) enqueue() (release func(), ok bool) {
	select {
	case c.pending <- struct{}{}:
	default:
		return nil, false
	}
	c.turn <- struct{}{}
	return func() {
		<-c.turn
		<-c.pending
	}, true
}

func (c *Core) ask(req ConfirmRequest) (Decision, string) {
	ctx, cancel := context.WithTimeout(context.Background(), c.confirmTimeout)
	defer cancel()
	d, err := c.conf.Confirm(ctx, req)
	switch {
	case ctx.Err() != nil:
		return Decision{}, "timed out"
	case err != nil:
		return Decision{}, err.Error()
	case !d.Allow:
		return Decision{}, "denied"
	}
	return d, ""
}

func (c *Core) event(t target, r signRequest) domain.AgentSignEvent {
	ev := domain.AgentSignEvent{
		KeyID: t.keyID, KeyName: t.name, Fingerprint: t.fp,
		ClientName: r.client.Name, ClientApp: r.client.App,
		ClientChain: strings.Join(r.client.Chain, " ← "), ClientPID: r.client.PID,
		InProcess: r.client.InProcess, Destination: r.host.Name, Forwarded: r.forwarded,
		CreatedAt: c.now(),
	}
	if r.client.InProcess {
		ev.ClientName, ev.ClientApp, ev.ClientChain = "Zish", "Zish", r.client.Purpose
	}
	return ev
}

func (c *Core) record(ev domain.AgentSignEvent) {
	if c.log != nil {
		c.log.Record(ev)
	}
}

// describeHost names the server behind a verified host key.
func (c *Core) describeHost(key ssh.PublicKey) Host {
	c.mu.Lock()
	hosts := c.hosts
	c.mu.Unlock()
	if hosts != nil {
		if h := hosts.Resolve(key); h.Name != "" {
			return h
		}
	}
	return Host{Name: "host key " + shortFingerprint(ssh.FingerprintSHA256(key))}
}
