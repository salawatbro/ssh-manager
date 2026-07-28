package service

import (
	"runtime"
	"testing"
)

func TestAppInfoServicePlatformReportsBuildTarget(t *testing.T) {
	got := NewAppInfoService().Platform()
	if got.OS != runtime.GOOS || got.Arch != runtime.GOARCH {
		t.Fatalf("Platform() = %+v, want %s/%s", got, runtime.GOOS, runtime.GOARCH)
	}
	if got.OS == "" || got.Arch == "" {
		t.Fatalf("Platform() returned an empty field: %+v", got)
	}
}
