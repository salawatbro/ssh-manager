package service

import (
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

func newPinSvc() (*LockService, *secret.Fake) {
	f := secret.NewFake()
	return NewLockService(f, nil, nil, nil, nil), f
}

func TestSetAndVerifyPin(t *testing.T) {
	svc, _ := newPinSvc()
	if svc.HasPin() {
		t.Fatal("HasPin true before any SetPin")
	}
	if err := svc.SetPin("123456"); err != nil {
		t.Fatalf("SetPin: %v", err)
	}
	if !svc.HasPin() {
		t.Fatal("HasPin false after SetPin")
	}
	ok, err := svc.VerifyPin("123456")
	if err != nil || !ok {
		t.Fatalf("VerifyPin(correct) = %v, %v; want true, nil", ok, err)
	}
	ok, err = svc.VerifyPin("000000")
	if err != nil || ok {
		t.Fatalf("VerifyPin(wrong) = %v, %v; want false, nil", ok, err)
	}
}

func TestSetPinRejectsBadFormat(t *testing.T) {
	svc, _ := newPinSvc()
	for _, bad := range []string{"", "1234", "1234567", "12a456", "abcdef"} {
		if err := svc.SetPin(bad); err == nil {
			t.Errorf("SetPin(%q) = nil, want error", bad)
		}
	}
}

func TestChangeAndRemovePin(t *testing.T) {
	svc, _ := newPinSvc()
	if err := svc.SetPin("111111"); err != nil {
		t.Fatal(err)
	}
	if err := svc.ChangePin("999999", "222222"); err == nil {
		t.Error("ChangePin with wrong current = nil, want error")
	}
	if err := svc.ChangePin("111111", "222222"); err != nil {
		t.Fatalf("ChangePin: %v", err)
	}
	if ok, _ := svc.VerifyPin("222222"); !ok {
		t.Error("new PIN does not verify after ChangePin")
	}
	if err := svc.RemovePin("000000"); err == nil {
		t.Error("RemovePin with wrong current = nil, want error")
	}
	if err := svc.RemovePin("222222"); err != nil {
		t.Fatalf("RemovePin: %v", err)
	}
	if svc.HasPin() {
		t.Error("HasPin true after RemovePin")
	}
}

// TestResetAll exercises the forgot-PIN factory reset against a real
// in-memory-style DB. It deliberately includes a jump-host server (jumper
// references srv via JumpID) to prove the reset clears jump hosts too: a
// naive per-id Delete loop would fail on srv while jumper still references
// it via the jump_id NO ACTION foreign key, but the bulk DeleteAll used by
// ResetAll removes every row in one statement, so the constraint is
// satisfied at statement end.
func TestResetAll(t *testing.T) {
	db, err := store.Open(t.TempDir() + "/db.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	servers := store.NewServerRepo(db)
	settingsRepo := store.NewSettingsRepo(db)
	f := secret.NewFake()

	srv := &domain.Server{ID: "s1", Name: "web", Host: "example.com", Port: 22, User: "root", AuthType: domain.AuthPassword, Environment: domain.EnvNone}
	if err := servers.Create(srv); err != nil {
		t.Fatal(err)
	}
	jumper := &domain.Server{ID: "s2", Name: "via", Host: "b.example.com", Port: 22, User: "root", AuthType: domain.AuthPassword, Environment: domain.EnvNone, JumpID: &srv.ID}
	if err := servers.Create(jumper); err != nil {
		t.Fatal(err)
	}
	_ = f.SetPassword(srv.ID, "secret")
	_ = f.SetAppLockHash("some-hash")

	stacks := store.NewStackRepo(db)
	if err := stacks.Create(&domain.Stack{ID: "st", Name: "Both", Steps: []domain.StackStep{{Kind: domain.StepServer, ServerID: &srv.ID, Placement: domain.PlaceTab}}}); err != nil {
		t.Fatal(err)
	}

	svc := NewLockService(f, servers, settingsRepo, nil, nil)
	SetLockStacks(svc, stacks)
	if err := svc.ResetAll(); err != nil {
		t.Fatalf("ResetAll: %v", err)
	}
	if list, _ := stacks.List(); len(list) != 0 {
		t.Errorf("stacks after reset = %d, want 0", len(list))
	}

	if list, _ := servers.List(); len(list) != 0 {
		t.Errorf("servers after reset = %d, want 0", len(list))
	}
	if _, err := f.GetPassword(srv.ID); err != secret.ErrNotStored {
		t.Errorf("server secret after reset = %v, want ErrNotStored", err)
	}
	if svc.HasPin() {
		t.Error("HasPin true after ResetAll")
	}
	got, _ := settingsRepo.Get()
	if got.LockEnabled {
		t.Error("settings not reset to default (LockEnabled still true)")
	}
}

type fakeBio struct{ ok bool }

func (f fakeBio) Available() bool          { return true }
func (f fakeBio) Authenticate(string) bool { return f.ok }

func TestLockGateRunsListenersAndToggles(t *testing.T) {
	g := NewLockGate(false)
	fired := 0
	g.OnLock(func() { fired++ })
	g.Lock()
	g.Lock()
	if !g.Locked() || fired != 2 {
		t.Fatalf("locked=%v fired=%d", g.Locked(), fired)
	}
	g.Unlock()
	if g.Locked() {
		t.Fatal("still locked")
	}
	if !NewLockGate(true).Locked() {
		t.Fatal("NewLockGate(true) starts unlocked")
	}
}

func TestLockServiceLocksOnlyWithAPin(t *testing.T) {
	f := secret.NewFake()
	gate := NewLockGate(false)
	revoked := 0
	gate.OnLock(func() { revoked++ })
	svc := NewLockService(f, nil, nil, gate, nil)
	svc.Lock(LockReasonManual)
	if svc.IsLocked() || revoked != 0 {
		t.Fatal("locked without a PIN")
	}
	if err := svc.SetPin("123456"); err != nil {
		t.Fatal(err)
	}
	svc.Lock(LockReasonManual)
	if !svc.IsLocked() || revoked != 1 {
		t.Fatalf("locked=%v revoked=%d", svc.IsLocked(), revoked)
	}
	if ok, _ := svc.VerifyPin("000000"); ok || !svc.IsLocked() {
		t.Fatal("wrong PIN unlocked the gate")
	}
	if ok, _ := svc.VerifyPin("123456"); !ok || svc.IsLocked() {
		t.Fatal("right PIN did not unlock the gate")
	}
}

func TestLockServiceBootLockedAndBiometrics(t *testing.T) {
	gate := NewLockGate(true)
	svc := NewLockService(secret.NewFake(), nil, nil, gate, fakeBio{ok: false})
	if !svc.IsLocked() {
		t.Fatal("boot lock lost")
	}
	if svc.UnlockWithBiometrics("Unlock Zish") || !svc.IsLocked() {
		t.Fatal("failed Touch ID unlocked")
	}
	svc = NewLockService(secret.NewFake(), nil, nil, gate, fakeBio{ok: true})
	if !svc.UnlockWithBiometrics("Unlock Zish") || svc.IsLocked() {
		t.Fatal("Touch ID did not unlock")
	}
	if NewLockService(secret.NewFake(), nil, nil, NewLockGate(true), nil).UnlockWithBiometrics("x") {
		t.Fatal("unlocked without biometrics")
	}
}

func TestLockServiceStatusKeepsTheFirstReason(t *testing.T) {
	svc, _ := newPinSvc()
	if st := svc.Status(); st.Locked || st.Reason != "" || st.Since != 0 {
		t.Fatalf("unlocked status = %+v", st)
	}
	if err := svc.SetPin("123456"); err != nil {
		t.Fatal(err)
	}
	svc.Lock(LockReasonIdle)
	first := svc.Status()
	if !first.Locked || first.Reason != LockReasonIdle || first.Since == 0 {
		t.Fatalf("idle status = %+v", first)
	}
	svc.Lock(LockReasonManual)
	if st := svc.Status(); st.Reason != LockReasonIdle || st.Since != first.Since {
		t.Fatalf("second lock replaced the first: %+v", st)
	}
	if ok, _ := svc.VerifyPin("123456"); !ok {
		t.Fatal("unlock failed")
	}
	// The frontend cannot claim the backend-only reasons.
	svc.Lock(LockReasonSleep)
	if st := svc.Status(); st.Reason != LockReasonManual {
		t.Fatalf("frontend sleep reason = %+v", st)
	}
	boot := NewLockService(secret.NewFake(), nil, nil, NewLockGate(true), nil)
	if st := boot.Status(); !st.Locked || st.Reason != LockReasonLaunch {
		t.Fatalf("boot status = %+v", st)
	}
}

func TestLockForSleepFollowsSettings(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	settings := store.NewSettingsRepo(db)
	f := secret.NewFake()
	svc := NewLockService(f, nil, settings, NewLockGate(false), nil)
	if err := svc.SetPin("123456"); err != nil {
		t.Fatal(err)
	}
	save := func(lockEnabled, onSleep bool) {
		t.Helper()
		s, err := settings.Get()
		if err != nil {
			t.Fatal(err)
		}
		s.LockEnabled, s.LockOnSleep = lockEnabled, onSleep
		if err := settings.Save(s); err != nil {
			t.Fatal(err)
		}
	}

	save(false, true)
	LockForSleep(svc)
	if svc.IsLocked() {
		t.Fatal("locked on sleep with Require unlock off")
	}
	save(true, false)
	LockForSleep(svc)
	if svc.IsLocked() {
		t.Fatal("locked on sleep with Lock on sleep off")
	}
	save(true, true)
	LockForSleep(svc)
	if st := svc.Status(); !st.Locked || st.Reason != LockReasonSleep {
		t.Fatalf("sleep status = %+v", st)
	}
	if err := f.DeleteAppLockHash(); err != nil {
		t.Fatal(err)
	}
	if ok, _ := svc.VerifyPin("123456"); ok {
		t.Fatal("verified a deleted PIN")
	}
	svc.gate.Unlock()
	LockForSleep(svc)
	if svc.IsLocked() {
		t.Fatal("locked on sleep without a PIN")
	}
}
