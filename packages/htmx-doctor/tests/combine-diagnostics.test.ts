import { describe, expect, it } from "vitest";
import type { Diagnostic, HtmxDoctorConfig } from "../src/types.js";
import {
  combineDiagnostics,
  computeJsxIncludePaths,
  computeSourceIncludePaths,
} from "../src/utils/combine-diagnostics.js";

const createDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "templates/index.html",
  plugin: "htmx-doctor",
  rule: "test-rule",
  severity: "warning",
  message: "test message",
  help: "test help",
  line: 1,
  column: 1,
  category: "Test",
  ...overrides,
});

describe("computeSourceIncludePaths", () => {
  it("returns undefined for empty include paths", () => {
    expect(computeSourceIncludePaths([])).toBeUndefined();
  });

  it("filters to only supported source files", () => {
    const paths = ["templates/index.html", "src/app.ts", "README.md", "templates/form.php"];
    const result = computeSourceIncludePaths(paths);
    expect(result).toEqual(["templates/index.html", "src/app.ts", "templates/form.php"]);
  });

  it("keeps the JSX alias wired to the same implementation", () => {
    const paths = ["templates/index.html", "README.md"];
    expect(computeJsxIncludePaths(paths)).toEqual(["templates/index.html"]);
  });
});

describe("combineDiagnostics", () => {
  it("merges lint and dead code diagnostics", () => {
    const lintDiagnostics = [createDiagnostic({ rule: "lint-rule" })];
    const deadCodeDiagnostics = [createDiagnostic({ rule: "dead-code-rule" })];

    const result = combineDiagnostics(lintDiagnostics, deadCodeDiagnostics, "/tmp", true, null);
    expect(result).toHaveLength(2);
    expect(result[0]?.rule).toBe("lint-rule");
    expect(result[1]?.rule).toBe("dead-code-rule");
  });

  it("returns empty array when both inputs are empty in diff mode", () => {
    const result = combineDiagnostics([], [], "/tmp", true, null);
    expect(result).toEqual([]);
  });

  it("applies config filtering when userConfig is provided", () => {
    const diagnostics = [
      createDiagnostic({ plugin: "htmx-doctor", rule: "delete-missing-confirm" }),
      createDiagnostic({ plugin: "htmx-doctor", rule: "headers-secret-literal" }),
    ];
    const config: HtmxDoctorConfig = {
      ignore: { rules: ["htmx-doctor/delete-missing-confirm"] },
    };

    const result = combineDiagnostics(diagnostics, [], "/tmp", true, config);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe("headers-secret-literal");
  });

  it("skips config filtering when userConfig is null", () => {
    const diagnostics = [createDiagnostic(), createDiagnostic()];
    const result = combineDiagnostics(diagnostics, [], "/tmp", true, null);
    expect(result).toHaveLength(2);
  });
});
