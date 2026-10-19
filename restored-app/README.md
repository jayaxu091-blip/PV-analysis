# Preserved Production Interface

Vite currently uses this folder as its application root.

Tracked inputs:

- `baseline/app.original.js`: archived compiled interface, verified by checksum before use.
- `assets/index-Cj98egCU.css`: original interface stylesheet, also checksum verified.

Generated files such as `app.js`, `index.html`, the announcement stylesheet, and `baseline/verification.json` are recreated by `tools/prepare_exact_interface.mjs` and are ignored.

Start with the readable TypeScript in `src/` for the video-analysis and measurement implementation. See [architecture](../docs/architecture.md) for the distinction between the readable React source and this production entrypoint.
