import { SftpService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { joinRemote, dirnameRemote } from '../lib/remotePath'
import { toastError } from './toasts'

type Side = 'local' | 'remote'

// The slice of the sftp store these mutations read and drive. Kept minimal (not
// the whole SftpState) so this module has no reason to import the store back.
interface Ctx {
  localCwd: string
  remoteCwd: string
  sessionId: string | null
  navLocal: (dir: string) => Promise<void>
  navRemote: (dir: string) => Promise<void>
}

// Shared body for every pane mutation: resolve the session (remote only) and the
// acting side's cwd, run the op, toast any failure, and refresh the side that
// changed. Refreshing the SAME directory keeps the selection (navLocal/navRemote
// only clear it on a real directory change), so a failed op does not also wipe
// what the user had picked.
async function mutate(get: () => Ctx, side: Side, op: (sessionID: string, cwd: string) => Promise<unknown>) {
  const s = get()
  const cwd = side === 'local' ? s.localCwd : s.remoteCwd
  try {
    if (side === 'remote' && !s.sessionId) throw new Error('This file session is no longer open.')
    await op(s.sessionId ?? '', cwd)
  } catch (e) {
    toastError(e instanceof Error ? e.message : String(e))
  }
  await (side === 'local' ? get().navLocal(get().localCwd) : get().navRemote(get().remoteCwd))
}

// The four file-manager mutations, side-aware: each dispatches to the remote
// SFTP session or the local filesystem. Split out of stores/sftp.ts to keep that
// file under the 250-line cap once both panes became writable.
export function fileMutations(get: () => Ctx) {
  return {
    mkdir: (side: Side, name: string) =>
      mutate(get, side, (sid, cwd) =>
        side === 'local' ? SftpService.MkdirLocal(joinRemote(cwd, name)) : SftpService.Mkdir(sid, joinRemote(cwd, name)),
      ),

    createFile: (side: Side, name: string) =>
      mutate(get, side, (sid, cwd) =>
        side === 'local'
          ? SftpService.CreateLocalFile(joinRemote(cwd, name))
          : SftpService.CreateFile(sid, joinRemote(cwd, name)),
      ),

    rename: (side: Side, oldPath: string, newName: string) =>
      mutate(get, side, (sid) => {
        const target = joinRemote(dirnameRemote(oldPath), newName)
        return side === 'local' ? SftpService.RenameLocal(oldPath, target) : SftpService.Rename(sid, oldPath, target)
      }),

    remove: (side: Side, paths: string[]) =>
      mutate(get, side, async (sid) => {
        // One call per path (no batch delete); a failure stops the run and the
        // refresh in mutate shows exactly what survived.
        for (const p of paths) {
          if (side === 'local') await SftpService.RemoveLocal(p)
          else await SftpService.Remove(sid, p)
        }
      }),
  }
}
