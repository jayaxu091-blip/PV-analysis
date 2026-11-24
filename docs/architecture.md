# Architecture

## Production Path

1. `pnpm dev` and `pnpm build` run `tools/prepare_exact_interface.mjs`.
2. The script reads `restored-app/baseline/app.original.js` and verifies its checksum.
3. It adapts calculation/state functions to call `src/restoredStudyBridge.ts` and replaces login rendering using `tools/templates/login-screen.tsx`.
4. `tools/separate_original_pages.mjs` creates the Jump analysis, Jump summary, Logistic model, and Attempt Log views from the original panels. It keeps the video mounted when switching views.
5. The bridge calls `src/poseAnalysis.ts` and `src/studyMeasurements.ts` and preserves full precision separately from rounded interface values.
6. `src/login.css`, `src/originalPages.css`, and `src/palette.css` style the current production interface. The logo is in `src/assets/`.
7. Vite serves `restored-app/` and builds to `dist/`. The current site at https://vaultlab.web.app/ uses `firebase.new-site.json`; `firebase.json` targets the older site.

The baseline JavaScript and original stylesheet are checked in because a fresh clone needs them to build. Generated entrypoints, build reports, and production bundles are ignored.

## Readable Source and Compatibility

`src/main.tsx` and `src/styles.css` contain the readable React interface source. The preserved production entrypoint currently uses an archived compiled interface, so these files are not its direct entrypoint. `src/vaultModel.ts` is the readable model implementation and is tested against the exported study parameters; the archived interface also contains its own model inference code. A future migration to the readable React entrypoint needs interface and model parity checks.

`src/poseMeasurements.ts`, `src/approachAnalysis.ts`, and `src/athleteFeedback.ts` also support the separate audit and readable-interface work. The production study calculations are in `src/studyMeasurements.ts`.

## Storage and Services

- Firebase Authentication provides sign-in; demo mode bypasses account creation.
- Attempt metadata is stored in browser local storage, scoped to the active user.
- Saved video blobs are stored in IndexedDB through `src/videoStore.ts`.
- Pose extraction runs in the browser using externally loaded MediaPipe assets.
- The optional `backend/` prototype is independent of the current browser workflow.

## Verification

`pnpm test` prepares the preserved interface, runs the TypeScript tests through the bundled esbuild runner, and checks login rendering/handlers. Saved real-video landmark regression data is optional and local; that test is explicitly skipped when the fixture is unavailable. Synthetic-frame checks and tracked model/dataset checks still run. GitHub Actions runs the portable tests and production build on a fresh checkout.
