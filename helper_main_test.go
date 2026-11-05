package main

import "testing"

func TestDetectHelperMode(t *testing.T) {
	cases := []struct {
		args []string
		mode helperMode
		arg  string
	}{
		{nil, modeGUI, ""},
		{[]string{"/Applications/Zish.app/Contents/MacOS/sshmgr"}, modeGUI, ""},
		{[]string{"sshmgr", "-psn_0_12345"}, modeGUI, ""},
		{[]string{"/Users/me/Library/Application Support/SSHManager/run/zish-askpass", "root@h's password: "}, modeAskpass, "root@h's password: "},
		{[]string{"zish-askpass"}, modeAskpass, ""},
		{[]string{"sshmgr", "--askpass", "Password: "}, modeAskpass, "Password: "},
		{[]string{"sshmgr", "--connect", "abc"}, modeConnect, "abc"},
		{[]string{"sshmgr", "--connect"}, modeConnect, ""},
		{[]string{"sshmgr", "x", "--connect", "abc"}, modeGUI, ""},
		{[]string{"/tmp/zish-askpass-not", "p"}, modeGUI, ""},
	}
	for _, c := range cases {
		mode, arg := detectHelperMode(c.args)
		if mode != c.mode || arg != c.arg {
			t.Errorf("detectHelperMode(%q) = %v %q, want %v %q", c.args, mode, arg, c.mode, c.arg)
		}
	}
}
