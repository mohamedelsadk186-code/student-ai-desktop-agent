# Student AI Desk

Student AI Desk is a desktop study assistant for university students. It helps with:
- AI chat for courses and study planning
- math solving
- notes and tasks management
- calendar events
- PDF/text summarization
- local SQLite persistence
- OpenAI / Claude / Gemini support

## Tech stack
- React + TypeScript
- Electron
- Express
- SQLite
- Vite

## Quick start

### 1) Install

```bash
npm install
```

### 2) Configure environment

Use one of the provider files:

```bash
copy .env.openai .env
```

or

```bash
copy .env.claude .env
```

or

```bash
copy .env.gemini .env
```

### 3) Run locally

```bash
npm run dev
```

### 4) Build

```bash
npm run build
```

### 5) Package

```bash
npm run electron:build
```

Or platform-specific builds:

```bash
npm run release:win
npm run release:mac
npm run release:linux
```

## Provider setup

### OpenAI
```env
DEFAULT_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
```

### Claude
```env
DEFAULT_PROVIDER=claude
CLAUDE_API_KEY=your_key_here
```

### Gemini
```env
DEFAULT_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
```

### Local mode
```env
DEFAULT_PROVIDER=local
```

## Notes
- SQLite is used for notes, tasks, and events.
- The app falls back to local answers when keys are missing.
- For signed releases, add certificate secrets in GitHub Actions.

## License
MIT
