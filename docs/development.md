# Development

## Prerequisites

- Node.js 22.12 or newer.
- pnpm 10.
- A current browser with video playback and IndexedDB support.

Run all commands from the repository root. `pnpm dev`, `pnpm test`, and `pnpm build` prepare the production entrypoint automatically. `pnpm preview` serves an existing production build.

## Edit the Right File

- Measurements and estimated phases: `src/studyMeasurements.ts`.
- Video sampling and MediaPipe loading: `src/poseAnalysis.ts`.
- Full-precision values passed to the preserved interface: `src/restoredStudyBridge.ts`.
- Login rendering: `tools/templates/login-screen.tsx`, styled in `src/login.css`.
- Four-page navigation: `tools/separate_original_pages.mjs`, styled in `src/originalPages.css`.
- Current palette: `src/palette.css`.
- Alternate readable React interface: `src/main.tsx` and `src/styles.css`.

The last interface is not the current production entrypoint. Generated files in `restored-app/` will be overwritten; edit the source/template instead.

## Authentication and Hosting

Demo mode is the easiest way to review a fresh checkout and requires no account. `src/firebase.ts` contains the public Firebase web-client configuration; these browser identifiers are not server credentials. Never commit service-account credentials, refresh tokens, private API credentials, or a personal `.env` file.

For an independent deployment, configure your own Firebase project and supported sign-in providers, update the public client configuration, and add your local and deployed domains to its authorized domains. The preserved interface also embeds its original Firebase client initialization; adapting it to a different project requires updating the generator consistently with `src/firebase.ts` and testing sign-in. Simply changing `src/firebase.ts` does not reconfigure the archived interface.

The current public app is https://vaultlab.web.app/ and its Hosting configuration is `firebase.json`. Building or cleaning the repository does not deploy the site.

## Tests

`pnpm test` runs the measurement/model tests and the current login-rendering test. One saved-video regression check needs an optional local landmark-audit fixture and is explicitly skipped on a fresh checkout. Synthetic measurements and the tracked model/feature fixtures still run.

Tests need no private videos, Python environment, or sign-in credentials. They verify calculations and generated-interface behavior; they are not evidence of predictive accuracy on unseen athletes.

## Troubleshooting

- Missing login template, logo, or stylesheet: use a complete checkout of the repository.
- Pose model cannot load: check access to jsDelivr and Google's model storage. The runtime is loaded on demand.
- Video not supported: try a standard MP4/H.264 recording with the full athlete visible.
- Google/email sign-in fails on a fork: check that the Firebase project enables the provider and authorizes that domain. Demo mode remains available.
- Looking for saved attempts on another computer: records and videos stay in the original browser; they are not synchronized to a cloud database.
