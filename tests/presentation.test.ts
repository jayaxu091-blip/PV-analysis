import test from "node:test";
import assert from "node:assert/strict";
import { displayNumber, readPhaseTime } from "../src/presentation";
import { emptyForm, getMetrics } from "../src/utils";
import { formVector, generalVaultModel, predictVault } from "../src/vaultModel";
import { MEASUREMENT_VERSION } from "../src/studyMeasurements";

test("rounding a field for display does not round the prediction input", () => {
  const form = { ...emptyForm(), measurementVersion: MEASUREMENT_VERSION, barHeight: "3.5", unit: "m" as const,
    takeoffAngle: "135.123456789", inversionAngle: "124.987654321", takeoffTime: "1.123456789", clearanceTime: "2.234567891" };
  const before = predictVault(generalVaultModel, formVector(form, getMetrics(form)));
  assert.equal(displayNumber(form.takeoffAngle, 1), "135.1");
  assert.equal(displayNumber(form.clearanceTime, 2), "2.23");
  assert.equal(form.takeoffAngle, "135.123456789");
  assert.deepEqual(predictVault(generalVaultModel, formVector(form, getMetrics(form))), before);
});

test("empty and zero fields remain distinct in the restored interface", () => {
  assert.equal(displayNumber("", 1), "");
  assert.equal(displayNumber("0", 1), "0.0");
  assert.equal(displayNumber("180", 1), "180.0");
});

test("friendly phase labels preserve saved inversion timestamps", () => {
  assert.equal(readPhaseTime("Auto-estimated at 3.75s. Review the selected inversion frame."), 3.75);
  assert.equal(readPhaseTime("Saved max inversion time: 3.75s."), 3.75);
  assert.equal(readPhaseTime("Study inversion candidate: 3.75s."), 3.75);
  assert.equal(readPhaseTime("Not analyzed yet."), null);
});
