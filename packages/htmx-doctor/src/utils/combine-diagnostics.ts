import { SOURCE_FILE_PATTERN } from "../constants.js";
import type { Diagnostic, HtmxDoctorConfig } from "../types.js";
import { checkReducedMotion } from "./check-reduced-motion.js";
import { filterIgnoredDiagnostics, filterInlineSuppressions } from "./filter-diagnostics.js";

export const computeSourceIncludePaths = (includePaths: string[]): string[] | undefined =>
  includePaths.length > 0
    ? includePaths.filter((filePath) => SOURCE_FILE_PATTERN.test(filePath))
    : undefined;

export const computeJsxIncludePaths = computeSourceIncludePaths;

export const combineDiagnostics = (
  lintDiagnostics: Diagnostic[],
  deadCodeDiagnostics: Diagnostic[],
  directory: string,
  isDiffMode: boolean,
  userConfig: HtmxDoctorConfig | null,
): Diagnostic[] => {
  const merged = [
    ...lintDiagnostics,
    ...deadCodeDiagnostics,
    ...(isDiffMode ? [] : checkReducedMotion(directory)),
  ];
  const filtered = userConfig ? filterIgnoredDiagnostics(merged, userConfig) : merged;
  return filterInlineSuppressions(filtered, directory);
};
