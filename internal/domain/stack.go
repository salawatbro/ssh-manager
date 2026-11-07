package domain

import (
	"strings"
	"time"
	"unicode/utf8"
)

// StepKind says what a stack step opens.
type StepKind string

// The step kinds: a saved tunnel started inside Zish, or a server opened in
// the terminal app.
const (
	StepTunnel StepKind = "tunnel"
	StepServer StepKind = "server"
)

// Placement is where a server step opens relative to the step before it.
type Placement string

// The placements. PlaceSplit needs iTerm2; other terminals open it as a tab.
const (
	PlaceTab    Placement = "tab"
	PlaceSplit  Placement = "split"
	PlaceWindow Placement = "window"
)

// MaxStackSteps caps the steps of one stack.
const MaxStackSteps = 16

// MaxStackDescriptionRunes caps Stack.Description.
const MaxStackDescriptionRunes = 200

// Stack opens several tunnels and servers in one go. Tunnels start first, then
// servers open in Position order. LastLaunchedAt and SortOrder are lifecycle
// fields: a form save never writes them.
type Stack struct {
	ID          string `gorm:"primaryKey;type:text" json:"id"`
	Name        string `gorm:"not null" json:"name"`
	Description string `gorm:"not null;default:''" json:"description"`
	Icon        string `gorm:"not null;default:''" json:"icon"`
	Color       string `gorm:"not null;default:''" json:"color"`
	// Shortcut is a global hot key in canonical form ("alt+cmd+1"), or "".
	Shortcut  string `gorm:"not null;default:''" json:"shortcut"`
	InMenuBar bool   `gorm:"not null;default:false" json:"inMenuBar"`
	// OneApproval asks once at launch and covers the stack's own signatures
	// for a short while (agent.LaunchWindow). The column default is false on
	// purpose: GORM skips a zero bool on insert and would store a true default.
	OneApproval    bool        `gorm:"not null;default:false" json:"oneApproval"`
	SortOrder      int         `gorm:"not null;default:0" json:"sortOrder"`
	LastLaunchedAt *time.Time  `json:"lastLaunchedAt"`
	Steps          []StackStep `gorm:"foreignKey:StackID;constraint:OnDelete:CASCADE" json:"steps"`
	CreatedAt      time.Time   `json:"createdAt"`
	UpdatedAt      time.Time   `json:"updatedAt"`
}

// StackStep is one tunnel or server of a stack. Its server or forward row
// cascades: deleting either removes the step, never leaving it dangling.
type StackStep struct {
	ID        string       `gorm:"primaryKey;type:text" json:"id"`
	StackID   string       `gorm:"not null;index" json:"stackId"`
	Position  int          `gorm:"not null;default:0" json:"position"`
	Kind      StepKind     `gorm:"not null" json:"kind"`
	ServerID  *string      `gorm:"index" json:"serverId"`
	Server    *Server      `gorm:"foreignKey:ServerID;constraint:OnDelete:CASCADE" json:"-"`
	ForwardID *string      `gorm:"index" json:"forwardId"`
	Forward   *PortForward `gorm:"foreignKey:ForwardID;constraint:OnDelete:CASCADE" json:"-"`
	Placement Placement    `gorm:"not null;default:''" json:"placement"`
	// RunCommand replaces the server's own run-after-connect line for this
	// step; "" keeps the server's.
	RunCommand string `gorm:"not null;default:''" json:"runCommand"`
}

// Validate normalises the stack and its steps in place and checks them.
// Whether a step's server or tunnel exists is the service's job.
func (s *Stack) Validate() error {
	s.Name = strings.TrimSpace(s.Name)
	s.Description = strings.TrimSpace(s.Description)
	if n := utf8.RuneCountInString(s.Name); n < 1 || n > 64 {
		return validationError("Name the stack (1 to 64 characters).")
	}
	if !utf8.ValidString(s.Description) || utf8.RuneCountInString(s.Description) > MaxStackDescriptionRunes {
		return validationError("The description must be at most 200 characters.")
	}
	if err := validateLook(&s.Icon, &s.Color); err != nil {
		return err
	}
	sc, err := ParseShortcut(s.Shortcut)
	if err != nil {
		return err
	}
	s.Shortcut = sc
	if len(s.Steps) > MaxStackSteps {
		return validationError("A stack can have at most 16 steps.")
	}
	tunnels := map[string]bool{}
	for i := range s.Steps {
		st := &s.Steps[i]
		st.Position = i
		if err := st.validate(); err != nil {
			return err
		}
		if st.Kind == StepTunnel {
			if tunnels[*st.ForwardID] {
				return validationError("A tunnel can be a step of a stack only once.")
			}
			tunnels[*st.ForwardID] = true
		}
	}
	return nil
}

func (st *StackStep) validate() error {
	st.RunCommand = strings.TrimSpace(st.RunCommand)
	switch st.Kind {
	case StepTunnel:
		if st.ForwardID == nil || strings.TrimSpace(*st.ForwardID) == "" {
			return validationError("Choose the tunnel this step starts.")
		}
		st.ServerID, st.Placement = nil, ""
		if st.RunCommand != "" {
			return validationError("A tunnel step has no command to run.")
		}
	case StepServer:
		if st.ServerID == nil || strings.TrimSpace(*st.ServerID) == "" {
			return validationError("Choose the server this step opens.")
		}
		st.ForwardID = nil
		switch st.Placement {
		case PlaceTab, PlaceSplit, PlaceWindow:
		case "":
			st.Placement = PlaceTab
		default:
			return validationError("A server opens in a tab, a split or a window.")
		}
		if err := validateRunAfterConnect(st.RunCommand); err != nil {
			return err
		}
	default:
		return validationError("A step is a server or a tunnel.")
	}
	return nil
}

// StepsOfKind returns the steps of one kind, in position order.
func (s *Stack) StepsOfKind(k StepKind) []StackStep {
	var out []StackStep
	for _, st := range s.Steps {
		if st.Kind == k {
			out = append(out, st)
		}
	}
	return out
}
