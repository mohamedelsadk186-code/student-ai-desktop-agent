# Student AI Desk

A desktop AI study assistant for university students.

## Features
- AI chat for study help
- math solving
- notes and tasks tracking
- calendar events
- PDF/text summarization
- SQLite database
- OpenAI / Claude / Gemini support

## Quick Start

### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment

Choose one provider file and copy it to `.env`:

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

### 4) Build app
```bash
npm run build
```

### 5) Package app
```bash
npm run electron:build
```

## Provider examples

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

## Release signing

For signed release builds, add the following secrets to GitHub Actions:

### Windows
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

### macOS
- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Then tag a release:
```bash
git tag v1.0.0
git push origin v1.0.0
```

## License
MIT
