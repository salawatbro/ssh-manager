package sshx

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

// CodeRequest is a single interactive prompt the server issued that the app
// could not auto-answer (no stored TOTP secret, or an unrecognised prompt).
type CodeRequest struct {
	RequestID  string `json:"requestID"`
	ServerName string `json:"serverName"`
	Prompt     string `json:"prompt"`
	Echo       bool   `json:"echo"` // whether the typed answer should be visible
}

// CodePrompter turns a blocking keyboard-interactive prompt into a UI ask.
// The service layer implements it (mirrors HostKeyPrompter).
type CodePrompter interface {
	// Prompt blocks until the user answers or the prompt times out.
	Prompt(req CodeRequest) (code string, err error)
}

// buildKIChallenge returns the ssh.KeyboardInteractiveChallenge used for the
// keyboard-interactive auth method appended to a TwoFactor server's
// ClientConfig (see client.go). For each question the server sends, it tries
// to auto-answer from creds before falling back to prompter for anything it
// cannot resolve on its own:
//   - a prompt containing "password" is answered from creds.Password, but
//     only when that password is actually set — an empty one falls through
//     rather than silently sending a blank answer.
//   - a prompt containing "verification" or "code" is answered with a live
//     TOTP code computed from creds.TOTPSecret, when one is stored. A
//     TOTPCode computation error (e.g. a malformed secret) falls through to
//     the prompter instead of failing the whole challenge.
//   - anything else (including a code/verification prompt with no stored
//     secret) goes to prompter.
//
// A server round with no questions at all (some servers send an
// instruction-only banner) returns ([]string{}, nil) without ever touching
// prompter. If prompter is nil and some question needs it, the challenge
// returns (nil, err) instead of panicking on the nil interface.
func buildKIChallenge(serverName string, creds Credentials, prompter CodePrompter) ssh.KeyboardInteractiveChallenge {
	return func(_ /* name */, _ /* instruction */ string, questions []string, echos []bool) ([]string, error) {
		if len(questions) == 0 {
			return []string{}, nil
		}
		answers := make([]string, 0, len(questions))
		for i, q := range questions {
			echo := false
			if i < len(echos) {
				echo = echos[i]
			}
			lower := strings.ToLower(q)
			var (
				answer string
				err    error
			)
			switch {
			case strings.Contains(lower, "password") && creds.Password != "":
				answer = creds.Password
			case strings.Contains(lower, "verification") || strings.Contains(lower, "code"):
				if creds.TOTPSecret != "" {
					if code, totpErr := domain.TOTPCode(creds.TOTPSecret, time.Now()); totpErr == nil {
						answer = code
						break
					}
					// TOTPCode errored (e.g. a malformed stored secret) —
					// fall through to the prompter below.
				}
				answer, err = askCodePrompter(prompter, serverName, q, echo)
			default:
				answer, err = askCodePrompter(prompter, serverName, q, echo)
			}
			if err != nil {
				return nil, err
			}
			answers = append(answers, answer)
		}
		return answers, nil
	}
}

// askCodePrompter asks prompter for a single question, turning a nil
// prompter into a clear coded error instead of a nil-interface panic.
func askCodePrompter(prompter CodePrompter, serverName, question string, echo bool) (string, error) {
	if prompter == nil {
		return "", fmt.Errorf("sshx: server asked %q but no code prompter is wired", question)
	}
	return prompter.Prompt(CodeRequest{
		RequestID:  uuid.NewString(),
		ServerName: serverName,
		Prompt:     question,
		Echo:       echo,
	})
}
