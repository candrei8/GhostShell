/**
 * electron-builder afterPack hook.
 *
 * macOS builds ship without an Apple Developer certificate. electron-builder then
 * skips signing entirely, which leaves the Electron binary with a broken signature
 * after packaging — Apple Silicon refuses to run it and Gatekeeper reports the app
 * as "damaged". An ad-hoc signature ("-") is enough to make the bundle valid.
 */
const path = require('path')
const { execFileSync } = require('child_process')

exports.default = async function adhocSignMac(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )

  console.log(`  • ad-hoc signing  ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
}
