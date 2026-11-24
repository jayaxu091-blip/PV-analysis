# Contributing

1. Follow the README to install dependencies and start demo mode.
2. Read [the architecture](docs/architecture.md) before changing the UI: the preserved production interface and `src/main.tsx` are separate entrypoints.
3. Make a focused change, then run `pnpm test` and `pnpm build`.
4. Describe the user-visible change and checks in your pull request.

Keep measurements labeled as estimates. Changes to feature definitions or model parameters need corresponding tests and a clear explanation of compatibility with saved attempts.

Do not commit personal videos, browser storage, private account credentials, temporary dependencies, or generated builds. Research and video-production files may remain locally but are not required for a contribution.
