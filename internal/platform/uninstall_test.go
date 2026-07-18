package platform

import "testing"

// The go test binary is not inside a .app bundle, so MoveAppBundleToTrash must
// take the dev-guard no-op path — return nil and trash NOTHING. This is the
// safety guard that keeps `wails3 dev` (and every test run) from deleting an app.
func TestMoveAppBundleToTrashNoopForNonBundle(t *testing.T) {
	if err := MoveAppBundleToTrash(); err != nil {
		t.Fatalf("MoveAppBundleToTrash from a non-bundle binary = %v, want nil (no-op)", err)
	}
}
