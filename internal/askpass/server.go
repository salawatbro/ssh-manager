package askpass

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"os"
	"sync"
	"time"
)

// Handler is what the control socket dispatches to; *Broker implements it.
type Handler interface {
	// RedeemFrom gets the peer's pid (0 if unknown) for Launch.OnRedeem.
	RedeemFrom(launchToken string, pid int) (Redeemed, error)
	Answer(askToken, prompt, hint string) Reply
}

// Server serves the control socket: one JSON request per connection, from
// processes of the same user only.
type Server struct {
	h              Handler
	peerUID        func(*net.UnixConn) (int, error)
	peerPID        func(*net.UnixConn) int
	uid            int
	requestTimeout time.Duration
	totalTimeout   time.Duration

	mu sync.Mutex
	ln *net.UnixListener
	wg sync.WaitGroup
}

// NewServer returns a stopped server.
func NewServer(h Handler) *Server {
	return &Server{h: h, peerUID: peerUID, peerPID: peerPID, uid: os.Getuid(), requestTimeout: requestTimeout, totalTimeout: totalTimeout}
}

// Start listens on path. A stale socket of ours is replaced; anything else at
// path is refused.
func (s *Server) Start(path string) error {
	if fi, err := os.Lstat(path); err == nil {
		if fi.Mode()&fs.ModeSocket == 0 || !ownedByMe(fi) {
			return fmt.Errorf("%s exists and is not a Zish socket", path)
		}
		if err := os.Remove(path); err != nil {
			return err
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
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
	s.mu.Lock()
	s.ln = ln
	s.mu.Unlock()
	s.wg.Add(1)
	go s.serve(ln)
	return nil
}

// Stop closes the listener, removes the socket and waits for open requests.
func (s *Server) Stop() {
	s.mu.Lock()
	ln := s.ln
	s.ln = nil
	s.mu.Unlock()
	if ln != nil {
		_ = ln.Close()
	}
	s.wg.Wait()
}

func (s *Server) serve(ln *net.UnixListener) {
	defer s.wg.Done()
	for {
		c, err := ln.AcceptUnix()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return
			}
			time.Sleep(10 * time.Millisecond)
			continue
		}
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			defer func() { _ = c.Close() }()
			s.handle(c)
		}()
	}
}

func (s *Server) handle(c *net.UnixConn) {
	if uid, err := s.peerUID(c); err != nil || uid != s.uid {
		return
	}
	start := time.Now()
	_ = c.SetDeadline(start.Add(s.totalTimeout))
	_ = c.SetReadDeadline(start.Add(s.requestTimeout))
	line, err := bufio.NewReader(io.LimitReader(c, MaxRequestBytes+1)).ReadBytes('\n')
	if err != nil || len(line) > MaxRequestBytes {
		return
	}
	_ = c.SetReadDeadline(start.Add(s.totalTimeout))
	var req Request
	if err := json.Unmarshal(line, &req); err != nil || req.V != ProtoVersion {
		_ = writeJSON(c, RedeemReply{Code: CodeBadRequest, Message: "unsupported request"})
		return
	}
	switch req.Op {
	case OpRedeem:
		r, err := s.h.RedeemFrom(req.Token, s.peerPID(c))
		if err != nil {
			_ = writeJSON(c, RedeemReply{Code: CodeExpired, Message: err.Error()})
			return
		}
		_ = writeJSON(c, RedeemReply{OK: true, Argv: r.Argv, Env: r.Env, Title: r.Title})
	case OpAsk:
		_ = writeJSON(c, s.h.Answer(req.Token, req.Prompt, req.Hint))
	default:
		_ = writeJSON(c, RedeemReply{Code: CodeBadRequest, Message: "unknown op"})
	}
}

func writeJSON(w io.Writer, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = w.Write(append(b, '\n'))
	return err
}
