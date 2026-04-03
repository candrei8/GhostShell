#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const electronDir = path.join(rootDir, 'node_modules', 'electron')
const nodePtyPrebuildsDir = path.join(rootDir, 'node_modules', 'node-pty', 'prebuilds')

function getElectronPlatformPath() {
  switch (process.platform) {
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'freebsd':
    case 'linux':
    case 'openbsd':
      return 'electron'
    case 'win32':
      return 'electron.exe'
    default:
      throw new Error(`Unsupported platform for Electron: ${process.platform}`)
  }
}

function fixNodePtySpawnHelpers() {
  try {
    const prebuilds = fs.readdirSync(nodePtyPrebuildsDir)
    for (const prebuild of prebuilds) {
      const helperPath = path.join(nodePtyPrebuildsDir, prebuild, 'spawn-helper')
      try {
        fs.chmodSync(helperPath, 0o755)
      } catch {
        // Ignore missing helpers on platforms that do not ship one.
      }
    }
    console.log('node-pty spawn-helpers fixed')
  } catch {
    // node-pty may not be installed yet during partial installs.
  }
}

function isElectronInstalled() {
  try {
    const electronPackage = JSON.parse(
      fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8'),
    )
    const expectedBinary = getElectronPlatformPath()
    const installedBinary = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim()
    const installedVersion = fs
      .readFileSync(path.join(electronDir, 'dist', 'version'), 'utf8')
      .trim()
      .replace(/^v/, '')

    if (installedBinary !== expectedBinary) return false
    if (installedVersion !== electronPackage.version) return false

    return fs.existsSync(path.join(electronDir, 'dist', installedBinary))
  } catch {
    return false
  }
}

function ensureElectronInstall() {
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
    console.log('Skipping Electron binary check because ELECTRON_SKIP_BINARY_DOWNLOAD is set')
    return
  }

  if (isElectronInstalled()) {
    console.log('Electron binary OK')
    return
  }

  const installScript = path.join(electronDir, 'install.js')
  if (!fs.existsSync(installScript)) {
    throw new Error('node_modules/electron/install.js is missing')
  }

  console.log('Electron binary missing or incomplete, running electron/install.js')
  const result = spawnSync(process.execPath, [installScript], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  if (!isElectronInstalled()) {
    throw new Error('Electron install finished but the binary is still unavailable')
  }

  console.log('Electron binary repaired successfully')
}

try {
  fixNodePtySpawnHelpers()
  ensureElectronInstall()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
