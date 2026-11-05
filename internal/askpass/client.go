package askpass

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"net"
	"time"
)

// ControlSocketName is the control socket's file name in RunDir.
const ControlSocketName = "control.sock"

var (
	errNotRunning = errors.New("zish is not running")
	errBadReply   = errors.New("unexpected reply from zish")
)

// exchange sends one request and decodes one reply line.
func exchange(sockPath string, req Request, reply any, timeout time.Duration) error {
	c, err := net.DialTimeout("unix", sockPath, timeout)
	if err != nil {
		return errors.Join(errNotRunning, err)
	}
	defer func() { _ = c.Close() }()
	_ = c.SetDeadline(time.Now().Add(timeout))
	if err := writeJSON(c, req); err != nil {
		return errors.Join(errBadReply, err)
	}
	line, err := bufio.NewReader(io.LimitReader(c, maxReplyBytes)).ReadBytes('\n')
	if err != nil {
		return errors.Join(errBadReply, err)
	}
	if err := json.Unmarshal(line, reply); err != nil {
		return errors.Join(errBadReply, err)
	}
	return nil
}
