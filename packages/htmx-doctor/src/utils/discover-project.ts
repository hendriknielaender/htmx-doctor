import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  GIT_LS_FILES_MAX_BUFFER_BYTES,
  HTMX_ATTRIBUTE_PATTERN,
  HTMX_SCRIPT_PATTERN,
  SOURCE_FILE_PATTERN,
} from "../constants.js";
import type {
  DependencyInfo,
  Framework,
  PackageJson,
  ProjectInfo,
  WorkspacePackage,
} from "../types.js";
import { findMonorepoRoot, isMonorepoRoot } from "./find-monorepo-root.js";
import { isFile } from "./is-file.js";
import { isPlainObject } from "./is-plain-object.js";
import { listSourceFiles } from "./list-source-files.js";
import { readPackageJson } from "./read-package-json.js";

const HTMX_DEPENDENCY_NAMES = new Set(["htmx.org"]);
const HTMX_VERSION_PATTERN = /htmx\.org@(\d+(?:\.\d+){1,2})/i;

const FRAMEWORK_PACKAGES: Record<string, Framework> = {
  next: "nextjs",
  vite: "vite",
  "@remix-run/react": "remix",
  gatsby: "gatsby",
  expo: "expo",
  astro: "astro",
  express: "express",
  fastify: "fastify",
  hono: "hono",
};

const FRAMEWORK_DISPLAY_NAMES: Record<Framework, string> = {
  nextjs: "Next.js",
  vite: "Vite",
  remix: "Remix",
  gatsby: "Gatsby",
  expo: "Expo",
  astro: "Astro",
  django: "Django",
  express: "Express",
  fastify: "Fastify",
  flask: "Flask",
  go: "Go",
  hono: "Hono",
  laravel: "Laravel",
  phoenix: "Phoenix",
  rails: "Rails",
  unknown: "Unknown",
};

export const formatFrameworkName = (framework: Framework): string =>
  FRAMEWORK_DISPLAY_NAMES[framework];

const countSourceFilesViaFilesystem = (rootDirectory: string): number => {
  let count = 0;
  const stack = [rootDirectory];

  while (stack.length > 0) {
    const currentDirectory = stack.pop()!;
    const entries = fs.readdirSync(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (
          !entry.name.startsWith(".") &&
          !new Set(["node_modules", "dist", "build", "coverage", ".next"]).has(entry.name)
        ) {
          stack.push(path.join(currentDirectory, entry.name));
        }
        continue;
      }
      if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) {
        count++;
      }
    }
  }

  return count;
};

const countSourceFilesViaGit = (rootDirectory: string): number | null => {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: rootDirectory,
    encoding: "utf-8",
    maxBuffer: GIT_LS_FILES_MAX_BUFFER_BYTES,
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return result.stdout
    .split("\n")
    .filter((filePath) => filePath.length > 0 && SOURCE_FILE_PATTERN.test(filePath)).length;
};

const countSourceFiles = (rootDirectory: string): number =>
  countSourceFilesViaGit(rootDirectory) ?? countSourceFilesViaFilesystem(rootDirectory);

const collectAllDependencies = (packageJson: PackageJson): Record<string, string> => ({
  ...packageJson.peerDependencies,
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
});

const detectFramework = (dependencies: Record<string, string>): Framework => {
  for (const [packageName, frameworkName] of Object.entries(FRAMEWORK_PACKAGES)) {
    if (dependencies[packageName]) {
      return frameworkName;
    }
  }
  return "unknown";
};

const detectFrameworkFromFiles = (rootDirectory: string): Framework => {
  if (isFile(path.join(rootDirectory, "manage.py"))) return "django";
  if (isFile(path.join(rootDirectory, "go.mod"))) return "go";
  if (isFile(path.join(rootDirectory, "mix.exs"))) return "phoenix";

  const gemfilePath = path.join(rootDirectory, "Gemfile");
  if (isFile(gemfilePath)) {
    const gemfileContent = fs.readFileSync(gemfilePath, "utf-8");
    if (/gem ["']rails["']/.test(gemfileContent)) {
      return "rails";
    }
  }

  const composerJsonPath = path.join(rootDirectory, "composer.json");
  if (isFile(composerJsonPath)) {
    try {
      const composerJson = JSON.parse(fs.readFileSync(composerJsonPath, "utf-8")) as PackageJson;
      const composerDependencies = collectAllDependencies(composerJson);
      if (composerDependencies["laravel/framework"]) {
        return "laravel";
      }
    } catch {}
  }

  return "unknown";
};

const isCatalogReference = (version: string): boolean => version.startsWith("catalog:");

const resolveVersionFromCatalog = (
  catalog: Record<string, unknown>,
  packageName: string,
): string | null => {
  const version = catalog[packageName];
  if (typeof version === "string" && !isCatalogReference(version)) return version;
  return null;
};

const resolveCatalogVersion = (packageJson: PackageJson, packageName: string): string | null => {
  const raw = packageJson as Record<string, unknown>;

  if (isPlainObject(raw.catalog)) {
    const version = resolveVersionFromCatalog(raw.catalog, packageName);
    if (version) return version;
  }

  if (isPlainObject(raw.catalogs)) {
    for (const catalogEntries of Object.values(raw.catalogs)) {
      if (isPlainObject(catalogEntries)) {
        const version = resolveVersionFromCatalog(catalogEntries, packageName);
        if (version) return version;
      }
    }
  }

  return null;
};

const extractHtmxVersionFromContent = (fileContent: string): string | null => {
  const matchedVersion = fileContent.match(HTMX_VERSION_PATTERN);
  if (matchedVersion?.[1]) {
    return matchedVersion[1];
  }

  return null;
};

const scanDirectoryForHtmxUsage = (
  rootDirectory: string,
): { htmxSourceFileCount: number; htmxVersion: string | null } => {
  let htmxSourceFileCount = 0;
  let htmxVersion: string | null = null;

  for (const sourceFilePath of listSourceFiles(rootDirectory)) {
    const absoluteFilePath = path.join(rootDirectory, sourceFilePath);

    try {
      const fileContent = fs.readFileSync(absoluteFilePath, "utf-8");
      const hasHtmxUsage =
        HTMX_ATTRIBUTE_PATTERN.test(fileContent) || HTMX_SCRIPT_PATTERN.test(fileContent);

      if (!hasHtmxUsage) {
        continue;
      }

      htmxSourceFileCount++;

      if (!htmxVersion) {
        htmxVersion = extractHtmxVersionFromContent(fileContent);
      }
    } catch {}
  }

  return { htmxSourceFileCount, htmxVersion };
};

const extractDependencyInfo = (packageJson: PackageJson): DependencyInfo => {
  const allDependencies = collectAllDependencies(packageJson);
  const rawHtmxVersion = allDependencies["htmx.org"] ?? null;
  const htmxVersion = rawHtmxVersion && !isCatalogReference(rawHtmxVersion) ? rawHtmxVersion : null;
  return {
    htmxVersion,
    framework: detectFramework(allDependencies),
  };
};

const parsePnpmWorkspacePatterns = (rootDirectory: string): string[] => {
  const workspacePath = path.join(rootDirectory, "pnpm-workspace.yaml");
  if (!isFile(workspacePath)) return [];

  const content = fs.readFileSync(workspacePath, "utf-8");
  const patterns: string[] = [];
  let isInsidePackagesBlock = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "packages:") {
      isInsidePackagesBlock = true;
      continue;
    }
    if (isInsidePackagesBlock && trimmed.startsWith("-")) {
      patterns.push(trimmed.replace(/^-\s*/, "").replace(/["']/g, ""));
    } else if (isInsidePackagesBlock && trimmed.length > 0 && !trimmed.startsWith("#")) {
      isInsidePackagesBlock = false;
    }
  }

  return patterns;
};

const getWorkspacePatterns = (rootDirectory: string, packageJson: PackageJson): string[] => {
  const pnpmPatterns = parsePnpmWorkspacePatterns(rootDirectory);
  if (pnpmPatterns.length > 0) return pnpmPatterns;

  if (Array.isArray(packageJson.workspaces)) {
    return packageJson.workspaces;
  }

  if (packageJson.workspaces?.packages) {
    return packageJson.workspaces.packages;
  }

  return [];
};

const resolveWorkspaceDirectories = (rootDirectory: string, pattern: string): string[] => {
  const cleanPattern = pattern.replace(/["']/g, "").replace(/\/\*\*$/, "/*");

  if (!cleanPattern.includes("*")) {
    const directoryPath = path.join(rootDirectory, cleanPattern);
    if (fs.existsSync(directoryPath) && isFile(path.join(directoryPath, "package.json"))) {
      return [directoryPath];
    }
    return [];
  }

  const wildcardIndex = cleanPattern.indexOf("*");
  const baseDirectory = path.join(rootDirectory, cleanPattern.slice(0, wildcardIndex));
  const suffixAfterWildcard = cleanPattern.slice(wildcardIndex + 1);

  if (!fs.existsSync(baseDirectory) || !fs.statSync(baseDirectory).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(baseDirectory)
    .map((entry) => path.join(baseDirectory, entry, suffixAfterWildcard))
    .filter(
      (entryPath) =>
        fs.existsSync(entryPath) &&
        fs.statSync(entryPath).isDirectory() &&
        isFile(path.join(entryPath, "package.json")),
    );
};

const findDependencyInfoFromMonorepoRoot = (directory: string): DependencyInfo => {
  const monorepoRoot = findMonorepoRoot(directory);
  if (!monorepoRoot) return { htmxVersion: null, framework: "unknown" };

  const monorepoPackageJsonPath = path.join(monorepoRoot, "package.json");
  if (!isFile(monorepoPackageJsonPath)) {
    return { htmxVersion: null, framework: "unknown" };
  }

  const rootPackageJson = readPackageJson(monorepoPackageJsonPath);
  const rootInfo = extractDependencyInfo(rootPackageJson);
  const htmxCatalogVersion = resolveCatalogVersion(rootPackageJson, "htmx.org");
  const workspaceInfo = findHtmxInWorkspaces(monorepoRoot, rootPackageJson);

  return {
    htmxVersion: rootInfo.htmxVersion ?? htmxCatalogVersion ?? workspaceInfo.htmxVersion,
    framework: rootInfo.framework !== "unknown" ? rootInfo.framework : workspaceInfo.framework,
  };
};

const findHtmxInWorkspaces = (rootDirectory: string, packageJson: PackageJson): DependencyInfo => {
  const patterns = getWorkspacePatterns(rootDirectory, packageJson);
  const result: DependencyInfo = { htmxVersion: null, framework: "unknown" };

  for (const pattern of patterns) {
    const directories = resolveWorkspaceDirectories(rootDirectory, pattern);

    for (const workspaceDirectory of directories) {
      const workspacePackageJson = readPackageJson(path.join(workspaceDirectory, "package.json"));
      const info = extractDependencyInfo(workspacePackageJson);
      const sourceInfo = scanDirectoryForHtmxUsage(workspaceDirectory);

      if ((info.htmxVersion ?? sourceInfo.htmxVersion) && !result.htmxVersion) {
        result.htmxVersion = info.htmxVersion ?? sourceInfo.htmxVersion;
      }
      if (info.framework !== "unknown" && result.framework === "unknown") {
        result.framework = info.framework;
      }
      if (result.framework === "unknown") {
        result.framework = detectFrameworkFromFiles(workspaceDirectory);
      }

      if (result.htmxVersion && result.framework !== "unknown") {
        return result;
      }
    }
  }

  return result;
};

const hasHtmxDependency = (packageJson: PackageJson): boolean => {
  const allDependencies = collectAllDependencies(packageJson);
  return Object.keys(allDependencies).some((packageName) => HTMX_DEPENDENCY_NAMES.has(packageName));
};

const hasHtmxSignals = (directory: string, packageJson: PackageJson | null): boolean => {
  if (packageJson && hasHtmxDependency(packageJson)) {
    return true;
  }

  return scanDirectoryForHtmxUsage(directory).htmxSourceFileCount > 0;
};

export const discoverHtmxSubprojects = (rootDirectory: string): WorkspacePackage[] => {
  if (!fs.existsSync(rootDirectory) || !fs.statSync(rootDirectory).isDirectory()) return [];

  const packages: WorkspacePackage[] = [];

  const rootPackageJsonPath = path.join(rootDirectory, "package.json");
  if (isFile(rootPackageJsonPath)) {
    const rootPackageJson = readPackageJson(rootPackageJsonPath);
    if (hasHtmxSignals(rootDirectory, rootPackageJson)) {
      const name = rootPackageJson.name ?? path.basename(rootDirectory);
      packages.push({ name, directory: rootDirectory });
    }
  } else if (hasHtmxSignals(rootDirectory, null)) {
    packages.push({ name: path.basename(rootDirectory), directory: rootDirectory });
  }

  const entries = fs.readdirSync(rootDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }

    const subdirectory = path.join(rootDirectory, entry.name);
    const packageJsonPath = path.join(subdirectory, "package.json");
    const packageJson = isFile(packageJsonPath) ? readPackageJson(packageJsonPath) : null;
    if (!hasHtmxSignals(subdirectory, packageJson)) continue;

    const name = packageJson?.name ?? entry.name;
    packages.push({ name, directory: subdirectory });
  }

  return packages;
};

export const listWorkspacePackages = (rootDirectory: string): WorkspacePackage[] => {
  const packageJsonPath = path.join(rootDirectory, "package.json");
  if (!isFile(packageJsonPath)) return [];

  const packageJson = readPackageJson(packageJsonPath);
  const patterns = getWorkspacePatterns(rootDirectory, packageJson);
  if (patterns.length === 0) return [];

  const packages: WorkspacePackage[] = [];

  for (const pattern of patterns) {
    const directories = resolveWorkspaceDirectories(rootDirectory, pattern);
    for (const workspaceDirectory of directories) {
      const workspacePackageJson = readPackageJson(path.join(workspaceDirectory, "package.json"));

      if (!hasHtmxSignals(workspaceDirectory, workspacePackageJson)) continue;

      const name = workspacePackageJson.name ?? path.basename(workspaceDirectory);
      packages.push({ name, directory: workspaceDirectory });
    }
  }

  return packages;
};

export const discoverProject = (directory: string): ProjectInfo => {
  const packageJsonPath = path.join(directory, "package.json");
  const packageJson = isFile(packageJsonPath) ? readPackageJson(packageJsonPath) : {};
  let { htmxVersion, framework } = extractDependencyInfo(packageJson);
  if (!htmxVersion) {
    htmxVersion = resolveCatalogVersion(packageJson, "htmx.org");
  }

  if (!htmxVersion || framework === "unknown") {
    const workspaceInfo = findHtmxInWorkspaces(directory, packageJson);
    if (!htmxVersion && workspaceInfo.htmxVersion) {
      htmxVersion = workspaceInfo.htmxVersion;
    }
    if (framework === "unknown" && workspaceInfo.framework !== "unknown") {
      framework = workspaceInfo.framework;
    }
  }

  if ((!htmxVersion || framework === "unknown") && !isMonorepoRoot(directory)) {
    const monorepoInfo = findDependencyInfoFromMonorepoRoot(directory);
    if (!htmxVersion) {
      htmxVersion = monorepoInfo.htmxVersion;
    }
    if (framework === "unknown") {
      framework = monorepoInfo.framework;
    }
  }

  if (framework === "unknown") {
    framework = detectFrameworkFromFiles(directory);
  }

  const sourceInfo = scanDirectoryForHtmxUsage(directory);
  if (!htmxVersion) {
    htmxVersion = sourceInfo.htmxVersion;
  }

  const projectName = packageJson.name ?? path.basename(directory);
  const hasTypeScript = fs.existsSync(path.join(directory, "tsconfig.json"));
  const sourceFileCount = countSourceFiles(directory);

  return {
    rootDirectory: directory,
    projectName,
    hasPackageJson: isFile(packageJsonPath),
    htmxVersion,
    framework,
    hasTypeScript,
    sourceFileCount,
    htmxSourceFileCount: sourceInfo.htmxSourceFileCount,
  };
};
