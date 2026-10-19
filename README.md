# VaultLab

Pole vault video analysis for high school athletes and coaches. VaultLab turns ordinary practice videos into estimated body measurements, reviewable vault phases, and an interpretable make-probability estimate.

[Open the app](https://pvanalysis-68252.web.app)

## Start With the Code

| File | What it does |
| --- | --- |
| [src/poseAnalysis.ts](src/poseAnalysis.ts) | Samples video frames and runs MediaPipe Pose Landmarker Lite. |
| [src/studyMeasurements.ts](src/studyMeasurements.ts) | Calculates vault measurements from landmarks and selects estimated phases. |
| [src/vaultModel.ts](src/vaultModel.ts) | Stores model parameters and calculates probabilities and factor contributions. |
| [src/restoredStudyBridge.ts](src/restoredStudyBridge.ts) | Connects the preserved interface to full-precision study measurements. |
| [src/main.tsx](src/main.tsx) | Readable React interface source; see the build note below. |
| [src/videoStore.ts](src/videoStore.ts) | Stores saved videos in the browser. |

For a short code walkthrough, follow the first three files in order: video, measurements, prediction.

## Run Locally

Use Node.js 22 or newer and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. Demo mode works without creating an account. Pose analysis requires internet access to load the MediaPipe runtime and model; Firebase sign-in requires the configured authentication providers.

```sh
pnpm build
pnpm test
pnpm preview
```

## Repository Map

| Folder | Contents |
| --- | --- |
| [src/](src/) | TypeScript analysis, model, storage, and React source. |
| [tests/](tests/) | Measurement, model, display, and compatibility tests. |
| [tools/](tools/README.md) | Build preparation, extraction, training, and verification scripts. |
| [model_output/](model_output/README.md) | Model exports, extracted feature datasets, and historical reports. |
| [restored-app/](restored-app/README.md) | Preserved interface assets and generated production entrypoint. |
| [backend/](backend/README.md) | Optional Python prototype; the browser app does not require it. |
| [docs/](docs/architecture.md) | Architecture and repository maintenance notes. |

## Build Note

The current Vite entrypoint is `restored-app/`, rather than the root `index.html`. Before development and production builds, `tools/prepare_exact_interface.mjs` regenerates that entrypoint from the checked-in interface baseline and connects it to the TypeScript study functions. Editing `src/main.tsx` alone does not change the preserved production interface. See [architecture](docs/architecture.md).

## Measurement Scope

MediaPipe supplies a pretrained pose model. VaultLab adds sport-specific measurements, phase-selection rules, browser storage, and logistic-regression inference. The active model uses four inputs from the original balanced 30-attempt study: bar height, takeoff body-line angle, inversion alignment, and takeoff-to-clearance interval. Saving attempts does not retrain the active model.

Measurements are estimates from a single camera. The model's predictive accuracy on new athletes has not been established. Historical model exports and training scores are retained for reproducibility, with context in [model_output/README.md](model_output/README.md).
