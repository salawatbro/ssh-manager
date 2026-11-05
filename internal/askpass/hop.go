// Package askpass answers OpenSSH's SSH_ASKPASS prompts for connections Zish
// launched in an external terminal. The running app holds a Broker behind a
// control socket; the app's executable, started by ssh as the askpass program
// or by the launch script in connect mode, asks it over that socket.
package askpass

// LinkName is the basename of the RunDir symlink that ssh runs as SSH_ASKPASS.
// The executable recognises askpass mode by it, because ssh passes no flags.
const LinkName = "zish-askpass"

// Hop is one ssh connection in a launch, root first, target last. The flags
// say which stored secrets Zish may answer for it.
type Hop struct {
	ServerID   string
	User, Host string
	// KeyPath is the ~-expanded path exactly as ssh prints it in the
	// passphrase prompt; "" unless the hop authenticates with a key file.
	KeyPath    string
	Password   bool
	Passphrase bool
	TOTP       bool
}

func (h Hop) has(s slot) bool {
	switch s {
	case slotPassword:
		return h.Password
	case slotPassphrase:
		return h.Passphrase
	case slotTOTP:
		return h.TOTP
	}
	return false
}
