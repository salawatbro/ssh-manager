// Destination host/port fields for a Local (-L) or Remote (-R) forward,
// split out of ForwardForm to keep that file under the 200-line cap. Dynamic
// (-D) forwards don't render this — ForwardForm shows a SOCKS5 hint instead,
// since a -D forward negotiates its destination per-connection rather than
// carrying a fixed one (mirrors domain.PortForward's DestHost/DestPort).
interface Props {
  field: string
  label: string
  destHost: string
  setDestHost: (v: string) => void
  destPort: number | ''
  setDestPort: (v: number | '') => void
}

export function DestFields({ field, label, destHost, setDestHost, destPort, setDestPort }: Props) {
  return (
    <div className="flex gap-[6px]">
      <div className="flex flex-[2] flex-col gap-[4px]">
        <span className={label}>Destination host</span>
        <input
          className={`${field} font-mono`}
          value={destHost}
          onChange={(e) => setDestHost(e.target.value)}
        />
      </div>
      <div className="flex flex-1 flex-col gap-[4px]">
        <span className={label}>Destination port</span>
        <input
          className={`${field} font-mono`}
          inputMode="numeric"
          value={destPort}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            setDestPort(v === '' ? '' : Number(v))
          }}
        />
      </div>
    </div>
  )
}
