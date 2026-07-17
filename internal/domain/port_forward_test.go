package domain

import "testing"

func TestPortForwardValidate(t *testing.T) {
	base := func() PortForward {
		return PortForward{ServerID: "s1", Name: "db", Type: ForwardLocal,
			BindAddr: "127.0.0.1", BindPort: 5432, DestHost: "10.0.0.5", DestPort: 5432}
	}
	// base() returns a value, and Validate has a pointer receiver — a
	// function call result isn't addressable, so the call must go through a
	// local variable rather than base().Validate() directly.
	valid := base()
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid forward rejected: %v", err)
	}
	cases := map[string]func(*PortForward){
		"empty name":     func(f *PortForward) { f.Name = "" },
		"bad type":       func(f *PortForward) { f.Type = "X" }, // "D" is now a valid type (ForwardDynamic) — see TestPortForwardValidateDynamic
		"bindport 0":     func(f *PortForward) { f.BindPort = 0 },
		"bindport 70000": func(f *PortForward) { f.BindPort = 70000 },
		"destport 0":     func(f *PortForward) { f.DestPort = 0 },
		"empty desthost": func(f *PortForward) { f.DestHost = "" },
		"empty bindaddr": func(f *PortForward) { f.BindAddr = "" },
	}
	for name, mut := range cases {
		f := base()
		mut(&f)
		if err := f.Validate(); err == nil {
			t.Errorf("%s: expected validation error, got nil", name)
		}
	}
}

// TestPortForwardValidateDynamic covers the -D (dynamic/SOCKS5) forward
// type: unlike -L/-R, it carries no fixed destination (the SOCKS client
// negotiates one per proxied connection), so DestHost/DestPort must NOT be
// required for it — while -L/-R must still reject a missing destination.
func TestPortForwardValidateDynamic(t *testing.T) {
	dynamic := PortForward{
		ServerID: "s1", Name: "proxy", Type: ForwardDynamic,
		BindAddr: "127.0.0.1", BindPort: 1080,
		// DestHost/DestPort deliberately left zero-valued.
	}
	if err := dynamic.Validate(); err != nil {
		t.Fatalf("valid -D forward without dest rejected: %v", err)
	}

	local := PortForward{
		ServerID: "s1", Name: "db", Type: ForwardLocal,
		BindAddr: "127.0.0.1", BindPort: 5432,
		// No DestHost/DestPort: -L must still require them.
	}
	if err := local.Validate(); err == nil {
		t.Fatal("-L forward without dest unexpectedly accepted")
	}

	remote := PortForward{
		ServerID: "s1", Name: "tunnel", Type: ForwardRemote,
		BindAddr: "0.0.0.0", BindPort: 2222,
		// No DestHost/DestPort: -R must still require them.
	}
	if err := remote.Validate(); err == nil {
		t.Fatal("-R forward without dest unexpectedly accepted")
	}
}
