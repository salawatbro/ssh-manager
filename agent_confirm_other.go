//go:build !darwin

package main

import (
	"context"

	"github.com/salawat/sshmgr/internal/agent"
)

// agentConfirmer denies every request off macOS: there is no prompt.
type agentConfirmer struct{}

func (agentConfirmer) Confirm(context.Context, agent.ConfirmRequest) (bool, error) {
	return false, nil
}
