<p align="center"><img src="build/icon.png" width="96" alt="Mesh"></p>

<h1 align="center">Mesh</h1>

<p align="center"><b>Open-source 3D studio</b>: modeling, sculpting, animation, VFX/SFX and video editing, with an AI assistant that works on screen through multiple cursors.<br>
You can use <b>your own Gemini or Claude account</b> instead of paying for an API.</p>

<p align="center">
  <a href="https://github.com/CodeState01/mesh-studio/releases/latest"><b>⬇ Download for Windows</b></a> ·
  <a href="#recursos">Features</a> ·
  <a href="#ia">AI</a> ·
  <a href="#compilar">Build from source</a>
</p>

---

## Download and installation

Grab the latest version from [**Releases**](https://github.com/CodeState01/mesh-studio/releases/latest):

| File | Use |
|---|---|
| `Mesh-Setup-x.y.z.exe` | **Installer (recommended).** Creates shortcuts and **updates itself automatically**. |
| `Mesh-x.y.z-portable.exe` | Runs without installing (USB stick, restricted PCs). It does **not** update on its own. |

> **Windows SmartScreen:** the installer is not yet digitally signed, so Windows may show "Windows protected your PC".
> Click **More info → Run anyway**. The source code is fully public in this repository.

### Automatic updates
The installed app checks for a new version **when it opens and every 4 hours**. It downloads the update in the background and
offers **"Restart to update"**. You can also check manually in **Settings → Updates**.

<a id="recursos"></a>
## Features

- **Modeling:** vertex, edge and face editing, extrude, inset, bevel, loop cut, merge, connect, fill and subdivide,
  plus X mirror, proportional editing and booleans.
- **Non-destructive modifiers:** smooth subdivision (Catmull-Clark), mirror, array, solidify, twist and displace.
- **Precision:**
  - Typed transforms: `G` / `R` / `S`, then axis `X`/`Y`/`Z`, then a number, then `Enter`.
  - Snapping to grid, vertex, edge midpoint or face center.
  - 3D cursor, ruler, units (m/cm/mm/in), alignment and exact dimensions.
- **Sculpting:** inflate, dig, grab, smooth and flatten brushes.
- **UV and painting:** unwrap (smart, box, planar, spherical, cylindrical) and texture painting on the model.
- **Animation:** keyframes, curve editor, motion presets, rigging with automatic weights, rigid-body physics and cloth.
- **VFX and SFX:** GPU particles (fire, smoke, sparks, magic…) and synthesized sounds on the timeline.
- **Video:** clip editor with transitions and WebM export with audio.
- **Store:** models, materials, textures, VFX and SFX with real previews, plus Poly Haven CC0 assets.
- **Code Lab:** generate 3D with JavaScript and watch a live preview.
- **Engines:** send models to Unity, Unreal, Godot, Roblox Studio and Blender, with live sync.
- **Interface:** a floating canvas where panels move freely and can **pop out into another window or monitor**.
- **Camera:** WASD fly camera (hold the right mouse button; Space goes up).

<a id="ia"></a>
## AI

| Mode | How it works |
|---|---|
| **Your account (no API)** | Settings → **Accounts**. Uses the official **Gemini CLI** (Google account: free, Pro or Ultra) and **Claude Code** (Claude Pro/Max) tools, which log in with your subscription. The agent receives **only** Mesh's tools: no terminal, no files, no web. |
| **API key** | 51 cloud providers (Anthropic, OpenAI, Gemini, Mistral, DeepSeek, Groq, OpenRouter…). Keys are encrypted on your PC. |
| **Local models** | 19 local servers (Ollama, LM Studio, llama.cpp, vLLM…). No key and no internet needed. |
| **MCP** | Any MCP client (Claude Desktop, Claude Code, Cursor…) can control Mesh. See Settings → MCP. |

Every action the AI takes appears on screen as its own cursor, and several cursors work in parallel.

<a id="compilar"></a>
## Build from source

Requirements: **Node.js 20+** and Windows 10/11.

```bash
git clone https://github.com/CodeState01/mesh-studio.git
cd mesh-studio
npm install
npm start          # build + open the app
npm run dev        # development with hot reload
npm run dist       # builds the installer and the portable exe in release/
```

Tests for the modeling geometry:

```bash
node tests/editmesh.test.mjs
node tests/modstack.test.mjs
```

### Publishing a new version (maintainers)
1. Bump `version` in `package.json` (for example with `npm version patch`).
2. Push the tag: `git push --follow-tags`.
3. The workflow in `.github/workflows/release.yml` builds the installer and publishes the Release. Installed apps update themselves.

## Project structure

```
electron/      window, AI proxy, MCP bridge, account agents, updater
mcp/           MCP server + toolspec (single source of tool definitions)
src/core/      viewport, EditMesh, modifiers, precision, sculpting, UV, rigging, physics
src/ui/        floating canvas, panels, pages, AI cursors
src/store/     store + thumbnail generator     src/code/  Code Lab
integrations/  scripts for Blender, Unreal, Unity, Godot, Roblox
tests/         modeling geometry tests
```

## License

[MIT](LICENSE). Use, modify and distribute freely.
Credits: Poly Haven assets (CC0) · icons by [Lucide](https://lucide.dev) (ISC) · brand logos by [Simple Icons](https://simpleicons.org) (CC0) · Helvetiker font (license in `src/assets/FONT_LICENSE`).
