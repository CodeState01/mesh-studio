# Argila Studio

Open-source desktop app (Windows) for **3D modeling, sculpting, materials, animation, VFX/SFX and video editing**. The interface is friendly instead of cockpit-like. Argila includes an AI assistant that works through **multiple cursors at once**, an **MCP server** for external AI clients, **70 AI providers** (19 of them local), a **store** with previews, a **Code Lab** with live preview, **engine export** and **auto-updates**.

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
- MCP: `claude mcp add argila -- node "<pasta>/mcp/server.mjs"`. Self-test: `node scripts/mcp-selftest.mjs`.

## Engine integrations (`integrations/`)

| Engine | How it works |
|---|---|
| Blender | `blender/argila_live_link.py` add-on. Reloads automatically on every send. |
| Unreal | `unreal/argila_import.py` Python script. Imports into `/Game/Argila`. |
| Unity | `unity/ArgilaLiveLink.cs`. Updates the instance in the scene. Requires glTFast. |
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
