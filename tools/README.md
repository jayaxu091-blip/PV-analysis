# Development Tools

Run commands from the repository root.

## Build and Tests

- `prepare_exact_interface.mjs`: regenerates the preserved interface; runs automatically before development, builds, and tests.
- `test_pose_measurements.mjs`: bundles and runs the TypeScript test files; use `pnpm test`.

## Data and Training

- `batch_pose_extract.html` and `run_batch_pose_extract.mjs`: historical video-to-feature extraction workflow.
- `train_pose_logistic_model.py`: fits pose-feature logistic models and writes model exports.
- `train_general_logistic_model.py`: historical general-feature model training.
- `compare_pose_feature_sets.py` and `compare_selected_pose_models.py`: model comparison experiments.

Training commands can overwrite model exports. They are not needed to run the app.

## Local Audits

`run_pose_audit.mjs`, `smoke_pose_v2.mjs`, `render_research_pose_figure.mjs`, `replay_restored_app.mjs`, and `verify_exact_interface.mjs` are historical audit and verification utilities. Some require local video datasets, output files, a machine-specific Playwright installation, or earlier interface assumptions. They are not part of the portable build/test commands above.

Document, slide, and video-production scripts may remain in the local folder but are excluded from GitHub.
