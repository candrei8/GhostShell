#!/usr/bin/env node
/**
 * GhostShell Icon Generator — Professional Edition
 * Generates icon.png (512x512), icon.ico, and favicon.ico
 * Pure Node.js — no external dependencies
 *
 * Design: Minimalist geometric ghost on dark background
 * - Light lavender-white ghost body with subtle gradient
 * - Clean dome + 3 smooth tentacles
 * - Dark cutout eyes
 * - Soft purple ambient glow
 * - Rounded square background (iOS-style)
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 512

// ─── Utilities ────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const dist = (x1, y1, x2, y2) => Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)

// ─── CRC32 ────────────────────────────────────────────────────
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c
}
function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// ─── Ghost Shape ──────────────────────────────────────────────
const GCX = 256
const DOME_CY = 205
const DOME_R = 118
const BODY_L = GCX - DOME_R
const BODY_R = GCX + DOME_R
const BODY_BOT = 360
const TENT_AMP = 34
const TENT_N = 3

// Eyes: two circles
const EYE_LX = 220, EYE_RX = 292
const EYE_Y = 228
const EYE_RADIUS = 17

function ghostSDF(px, py) {
  // Dome
  if (py <= DOME_CY) {
    return dist(px, py, GCX, DOME_CY) - DOME_R
  }
  // Body
  if (py > DOME_CY && py <= BODY_BOT) {
    if (px >= BODY_L && px <= BODY_R) {
      return -Math.min(px - BODY_L, BODY_R - px, py - DOME_CY, BODY_BOT - py)
    }
    return px < BODY_L ? BODY_L - px : px - BODY_R
  }
  // Tentacles
  if (py > BODY_BOT) {
    if (px < BODY_L || px > BODY_R) {
      const dx = px < BODY_L ? BODY_L - px : px - BODY_R
      return Math.sqrt(dx * dx + (py - BODY_BOT) * (py - BODY_BOT))
    }
    const t = (px - BODY_L) / (BODY_R - BODY_L)
    const yEdge = BODY_BOT + TENT_AMP * Math.pow(Math.sin(t * Math.PI * TENT_N), 2)
    return py - yEdge
  }
  return 999
}

function isEye(px, py) {
  return dist(px, py, EYE_LX, EYE_Y) <= EYE_RADIUS || dist(px, py, EYE_RX, EYE_Y) <= EYE_RADIUS
}

function sdfRoundRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.max(Math.abs(px - cx) - hw + r, 0)
  const dy = Math.max(Math.abs(py - cy) - hh + r, 0)
  return Math.sqrt(dx * dx + dy * dy) - r
}

// ─── Palette ──────────────────────────────────────────────────
const BG = [10, 10, 20]
const GHOST_TOP = [244, 241, 254]
const GHOST_BOT = [182, 167, 222]
const GLOW_CLR = [139, 92, 246]

// ─── Renderer ─────────────────────────────────────────────────
function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4, 0)
  const sc = size / SIZE

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const fx = (x + 0.5) / sc
      const fy = (y + 0.5) / sc

      // Background
      const bgD = sdfRoundRect(fx, fy, 256, 256, 236, 236, 80)
      const aaW = 1.5 / sc
      if (bgD > aaW) { buf[i + 3] = 0; continue }
      const bgA = bgD > -aaW ? clamp((aaW - bgD) / (2 * aaW), 0, 1) : 1

      let r = BG[0], g = BG[1], b = BG[2]

      // Glow
      const gd = ghostSDF(fx, fy)
      if (gd > 0 && gd < 55) {
        const inten = 0.2 * Math.exp(-gd / 16)
        r = Math.round(lerp(r, GLOW_CLR[0], inten))
        g = Math.round(lerp(g, GLOW_CLR[1], inten))
        b = Math.round(lerp(b, GLOW_CLR[2], inten))
      }

      // Ghost body — supersampled
      const SS = size >= 256 ? 4 : 3
      let gc = 0, ec = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const spx = (x + (sx + 0.5) / SS) / sc
          const spy = (y + (sy + 0.5) / SS) / sc
          if (ghostSDF(spx, spy) <= 0) {
            gc++
            if (isEye(spx, spy)) ec++
          }
        }
      }
      gc /= SS * SS
      ec /= SS * SS

      if (gc > 0) {
        const topY = DOME_CY - DOME_R
        const botY = BODY_BOT + TENT_AMP
        const gt = clamp((fy - topY) / (botY - topY), 0, 1)
        let cr = lerp(GHOST_TOP[0], GHOST_BOT[0], gt)
        let cg = lerp(GHOST_TOP[1], GHOST_BOT[1], gt)
        let cb = lerp(GHOST_TOP[2], GHOST_BOT[2], gt)

        // Dome highlight
        const hlD = dist(fx, fy, GCX, DOME_CY - DOME_R * 0.5)
        const hl = 0.4 * Math.pow(clamp(1 - hlD / (DOME_R * 0.85), 0, 1), 2.5)
        cr = lerp(cr, 255, hl)
        cg = lerp(cg, 255, hl)
        cb = lerp(cb, 255, hl)

        r = Math.round(lerp(r, cr, gc))
        g = Math.round(lerp(g, cg, gc))
        b = Math.round(lerp(b, cb, gc))

        if (ec > 0) {
          r = Math.round(lerp(r, BG[0], ec))
          g = Math.round(lerp(g, BG[1], ec))
          b = Math.round(lerp(b, BG[2], ec))
        }
      }

      buf[i] = r
      buf[i + 1] = g
      buf[i + 2] = b
      buf[i + 3] = Math.round(bgA * 255)
    }
  }
  return buf
}

// ─── PNG Encoder ──────────────────────────────────────────────
function makeChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, c])
}

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc(h * (1 + w * 4))
  let off = 0
  for (let y = 0; y < h; y++) {
    raw[off++] = 0
    rgba.copy(raw, off, y * w * 4, (y + 1) * w * 4)
    off += w * 4
  }
  const compressed = zlib.deflateSync(raw, { level: 9 })
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', compressed), makeChunk('IEND', Buffer.alloc(0))])
}

// ─── ICO Encoder ──────────────────────────────────────────────
function encodeICO(images) {
  const n = images.length
  const hdr = Buffer.alloc(6)
  hdr.writeUInt16LE(0, 0)
  hdr.writeUInt16LE(1, 2)
  hdr.writeUInt16LE(n, 4)
  let off = 6 + n * 16
  const entries = [], pngs = []
  for (const { size, png } of images) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(off, 12)
    entries.push(e)
    pngs.push(png)
    off += png.length
  }
  return Buffer.concat([hdr, ...entries, ...pngs])
}

// ─── Downscale (area average) ─────────────────────────────────
function downscale(src, srcSz, dstSz) {
  const dst = Buffer.alloc(dstSz * dstSz * 4)
  const r = srcSz / dstSz
  for (let dy = 0; dy < dstSz; dy++) {
    for (let dx = 0; dx < dstSz; dx++) {
      let rs = 0, gs = 0, bs = 0, as = 0, cnt = 0
      const y0 = Math.floor(dy * r), y1 = Math.min(Math.ceil((dy + 1) * r), srcSz)
      const x0 = Math.floor(dx * r), x1 = Math.min(Math.ceil((dx + 1) * r), srcSz)
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const si = (sy * srcSz + sx) * 4
        rs += src[si]; gs += src[si + 1]; bs += src[si + 2]; as += src[si + 3]; cnt++
      }
      const di = (dy * dstSz + dx) * 4
      dst[di] = Math.round(rs / cnt)
      dst[di + 1] = Math.round(gs / cnt)
      dst[di + 2] = Math.round(bs / cnt)
      dst[di + 3] = Math.round(as / cnt)
    }
  }
  return dst
}

// ─── Generate All ─────────────────────────────────────────────
console.log('Rendering 512x512 icon...')
const px512 = renderIcon(512)
const png512 = encodePNG(512, 512, px512)

console.log('Generating smaller sizes...')
const sizes = [256, 48, 32, 16]
const pngs = {}
for (const s of sizes) {
  pngs[s] = encodePNG(s, s, downscale(px512, 512, s))
}

// Save
const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'build')
const publicDir = path.join(root, 'public')
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true })
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })

fs.writeFileSync(path.join(buildDir, 'icon.png'), png512)
console.log('  -> build/icon.png (512x512)')

const ico = encodeICO([
  { size: 256, png: pngs[256] },
  { size: 48, png: pngs[48] },
  { size: 32, png: pngs[32] },
  { size: 16, png: pngs[16] },
])
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico)
console.log('  -> build/icon.ico (256+48+32+16)')

const fav = encodeICO([{ size: 32, png: pngs[32] }, { size: 16, png: pngs[16] }])
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), fav)
console.log('  -> public/favicon.ico (32+16)')

console.log('Done!')
