package agent

import "testing"

func TestHolderOf(t *testing.T) {
	const (
		claudeCode = "/Users/u/Library/Application Support/Claude/claude-code/2.1.321/x/claude.app/Contents/MacOS/claude"
		claudeApp  = "/Applications/Claude.app/Contents/MacOS/Claude"
		disclaimer = "/Applications/Claude.app/Contents/Helpers/disclaimer"
		warp       = "/Applications/Warp.app/Contents/MacOS/stable"
		foo        = "/Applications/Foo.app/Contents/MacOS/foo"
	)
	p := func(pid int, path string) proc { return proc{pid: pid, start: int64(pid) * 10, name: path, path: path} }
	tests := []struct {
		name   string
		procs  []proc
		at     int
		holder string
	}{
		{"every Claude Code session shares the Claude app", []proc{
			p(10, "/usr/bin/ssh-keygen"), p(11, "/usr/bin/git"), p(12, "/bin/zsh"),
			p(13, claudeCode), p(14, disclaimer), p(15, claudeApp),
		}, 5, "Claude"},
		{"a terminal holds what runs in its shells", []proc{
			p(20, "/usr/bin/ssh"), p(21, "/usr/bin/git"), p(22, "/bin/zsh"), p(23, warp), p(24, warp),
		}, 4, "Warp"},
		{"an app started from a shell is its own holder", []proc{
			p(30, "/usr/bin/ssh"), p(31, foo), p(32, "/bin/zsh"), p(33, warp),
		}, 1, "Foo"},
		{"no app: the outermost ancestor", []proc{
			p(40, "/usr/bin/ssh"), p(41, "/bin/zsh"), p(42, "/usr/sbin/sshd"),
		}, 2, "/usr/sbin/sshd"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at, h := holderOf(tt.procs)
			want := tt.procs[tt.at]
			if at != tt.at || h.PID != want.pid || h.Start != want.start || h.Name != tt.holder {
				t.Fatalf("holderOf = %d %+v, want %d pid %d %q", at, h, tt.at, want.pid, tt.holder)
			}
		})
	}
}
