package service

import (
	"testing"

	"github.com/salawat/sshmgr/internal/secret"
)

func newLockSvc() (*LockService, *secret.Fake) {
	f := secret.NewFake()
	return NewLockService(f), f
}

func TestSetAndVerifyPin(t *testing.T) {
	svc, _ := newLockSvc()
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
	svc, _ := newLockSvc()
	for _, bad := range []string{"", "1234", "1234567", "12a456", "abcdef"} {
		if err := svc.SetPin(bad); err == nil {
			t.Errorf("SetPin(%q) = nil, want error", bad)
		}
	}
}

func TestChangeAndRemovePin(t *testing.T) {
	svc, _ := newLockSvc()
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
