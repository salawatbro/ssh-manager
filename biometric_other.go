//go:build !darwin

package main

// BiometricService is macOS-only; elsewhere it is a no-op so the app still
// builds and the binding still exists (Available() false → PIN-only UI).
type BiometricService struct{}

// NewBiometricService returns the service.
func NewBiometricService() *BiometricService { return &BiometricService{} }

// Available is always false off macOS.
func (s *BiometricService) Available() bool { return false }

// Authenticate always fails off macOS.
func (s *BiometricService) Authenticate(reason string) bool { return false }
