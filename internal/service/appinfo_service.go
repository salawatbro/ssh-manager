package service

import "github.com/salawat/sshmgr/internal/platform"

// AppInfoService exposes read-only facts about the running binary.
//
// It is its own service rather than a method on SettingsService because
// SettingsService's contract is the single-row settings table. Platform facts
// are not settings, and hanging them there is how every future "app fact"
// would end up accumulating in the same place.
type AppInfoService struct{}

// NewAppInfoService constructs the service. It takes no dependencies because
// every fact it reports comes from the Go runtime itself, not from a store or
// repo.
func NewAppInfoService() *AppInfoService { return &AppInfoService{} }

// PlatformInfo is what the About screen renders beside the app version.
type PlatformInfo struct {
	OS   string `json:"os"`
	Arch string `json:"arch"`
}

// Platform reports the OS and architecture this binary was built for.
func (s *AppInfoService) Platform() PlatformInfo {
	goos, goarch := platform.Platform()
	return PlatformInfo{OS: goos, Arch: goarch}
}
