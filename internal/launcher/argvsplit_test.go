package launcher

import "errors"

// opensshArgvSplit is a Go port of argv_split() from OpenSSH misc.c (8.7 and
// later), which ssh uses to split ssh_config lines and -o values. Tests use
// it to prove an encoded value comes back as exactly one, unchanged token.
func opensshArgvSplit(s string, terminateOnComment bool) ([]string, error) {
	var argv []string
	for i := 0; i < len(s); i++ {
		if s[i] == ' ' || s[i] == '\t' {
			continue
		}
		if terminateOnComment && s[i] == '#' {
			break
		}
		var quote byte
		var arg []byte
		for ; i < len(s); i++ {
			c := s[i]
			switch {
			case c == '\\':
				if i+1 < len(s) && (s[i+1] == '\'' || s[i+1] == '"' || s[i+1] == '\\' || (quote == 0 && s[i+1] == ' ')) {
					i++
					arg = append(arg, s[i])
				} else {
					arg = append(arg, c)
				}
			case quote == 0 && (c == ' ' || c == '\t'):
				goto done
			case quote == 0 && (c == '"' || c == '\''):
				quote = c
			case quote != 0 && c == quote:
				quote = 0
			default:
				arg = append(arg, c)
			}
		}
		if quote != 0 {
			return nil, errors.New("invalid quotes")
		}
	done:
		argv = append(argv, string(arg))
	}
	return argv, nil
}
