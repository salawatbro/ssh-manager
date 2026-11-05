package launcher

import (
	"errors"
	"slices"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func TestSplitWords(t *testing.T) {
	cases := map[string][]string{
		"open -na MyTerm --args -e {script}": {"open", "-na", "MyTerm", "--args", "-e", "{script}"},
		"  a\t b  ":                          {"a", "b"},
		`'My Term' -e {script}`:              {"My Term", "-e", "{script}"},
		`"a \"b\" \\ \$x \` + "`" + `" c`:    {`a "b" \ $x ` + "`", "c"},
		`"keep \n literal"`:                  {`keep \n literal`},
		`a\ b c`:                             {"a b", "c"},
		`x'y'"z"`:                            {"xyz"},
		`''`:                                 {""},
		"$HOME ~/x $(id) `id` ; | &":         {"$HOME", "~/x", "$(id)", "`id`", ";", "|", "&"},
		"ünï -e {script}":                    {"ünï", "-e", "{script}"},
	}
	for in, want := range cases {
		got, err := splitWords(in)
		if err != nil || !slices.Equal(got, want) {
			t.Errorf("splitWords(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{`'open`, `"open`, `open \`, "a\nb", "a\x1bb"} {
		if _, err := splitWords(bad); err == nil {
			t.Errorf("splitWords(%q) accepted", bad)
		}
	}
}

func TestCustomCommand(t *testing.T) {
	got, err := CustomCommand(`open -na "My Term" --args --cmd={script} -e {script}`, scriptPath)
	want := []string{"open", "-na", "My Term", "--args", "--cmd=" + scriptPath, "-e", scriptPath}
	if err != nil || !slices.Equal(got, want) {
		t.Fatalf("got %q, %v", got, err)
	}
	// Shell syntax in the template stays literal argv: nothing runs a shell.
	got, _ = CustomCommand(`term -e {script}; rm -rf ~`, scriptPath)
	if !slices.Equal(got, []string{"term", "-e", scriptPath + ";", "rm", "-rf", "~"}) {
		t.Fatalf("got %q", got)
	}
	for _, tmpl := range []string{"", "   ", "open -na MyTerm", "open '{script}"} {
		_, err := CustomCommand(tmpl, scriptPath)
		var de *domain.Error
		if !errors.As(err, &de) || de.Code != domain.CodeTerminalLaunch {
			t.Errorf("CustomCommand(%q) err = %v", tmpl, err)
		}
	}
	if a := CustomAttempt([]string{"x"}); !a.KeepRunning || a.Wait <= 0 {
		t.Fatalf("custom attempt = %+v", a)
	}
}
