import { createRequire } from "node:module";
const require = createRequire(import.meta.resolve("vite"));
const { build } = require("esbuild");
for (const entry of ["tests/poseMeasurements.test.ts", "tests/studyMeasurements.test.ts", "tests/presentation.test.ts", "tests/athleteExperience.test.ts", "tests/restoredStudyBridge.test.ts"]) {
const result = await build({ entryPoints: [entry], bundle: true,
  platform: "node", format: "esm", write: false });
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
