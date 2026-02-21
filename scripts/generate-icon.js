/**
 * Generate a 256x256 PNG icon for GhostShell.
 * Pure Node.js — no external dependencies.
 * Renders a stylized ghost silhouette on dark background.
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 256
const HALF = SIZE / 2

// Colors
const BG = [26, 16, 37]         // #1a1025 (ghost-bg)
const GHOST = [168, 85, 247]    // #a855f7 (ghost-accent)
const GHOST_LIGHT = [196, 141, 255]
const EYE = [26, 16, 37]        // dark eyes
const GLOW = [168, 85, 247, 60] // subtle glow

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

function drawPixel(x, y) {
  // Center coordinates
  const cx = x - HALF
  const cy = y - HALF

  // --- Ghost body shape ---
  // Head: ellipse top half, centered at (0, -20)
  const headCY = cy + 20
  const headRX = 70, headRY = 75
  const inHead = (cx * cx) / (headRX * headRX) + (headCY * headCY) / (headRY * headRY) <= 1 && headCY <= 0

  // Body: rectangle with slight taper, from y=-20 to y=+55
  const bodyTop = -20, bodyBot = 55
  const bodyWidthTop = 70, bodyWidthBot = 75
  const bodyT = (cy - HALF + HALF + bodyTop) <= 0 ? 0 : Math.min(1, (cy - bodyTop) / (bodyBot - bodyTop))
  const bodyHalfW = lerp(bodyWidthTop, bodyWidthBot, bodyT)
  const inBody = cy >= bodyTop && cy <= bodyBot && Math.abs(cx) <= bodyHalfW

  // Wavy bottom: 3 bumps
  const waveY = bodyBot
  const waveAmp = 18
  const inWave = cy > waveY && cy <= waveY + waveAmp && Math.abs(cx) <= bodyWidthBot
  let inWaveBump = false
  if (inWave) {
    // 3 semicircles at bottom
    const bumpR = bodyWidthBot / 3
    const centers = [-bumpR * 2, 0, bumpR * 2]
    for (const bcx of centers) {
      const dx = cx - bcx
      const dy = cy - waveY
      if (dx * dx + dy * dy <= bumpR * bumpR && dy >= 0) {
        inWaveBump = true
        break
      }
    }
  }

  const inGhost = inHead || inBody || inWaveBump

  // --- Eyes ---
  const eyeY = -25
  const eyeSpacing = 24
  const eyeRX = 10, eyeRY = 13
  const leftEye = ((cx + eyeSpacing) * (cx + eyeSpacing)) / (eyeRX * eyeRX) + ((cy - eyeY) * (cy - eyeY)) / (eyeRY * eyeRY) <= 1
  const rightEye = ((cx - eyeSpacing) * (cx - eyeSpacing)) / (eyeRX * eyeRX) + ((cy - eyeY) * (cy - eyeY)) / (eyeRY * eyeRY) <= 1
  const inEye = leftEye || rightEye

  // --- Glow around ghost ---
  const glowDist = 12
  const headGlowRX = headRX + glowDist, headGlowRY = headRY + glowDist
  const inHeadGlow = (cx * cx) / (headGlowRX * headGlowRX) + (headCY * headCY) / (headGlowRY * headGlowRY) <= 1 && headCY <= glowDist
  const bodyGlowW = bodyWidthBot + glowDist
  const inBodyGlow = cy >= bodyTop - glowDist && cy <= bodyBot + waveAmp + glowDist && Math.abs(cx) <= bodyGlowW
  const inGlow = (inHeadGlow || inBodyGlow) && !inGhost

  // --- Determine color ---
  if (inGhost && inEye) {
    return [...EYE, 255]
  }
  if (inGhost) {
    // Gradient: lighter at top, accent at bottom
    const t = Math.max(0, Math.min(1, (cy + 95) / 170))
    return [
      Math.round(lerp(GHOST_LIGHT[0], GHOST[0], t)),
      Math.round(lerp(GHOST_LIGHT[1], GHOST[1], t)),
      Math.round(lerp(GHOST_LIGHT[2], GHOST[2], t)),
      255,
    ]
  }
  if (inGlow) {
    return [GHOST[0], GHOST[1], GHOST[2], 35]
  }
  return [...BG, 255]
}

// Build raw RGBA rows (each row prefixed with filter byte 0)
const rawData = Buffer.alloc(SIZE * (1 + SIZE * 4))
for (let y = 0; y < SIZE; y++) {
  const rowOff = y * (1 + SIZE * 4)
  rawData[rowOff] = 0 // PNG filter: None
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = drawPixel(x, y)
    const px = rowOff + 1 + x * 4
    rawData[px] = r
    rawData[px + 1] = g
    rawData[px + 2] = b
    rawData[px + 3] = a
  }
}

// Compress
const compressed = zlib.deflateSync(rawData, { level: 9 })

// Build PNG file
function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([len, typeAndData, crc])
}

// IHDR
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)  // width
ihdr.writeUInt32BE(SIZE, 4)  // height
ihdr[8] = 8   // bit depth
ihdr[9] = 6   // color type: RGBA
ihdr[10] = 0  // compression
ihdr[11] = 0  // filter
ihdr[12] = 0  // interlace

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const png = Buffer.concat([
  signature,
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', compressed),
  makeChunk('IEND', Buffer.alloc(0)),
])

const outPath = path.join(__dirname, '..', 'build', 'icon.png')
fs.writeFileSync(outPath, png)
console.log(`Icon written to ${outPath} (${png.length} bytes)`)
