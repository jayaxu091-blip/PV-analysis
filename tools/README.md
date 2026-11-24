# Development Tools

Run commands from the repository root.

## Build and Tests

- `prepare_exact_interface.mjs`: prepares the production interface before development, builds, and tests.
- `separate_original_pages.mjs`: creates the four production views.
- `templates/login-screen.tsx`: current login interface.
- `test_pose_measurements.mjs`: runs measurement and model tests.
- `test_login_screen.mjs`: checks login rendering and handlers.

Use `pnpm test` to run both test groups.

## Model Training

- `batch_pose_extract.html`: original feature extractor, also used by regression tests.
- `run_batch_pose_extract.mjs`: historical browser extraction runner; needs local video files and its configured browser runtime.
- `train_pose_logistic_model.py`: trains logistic regression from `model_output/vault_pose_extracted_dataset.csv`.

Training can overwrite model exports. It is not needed to run the app.
