module github.com/salawat/sshmgr

go 1.26.0

// Floor, not a preference. go1.26.9 and earlier ship stdlib vulnerabilities
// that govulncheck fails the phase gate on — among them GO-2026-4971, a Dial
// panic on a NUL byte on Windows, which is a platform we ship (NFR-03), and
// GO-2026-6809 in crypto/x509. All are fixed by go1.26.10; none require a code
// change. CI installs the latest 1.26.x, which satisfies this; the directive is
// what stops a developer's older local toolchain from quietly building a
// vulnerable binary.
toolchain go1.26.10

require (
	github.com/glebarez/sqlite v1.11.0
	github.com/google/uuid v1.6.0
	github.com/skeema/knownhosts v1.3.2
	github.com/wailsapp/wails/v3 v3.1.0
	// zalando/go-keyring: floor v0.2.0. Below that, Set() puts the secret in
	// the argv of `/usr/bin/security` (ps-readable — SEC-06 breach). v0.2.0+
	// writes it via stdin instead. Verified by reading the vendored source and
	// catching the process argv over 400 writes. Do not downgrade.
	github.com/zalando/go-keyring v0.2.8
	golang.org/x/crypto v0.57.0
	golang.org/x/sys v0.48.0
	golang.org/x/term v0.46.0
	gorm.io/gorm v1.31.2
)

require github.com/Microsoft/go-winio v0.6.2

require (
	git.sr.ht/~jackmordaunt/go-toast/v2 v2.0.3 // indirect
	github.com/coder/websocket v1.8.14 // indirect
	github.com/danieljoos/wincred v1.2.3 // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/ebitengine/purego v0.11.1 // indirect
	github.com/glebarez/go-sqlite v1.21.2 // indirect
	github.com/go-ole/go-ole v1.3.0 // indirect
	github.com/godbus/dbus/v5 v5.2.2 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/ncruces/go-strftime v1.0.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/exp v0.0.0-20260410095643-746e56fc9e2f // indirect
	golang.org/x/text v0.42.0 // indirect
	modernc.org/libc v1.67.6 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.11.0 // indirect
	modernc.org/sqlite v1.44.3 // indirect
)
