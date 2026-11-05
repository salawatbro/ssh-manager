package agent

import (
	"crypto/rand"
	"errors"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

func signDirect(f *fixture, pub ssh.PublicKey) error {
	_, err := f.core.sign(signRequest{pub: pub, data: []byte("d"), client: ClientInfo{Name: "ssh", App: "Terminal"}})
	return err
}

func TestPolicyRequireConfirm(t *testing.T) {
	f := newFixture(t)
	confirmPub := f.keys.add(t, "k1", "work", newEd25519(t), true)
	plainPub := f.keys.add(t, "k2", "ci", newEd25519(t), false)

	if err := signDirect(f, confirmPub); err != nil {
		t.Fatal(err)
	}
	reqs := f.conf.requests()
	if len(reqs) != 1 || reqs[0].KeyName != "work" || reqs[0].Fingerprint != ssh.FingerprintSHA256(confirmPub) || reqs[0].Client.App != "Terminal" || reqs[0].Locked {
		t.Fatalf("confirm request = %+v", reqs)
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignConfirmed {
		t.Fatalf("outcome = %q", ev.Outcome)
	}

	f.conf.answer = false
	if err := signDirect(f, confirmPub); err == nil {
		t.Fatal("signed after a denial")
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignDenied || ev.Detail != "denied" {
		t.Fatalf("event = %+v", ev)
	}

	if err := signDirect(f, plainPub); err != nil {
		t.Fatal(err)
	}
	if len(f.conf.requests()) != 2 {
		t.Fatal("a no-confirm key prompted")
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignAllowed {
		t.Fatalf("outcome = %q", ev.Outcome)
	}
}

func TestPolicyAppLocked(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "ci", newEd25519(t), false)
	f.lock.v.Store(true)

	f.conf.answer = false
	if err := signDirect(f, pub); err == nil {
		t.Fatal("signed while the app is locked without approval")
	}
	if reqs := f.conf.requests(); len(reqs) != 1 || !reqs[0].Locked {
		t.Fatalf("locked prompt = %+v", reqs)
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignLocked {
		t.Fatalf("outcome = %q", ev.Outcome)
	}

	f.conf.answer = true
	for i := 0; i < 2; i++ {
		if err := signDirect(f, pub); err != nil {
			t.Fatal(err)
		}
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignConfirmed {
		t.Fatalf("outcome = %q", ev.Outcome)
	}
	if got := f.keys.loadCount(); got != 2 {
		t.Fatalf("signer cached while locked: %d loads for 2 signs", got)
	}
}

func TestPolicyNoConfirmerDenies(t *testing.T) {
	keys := newMemKeys()
	pub := keys.add(t, "k1", "work", newEd25519(t), true)
	core := NewCore(keys, nil, nil, nil, nil)
	if _, err := core.sign(signRequest{pub: pub, data: []byte("d")}); err == nil {
		t.Fatal("confirm key signed with no confirmer")
	}
}

func TestPolicyQueueCap(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "work", newEd25519(t), true)
	f.conf.release = make(chan struct{})
	f.conf.started = make(chan struct{}, maxPendingConfirms)

	var wg sync.WaitGroup
	errs := make(chan error, maxPendingConfirms)
	for i := 0; i < maxPendingConfirms; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- signDirect(f, pub) }()
	}
	<-f.conf.started // the first prompt is showing
	deadline := time.Now().Add(5 * time.Second)
	for len(f.core.pending) < maxPendingConfirms {
		if time.Now().After(deadline) {
			t.Fatalf("only %d pending", len(f.core.pending))
		}
		time.Sleep(time.Millisecond)
	}
	start := time.Now()
	if err := signDirect(f, pub); err == nil {
		t.Fatal("ninth request was not denied")
	}
	if time.Since(start) > time.Second {
		t.Fatal("ninth request waited instead of failing fast")
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignDenied || ev.Detail != "busy" {
		t.Fatalf("event = %+v", ev)
	}
	close(f.conf.release)
	go func() {
		for range f.conf.started { //nolint:revive // drain the remaining prompt starts
		}
	}()
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("queued request failed: %v", err)
		}
	}
}

func TestPolicyConfirmTimeout(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "work", newEd25519(t), true)
	f.core.confirmTimeout = 30 * time.Millisecond
	f.conf.release = make(chan struct{})
	if err := signDirect(f, pub); err == nil {
		t.Fatal("signed after the prompt timed out")
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignDenied || ev.Detail != "timed out" {
		t.Fatalf("event = %+v", ev)
	}
}

func TestCacheAndInvalidate(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "ci", newEd25519(t), false)
	for i := 0; i < 3; i++ {
		if err := signDirect(f, pub); err != nil {
			t.Fatal(err)
		}
	}
	if got := f.keys.loadCount(); got != 1 {
		t.Fatalf("loads = %d, want 1 (cached)", got)
	}
	f.core.Invalidate()
	if err := signDirect(f, pub); err != nil {
		t.Fatal(err)
	}
	if got := f.keys.loadCount(); got != 2 {
		t.Fatalf("loads after Invalidate = %d, want 2", got)
	}
	f.core.Forget("k1")
	f.keys.drop("k1")
	if err := signDirect(f, pub); !errors.Is(err, ErrKeyMissing) {
		t.Fatalf("missing Keychain item = %v", err)
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignError {
		t.Fatalf("outcome = %q", ev.Outcome)
	}
}

func TestInvalidateDropsTempKeys(t *testing.T) {
	f := newFixture(t)
	changes := 0
	f.core.OnChange(func() { changes++ })
	if err := f.core.addTemp(tempAdded(t)); err != nil {
		t.Fatal(err)
	}
	f.core.Invalidate()
	if _, temp := f.core.Snapshot(); len(temp) != 0 {
		t.Fatalf("temp keys survived: %d", len(temp))
	}
	if changes != 2 {
		t.Fatalf("OnChange ran %d times, want 2", changes)
	}
}

func TestInProcessSigner(t *testing.T) {
	f := newFixture(t)
	f.keys.add(t, "k-rsa", "deploy", newRSA(t), true)
	s, err := f.core.Signer("k-rsa", ClientInfo{Purpose: "test connection", Target: Host{Name: "prod-db"}})
	if err != nil {
		t.Fatal(err)
	}
	ms, ok := s.(ssh.MultiAlgorithmSigner)
	if !ok || ms.Algorithms()[0] != ssh.KeyAlgoRSASHA512 {
		t.Fatalf("not a multi-algorithm RSA signer: %v", ok)
	}
	sig, err := ms.SignWithAlgorithm(rand.Reader, []byte("d"), ssh.KeyAlgoRSASHA256)
	if err != nil || sig.Format != ssh.KeyAlgoRSASHA256 {
		t.Fatalf("SignWithAlgorithm = %v, %v", sig, err)
	}
	verify(t, s.PublicKey(), []byte("d"), sig)
	req := f.conf.requests()[0]
	if !req.Client.InProcess || ConfirmReason(req) != `use the SSH key "deploy" for Zish test connection → prod-db` {
		t.Fatalf("in-process prompt = %q", ConfirmReason(req))
	}
	ev := f.log.last(t)
	if !ev.InProcess || ev.ClientName != "Zish" || ev.Destination != "prod-db" || ev.ClientChain != "test connection" {
		t.Fatalf("event = %+v", ev)
	}
	if _, err := ms.SignWithAlgorithm(rand.Reader, []byte("d"), ssh.KeyAlgoED25519); err == nil {
		t.Fatal("RSA key signed as ed25519")
	}
	if _, err := f.core.Signer("nope", ClientInfo{}); !errors.Is(err, ErrKeyMissing) {
		t.Fatalf("unknown key = %v", err)
	}
}

func TestLabelSanitises(t *testing.T) {
	long := ""
	for i := 0; i < 80; i++ {
		long += "x"
	}
	cases := map[string]string{
		"work":             "work",
		"a\"b\x1b[31m":     "ab[31m",
		"  two   words \n": "two words",
		long:               long[:63] + "…",
		"line separator":   "line separator",
	}
	for in, want := range cases {
		if got := Label(in); got != want {
			t.Errorf("Label(%q) = %q, want %q", in, got, want)
		}
	}
	if got := ConfirmReason(ConfirmRequest{KeyName: "k", Client: ClientInfo{Name: "ssh", App: "Ghostty"}}); got != `use the SSH key "k" for ssh in Ghostty` {
		t.Fatalf("reason = %q", got)
	}
	if got := ConfirmReason(ConfirmRequest{KeyName: "k"}); got != `use the SSH key "k" for an unknown process` {
		t.Fatalf("reason = %q", got)
	}
}
