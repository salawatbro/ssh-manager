//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework LocalAuthentication
#include <stdlib.h>
#include "biometric_native.h"
*/
import "C"

import (
	"context"
	"errors"
	"time"
	"unsafe"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/platform"
	"github.com/salawat/sshmgr/internal/service"
)

// agentConfirmer asks the user to approve one agent signature: Zish's
// approval window first, then Touch ID or the macOS password through
// LocalAuthentication. Without the window it is the plain system sheet.
type agentConfirmer struct {
	agents   *service.AgentService
	settings *service.SettingsService
}

func newAgentConfirmer(agents *service.AgentService, settings *service.SettingsService) agent.Confirmer {
	return &agentConfirmer{agents: agents, settings: settings}
}

func (c *agentConfirmer) Confirm(ctx context.Context, req agent.ConfirmRequest) (agent.Decision, error) {
	packaged := platform.RunningFromAppBundle()
	// While Zish is locked only device-owner authentication answers.
	if !req.Locked {
		d, err := service.AskApproval(ctx, c.agents, req, service.ApprovalOptions{
			Default: c.grantDefault(), TouchID: packaged, Show: showApprovalWindow, Hide: hideApprovalWindow,
		})
		switch {
		case errors.Is(err, service.ErrApprovalWindow):
		case err != nil || !d.Allow:
			return agent.Decision{}, err
		case !packaged:
			// An unsigned dev build cannot present LocalAuthentication.
			return d, nil
		default:
			ok, err := deviceOwnerAuth(ctx, agent.ApprovalReason(req, d.Length))
			if !ok {
				return agent.Decision{}, err
			}
			return d, nil
		}
	}
	reason := agent.ConfirmReason(req)
	if !packaged && !req.Locked {
		ok, err := devConfirmDialog(ctx, reason)
		return agent.Decision{Allow: ok, Length: agent.GrantOnce}, err
	}
	ok, err := deviceOwnerAuth(ctx, reason)
	return agent.Decision{Allow: ok, Length: agent.GrantOnce}, err
}

func (c *agentConfirmer) grantDefault() string {
	if s, err := c.settings.Get(); err == nil {
		return s.GrantDefault
	}
	return domain.GrantFor15Min
}

// deviceOwnerAuth runs Touch ID or the macOS password until ctx's deadline.
func deviceOwnerAuth(ctx context.Context, reason string) (bool, error) {
	secs := int(time.Until(deadlineOf(ctx)).Seconds())
	if secs < 1 {
		return false, ctx.Err()
	}
	cs := C.CString(reason)
	defer C.free(unsafe.Pointer(cs))
	return C.sshmgrDeviceOwnerAuthenticate(cs, C.int(secs)) == 1, nil
}

func deadlineOf(ctx context.Context) time.Time {
	if d, ok := ctx.Deadline(); ok {
		return d
	}
	return time.Now().Add(agent.ConfirmTimeout)
}
