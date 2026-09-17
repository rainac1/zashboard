/*
 * 生成 public/ 下的全套图标:三块圆角面板 + 白底 / 黑底底板。
 *
 *   pnpm gen:icon
 *
 * 改版面或配色只动下面几个常量,九个文件都由它们推出来。三条分支的区别:
 *   - favicon / pwa    带圆角底板,直接照原样显示;
 *   - apple-touch      满幅出血,iOS 自己套圆角遮罩,这里再切一次会露出白边;
 *   - maskable         满幅出血,另外把图形收到 MASKABLE_SCALE ——
 *                      Android 的遮罩形状各家不同,只有中心直径 80% 的圆是保证不被裁的。
 *
 * 依赖系统里的 rsvg-convert(librsvg)和 magick(ImageMagick 7),不进 node_modules。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url))

// 莫兰迪雾霾蓝,色相统一在 213° 上下,饱和度压在 30% 以内才不会跳出莫兰迪的灰度区间。
// 三档明度依次给「高列 / 右上 / 右下」,暗色版是整体提亮,不是反相。
const THEMES = {
  light: { plate: '#FFFFFF', panels: ['#7E92AB', '#A8B8CC', '#5C6E86'] },
  dark: { plate: '#0D0F13', panels: ['#8B9DB4', '#BFCBDB', '#64748C'] },
}

const PLATE_RADIUS = 114 // 512 的 22%
const PANEL_RADIUS = 38
// [x, y, 宽, 高] —— 左边一根高列 + 右边上下两块,横纵中心都落在 256
const PANELS = [
  [105, 131, 123, 250],
  [251, 131, 156, 109],
  [251, 272, 156, 109],
]
const MASKABLE_SCALE = 0.875

const svg = (theme, { radius = PLATE_RADIUS, scale = 1 } = {}) => {
  const { plate, panels } = THEMES[theme]
  const rects = PANELS.map(
    ([x, y, w, h], i) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${PANEL_RADIUS}" fill="${panels[i]}"/>`,
  ).join('\n    ')
  const transform =
    scale === 1 ? '' : ` transform="translate(256 256) scale(${scale}) translate(-256 -256)"`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512"${radius ? ` rx="${radius}"` : ''} fill="${plate}"/>
  <g${transform}>
    ${rects}
  </g>
</svg>
`
}

const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' })
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message
    throw new Error(`${cmd} 执行失败: ${detail}`)
  }
}

for (const cmd of ['rsvg-convert', 'magick']) {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' })
  } catch {
    console.error(
      `找不到 ${cmd}。Arch: pacman -S librsvg imagemagick;Debian: apt install librsvg2-bin imagemagick`,
    )
    process.exit(1)
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'zashboard-icon-'))
const written = []

const emitSvg = (name, source) => {
  const out = join(PUBLIC_DIR, name)
  writeFileSync(out, source)
  written.push(name)
  return out
}

const emitPng = (source, size, name) => {
  run('rsvg-convert', [
    '-w',
    String(size),
    '-h',
    String(size),
    source,
    '-o',
    join(PUBLIC_DIR, name),
  ])
  written.push(name)
}

try {
  const light = svg('light')
  const roundedSvg = emitSvg('favicon.svg', light)
  emitSvg('icon.svg', light)
  emitSvg('favicon-dark.svg', svg('dark'))

  // 满幅版本不落进 public/,只是两种 png 的中间产物
  const bleedSvg = join(tmp, 'bleed.svg')
  writeFileSync(bleedSvg, svg('light', { radius: 0, scale: MASKABLE_SCALE }))

  emitPng(roundedSvg, 192, 'pwa-192x192.png')
  emitPng(roundedSvg, 512, 'pwa-512x512.png')
  emitPng(bleedSvg, 192, 'pwa-maskable-192x192.png')
  emitPng(bleedSvg, 512, 'pwa-maskable-512x512.png')
  emitPng(bleedSvg, 180, 'apple-touch-icon.png')

  // ico 里塞三档,让浏览器按标签页 / 收藏栏 / 桌面快捷方式各取所需
  const icoSizes = [16, 32, 48].map((size) => {
    const out = join(tmp, `ico-${size}.png`)
    run('rsvg-convert', ['-w', String(size), '-h', String(size), roundedSvg, '-o', out])
    return out
  })
  run('magick', [...icoSizes, join(PUBLIC_DIR, 'favicon.ico')])
  written.push('favicon.ico')

  // rsvg 会写入时间戳一类的块,去掉后同样的输入才有同样的字节
  const pngs = readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.png'))
  run('magick', ['mogrify', '-strip', ...pngs.map((f) => join(PUBLIC_DIR, f))])
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

for (const name of written) console.log(`  ✓ public/${name}`)
