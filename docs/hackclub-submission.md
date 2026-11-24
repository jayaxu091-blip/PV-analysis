# Hack Club Certificate Submission Preparation

Checked November 24, 2026. This is preparation, not a claim of acceptance or completion.

## Project Details

- Project: VaultLab
- GitHub: https://github.com/jayaxu091-blip/PV-analysis
- Playable site: https://vaultlab.web.app/
- Reviewer access: choose **Explore the demo** without signing in.
- GitHub username: jayaxu091-blip

Suggested description:

> VaultLab is a browser-based video analysis app for high school pole vaulters and coaches. It uses MediaPipe pose estimation to extract body landmarks, estimate vault-specific measurements and phases, and display an interpretable logistic-regression make-probability estimate. Athletes can review measurements, save attempts with their videos, and export a training log. Videos and records remain in the browser. The model is exploratory, and accuracy on new athletes has not been established.

## Remaining Requirements

- [ ] Confirm the Congressional App Challenge submission was completed.
- [ ] Create/sign in to Hackatime and configure the editor using its official setup page.
- [ ] Record at least one genuine hour of project improvements and confirm the project name on the Hackatime dashboard.
- [ ] Open a gallery pull request against `hackclub/capitol` and record its URL.
- [ ] Complete the certificate form with the project details, PR URL, Hackatime project name, and the applicant's own private contact/address details.

No time is claimed for work performed before Hackatime was configured. Do not invent or backfill activity to satisfy the hour.

## Official Links and Current Uncertainty

- Requirements: https://congressional.hackclub.com/certificate
- Submission form: https://forms.hackclub.com/congressional_certification
- Gallery instructions: https://github.com/hackclub/capitol#adding-your-project-to-the-gallery
- Hackatime setup: https://hackatime.hackclub.com/my/settings
- VS Code instructions: https://hackatime.hackclub.com/docs/editors/vs-code
- Resources: https://congressional.hackclub.com/resources

The live form explicitly requires a Hackatime project with one hour or more and a gallery PR URL. The resources page has conflicting wording about whether tracking is optional and lists an October 26, 2026 deadline. Confirm current submission eligibility with the organizers before final submission; an accessible form does not establish eligibility.

## Gallery Entry to Prepare After Tracking

Follow the official repository instructions and append an entry to `src/app/gallery/projects.json` in a fork of `hackclub/capitol`:

```json
{
  "recordId": "jayaxu091-blip-vaultlab",
  "projectName": "VaultLab",
  "demoUrl": "https://vaultlab.web.app/",
  "codeUrl": "https://github.com/jayaxu091-blip/PV-analysis",
  "githubUsername": "jayaxu091-blip",
  "imageSrc": "/gallery/placeholder.svg"
}
```

An actual app screenshot can replace the placeholder when preparing that pull request. Do not publish mailing addresses or Hackatime API keys in the repository or PR.

## A Useful Tracked Improvement Session

After setup, work in the configured editor on a real change such as explaining the measurement units and model limitations more clearly, testing empty/error states, or improving accessibility. Check the dashboard afterward rather than assuming elapsed clock time was logged.
