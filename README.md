# Mesh

Open-source desktop app (Windows) for **3D modeling, sculpting, materials, animation, VFX/SFX and video editing**. The interface is friendly instead of cockpit-like. Mesh includes an AI assistant that works through **multiple cursors at once**, an **MCP server** for external AI clients, **70 AI providers** (19 of them local), a **store** with previews, a **Code Lab** with live preview, **engine export** and **auto-updates**.

License: MIT.

## Running it

```bash
npm install
npm start          # build + open the app
npm run dev        # development with hot reload
npm run dist       # Windows installer in release/
```

## Pages

| Page | What it does |
|---|---|
| **Home** | Quick start and autosave recovery |
| **Model** | Primitives, 3D text, **Edit mode (Tab)** with vertices/faces, **Extrude (E)**, delete faces, **booleans** (union/subtract/intersect), modifiers (array, mirror, subdivide, decimate, twist, bend) |
| **Sculpt** | Inflate, Dig, Grab, Smooth and Flatten brushes, with adjustable radius/strength and BVH acceleration |
| **Materials** | PBR, 10 procedural textures with normal maps, image import |
| **Animate** | Keyframes, 7 easings, dopesheet, 10 motion presets, SFX on the timeline |
| **Effects** | 8 GPU particle types |
| **Video** | NLE with 3D-scene, title, color, image, video and audio clips, transitions, and WebM export with audio |
| **Code** | Code Lab: JavaScript editor (CodeMirror) with **live 3D preview**, templates, console, and "send to scene" |
| **Store** | Free models, materials, textures, VFX and SFX. **Every item shows a real image** (a 3D render, a particle simulation, or the sound's waveform). The Community tab adds hundreds of CC0 assets from Poly Haven (models, textures and HDRI skies) |
| **Engines** | Sends the scene or the selection to **Unity, Unreal, Godot, Roblox Studio, Blender** or Web, with **live sync** |
| **Commands** | Lists every command with its shortcut. Ctrl+K opens quick search from anywhere |
| **Settings** | AI providers and keys (encrypted), appearance/brightness, viewport, AI cursors, MCP, updates |

## AI

- Tools the model calls together **run in parallel, each with its own cursor** (1 to 8).
- 51 cloud providers plus 19 local ones (Ollama, LM Studio, llama.cpp, vLLM…). To add a provider, add a line to `src/ai/providers.js`.
- MCP: `claude mcp add mesh -- node "<pasta>/mcp/server.mjs"`. Self-test: `node scripts/mcp-selftest.mjs`.

## Engine integrations (`integrations/`)

| Engine | How it works |
|---|---|
| Blender | `blender/mesh_live_link.py` add-on. Reloads automatically on every send. |
| Unreal | `unreal/mesh_import.py` Python script. Imports into `/Game/Mesh`. |
| Unity | `unity/MeshLiveLink.cs`. Updates the instance in the scene. Requires glTFast. |
| Godot | Native `.glb` import. See `godot/README.md`. |
| Roblox | Uses Import 3D. See `roblox/README.md`. |

## Future updates

- **Auto-update** through GitHub Releases. Run `npm version patch && git push --follow-tags`.
- **Project migrations** live in `src/io/io.js`. Older `.orbe` and `.argila` files still open.
- **Plugins**: `src/plugins/*.js` files are loaded automatically.
- **New AI/MCP tools**: add them to `mcp/toolspec.mjs` and `src/core/tools.js`.

## Architecture

```
electron/      window, MCP bridge, AI proxy, engines (folders allowed by the user), updater
mcp/           MCP server + toolspec (single source of truth for tools)
src/core/      viewport, objects, edit mode, sculpt, booleans, modifiers, commands, settings
src/store/     catalog, thumbnail generator, store page (+ Poly Haven)
src/code/      Code Lab        src/engines/  engine export
src/ai/        providers, client, agent      src/ui/  shell, pages, panels, AI cursors
integrations/  scripts for Blender, Unreal, Unity, Godot, Roblox
```

Credits: Poly Haven assets (CC0). Helvetiker font (license in `src/assets/FONT_LICENSE`).

## Precision & modeling (v0.2)

- **Floating-canvas UI**: full-screen viewport with glass panels, Lucide icons on every control, provider logos (Simple Icons, CC0).
- **Multi-selection** (Shift/Ctrl+click), pivot (median / active / individual / 3D cursor), global/local orientation.
- **Modal transforms**: `G`/`R`/`S` → `X`/`Y`/`Z` → type a value → `Enter` (Esc cancels, Ctrl toggles snap).
- **Snapping** by increment, grid or vertex; **3D cursor** (Shift+right-click); **ruler** (Shift+M); align & distribute; exact dimensions in meters.
- **EditMesh** (quads/n-gons): vertex/edge/face modes, edge loops (Alt+click), box select, proportional editing (O),
  Extrude (E), Inset (I), Bevel (Ctrl+B), Loop Cut (Ctrl+R), Merge (M), Connect (J), Fill (F), Subdivide, Flip.
  Every operation opens **"Adjust last operation"** with exact values. Geometry is covered by `node tests/editmesh.test.mjs`.
- **UV**: smart/box/planar/spherical/cylindrical unwrap, UV preview, **texture painting** on the model.
- **Rigging**: auto-rig with automatic weights, Pose mode, bone keyframes.
- **Physics**: rigid bodies (cannon-es) with live simulation and bake-to-keyframes; Verlet **cloth** with pins and collisions.
- **Graph editor** for animation curves (drag keys in time × value, per-key easing).

## v0.3 — Mesh

- **Use your account instead of an API key**: Settings › Contas connects the official CLIs that log in with your personal
  subscription — **Gemini CLI** (Google account: free, Pro or Ultra) and **Claude Code** (Claude Pro/Max). Mesh runs them
  headless and gives them **only** the Mesh MCP tools (no shell, no files, no web). ChatGPT/Codex: login detected, agent run coming soon.
- **Non-destructive modifier stack**: Subdivision Surface (Catmull-Clark), Mirror (with seam weld), Array, Solidify, Twist,
  Displace — toggle, reorder, apply. Covered by `node tests/modstack.test.mjs`.
- **Fly camera**: hold right mouse → WASD + mouse look, Space/E up, Q/Ctrl down, Shift faster, wheel = speed; Shift+F toggles.
- **Movable panels**: drag by the top grabber (magnetic snapping); drop outside the window or double-click to pop a panel
  into its own window (second monitor). "Restaurar posição dos painéis" resets.
- **Mesh tools without a mesh in edit**: Extrude/Bevel/… auto-enter Edit mode in the right sub-mode, or highlight the
  vertices/edges of every mesh and wait for a click. Alt+Z toggles "show mesh parts".
- **More precision**: X-mirror editing (Shift+X), snap to edge midpoints / face centers, display units (m/cm/mm/in),
  grid size, parenting (Ctrl+P / Alt+P), hide / unhide / isolate (H / Alt+H / Shift+H), origin to 3D cursor, full outliner hierarchy.
