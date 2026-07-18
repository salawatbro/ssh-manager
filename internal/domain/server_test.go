package domain

import "testing"

// TwoFactor must default to false for a zero-value Server (e.g. a struct
// literal built without the field, or a row read before the column
// existed) so AutoMigrate's NOT NULL DEFAULT false backfill and Go's own
// zero value agree.
func TestServerZeroValueTwoFactorDefaultsFalse(t *testing.T) {
	var s Server
	if s.TwoFactor {
		t.Fatal("zero-value Server.TwoFactor = true, want false")
	}
}
