import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/types.js";
import { runOxlint } from "../src/utils/run-oxlint.js";

const FIXTURES_DIRECTORY = path.resolve(import.meta.dirname, "fixtures");
const BASIC_HTMX_DIRECTORY = path.join(FIXTURES_DIRECTORY, "basic-htmx");
const CONFIG_SECURITY_DIRECTORY = path.join(FIXTURES_DIRECTORY, "config-security");

interface RuleTestCase {
  severity?: "error" | "warning";
  category?: string;
}

const findDiagnosticsByRule = (diagnostics: Diagnostic[], rule: string): Diagnostic[] =>
  diagnostics.filter((diagnostic) => diagnostic.rule === rule);

const describeRules = (
  groupName: string,
  rules: Record<string, RuleTestCase>,
  getDiagnostics: () => Diagnostic[],
) => {
  describe(groupName, () => {
    for (const [ruleName, testCase] of Object.entries(rules)) {
      it(ruleName, () => {
        const issues = findDiagnosticsByRule(getDiagnostics(), ruleName);
        expect(issues.length).toBeGreaterThan(0);
        if (testCase.severity) expect(issues[0]?.severity).toBe(testCase.severity);
        if (testCase.category) expect(issues[0]?.category).toBe(testCase.category);
      });
    }
  });
};

let basicHtmxDiagnostics: Diagnostic[];
let configSecurityDiagnostics: Diagnostic[];

describe("runOxlint", () => {
  beforeAll(async () => {
    basicHtmxDiagnostics = await runOxlint(BASIC_HTMX_DIRECTORY);
    configSecurityDiagnostics = await runOxlint(CONFIG_SECURITY_DIRECTORY);
  });

  it("loads HTMX diagnostics from HTML fixtures", async () => {
    expect(basicHtmxDiagnostics.length).toBeGreaterThan(0);
  });

  it("supports include path filtering", async () => {
    const diagnostics = await runOxlint(BASIC_HTMX_DIRECTORY, ["templates/delete-button.html"]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe("delete-missing-confirm");
  });

  it("detects unsafe HTMX runtime config from meta tags and scripts", () => {
    expect(
      findDiagnosticsByRule(configSecurityDiagnostics, "config-allow-eval-enabled"),
    ).toHaveLength(2);
    expect(
      findDiagnosticsByRule(configSecurityDiagnostics, "config-allow-script-tags-enabled"),
    ).toHaveLength(2);
    expect(
      findDiagnosticsByRule(configSecurityDiagnostics, "config-history-cache-enabled"),
    ).toHaveLength(2);
    expect(
      findDiagnosticsByRule(configSecurityDiagnostics, "config-self-requests-only-disabled"),
    ).toHaveLength(2);
  });

  it("tightens selfRequestsOnly guidance when validateUrl is missing", async () => {
    const diagnostics = await runOxlint(CONFIG_SECURITY_DIRECTORY, ["meta-config.html"]);
    const selfRequestsOnlyDiagnostic = findDiagnosticsByRule(
      diagnostics,
      "config-self-requests-only-disabled",
    )[0];

    expect(selfRequestsOnlyDiagnostic?.help).toContain("add a strict `htmx:validateUrl` allowlist");
  });

  it("recognizes a validateUrl allowlist when present", () => {
    const selfRequestsOnlyDiagnostic = findDiagnosticsByRule(
      configSecurityDiagnostics,
      "config-self-requests-only-disabled",
    )[0];

    expect(selfRequestsOnlyDiagnostic?.help).toContain(
      "keep the `htmx:validateUrl` allowlist narrow",
    );
  });

  it("ignores explicitly safe HTMX runtime config", async () => {
    const diagnostics = await runOxlint(CONFIG_SECURITY_DIRECTORY, ["safe-config.html"]);
    expect(diagnostics).toEqual([]);
  });

  it("returns diagnostics with required fields", () => {
    for (const diagnostic of basicHtmxDiagnostics) {
      expect(diagnostic).toHaveProperty("filePath");
      expect(diagnostic).toHaveProperty("plugin");
      expect(diagnostic).toHaveProperty("rule");
      expect(diagnostic).toHaveProperty("severity");
      expect(diagnostic).toHaveProperty("message");
      expect(diagnostic).toHaveProperty("category");
      expect(["error", "warning"]).toContain(diagnostic.severity);
      expect(diagnostic.message.length).toBeGreaterThan(0);
    }
  });

  it("only reports diagnostics from supported HTMX source files", () => {
    for (const diagnostic of basicHtmxDiagnostics) {
      expect(diagnostic.filePath).toMatch(/\.(html|js)$/);
    }
  });

  describeRules(
    "HTMX rules",
    {
      "delete-missing-confirm": {
        severity: "warning",
        category: "Security",
      },
      "absolute-request-url": {
        severity: "warning",
        category: "Security",
      },
      "input-trigger-missing-delay": {
        severity: "warning",
        category: "Performance",
      },
      "body-outerhtml-swap": {
        severity: "warning",
        category: "Correctness",
      },
      "polling-too-frequent": {
        severity: "warning",
        category: "Performance",
      },
      "form-missing-sync": {
        severity: "warning",
        category: "Correctness",
      },
      "inline-evaluation": {
        severity: "error",
        category: "Security",
      },
      "headers-secret-literal": {
        severity: "error",
        category: "Security",
      },
      "config-allow-eval-enabled": {
        severity: "warning",
        category: "Security",
      },
      "config-allow-script-tags-enabled": {
        severity: "warning",
        category: "Security",
      },
      "config-history-cache-enabled": {
        severity: "warning",
        category: "Security",
      },
      "config-self-requests-only-disabled": {
        severity: "warning",
        category: "Security",
      },
    },
    () => [...basicHtmxDiagnostics, ...configSecurityDiagnostics],
  );
});
