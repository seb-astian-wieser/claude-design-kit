/**
 * Dev-only patch to DialKit's panel (the package in node_modules stays untouched):
 * - one toolbar at the top for the whole panel: sections menu, undo, redo, copy parameters
 *   (toolbar.js, toolbar.css);
 * - sections lose their own Copy parameters / Save version row and its divider;
 * - action buttons get white text;
 * - the open panel can be dragged by its title row;
 * - easing durations go up to 10 s;
 * - version history: saved versions of every panel's values live in dial-history.json
 *   (GET /__dial-history -> { versions }, POST a version -> appended; kept 30 days).
 * Each replacement must match exactly once, so a DialKit update that changes the code fails loudly
 * instead of silently dropping the patch.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const here = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')

function replaceOnce(code, from, to) {
  const n = code.split(from).length - 1
  if (n !== 1) throw new Error(`dialkit-patch: expected 1 match, found ${n}: ${from.slice(0, 60)}`)
  return code.replace(from, () => to)
}

function patchJs(code) {
  const marker = 'function Panel({ panel, defaultOpen = true,'
  code = replaceOnce(code, marker, here('./toolbar.js') + marker)
  // No "Save version" strip in sections.
  code = replaceOnce(
    code,
    'versions !== "menu" && /* @__PURE__ */ jsx18(VersionGallery, { panelId: panel.id, theme }),',
    'false,',
  )
  // Sections: an empty toolbar (keeps DialKit's section fold animation, renders nothing).
  code = replaceOnce(
    code,
    'return /* @__PURE__ */ jsx18(Folder, { title: panel.name, open: isOpen, onOpenChange: handleOpenChange, toolbar, children: renderControls() });',
    'return /* @__PURE__ */ jsx18(Folder, { title: panel.name, open: isOpen, onOpenChange: handleOpenChange, toolbar: /* @__PURE__ */ jsx18(Fragment5, {}), children: renderControls() });',
  )
  // A single panel shown on its own gets the shared toolbar too.
  code = replaceOnce(
    code,
    'isRoot: true, inline, onOpenChange: handleOpenChange, toolbar, children: renderControls() }) });',
    'isRoot: true, inline, onOpenChange: handleOpenChange, toolbar: versions === "menu" ? toolbar : /* @__PURE__ */ jsx18(RootToolbar, { extra: toolbarExtra }), children: renderControls() }) });',
  )
  // Several panels: the shared toolbar under the DialKit title.
  code = replaceOnce(
    code,
    `          toolbar: timelineToggle,
          children: panels.map((panel) => /* @__PURE__ */ jsx20(`,
    `          toolbar: versions === "menu" ? timelineToggle : /* @__PURE__ */ jsx20(RootToolbar, { extra: timelineToggle }),
          children: panels.map((panel) => /* @__PURE__ */ jsx20(`,
  )
  // The open panel can be dragged by its title row too (stock DialKit excludes it as a button,
  // which left nothing to grab). A click that ends a drag is already swallowed, so a plain click
  // still collapses the panel.
  code = replaceOnce(
    code,
    `  if (target.closest(DRAG_EXCLUSION_SELECTOR)) return null;
  return header;`,
    `  const excluded = target.closest(DRAG_EXCLUSION_SELECTOR);
  if (excluded && !(excluded.matches('[role="button"]') && excluded.parentElement === header)) return null;
  return header;`,
  )
  // Easing durations go up to 10 s (stock: 2 s), e.g. for a page loader's long run.
  code = replaceOnce(code, 'max: durationControl?.max ?? (isEasing ? 2 : 1),', 'max: durationControl?.max ?? (isEasing ? 10 : 1),')
  // The sections stack in the order dragged in the sections menu (toolbar.js → DkOrder).
  code = replaceOnce(
    code,
    'const [panels, setPanels] = useState9([]);',
    'const [rawPanels, setPanels] = useState9([]);\n  const panels = dkSortPanels(rawPanels, useDkOrder());',
  )
  // Easing: pick a named curve (toolbar.js → DK_EASES) instead of typing four bézier numbers.
  code = replaceOnce(
    code,
    'isEasing ? /* @__PURE__ */ jsx9(Fragment3, { children: /* @__PURE__ */ jsx9(EaseTextInput, { ease: easing.ease, onChange: (newEase) => onChange({ ...easing, ease: newEase }) }) })',
    'isEasing ? /* @__PURE__ */ jsx9(DkEaseCurve, { ease: easing.ease, onChange: (newEase) => onChange({ ...easing, ease: newEase }) })',
  )
  return code
}

const JS = /node_modules\/dialkit\/dist\/index\.js$/
const CSS = /node_modules\/dialkit\/dist\/styles\.css$/

const HISTORY_FILE = 'dial-history.json'
const HISTORY_DAYS = 30

export function dialkitPatch() {
  let historyPath
  const readHistory = () => {
    try {
      return JSON.parse(fs.readFileSync(historyPath, 'utf8'))
    } catch {
      return { versions: [] }
    }
  }
  let devServer = null
  const serverStart = Date.now()
  return {
    name: 'dialkit-patch',
    apply: 'serve',
    enforce: 'pre',
    // Served as source (not pre-bundled), so load() below sees it. The history file is never
    // imported, so writing it doesn't reload anything.
    config: () => ({ optimizeDeps: { exclude: ['dialkit'] }, server: { watch: { ignored: [`**/${HISTORY_FILE}`] } } }),
    configResolved(c) {
      historyPath = path.resolve(c.root, HISTORY_FILE)
    },
    configureServer(server) {
      devServer = server
      // Vite serves package files as cacheable forever, so a normal reload would keep an old copy
      // of the patched DialKit. Revalidate instead (cheap 304s while nothing changed).
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.includes('/node_modules/dialkit/dist/')) {
          const setHeader = res.setHeader.bind(res)
          res.setHeader = (name, value) =>
            setHeader(name, String(name).toLowerCase() === 'cache-control' ? 'no-cache' : value)
        }
        next()
      })
      server.middlewares.use('/__dial-history', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(readHistory()))
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try {
            const version = JSON.parse(body)
            if (!version || typeof version.at !== 'number' || !version.values) throw new Error('bad version')
            const cutoff = Date.now() - HISTORY_DAYS * 86400000
            const data = readHistory()
            data.versions = [...(data.versions || []).filter((v) => v.at >= cutoff && v.id !== version.id), version]
            // Write-then-rename, so a server killed mid-write can't leave a truncated file.
            fs.writeFileSync(`${historyPath}.tmp`, `${JSON.stringify(data, null, 1)}\n`)
            fs.renameSync(`${historyPath}.tmp`, historyPath)
            res.end('ok')
          } catch (e) {
            res.statusCode = 400
            res.end(String(e))
          }
        })
      })
    },
    // DialKit's URL carries a hash of the patch, so a browser that cached an older copy (Vite marks
    // package files as cacheable forever) fetches the new one on a normal reload. It also carries
    // Vite's current dependency version and this server's start: DialKit imports React, and when
    // Vite re-bundles its dependencies (a new package, a config change) an unchanged URL kept a copy
    // pointing at the old React bundle, so two Reacts loaded and the app crashed (a blank page).
    async resolveId(source, importer, options) {
      if (source !== 'dialkit') return
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved) return
      const deps = devServer?.environments?.client?.depsOptimizer?.metadata?.browserHash ?? ''
      const hash = createHash('sha1').update(here('./plugin.js')).update(here('./toolbar.js')).update(here('./toolbar.css')).update(`${deps}:${serverStart}`).digest('hex').slice(0, 8)
      return { ...resolved, id: `${resolved.id.split('?')[0]}?dk=${hash}` }
    },
    load(id) {
      const file = id.split('?')[0]
      // Editing toolbar.js / toolbar.css reloads the patched module.
      if (JS.test(file)) {
        this.addWatchFile(fileURLToPath(new URL('./toolbar.js', import.meta.url)))
        return patchJs(readFileSync(file, 'utf8'))
      }
      if (CSS.test(file)) {
        this.addWatchFile(fileURLToPath(new URL('./toolbar.css', import.meta.url)))
        return readFileSync(file, 'utf8') + here('./toolbar.css')
      }
    },
  }
}
