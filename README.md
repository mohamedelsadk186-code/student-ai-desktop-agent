# Student AI Desk

A desktop AI study assistant for university students built with Electron, React, TypeScript, Express, and SQLite.

## Features

- Animated 3D NOVA assistant with Arabic and English student-data actions
- Academic Hub for subjects, lectures, exams, attendance, grades, and credits
- Student dashboard with study trends, GPA estimates, attendance, and deadlines
- Day, week, and month planner with subject-linked study sessions and exams
- Focus timer, break timer, daily/weekly goals, and study streaks
- Markdown Knowledge Base with search, folders, tags, favorites, pins, and academic links
- Exam Center with syllabus, study-plan generation, and grade records
- Developer Workspace with a multi-language editor and coding utilities
- Calculator, GPA, percentage, binary/hex, data-unit, and date tools
- File Vault for user-selected file/folder references; files are not moved
- Backup export and confirmed restore
- PDF and text summarization
- OpenAI, Claude, and Gemini integration
- Local backend with SQLite data storage
- Desktop app ready for Windows, macOS, and Linux

## AI and Data Safety

NOVA reads academic records and notes stored in the app. Connect an AI provider in Settings for general model-backed answers; without a provider, local responses are limited. App Lock and encrypted-at-rest storage are not implemented, so do not treat local API-key storage as encrypted.

## Tech Stack

- Frontend: React + TypeScript + Vite
- Desktop: Electron
- Backend: Express + SQLite
- AI Providers: OpenAI, Anthropic Claude, Google Gemini

## Installation

```bash
npm install
```

## Configure AI Provider

Copy one of the ready-made environment files:

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

Then update the keys in `.env`.

## Run the App

```bash
npm run dev
```

This starts the app in development mode.

## Build Production App

```bash
npm run build
```

To package the desktop app:

```bash
npm run electron:build
```

## Project Structure

```text
.
├── src/
├── server/
├── electron/
├── .env.openai
├── .env.claude
├── .env.gemini
├── .env.example
├── package.json
├── package-lock.json
├── README.md
├── LICENSE
├── SECURITY.md
├── .github/
└── .gitignore
```

## License

This project is licensed under the MIT License.

## Security

Please review [SECURITY.md](SECURITY.md) before reporting vulnerabilities.
