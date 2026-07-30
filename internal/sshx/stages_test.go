package sshx

import (
	"context"
	"testing"
)

func TestStageContext(t *testing.T) {
	base := context.Background()
	if stagesActive(base) {
		t.Fatal("a bare context should have no stage reporter")
	}
	// emitStage on a context with no reporter is a safe no-op.
	emitStage(base, "h", StageResolve)

	var got [][2]string
	ctx := WithStages(base, func(host, stage string) { got = append(got, [2]string{host, stage}) })
	if !stagesActive(ctx) {
		t.Fatal("stagesActive should be true once a reporter is set")
	}
	emitStage(ctx, "example.com", StageResolve)
	emitStage(ctx, "example.com", StageTCP)

	// A nil reporter (used to silence non-target jump hops) disables reporting.
	silenced := WithStages(ctx, nil)
	if stagesActive(silenced) {
		t.Fatal("a nil reporter should read as inactive")
	}
	emitStage(silenced, "jump", StageTCP)

	if len(got) != 2 || got[0] != [2]string{"example.com", "resolve"} || got[1] != [2]string{"example.com", "tcp"} {
		t.Fatalf("stages = %v, want the two example.com stages only", got)
	}
}
