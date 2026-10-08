# Student AI Desk 0.1.0

Initial development release of Student AI Desk.

## Included

- Electron desktop application with a React, TypeScript, and Vite interface
- Express backend with SQLite persistence for notes, tasks, and events
- AI chat integration points for OpenAI, Claude, and Gemini
- PDF and text summarization
- Development and desktop packaging scripts for Windows, macOS, and Linux

## Before you use it

- Add your own AI provider API key in a local `.env` file. Never publish that file.
- Unsigned desktop builds may show operating-system security warnings.
- Windows/macOS signing and macOS notarization require valid certificates and credentials.
- This is an initial release; back up important local data.

## Build from source

```bash
npm ci
npm run dev
```

To build the renderer and package the desktop app:

```bash
npm run build
npm run electron:build
```
