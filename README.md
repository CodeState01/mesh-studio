# Orbe Studio

Desktop app (Windows) for **3D modeling, animation, motion design, VFX/SFX, texturing and video editing**. It has a built-in AI assistant that works through **multiple cursors at the same time**, an **MCP server** that external AI clients can connect to, **70 AI providers** (including 19 local runtimes), and **automatic updates**.

## Running it

```bash
npm install
npm start          # build + open the app
npm run dev        # development with hot reload (Vite + Electron)
npm run dist       # generate the Windows installer in release/
```

## Features

| Area | What it does |
|---|---|
| **Modeling** | 10 primitives + plugins, 3D text, Edit Mode (Tab) with vertex editing, smooth/flat shading |
| **Modifiers** | Array, Mirror, Subdivide, Decimate, Twist, Bend (all with Ctrl+Z) |
| **Materials** | Full PBR (metalness, roughness, clearcoat, transmission, emission, opacity) |
| **Textures** | 10 procedural textures with an automatically generated normal map + image import |
| **Lighting** | Point, Spot, Sun, Area, Hemisphere + studio environment (PMREM) and sky presets |
| **Animation** | Keyframes with 7 easings, a dopesheet with draggable keys, 10 motion presets |
| **VFX** | GPU particles: fire, smoke, sparks, snow, rain, magic, confetti, dust |
| **SFX** | 9 synthesized sounds (no files needed) + audio import, synced to the timeline |
| **Video** | NLE with 3 video tracks + 1 audio track, 3D scene, animated title, color, image and video clips, transitions, cutting, and **WebM export with audio** |
| **Render** | Bloom, ACES tone mapping, soft shadows, PNG/4K render through the scene camera |
| **I/O** | Import glTF/GLB/OBJ/FBX/STL, export GLB/glTF/OBJ/STL, versioned `.orbe` projects, autosave |
| **Editor** | Undo/redo, outliner, scrub fields, command palette (Ctrl+K), DCC-style shortcuts |

## AI

- **Assistant panel**: pick a provider and a model, then describe what you want. The tools the model calls in a single response **run in parallel, each with its own cursor**. You can set 1 to 8 cursors.
- **Providers**: Anthropic, OpenAI, Gemini, xAI, Mistral, DeepSeek, Groq, OpenRouter, Together, Fireworks, NVIDIA, Hugging Face, Moonshot, Qwen, and others, for 51 cloud providers in total. **Local runtimes**: Ollama, LM Studio, llama.cpp, vLLM, SGLang, LocalAI, Jan, KoboldCpp, and 11 more. To add one, append a line to `src/ai/providers.js`.
- **Demo mode** (offline) shows the cursors working without needing an API key.
- API keys are encrypted with the operating system's `safeStorage`.

## MCP: controlling Orbe from other AI clients

With the app open:

```json
{ "mcpServers": { "orbe": { "command": "node", "args": ["C:/caminho/para/orbe/mcp/server.mjs"] } } }
```

For Claude Code: `claude mcp add orbe -- node "C:/caminho/para/orbe/mcp/server.mjs"`.
Self-test: `node scripts/mcp-selftest.mjs`.

## Future updates

- **Auto-update**: set `build.publish` in `package.json` (owner/repo), then run `npm version patch && git push --follow-tags`. The workflow in `.github/workflows/release.yml` publishes the release, and installed apps update themselves.
- **Project migrations**: `src/io/io.js` → `MIGRATIONS`. Old projects keep opening after the format changes.
- **Plugins**: any `src/plugins/*.js` file is loaded automatically (see `exemplo-piramide.js`).
- **New AI/MCP tools**: declare them in `mcp/toolspec.mjs` and implement them in `src/core/tools.js`. Both the MCP server and the built-in assistant pick them up automatically.

## Architecture

```
electron/   main process: window, MCP bridge (WebSocket), AI proxy, updater
mcp/        MCP server (stdio) + toolspec (single source of tools)
src/core/   viewport, objects, commands, history, edit mode, modifiers, tools, plugins
src/ai/     providers, unified client (OpenAI/Anthropic), agent, demo
src/fx/     textures, VFX, audio      src/anim/  timeline      src/video/  editor
src/ui/     shell, panels, timeline, AI panel, AI cursors, icons
```
