//go:build !darwin

package main

import (
	"context"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/service"
)

// agentConfirmer denies every request off macOS: there is no prompt.
type agentConfirmer struct{}

func newAgentConfirmer(*service.AgentService, *service.SettingsService) agent.Confirmer {
	return agentConfirmer{}
}

func (agentConfirmer) Confirm(context.Context, agent.ConfirmRequest) (agent.Decision, error) {
	return agent.Decision{}, nil
}
