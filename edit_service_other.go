//go:build !darwin

package main

// EditService's platform actions are macOS-only; elsewhere it is a no-op so
// the rest of the app still builds and the binding still exists.
type EditService struct{}

// NewEditService returns the service.
func NewEditService() *EditService { return &EditService{} }

// Paste does nothing off macOS. There is no pasteboard-privacy prompt to work
// around there, and the frontend's clipboard path is the one that applies.
func (s *EditService) Paste() {}
