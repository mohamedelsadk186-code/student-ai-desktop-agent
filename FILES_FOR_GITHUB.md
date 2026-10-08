# GitHub Submission Checklist

## Commit these project files

- `.github/CODEOWNERS`
- `.github/workflows/release.yml`
- `.gitignore`
- `.env.example`
- `.env.openai`, `.env.claude`, `.env.gemini` only while they contain placeholder keys
- `electron/main.js`, `electron/preload.js`, `electron/notarize.js`
- `server/index.js`
- `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/types.ts`, `src/vite-env.d.ts`
- `index.html`
- `package.json` and `package-lock.json`
- `tsconfig.json` and `vite.config.ts`
- `README.md`, `README-START.md`, `README-FINAL.md`, `README-GITHUB.md`
- `GITHUB_PROJECT.md`, `RELEASE_NOTES.md`, `SECURITY.md`, and `LICENSE`

## Do not commit

- `.env` or any file containing real API keys, tokens, passwords, or signing certificates
- `node_modules/`
- `dist/`, `release/`, `.vite/`, or packaged application files
- SQLite database files (`*.db`, `*.sqlite`, `*.sqlite3`) or their journal files
- Logs, operating-system metadata, and editor-specific files

These generated and local files are covered by `.gitignore`. Review the staged file list before the first push to confirm no credentials or local database data are included.

## Before publishing

- Add a valid GitHub owner rule to `.github/CODEOWNERS` when you are ready to assign code ownership; it is comment-only until then.
- Confirm the provider environment templates contain placeholders only.
- Run `npm ci` and `npm run build`.
- Check the repository About description and topics in `GITHUB_PROJECT.md`.
- For a tagged release, use a version tag such as `v0.1.0` and adapt `RELEASE_NOTES.md` as needed.

## Release workflow note

Pushing a version tag such as `v0.1.0` builds Windows, macOS, and Linux packages, uploads the artifacts, and publishes a GitHub Release using `RELEASE_NOTES.md`. Without signing secrets, Windows and macOS outputs are unsigned installers. Add valid signing/notarization secrets for trusted distribution.
