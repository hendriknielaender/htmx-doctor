import { describe, expect, it } from "vitest";
import type { Diagnostic, HtmxDoctorConfig } from "../src/types.js";
import { filterIgnoredDiagnostics } from "../src/utils/filter-diagnostics.js";

const createDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "templates/index.html",
  plugin: "htmx-doctor",
  rule: "delete-missing-confirm",
  severity: "warning",
  message: "test message",
  help: "test help",
  line: 1,
  column: 1,
  category: "Correctness",
  ...overrides,
});

describe("filterIgnoredDiagnostics", () => {
  it("returns all diagnostics when config has no ignore rules", () => {
    const diagnostics = [createDiagnostic()];
    const config: HtmxDoctorConfig = {};
    expect(filterIgnoredDiagnostics(diagnostics, config)).toEqual(diagnostics);
  });

  it("filters diagnostics matching ignored rules", () => {
    const diagnostics = [
      createDiagnostic({ plugin: "htmx-doctor", rule: "delete-missing-confirm" }),
      createDiagnostic({ plugin: "htmx-doctor", rule: "polling-too-frequent" }),
      createDiagnostic({ plugin: "htmx-doctor", rule: "headers-secret-literal" }),
    ];
    const config: HtmxDoctorConfig = {
      ignore: {
        rules: ["htmx-doctor/delete-missing-confirm", "htmx-doctor/polling-too-frequent"],
      },
    };

    const filtered = filterIgnoredDiagnostics(diagnostics, config);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.rule).toBe("headers-secret-literal");
  });

  it("filters diagnostics matching ignored file patterns", () => {
    const diagnostics = [
      createDiagnostic({ filePath: "templates/generated/types.html" }),
      createDiagnostic({ filePath: "templates/generated/api/client.html" }),
      createDiagnostic({ filePath: "templates/components/button.html" }),
    ];
    const config: HtmxDoctorConfig = {
      ignore: {
        files: ["templates/generated/**"],
      },
    };

    const filtered = filterIgnoredDiagnostics(diagnostics, config);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.filePath).toBe("templates/components/button.html");
  });

  it("filters by both rules and files together", () => {
    const diagnostics = [
      createDiagnostic({
        plugin: "htmx-doctor",
        rule: "delete-missing-confirm",
        filePath: "templates/index.html",
      }),
      createDiagnostic({
        plugin: "knip",
        rule: "exports",
        filePath: "templates/generated/api.html",
      }),
      createDiagnostic({
        plugin: "htmx-doctor",
        rule: "headers-secret-literal",
        filePath: "templates/components/app.html",
      }),
    ];
    const config: HtmxDoctorConfig = {
      ignore: {
        rules: ["htmx-doctor/delete-missing-confirm"],
        files: ["templates/generated/**"],
      },
    };

    const filtered = filterIgnoredDiagnostics(diagnostics, config);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.rule).toBe("headers-secret-literal");
  });

  it("keeps all diagnostics when no rules or files match", () => {
    const diagnostics = [
      createDiagnostic({ plugin: "htmx-doctor", rule: "delete-missing-confirm" }),
      createDiagnostic({ plugin: "knip", rule: "exports" }),
    ];
    const config: HtmxDoctorConfig = {
      ignore: {
        rules: ["nonexistent/rule"],
        files: ["nonexistent/**"],
      },
    };

    const filtered = filterIgnoredDiagnostics(diagnostics, config);
    expect(filtered).toHaveLength(2);
  });

  it("filters file paths with ./ prefix against patterns without it", () => {
    const diagnostics = [
      createDiagnostic({ filePath: "./resources/templates/components/ui/button.html" }),
      createDiagnostic({ filePath: "./resources/templates/marketing/hero.html" }),
      createDiagnostic({ filePath: "./resources/templates/pages/home.html" }),
    ];
    const config: HtmxDoctorConfig = {
      ignore: {
        files: ["resources/templates/components/ui/**", "resources/templates/marketing/**"],
      },
    };

    const filtered = filterIgnoredDiagnostics(diagnostics, config);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.filePath).toBe("./resources/templates/pages/home.html");
  });

  it("handles knip rule identifiers", () => {
    const diagnostics = [
      createDiagnostic({ plugin: "knip", rule: "exports" }),
      createDiagnostic({ plugin: "knip", rule: "types" }),
      createDiagnostic({ plugin: "knip", rule: "files" }),
    ];
    const config: HtmxDoctorConfig = {
      ignore: {
        rules: ["knip/exports", "knip/types"],
      },
    };

    const filtered = filterIgnoredDiagnostics(diagnostics, config);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.rule).toBe("files");
  });
});
