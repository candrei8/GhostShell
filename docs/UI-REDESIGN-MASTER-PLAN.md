# GhostShell · Plan maestro — Rediseño de paneles + estabilidad del terminal

> Continuación de [`TERMINAL-REBUILD.md`](./TERMINAL-REBUILD.md) (v2.3.0 cerró el pipeline de bytes y el
> flow-control). Este documento cubre lo que quedó abierto: **la capa de layout/render** (minimizar, redimensionar,
> output largo) y el **rediseño visual** hacia el patrón de referencia (grid de cards tipo "vibecodingsimulator").
>
> Referencia visual: `clip-20261009-083527-605.png` (6 paneles Claude Code en grid 3×2, cards redondeadas con
> header por panel: dot de estado · glifo de proveedor · nombre · `···` · `⤢` · `+` · `×`).

---

## 0. Diagnóstico — por qué se buguea hoy

Todo pasa por tres ficheros: `src/hooks/useTerminal.ts`, `src/components/terminal/BentoLayout.tsx` y
`electron/main.ts` (`createWindow`). Ninguno de los síntomas es aleatorio.

### 0.1 Al redimensionar la ventana

| # | Causa raíz | Dónde | Efecto visible |
|---|-----------|-------|----------------|
| R1 | `debouncedFit` espera **300 ms** tras el último evento del `ResizeObserver` antes de hacer un único `fit()`. Durante el drag, xterm sigue con las columnas viejas y el canvas WebGL se estira/recorta. | `useTerminal.ts:93-105` | Texto "elástico" y recortado mientras arrastras; salto brusco al soltar. |
| R2 | Tras ese único fit, `terminal.onResize` manda **un** `pty:resize` → ConPTY reflowea todo su buffer y reemite la pantalla completa. Claude Code (Ink) repinta su frame entero con `cursor-up N`; si xterm y el PTY no tienen **exactamente** las mismas filas en ese instante, la aritmética de cursor falla. | `usePty.ts:1497`, `pty-manager.ts:resize` | Fragmentos duplicados, líneas desplazadas, cajas de input de Claude rotas. |
| R3 | El grid usa `repeat(n, 1fr)` + `gap: 1px` sin redondeo → celdas con anchos **fraccionarios** (p. ej. 452.33px). FitAddon hace `floor`, el canvas se dibuja con sub-píxel. | `BentoLayout.tsx:61-68` | Glifos borrosos, 1–2 px de "borde fantasma" entre paneles, cols que cambian al mover 1 px la ventana. |
| R4 | `BrowserWindow.backgroundColor: '#1a1025'` (morado) ≠ `--ghost-bg: #050912`. Windows pinta ese color en las zonas aún no repintadas durante el resize. | `main.ts:223` | Flash morado en los bordes al redimensionar. |
| R5 | Sidebar con `framer-motion` (`width: 0 → 320`, spring) dispara decenas de `ResizeObserver` → con R1 el terminal queda congelado 300 ms y luego salta. | `VibeSidebar.tsx:16-20` | "Lag" al abrir/cerrar sidebar. |

### 0.2 Al minimizar

| # | Causa raíz | Dónde | Efecto visible |
|---|-----------|-------|----------------|
| M1 | **`backgroundThrottling`** (default `true`). Minimizada, Chromium limita `setTimeout`/`rAF` a ~1/s. xterm encola `write()` con timers → los **acks de flow-control dejan de fluir** → `unacked` supera `FLOW_HIGH_WATERMARK` (100 k) → `ptyManager.pause()`. Claude Code se queda bloqueado escribiendo a un pipe pausado. Al restaurar, se vacía todo de golpe. | `main.ts:42-48, 332-336`; `createWindow` sin `backgroundThrottling:false` | Al volver, avalancha de output, repintados en cascada y UI congelada varios segundos. |
| M2 | Chromium **libera el contexto WebGL** de ventanas ocultas. `onContextLoss` pone `webglAvailableRef = false` **para siempre** → la sesión cae al DOM renderer (10× más lento con `scrollback: 10000`) y nunca vuelve a WebGL. | `useTerminal.ts:118-136` | *Después* de minimizar una vez, cualquier output largo va a tirones. Es el "al escribir algo largo se buguea muchísimo". |
| M3 | Al minimizar, la ventana pasa a 0×0 → `ResizeObserver` → `safeFit` lo salta (`< 10px`, correcto) pero el `fit` agendado dentro de un `rAF` se queda **colgado hasta restaurar**; al restaurar se acumulan ResizeObserver + rAF pendiente + `ghostshell:refit` → 2–3 fits/pty-resize seguidos (ver R2). | `useTerminal.ts:97-104`, `TerminalContainer.tsx:118-121` | Doble repintado de Claude al restaurar. |
| M4 | No hay listener de `visibilitychange` ni de `restore` de la ventana: nadie fuerza `refresh()` + re-attach WebGL al volver. | — | Canvas en negro hasta que llega output nuevo. |

### 0.3 Con output largo (independiente de minimizar)

| # | Causa raíz | Efecto |
|---|-----------|--------|
| L1 | Paneles ocultos con `display: none` (tabs / maximize). Al mostrarse, su tamaño es distinto al que tenían → fit → `pty:resize` → R2. Cada cambio de pestaña es un reflow de ConPTY. | Cambiar de tab con Claude trabajando = repintado completo con duplicados. |
| L2 | Claude Code (Ink) repinta el frame completo cuando la salida excede el alto del viewport; con `rows` pequeñas (grid 3×2 en 1400×900 ≈ 18 filas) el repintado es constante. | Scroll y flicker con respuestas largas; se agrava con M2. |
| L3 | `refresh(0, rows-1)` se llama en varios sitios (settings sync, activación) sin coalescer. | Micro-stalls al alternar paneles. |

**Conclusión:** el motor de bytes ya está bien (v2.3.0); lo que está roto es la **sincronía tamaño ⇄ PTY** y la
**gestión del ciclo de vida de la ventana**. Son ~6 cambios quirúrgicos (Fase 1), no otra reescritura.

---

## 1. Patrones identificados en la referencia

```
┌─ ● 🟧 Emma ─────────────────── ··· ⤢ + × ┐  ← header 28px, dot+glifo+nombre | acciones tenues
│                                            │
│  🟧 Claude Code v2.1.294                   │  ← xterm, padding 10px, font mono 12px
│     Opus 5.5 with xhigh …                  │
│                                            │
│                       ● xhigh · /effort    │  ← esto es el TUI de Claude, NO UI nuestra
│  > Try "refactor Blue light.mat"           │
│  ▶▶ auto mode on (shift+tab to …)          │
└────────────────────────────────────────────┘
```

| Patrón | Valor observado | Token propuesto |
|--------|-----------------|-----------------|
| Fondo de app | `#0a0a0a`–`#0b0b0b`, plano | `--shell-bg` |
| Fondo de card | `#0e0e0e`–`#101010` | `--pane-bg` |
| Borde de card | 1 px, `rgba(255,255,255,.07)` | `--pane-border` |
| Radio de card | 10–12 px | `--pane-radius: 12px` |
| Gap entre cards | 10–12 px uniforme; padding exterior igual al gap | `--pane-gap: 12px` |
| Header | 28 px, texto 12 px semibold, iconos 12 px a `white/30`, hover `white/80` | `--pane-header-h: 28px` |
| Dot de estado | 6 px, verde `#4ade80` activo / gris idle | `--status-active` |
| Glifo proveedor | 12 px, color del proveedor (Claude naranja `#d97757`) | ya existe `getProviderColor` |
| Nombre | nombre de persona (Emma, James…), nunca "Terminal 3" | `session.title` + auto-naming |
| Acciones | siempre visibles pero tenues (no `opacity-0 group-hover`) | — |
| Acciones (orden) | `···` menú · `⤢` maximizar · `+` nuevo/split · `×` cerrar | — |
| Grid | 3 cols × 2 filas; cards del mismo tamaño; sin tab bar visible | `getGridDimensions` ya lo da |
| Tipografía terminal | mono 12 px, line-height ~1.35, sin letter-spacing | `terminalFontSize: 12` |
| Sin gradientes / sin glow | cumple `CLAUDE.md` del repo | — |

---

## 2. Arquitectura objetivo (renderer)

```
TerminalContainer
└─ PaneGrid            ← nuevo (sustituye BentoLayout): padding = gap, tamaños enteros
   └─ PaneCell ×N      ← absolute, inset calculada en px enteros; hidden = visibility:hidden (NO display:none)
      └─ TerminalPane
         ├─ PaneHeader ← nuevo: dot · glifo · nombre · spacer · [menu][maximize][split][close]
         ├─ xterm host (contain: strict)
         └─ TerminalCommandBar (sin cambios)
```

Reglas de diseño del layout:

1. **Tamaños en píxeles enteros.** `PaneGrid` mide su `clientWidth/Height` (un solo `ResizeObserver` en el grid,
   no uno por pane) y calcula `Math.floor` para cada celda → cols/rows estables.
2. **Ocultar ≠ desmontar ≠ `display:none`.** Pane oculto = `visibility:hidden` **manteniendo el mismo tamaño que
   tendrá al mostrarse** (en modo tabs todos ocupan el área completa; en grid, su celda). Cambiar de tab deja de
   producir `pty:resize`. Es el modelo de VS Code.
3. **Maximizar = overlay.** El pane maximizado pasa a `inset: 0` del grid; los demás quedan `visibility:hidden` con
   su celda intacta. Un solo resize al entrar y otro al salir.
4. **`contain: strict` + `will-change: transform`** en cada `PaneCell` para que un repintado de xterm no invalide el
   layout de los vecinos.

---

## 3. Fases

### Fase 1 — Estabilidad del motor (bloquea todo lo demás) · ~1 día

| Paso | Cambio | Fichero | Cierra |
|------|--------|---------|--------|
| 1.1 | `webPreferences.backgroundThrottling: false` y `backgroundColor: '#050912'` (leer de tema al arrancar si se quiere exacto). | `electron/main.ts:216-231` | M1, R4 |
| 1.2 | Nuevo `fitNow()`: `fitAddon.proposeDimensions()` → si `cols/rows` cambian, `term.resize()` **y** `pty:resize` en el mismo tick. Coalescer con **un rAF** (≈16 ms) en vez de 300 ms; mantener un "settle" trailing de 120 ms para la última medida. | `useTerminal.ts` (`debouncedFit`, `safeFit`) | R1, R2, R5 |
| 1.3 | Congelar `pty:resize` mientras `document.visibilityState === 'hidden'`; al volver `visible`: un `fitNow()` + `refresh()` único. | `useTerminal.ts` + listener `visibilitychange` | M3 |
| 1.4 | WebGL: en `onContextLoss` no desactivar para siempre; reintentar `attachWebgl` en `visibilitychange→visible` (máx. 3 intentos, backoff). Log a consola del renderer activo. | `useTerminal.ts:118-136` | M2 |
| 1.5 | Un `ResizeObserver` en el grid (no por pane). Eliminar `ghostshell:refit` global + los 3 timers escalonados (0/200/400 ms) de activación; reemplazar por `fitNow()` tras `layout commit` (`useLayoutEffect`). | `useTerminal.ts:218-262`, `TerminalContainer.tsx:118-121`, `AppLayout.tsx:265` | M3, L3 |
| 1.6 | Reemplazar `display:none` por `visibility:hidden` con tamaño conservado (ver §2). | `BentoLayout.tsx` → `PaneGrid.tsx` | L1 |
| 1.7 | Exponer `window.ghostshell.onWindowState('minimize'|'restore')` desde main por si el renderer necesita distinguir minimize de "pestaña oculta" (opcional; `visibilitychange` suele bastar). | `main.ts`, `preload.ts` | M4 |

**Criterio de salida:** con Claude Code generando una respuesta de >200 líneas: (a) arrastrar la ventana 10 s no produce
líneas duplicadas; (b) minimizar 30 s y restaurar no bloquea ni repinta en cascada; (c) `renderer` sigue siendo WebGL
tras restaurar (comprobar con `term._core._renderService` o log 1.4).

### Fase 2 — `PaneGrid` + tokens · ~0,5 día

- `src/components/terminal/PaneGrid.tsx` (nuevo) con la lógica de §2. Conserva `getGridDimensions()` (ya testeado).
- Tokens en `globals.css`: `--shell-bg`, `--pane-bg`, `--pane-border`, `--pane-radius`, `--pane-gap`,
  `--pane-header-h`, `--status-active`, `--status-idle`. Respetar los 16 temas: los tokens derivan de `--ghost-*`
  (`--pane-bg: color-mix(in srgb, var(--ghost-bg) 92%, white)`), sin gradientes.
- Card: `border-radius: var(--pane-radius); border: 1px solid var(--pane-border); overflow: hidden; contain: strict`.
- `.xterm { padding: 10px 12px }` (hoy `4px 6px`). FitAddon ya descuenta el padding.
- Tests: `PaneGrid.layout.test.ts` → dado `(w, h, n, gap)` devuelve rects enteros, sin solapes, suma = área.

### Fase 3 — `PaneHeader` · ~0,5 día

Nuevo `src/components/terminal/PaneHeader.tsx` extraído de `TerminalPane.tsx:296-390`:

```
[● dot] [glifo proveedor] [Nombre (dblclick rename)] [estado · 12s] ·········· [···] [⤢] [+] [×]
```

- **Dot**: `--status-active` si `useLiveActivity().busy`, `--status-idle` si no. Ya existe la lógica.
- **Glifo proveedor**: `lucide` o SVG propio por proveedor con `getProviderColor`. Para shells sin proveedor: `TerminalIcon`.
- **Acciones siempre visibles** a `opacity .3`, hover `.85`. Quitar `opacity-0 group-hover:opacity-100`.
  - `···` → `AgentContextMenu`/menú de pane (rename, duplicate, change cwd, export).
  - `⤢` → `toggleMaximize(session.id)` (ya existe en `terminalStore.ts:359`; hoy no tiene botón). Icono cambia a `⤡` cuando está maximizado. Atajo: `Ctrl+Shift+Enter` (registrar en `shortcutRegistry`).
  - `+` → `duplicateSession` (split con mismo cwd).
  - `×` → `removeSession` con confirm si el proceso está vivo.
- Mantener el `cwdLeaf` como tooltip del nombre, no como texto (la referencia no lo muestra).

### Fase 4 — Nombres de panel · ~0,25 día

- Auto-naming al crear sesión: si hay `agentId` → nombre del agente; si no, tomar de `swarm-personas.ts` un nombre
  no usado (Emma, James, Olivia, Michael, Grace, Daniel…). Persistir en `session.title` (ya se guarda en `tabSnapshot`).
- Rename: doble clic (existe) + `F2` (existe `SHORTCUT_EVENTS.renameTab`) + opción en `···`.
- Test: `terminalStore.test.ts` → dos sesiones nuevas nunca reciben el mismo nombre; renombrar persiste tras snapshot.

### Fase 5 — Maximizar / modo foco · ~0,25 día

- Overlay (§2.3) con transición de 120 ms solo en `opacity` (sin animar `width/height`: evita R5 dentro del pane).
- Mientras maximizado, `Esc` restaura; los demás paneles conservan tamaño → al restaurar no hay reflow de ConPTY.
- Los atajos `Ctrl+1..9` siguen seleccionando pane y, si hay uno maximizado, lo sustituyen en el overlay.

### Fase 6 — Pulido · ~0,25 día

- Tab bar de workspaces: ocultarla cuando `viewMode === 'grid'` (la referencia no la tiene); mostrar en `tabs`.
- `terminalFontSize` default 12 y `lineHeight` 1.35 en `terminalPresets.ts` para el perfil usado con agentes.
- Scrollbar xterm: 8 px, thumb `white/15`, sin track visible (hoy 14 px con track).
- Empty state (`TerminalContainer.tsx:156-183`) al mismo lenguaje: card centrada, sin `hover:scale`.

### Fase 7 — Verificación

- `npm run verify` (typecheck + vitest) en verde.
- QA manual con checklist (añadir a `docs/QA-PANES.md`):
  1. 6 paneles Claude Code en grid; redimensionar ventana en diagonal 10 s → sin duplicados.
  2. Minimizar 30 s con output en curso → restaurar en <500 ms, WebGL activo.
  3. Cambiar de tab 20 veces seguidas → `pty:resize` enviado **0** veces (instrumentar con `console.count`).
  4. Maximizar/restaurar → exactamente 2 `pty:resize`.
  5. Abrir/cerrar sidebar → el terminal sigue el spring sin saltos (fit por frame).
  6. DPI 125 % y 150 % → bordes de card nítidos, cols estables.

---

## 4. Orden de ejecución y dependencias

```
Fase 1 ──► Fase 2 ──► Fase 3 ──► Fase 5 ──► Fase 6 ──► Fase 7
                 └───► Fase 4 ─────┘
```

Fase 1 va **primero y sola**: sin sincronía tamaño⇄PTY, cualquier rediseño del grid heredará los mismos bugs. Fases 3 y 4
son independientes entre sí y pueden ir en paralelo.

## 5. Fuera de alcance (explícito)

- Reescribir `usePty.ts` (1620 líneas): el pipeline de bytes ya es correcto; se toca solo `onResize`.
- Cambiar de xterm.js a otro renderer.
- Rediseño de sidebar/swarm/dashboard: solo el área de terminales.
- El flicker intrínseco de Ink en Claude Code con respuestas que exceden el viewport (L2) no se puede eliminar desde el
  host; se mitiga con filas estables y WebGL. Si molesta, la única palanca real es menos paneles por fila o fuente 11 px.

---

## 6. Estado de implementación (2026-10-09, rama `feat/pane-redesign`)

Todas las fases ejecutadas y publicadas en **v2.4.0**. `npm run verify` verde (typecheck + 111 tests, 17 nuevos) y `electron-vite build` OK.

| Fase | Hecho | Verificado en la app (CDP) |
|------|-------|----------------------------|
| 1 Motor | `backgroundThrottling:false`; color de ventana = `--shell-bg` del tema (IPC `window:setBackgroundColor`); `fitNow`/`scheduleFit` por rAF con debounce de cols >200 líneas (modelo VS Code); resize congelado mientras la ventana está minimizada (`src/lib/windowLifecycle.ts` + IPC `window:state`); WebGL se re-adjunta al restaurar; sync de tamaño del PTY tras `ptyCreate`; fuera `ghostshell:refit` y los 3 timers 0/200/400 ms | Minimizar 3 s → timers a ritmo completo (138 ticks/100 ms), tamaños idénticos y WebGL activo al volver; resize de ventana en 24 pasos sin desajustes |
| 2 PaneGrid | `src/lib/paneLayout.ts` (rects enteros, fila corta estirada) + `PaneGrid.tsx`; ocultar = `visibility` conservando rect; tokens `--pane-*` | 6 y 7 panes, rects enteros; maximizar/restaurar → el pane vuelve a 416×340 exactos |
| 3 PaneHeader | dot · glifo de proveedor · nombre (14 px) · estado · `···` `⤢` `+` `×`; botones no roban foco | Glifos Claude/Codex detectados en vivo |
| 4 Nombres | `src/lib/paneNames.ts`; `addSession`/`duplicateSession` asignan nombres únicos; `updateSession` no pisa un nombre con "Terminal"; `renameSession` para el usuario | Emma…Sofia |
| 5 Maximizar | Overlay; un maximizado solo tapa su propia vista (antes tapaba todas las pestañas); devuelve el foco al pane | Foco en el input del pane tras maximizar |
| 6 Pulido | Dock (luego: solo Tabs, ver iteración 2); barra de comandos de una sola fila de altura fija (~53 px vs ~110 px); scrollbar solo al hover; borde de selección con acento + filo interior + header tintado; selector GhostCode/GhostSwarm eliminado → `+`, estado vacío y arranque abren QuickLaunch | — |

**Iteración 2 (feedback en vivo)**

- Solo modo Tabs (un workspace a la vez); el conmutador Grid/Tabs desaparece y los snapshots en grid se abren como tabs.
- Pestañas rediseñadas: la activa es una mini-card con regla de acento, glifo del proveedor, contador para grupos, color de etiqueta como punto.
- Zero Lux es el tema por defecto; settings v6 lo aplica **una vez** a quien actualice (`migrateSettings`), después se respeta su elección.
- Borde seleccionado: 2 px sólidos (borde + anillo interior) sin cambiar el box (no redimensiona el PTY). El grid se maqueta en píxeles de dispositivo desde un origen alineado: antes, con fuente de UI 14 px, empezaba en (8,75 ; 38,5) y todos los bordes salían difuminados.
- Bug: tras activarse WebGL (mide la celda distinto al renderer DOM) no se reajustaba → terminales con 4–8 columnas de menos. Ahora se reajusta al cambiar de renderer.
- Foco: los botones del header no roban el foco; maximizar/restaurar lo devuelve al pane; en panes con barra de comandos el foco que cae en xterm se redirige a la barra.

**Desviaciones respecto al plan**

- `contain: strict` / `will-change` descartados: convierten el card en containing block de `position:fixed` y rompen los popups de la barra de comandos.
- Se mantiene un `ResizeObserver` por pane (coalescido por rAF) en vez de uno solo en el grid: mismo efecto, menos acoplamiento.
- `Esc` para salir de maximizado descartado: Claude Code usa `Esc` para interrumpir. Se restaura con `⤡`, doble clic en el header o `Ctrl+Shift+Enter`.
- Sin confirmación al cerrar un pane con proceso vivo (se mantiene el comportamiento anterior).
- `GHOSTSHELL_USER_DATA_DIR` (nuevo, opcional) aísla el `userData` para QA en dev; sin él, dev comparte datos con la app instalada.
- GhostSwarm ya no aparece al crear sesión; el subsistema sigue intacto y accesible desde la paleta de comandos.
