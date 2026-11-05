//go:build darwin

package main

import (
	"context"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// devConfirmDialog is the development-build stand-in for the Touch ID prompt:
// an Allow/Deny question.
func devConfirmDialog(ctx context.Context, reason string) (bool, error) {
	answer := make(chan bool, 1)
	d := application.Get().Dialog.Question().
		SetTitle("Zish agent").
		SetMessage("Zish wants to " + reason + ".")
	d.AddButton("Allow").OnClick(func() { answer <- true })
	deny := d.AddButton("Deny").OnClick(func() { answer <- false })
	d.SetDefaultButton(deny)
	d.SetCancelButton(deny)
	go d.Show()
	select {
	case ok := <-answer:
		return ok, nil
	case <-ctx.Done():
		return false, ctx.Err()
	}
}
