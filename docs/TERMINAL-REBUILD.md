# GhostShell · Terminal Subsystem — Roast + Rebuild Plan

> Auditoría forense del subsistema de terminales (PTY ↔ xterm ↔ UI) realizada con 7 subagentes
> paralelos + verificación adversarial, más inspección visual en vivo de la app corriendo.
> Datos crudos: [`terminal-audit-findings.json`](./terminal-audit-findings.json) — 121 hallazgos
> (10 críticos, 30 high, 46 medium, 31 low) y 13 patrones de referencia (WezTerm / VS Code / xterm.js).

---

## TL;DR — por qué "el texto se ve mal dentro de Claude"

Tu síntoma exacto (*"errores al estar dentro de Claude Code con mucho texto: scroll, copy/paste, textos mal
posicionados"*) **no es aleatorio**. Tiene causa raíz identificada y son 3 mecanismos concretos:

1. **`enhanceTerminalOutput` reescribe el stream ANSI byte a byte antes de pintarlo** (`terminalOutputEnhancer.ts`).
   ConPTY parte las secuencias de escape entre chunks de IPC. Cuando un chunk termina en `\x1b` suelto y el
   siguiente empieza por `[2K\rReading foo.ts`, el enhancer inyecta `\x1b[1m\x1b[95m…` en medio → el terminal ve
   `ESC ESC`, aborta la primera secuencia y pinta `[2K` como **texto literal**. Eso son exactamente las líneas
   duplicadas/desplazadas. Está **activo por defecto y solo para Claude**, el TUI que más se repinta. → **CRÍTICO**
2. **`imageLabels.maskText` reescribe los bytes crudos del PTY sustituyendo rutas largas por `Image 1`**
   (`terminalImageLabels.ts`). Cambia la longitud del texto que Claude ya calculó para dibujar su caja de input →
   los bordes se rompen, los backspaces borran celdas equivocadas, el wrap se desalinea. → **HIGH**
3. **Cero flow-control en el PTY**: `main.ts` hace un `webContents.send` por cada chunk de node-pty, sin batching
   ni pause/resume. Un build largo o un diff genera decenas de miles de mensajes IPC, cada uno dispara un handler
   pesadísimo en el renderer → freezes y saltos de scroll. → **HIGH**

Arreglar estos tres **elimina la clase entera de bugs visuales dentro de agentes**. Regla de oro de todo terminal
serio (WezTerm, VS Code, Ghostty): **nunca se muta el stream de bytes entre el PTY y el parser.** El resaltado
semántico se hace por encima con decoraciones, no reescribiendo escapes.

Y un bonus de seguridad que hay que apagar ya: **auto-confirm por regex** (`usePty.ts:877`) escribe `y⏎` en el PTY
en cuanto ve `(y/n)` en el *output* — aunque Claude solo esté *imprimiendo* un texto con `(y/n)`. Incluye
`/\? \(y\/N\)/`, que responde **YES a prompts cuyo default seguro es NO**: anula el modelo de permisos de Claude.

---

## Lo que SÍ está bien (se conserva)

El roast es duro, pero hay una base sólida que **no** se tira:

- **`contextIsolation: true`, `nodeIntegration: false`** y un `preload` con `contextBridge` bien planteado.
- **Ladder de spawn ConPTY→winpty** en `pty-manager.ts` — correcta idea, buen manejo de fallback en Windows.
- **Store de sesiones con derivación de workspaces** — la lógica de `normalizeGroups`/`buildWorkspaces` es
  demasiado compleja, pero la *intención* (grupos como splits) es la correcta y la migramos a un árbol limpio.
- **Sistema de temas de 16 skins**, `providers.ts` como fuente de verdad de proveedores, y toda la capa de agentes
  / swarm / command-blocks — nada de eso se toca en esta reescritura salvo para conectarlo bien.
- **Deferred PTY init anti-StrictMode**, `WebglAddon` con `onContextLoss`, `SearchAddon`, drag&drop de ficheros:
  buenos cimientos, mal cableados. Se reordenan, no se borran.

---

## Roast por área (hallazgos críticos y high)

### A. Backend PTY + IPC (`electron/`)
- **[CRÍTICO] `git:rollback` es una trituradora de datos.** `createCheckpoint` usa `git stash create` (solo
  captura *tracked*), y `rollback` hace `git checkout . && git clean -fd && git stash apply`. `clean -fd` **borra
  permanentemente todo untracked** — justo los ficheros que un agente IA acaba de escribir. Sin confirmación, sin
  backup. `main.ts:452`.
- **[HIGH] Sin flow-control ni coalescing.** Un `send` por chunk → inundación del renderer. `main.ts:280`.
- **[HIGH] `sandbox:false` + superficie IPC sin validar `senderFrame`.** fs read/write/delete de *cualquier* ruta,
  spawn de shell arbitrario, exec de binarios — cero defensa en profundidad. `main.ts:185`.
- **[HIGH] `force-device-scale-factor=1`** hace que en cualquier portátil Windows a 125–150 % la app se vea
  minúscula. El switch vecino `high-dpi-support` lleva años sin existir en Chromium. `main.ts:44`.
- **[HIGH] Exit del proceso viejo puede llegar a la sesión nueva** (mismo `id` de canal, closures sin generación).
  Aparece `[Process exited]` en un terminal vivo. `main.ts:284`.

### B. Pipeline de output (`src/lib/`)
- **[CRÍTICO] `enhanceTerminalOutput`** — descrito arriba. `terminalOutputEnhancer.ts:118`.
- **[CRÍTICO] auto-confirm `y⏎` por regex** — descrito arriba. `usePty.ts:877`.
- **[HIGH] `imageLabels.maskText`** desincroniza la aritmética de columnas del TUI. `terminalImageLabels.ts:25`.
- **[HIGH] `stripAnsi` no captura DEC private modes** (`\x1b[?25l`, `\x1b[?2026h`, `\x1b[?1049h`) ni OSC terminado
  en ST → fugas de bytes de control al chat Companion. `claude-output-parser.ts:5`.
- **[HIGH] `createBatchParser` re-parsea su cola de 200 chars** y los repaints de Claude re-inyectan el mismo texto
  → eventos y sub-agentes duplicados. `claude-output-parser.ts:872`.
- **[HIGH] Regex de coste/tokens** tragan `$1` de un script bash y `5 tokens` de prosa como telemetría real.
- **[HIGH] Clasificación por keyword** repinta prosa normal: "handles the error case" se vuelve rojo error.

### C. Visual / CSS (`src/`)
- **[CRÍTICO] 368 clases Tailwind con modificador de opacidad compilan a NADA.** Solo `ghost.text`/`ghost.accent`
  usan la forma `rgb(var(...) / <alpha-value>)`; el resto son `var()` crudos, así que `text-ghost-text-dim/40`,
  `border-ghost-border/70`, etc. → **cero CSS**. La jerarquía tipográfica dim/secundaria **no existe** donde se usan
  esas clases. `ResizeHandle` es literalmente invisible. `tailwind.config.js:15`.
- **[HIGH] Pasos de opacidad inválidos** (`white/8`, `bg-white/3`, `black/22`…) se descartan, y por el `preflight`
  de Tailwind esos bordes caen a **gris claro `#e5e7eb`** sobre UI oscura. `TerminalContextPanel.tsx` y +20 sitios.
- **[HIGH] El menú contextual de tabs se recorta a la invisibilidad** por el `overflow-hidden` de la titlebar.
  `GlobalDock.tsx:218` + `ContextMenu` usa `absolute` con coords de viewport. Necesita portal + `fixed` + clamp.
- **[HIGH] Pipeline de fuentes roto**: la UI carga Inter+JetBrains pero usa Manrope (que nunca se carga) → todo
  cae a Segoe UI; bold del terminal es *faux bold*; fuentes desde CDN de Google; sin Nerd Font fallback.
- **[HIGH] `SwarmViewToggle` (`fixed z-[60]`) puede tapar el botón Cerrar** de la ventana frameless.
- **[HIGH] 275× `#38bdf8` hardcodeado** en 40 ficheros — el sistema de 16 temas no llega a la mitad de la UI.
- **[MEDIUM] Violaciones del propio style-guide**: 3 `linear/radial-gradient` y un glow `0 0 6px …40`.
- **[MEDIUM] ~640 líneas de componentes muertos** (`TerminalTabs`, `LaunchScreen`, `FloatingSidePanel`) y ~35 % de
  `globals.css` es CSS que no referencia ningún componente.

### D. Estado / stores / shortcuts (`src/stores`, `src/hooks`)
- **[CRÍTICO] Maximizar y cambiar Tabs↔Grid desmontan panes y matan sus PTY vivos.** La vida del PTY está acoplada
  al mount de React (`usePty` cleanup → `ptyKill`). `BentoLayout` en maximize renderiza solo un pane → destruye el
  shell de todos los demás agentes; el toggle Grid re-keya todo y reinicia cada shell. `BentoLayout.tsx:59`.
- **[CRÍTICO] Los shortcuts custom nunca persisten**: `storage: electronStorage as any` pasa un `StateStorage`
  donde zustand v5 exige `PersistStorage`. Cada rebind se pierde al reiniciar. `shortcutStore.ts:339`.
- **[HIGH] Tres capas de teclado descoordinadas**: registro rebindable + intercepts hardcodeados en xterm
  (`Ctrl+T`, `F2`…) + un listener rogue de `Ctrl+Space`. Rebindear no tiene efecto con el terminal enfocado.
- **[MEDIUM] `commandBlockStore` nunca libera sesiones cerradas** → crecimiento de memoria ilimitado.
- **[MEDIUM] Todos los shortcuts de "abrir tab de settings" caen en Appearance** por un `?? ` tras llamada void.

### E. Build / tests / tipos
- **[CRÍTICO] Hay un error TS que es un `ReferenceError` en runtime**: `inputBuffer` se asigna en un scope
  hermano al de su declaración. En el bundle, pulsar Enter en un shell plano lanza `ReferenceError` **antes** de
  reenviar `\r` al PTY → la tecla se traga. `usePty.ts:523`.
- **[HIGH] No hay gate de typecheck/test/lint** en CI ni en el build. `package.json` no tiene script `typecheck`.
- **[HIGH] La suite de tests está roja** en HEAD (1 fail): un test asserta comportamiento que la implementación
  quitó a propósito. `terminalTextInput.test.ts:10`.
- **[HIGH] Cero cobertura** en los módulos críticos (`usePty`, `useTerminal`, `pty-manager`, parser, enhancer).
- **[HIGH] Electron 33.4.11 EOL** con 18 advisories sin parchear.

---

## Arquitectura objetivo (estilo WezTerm / VS Code)

Principios extraídos de la investigación de referencia:

1. **El stream de bytes es sagrado.** `pty.onData → xterm.write` verbatim. Nada de reescribir escapes. El
   resaltado semántico se hace con la **Decoration/Marker API** de xterm por encima del buffer ya pintado.
2. **La vida del PTY la posee un registro (mux), no React.** Un pane que se oculta se oculta con CSS
   (`visibility`), nunca se desmonta. `removeSession` explícito es el único que mata un PTY. (Modelo mux de WezTerm.)
3. **Flow-control ack-based** (constantes de VS Code: high-watermark 100 000 / low 5 000 / ack cada 5 000) +
   coalescing en un timer de ~8 ms. Esto es *lo más importante* para un terminal de agentes.
4. **Shell integration OSC 133/633** en lugar de sniffing por regex del prompt. Un `Prompt` de PowerShell inyectado
   emite `OSC 133;A/B/C/D` → markers de xterm → command-blocks precisos, CWD real, exit codes reales. Se acepta
   también 633 para compatibilidad con los scripts de VS Code.
5. **Layout = árbol binario de splits** (`leaf | split{direction, ratio, first, second}`) con una función pura
   `layoutTree(node, rect)`; zoom por flag `zoomedId`, sin mutar el árbol.
6. **Input**: `onData` es el único camino de entrada; `attachCustomKeyEventHandler` solo intercepta atajos y copy.
   Nunca sintetizamos secuencias de escape a mano.
7. **Tokens de color como triplete RGB** (`--ghost-border-rgb: 255 255 255`) mapeados por
   `rgb(var(--x) / <alpha-value>)` para que TODAS las opacidades Tailwind funcionen.

---

## Plan de ejecución por fases

Estrategia: **reescritura quirúrgica del núcleo, conservando la carcasa que funciona.** Cada fase deja la app
compilando, testeando en verde y arrancable. Verificación al final de cada fase: `tsc --noEmit` (web+node) +
`vitest run` + `electron-vite build` + smoke visual vía CDP.

### Fase 0 — Red de seguridad (gate de calidad)
- Añadir `typecheck` (`tsc --noEmit` web+node) y `test` al pipeline; script `verify` que corre todo.
- Arreglar el test rojo (`terminalTextInput.test.ts`) alineándolo con la implementación real.
- Hacer que `vitest` pueda testear `electron/**`.

### Fase 1 — Núcleo PTY + xterm (mata la clase de bugs visuales)
- **Borrar el stream-rewriting**: quitar `enhanceTerminalOutput` y `imageLabels.maskText` del camino de
  `pty:data`. El masking cosmético se mueve a las superficies propias de GhostShell (command-blocks, chat), nunca a
  los bytes del terminal.
- **Quitar el auto-confirm por regex** (`y⏎`). Si se quiere auto-approve, se usa el flag sancionado del CLI.
- **Flow-control + coalescing** en main: buffer + flush 8 ms, high/low watermark con `pty.pause()/resume()`, ack
  desde el renderer.
- **Fix del `ReferenceError` `inputBuffer`** (hoisting de scope).
- **Generación por sesión** en los payloads `pty:data`/`pty:exit` para descartar eventos del proceso viejo.
- `stripAnsi` correcto (DEC private modes + OSC ST) para el parser semántico (sin tocar el stream del terminal).
- Quitar `force-device-scale-factor=1` y el switch obsoleto.

### Fase 2 — Layout: tabs, panes y splits sin matar PTYs
- **Desacoplar la vida del PTY del mount**: registro/mux de terminales por `sessionId`; ocultar con CSS en vez de
  desmontar en maximize/grid/tabs.
- Migrar el modelo a un **árbol binario de splits** redimensionable con `layoutTree` puro; zoom por flag.
- Un único componente **PopoverLayer** (portal + `fixed` + clamp + Escape/outside-click) para todos los menús →
  arregla el menú de tabs recortado.

### Fase 3 — Interacciones: copy/paste, teclado, búsqueda, drag&drop
- **Clipboard robusto**: un solo path de paste (bracketed), sin triple-listener; copy con selección; SIGINT sin
  selección.
- **Unificar el protocolo multilínea** por proveedor (`\x1b\r` Claude / `\n` codex-gemini) en un solo helper;
  eliminar el backslash+CR divergente de `MultiLineInput`; registrar submissions multilínea en history/blocks.
- **Una sola capa de teclado**: registro rebindable como fuente de verdad; el custom key handler de xterm consulta
  el registro en vez de hardcodear.
- Búsqueda con decoraciones correctas.

### Fase 4 — Render de agentes + pulido visual (nivel premium)
- **Sistema de tokens RGB**: reescribir `tailwind.config.js` + `themes.ts` para que todas las opacidades compilen;
  override de `preflight` para que un borde perdido caiga oscuro, no gris claro.
- Barrido de `white/N` inválidos → valores bracketed; eliminar 275× `#38bdf8` hardcodeado hacia tokens.
- **Fuentes**: cargar la fuente real que se usa (o cambiar el stack), self-host, bold real, monospace con Nerd Font
  fallback y ligaduras opt-in.
- **Cumplir el style-guide**: eliminar los 3 gradientes y el glow.
- **Shell integration OSC 133** + command-blocks con decoraciones (barra sólida sky-400 running / roja error), CWD
  y exit code reales — reemplaza el sniffing por regex.
- Reposicionar `SwarmViewToggle` fuera de los window controls; borrar componentes/CSS muertos.

### Fase 5 — Verificación final (cero bugs)
- `tsc` (web+node) limpio, `vitest` verde con tests nuevos para el núcleo, `electron-vite build` ok.
- Review multi-agente adversarial de todo el diff.
- Smoke test visual en vivo (launch, tabs, split, grid, maximize, Claude con mucho output, copy/paste, resize).

---

*Documento generado como parte de la reescritura. La fuente de datos completa está en el JSON adjunto.*
