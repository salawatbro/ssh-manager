package service

import (
	"encoding/json"
	"errors"

	"github.com/salawat/sshmgr/internal/domain"
)

// MarshalError is wired into application.Options.MarshalError so a
// *domain.Error's stable Code survives the binding boundary.
//
// Measured against wails alpha2.117: the default marshaller does
// json.Marshal(&err), which serialises a *domain.Error's json tags
// intact — but ONLY when the returned error IS a *domain.Error. The moment
// a service wraps it (fmt.Errorf("...: %w", domErr)), the default produces
// "{}" and the code is lost, because json.Marshal(&err) sees the wrapper's
// unexported fields. Host-key modals and TestConnection switch on the code,
// so it must survive the wrap. This digs the *domain.Error out with
// errors.As and marshals THAT; a non-domain error returns nil, which Wails
// treats as "fall back to the default marshaller".
//
// Contract (application_options.go): MarshalError is not allowed to fail,
// may return nil to fall back, and any non-nil result must be valid JSON.
func MarshalError(err error) []byte {
	var de *domain.Error
	if errors.As(err, &de) {
		b, jsonErr := json.Marshal(de)
		if jsonErr != nil {
			return nil // fall back to the default marshaller
		}
		return b
	}
	return nil
}
