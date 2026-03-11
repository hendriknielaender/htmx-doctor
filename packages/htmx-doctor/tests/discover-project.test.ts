import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  discoverHtmxSubprojects,
  discoverProject,
  formatFrameworkName,
  listWorkspacePackages,
} from "../src/utils/discover-project.js";

const FIXTURES_DIRECTORY = path.resolve(import.meta.dirname, "fixtures");
const VALID_FRAMEWORKS = [
  "astro",
  "django",
  "express",
  "fastify",
  "flask",
  "go",
  "hono",
  "laravel",
  "phoenix",
  "rails",
  "unknown",
  "vite",
];

describe("discoverProject", () => {
  it("detects HTMX version from package.json", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "basic-htmx"));
    expect(projectInfo.htmxVersion).toBe("^2.0.4");
  });

  it("returns a valid framework", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "basic-htmx"));
    expect(VALID_FRAMEWORKS).toContain(projectInfo.framework);
  });

  it("detects TypeScript when tsconfig.json exists", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "basic-htmx"));
    expect(projectInfo.hasTypeScript).toBe(true);
  });

  it("detects HTMX usage from source files without package.json", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "package-less-htmx"));
    expect(projectInfo.hasPackageJson).toBe(false);
    expect(projectInfo.htmxVersion).toBe("1.9.12");
    expect(projectInfo.htmxSourceFileCount).toBeGreaterThan(0);
  });

  it("tracks whether package.json exists", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "basic-htmx"));
    expect(projectInfo.hasPackageJson).toBe(true);
  });
});

describe("listWorkspacePackages", () => {
  it("resolves nested workspace patterns like apps/*/ClientApp", () => {
    const packages = listWorkspacePackages(path.join(FIXTURES_DIRECTORY, "nested-workspaces"));
    const packageNames = packages.map((workspacePackage) => workspacePackage.name);

    expect(packageNames).toContain("my-app-client");
    expect(packageNames).toContain("ui");
    expect(packages).toHaveLength(2);
  });
});

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "htmx-doctor-discover-test-"));

afterAll(() => {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

describe("discoverHtmxSubprojects", () => {
  it("skips subdirectories where package.json is a directory", () => {
    const rootDirectory = path.join(tempDirectory, "eisdir-package-json");
    const subdirectory = path.join(rootDirectory, "broken-sub");
    fs.mkdirSync(rootDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(rootDirectory, "package.json"),
      JSON.stringify({ name: "my-app", dependencies: { "htmx.org": "^2.0.4" } }),
    );
    fs.mkdirSync(subdirectory, { recursive: true });
    fs.mkdirSync(path.join(subdirectory, "package.json"), { recursive: true });

    const packages = discoverHtmxSubprojects(rootDirectory);
    expect(packages).toHaveLength(1);
    expect(packages[0]?.name).toBe("my-app");
  });

  it("includes root directory when it has an HTMX dependency", () => {
    const rootDirectory = path.join(tempDirectory, "root-with-htmx");
    fs.mkdirSync(rootDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(rootDirectory, "package.json"),
      JSON.stringify({ name: "my-app", dependencies: { "htmx.org": "^2.0.4" } }),
    );

    const packages = discoverHtmxSubprojects(rootDirectory);
    expect(packages).toContainEqual({ name: "my-app", directory: rootDirectory });
  });

  it("includes both root and subdirectory when both have HTMX signals", () => {
    const rootDirectory = path.join(tempDirectory, "root-and-sub");
    const subdirectory = path.join(rootDirectory, "extension");
    fs.mkdirSync(subdirectory, { recursive: true });
    fs.writeFileSync(
      path.join(rootDirectory, "package.json"),
      JSON.stringify({ name: "my-app", dependencies: { "htmx.org": "^2.0.4" } }),
    );
    fs.writeFileSync(
      path.join(subdirectory, "package.json"),
      JSON.stringify({ name: "my-extension", dependencies: { "htmx.org": "^2.0.4" } }),
    );

    const packages = discoverHtmxSubprojects(rootDirectory);
    expect(packages).toHaveLength(2);
    expect(packages[0]).toEqual({ name: "my-app", directory: rootDirectory });
    expect(packages[1]).toEqual({ name: "my-extension", directory: subdirectory });
  });

  it("does not match packages with unrelated dependencies", () => {
    const rootDirectory = path.join(tempDirectory, "no-htmx");
    fs.mkdirSync(rootDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(rootDirectory, "package.json"),
      JSON.stringify({ name: "no-htmx", devDependencies: { "@types/node": "^24.0.0" } }),
    );

    const packages = discoverHtmxSubprojects(rootDirectory);
    expect(packages).toHaveLength(0);
  });

  it("matches packages with HTMX markup but no dependency declaration", () => {
    const rootDirectory = path.join(tempDirectory, "htmx-markup");
    fs.mkdirSync(rootDirectory, { recursive: true });
    fs.writeFileSync(path.join(rootDirectory, "index.html"), '<div hx-get="/ping"></div>');
    fs.writeFileSync(path.join(rootDirectory, "package.json"), JSON.stringify({ name: "markup" }));

    const packages = discoverHtmxSubprojects(rootDirectory);
    expect(packages).toHaveLength(1);
  });
});

describe("formatFrameworkName", () => {
  it("formats known frameworks", () => {
    expect(formatFrameworkName("vite")).toBe("Vite");
    expect(formatFrameworkName("django")).toBe("Django");
    expect(formatFrameworkName("laravel")).toBe("Laravel");
    expect(formatFrameworkName("rails")).toBe("Rails");
  });

  it("formats unknown framework as Unknown", () => {
    expect(formatFrameworkName("unknown")).toBe("Unknown");
  });
});
