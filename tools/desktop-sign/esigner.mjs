// electron-builder signing hook (electron-builder.yml win.signtoolOptions.sign): signs each Windows exe in place with
// SSL.com eSigner through the owner's CodeSignTool wrapper (sign.bat), so latest.yml hashes the signed installer.
// Credentials stay in the wrapper's environment (ESIGNER_*); nothing is read or printed here. Without ESIGNER_USERNAME
// (CI, other machines) it skips and the build is unsigned. ESIGNER_SIGN_BAT overrides the wrapper's path.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

export default async function sign(config) {
  if (!process.env.ESIGNER_USERNAME) return
  const bat = process.env.ESIGNER_SIGN_BAT || join(process.env.USERPROFILE || '', 'Tools', 'CodeSignTool', 'sign.bat')
  const r = spawnSync('cmd.exe', ['/d', '/c', bat, config.path], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`eSigner signing failed (${r.status}) for ${config.path}`)
}
