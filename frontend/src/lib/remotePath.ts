// Remote paths (SFTP) are always POSIX, regardless of the local OS the app
// runs on — these join/split on '/' unconditionally rather than relying on
// any local path lib. Used by stores/sftp.ts's mkdir/rename.
export function joinRemote(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`
}

export function dirnameRemote(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx > 0 ? path.slice(0, idx) : '/'
}
