package agent

import (
	"errors"
	"fmt"
	"io/fs"
	"net"
	"os"
	"sync"
	"time"
)

// maxConns caps concurrent agent connections; more are closed at once.
const maxConns = 64

// ErrSocketInUse reports a live socket at the path: another agent serves it.
var ErrSocketInUse = errors.New("another process is serving the agent socket")

// Listener serves the Core on a unix socket to processes of the same user.
type Listener struct {
	core     *Core
	peer     func(*net.UnixConn) (uid, pid int, err error)
	info     func(pid int) ClientInfo
	uid      int
	maxConns int

	mu    sync.Mutex
	ln    *net.UnixListener
	path  string
	conns map[net.Conn]struct{}
	wg    sync.WaitGroup
}

// NewListener returns a stopped listener for core.
func NewListener(core *Core) *Listener {
	return &Listener{core: core, peer: peerCred, info: processInfo, uid: os.Getuid(), maxConns: maxConns}
}

// Start listens on path (0600). A stale socket of ours is removed first; a
// live one, or anything that is not our socket, is refused.
func (l *Listener) Start(path string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.ln != nil {
		return errors.New("agent is already running")
	}
	if err := clearStaleSocket(path); err != nil {
		return err
	}
	ln, err := net.ListenUnix("unix", &net.UnixAddr{Name: path, Net: "unix"})
	if err != nil {
		return err
	}
	if err := os.Chmod(path, 0o600); err != nil {
		_ = ln.Close()
		return err
	}
	ln.SetUnlinkOnClose(true)
	l.ln, l.path, l.conns = ln, path, map[net.Conn]struct{}{}
	l.wg.Add(1)
	go l.serve(ln)
	return nil
}

func clearStaleSocket(path string) error {
	fi, err := os.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if fi.Mode()&fs.ModeSocket == 0 || !ownedByMe(fi) {
		return fmt.Errorf("%s exists and is not a Zish socket", path)
	}
	if c, err := net.DialTimeout("unix", path, 300*time.Millisecond); err == nil {
		_ = c.Close()
		return ErrSocketInUse
	}
	return os.Remove(path)
}

// Stop closes the listener (unlinking the socket) and every live connection.
func (l *Listener) Stop() {
	l.mu.Lock()
	ln := l.ln
	l.ln = nil
	conns := l.conns
	l.conns = nil
	l.mu.Unlock()
	if ln == nil {
		return
	}
	_ = ln.Close()
	for c := range conns {
		_ = c.Close()
	}
	l.wg.Wait()
}

// Running reports whether the socket is being served.
func (l *Listener) Running() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.ln != nil
}

func (l *Listener) serve(ln *net.UnixListener) {
	defer l.wg.Done()
	for {
		c, err := ln.AcceptUnix()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return
			}
			time.Sleep(10 * time.Millisecond)
			continue
		}
		if !l.track(c) {
			_ = c.Close()
			continue
		}
		go l.handle(c)
	}
}

func (l *Listener) track(c net.Conn) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.conns == nil || len(l.conns) >= l.maxConns {
		return false
	}
	l.conns[c] = struct{}{}
	return true
}

// handle serves one connection. There is no idle deadline: ssh keeps the
// connection open for the whole session.
func (l *Listener) handle(c *net.UnixConn) {
	defer func() {
		_ = c.Close()
		l.mu.Lock()
		delete(l.conns, c)
		l.mu.Unlock()
	}()
	uid, pid, err := l.peer(c)
	if err != nil || uid != l.uid {
		return
	}
	_ = l.core.Serve(c, l.info(pid))
}
