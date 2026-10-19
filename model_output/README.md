# Models and Feature Data

- `balanced_pose_vault_logistic_model.json`: exported parameters for the active 30-attempt study model (15 makes and 15 misses).
- `vault_pose_extracted_dataset.csv` and `.json`: historical extracted pose features used for study checks.
- `general_pose_vault_logistic_model.json`: historical full-dataset pose model.
- `general_vault_logistic_model.json` and `vault_training_dataset.csv`: earlier general-feature experiment.
- `pose_training_report.txt` and `training_report.txt`: historical training output; not evidence of accuracy on new athletes.

The active readable parameters are in `src/vaultModel.ts`. Tests check them against the balanced model export. Training scripts live in `tools/`.

Raw videos and generated landmark audit runs stay local and are not required for the default build. The optional saved-track regression test runs when its local audit fixture is present.
