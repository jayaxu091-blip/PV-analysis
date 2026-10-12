// Display formatting must never change the full-precision model inputs.
export function displayNumber(value: string, digits: number) {
  if (!value.trim()) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : value;
}

export function readPhaseTime(status: string) {
  const match = status.match(/(?:Marked at |candidate: |Auto-estimated at |Saved max inversion time: )([0-9.]+)s/);
  return match ? Number.parseFloat(match[1]) : null;
}
