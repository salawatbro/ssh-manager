package launcher

import (
	"slices"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func TestBuildPlanRunAfterConnect(t *testing.T) {
	target := srv("t", "root", "db.internal", 22, domain.AuthAgent, "")
	plain, err := BuildPlan([]domain.Server{target}, Options{}, "")
	if err != nil {
		t.Fatal(err)
	}

	target.RunAfterConnect = `cd /srv/web && echo "$(hostname)"; ls *`
	p, err := BuildPlan([]domain.Server{target}, Options{}, "")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{SSHPath, "-p", "22", "-l", "root", "-t", "--", "db.internal",
		"cd /srv/web && echo \"$(hostname)\"; ls *\nexec \"$SHELL\" -l"}
	if !slices.Equal(p.Argv, want) {
		t.Fatalf("argv = %q\nwant   %q", p.Argv, want)
	}
	if want := []string{SSHPath, "-p", "22", "-l", "root", "--", "db.internal"}; !slices.Equal(plain.Argv, want) {
		t.Fatalf("argv without a command changed: %q", plain.Argv)
	}
}

// Only the target's command runs; a jump hop's is ignored.
func TestBuildPlanRunAfterConnectThroughJumps(t *testing.T) {
	jump := srv("j", "ops", "10.0.0.1", 22, domain.AuthAgent, "")
	jump.RunAfterConnect = "touch /tmp/jump-ran"
	target := srv("t", "root", "db.internal", 22, domain.AuthAgent, "")

	p, err := BuildPlan([]domain.Server{jump, target}, Options{}, cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(p.Argv, "-t") || p.Argv[len(p.Argv)-1] != "db.internal" {
		t.Fatalf("jump hop's command leaked into argv: %q", p.Argv)
	}

	target.RunAfterConnect = "htop"
	p, err = BuildPlan([]domain.Server{jump, target}, Options{}, cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	n := len(p.Argv)
	if p.Argv[n-4] != "-t" || p.Argv[n-3] != "--" || p.Argv[n-2] != "db.internal" || p.Argv[n-1] != "htop"+execLoginShell {
		t.Fatalf("argv tail = %q", p.Argv[n-6:])
	}
	for _, a := range p.Argv {
		if a == "touch /tmp/jump-ran" || a == "touch /tmp/jump-ran"+execLoginShell {
			t.Fatalf("jump hop's command in argv: %q", p.Argv)
		}
	}
}

// A command starting with '-' sits after "--" and the host, so ssh never reads
// it as an option; a control character is refused even if validation was skipped.
func TestBuildPlanRunAfterConnectEdgeCases(t *testing.T) {
	target := srv("t", "root", "db.internal", 22, domain.AuthAgent, "")
	target.RunAfterConnect = "-oProxyCommand=touch /tmp/x"
	p, err := BuildPlan([]domain.Server{target}, Options{}, "")
	if err != nil {
		t.Fatal(err)
	}
	if i := slices.Index(p.Argv, "--"); p.Argv[i+1] != "db.internal" || p.Argv[i+2] != target.RunAfterConnect+execLoginShell {
		t.Fatalf("argv = %q", p.Argv)
	}

	target.RunAfterConnect = "ls\nrm -rf ~"
	if _, err := BuildPlan([]domain.Server{target}, Options{}, ""); !isUnsafe(err) {
		t.Fatalf("control character: err = %v", err)
	}
}
