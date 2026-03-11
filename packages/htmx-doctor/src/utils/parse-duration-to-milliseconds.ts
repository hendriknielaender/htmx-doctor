const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m)$/i;

const DURATION_UNIT_TO_MILLISECONDS: Record<string, number> = {
  m: 60_000,
  ms: 1,
  s: 1_000,
};

export const parseDurationToMilliseconds = (durationValue: string): number | null => {
  const matchedDuration = durationValue.trim().match(DURATION_PATTERN);
  if (!matchedDuration) return null;

  const numericDuration = Number(matchedDuration[1]);
  const unitValue = DURATION_UNIT_TO_MILLISECONDS[matchedDuration[2].toLowerCase()];

  if (!Number.isFinite(numericDuration) || !unitValue) {
    return null;
  }

  return Math.round(numericDuration * unitValue);
};
