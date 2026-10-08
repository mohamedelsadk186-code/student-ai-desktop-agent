# Student AI Desk

## 1) Install

```bash
npm install
```

## 2) Setup environment

Copy the example file and fill in your key(s):

```bash
copy .env.example .env
```

### Example .env values

```env
PORT=3001
HOST=127.0.0.1
DEFAULT_PROVIDER=local
DEFAULT_MODEL=gpt-4o-mini
API_BASE_URL=

# OpenAI
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1

# Claude
CLAUDE_API_KEY=

# Gemini
GEMINI_API_KEY=
```

### Choose a provider

- Local mode: leave all keys empty and use `DEFAULT_PROVIDER=local`
- OpenAI: set `DEFAULT_PROVIDER=openai` and `OPENAI_API_KEY=...`
- Claude: set `DEFAULT_PROVIDER=claude` and `CLAUDE_API_KEY=...`
- Gemini: set `DEFAULT_PROVIDER=gemini` and `GEMINI_API_KEY=...`

## 3) Run app

```bash
npm run dev
```

This starts:
- Express API on port 3001
- Vite frontend on port 5173
- Electron desktop app

## 4) Build app

```bash
npm run build
```

## 5) Package for release

```bash
npm run electron:build
```

For platform-specific builds:

```bash
npm run release:win
npm run release:mac
npm run release:linux
```

## Notes

- The app stores notes/tasks/events in SQLite.
- The app can fallback to local study answers if no AI key is supplied.
- For signed release builds, you need certificates and secrets in GitHub Actions.
