# Study Model and Features

- `balanced_pose_vault_logistic_model.json`: parameters for the active 30-attempt study model, with 15 makes and 15 misses.
- `vault_pose_extracted_dataset.csv`: extracted features used by the Python training script.
- `vault_pose_extracted_dataset.json`: feature data used by model regression tests.

The readable model implementation is in `src/vaultModel.ts`. Tests check its parameters against the balanced export. Accuracy on new athletes has not been established.

Raw videos and generated landmark audits stay local. The optional saved-track test runs when its local fixture is available.
