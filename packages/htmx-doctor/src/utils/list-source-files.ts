import fs from "node:fs";
import path from "node:path";
import { SOURCE_FILE_PATTERN } from "../constants.js";

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const normalizeRelativeFilePath = (filePath: string): string =>
  filePath.replace(/\\/g, "/").replace(/^\.\//, "");

const isHiddenDirectory = (directoryName: string): boolean =>
  directoryName.startsWith(".") && directoryName !== ".well-known";

const walkSourceFiles = (rootDirectory: string): string[] => {
  const discoveredFilePaths: string[] = [];
  const directoriesToVisit = [rootDirectory];

  while (directoriesToVisit.length > 0) {
    const currentDirectory = directoriesToVisit.pop();
    if (!currentDirectory) continue;

    const directoryEntries = fs.readdirSync(currentDirectory, { withFileTypes: true });

    for (const directoryEntry of directoryEntries) {
      if (directoryEntry.isDirectory()) {
        if (
          IGNORED_DIRECTORY_NAMES.has(directoryEntry.name) ||
          isHiddenDirectory(directoryEntry.name)
        ) {
          continue;
        }

        directoriesToVisit.push(path.join(currentDirectory, directoryEntry.name));
        continue;
      }

      if (!directoryEntry.isFile() || !SOURCE_FILE_PATTERN.test(directoryEntry.name)) {
        continue;
      }

      discoveredFilePaths.push(
        normalizeRelativeFilePath(
          path.relative(rootDirectory, path.join(currentDirectory, directoryEntry.name)),
        ),
      );
    }
  }

  return discoveredFilePaths.toSorted();
};

export const listSourceFiles = (rootDirectory: string, includePaths?: string[]): string[] => {
  if (!includePaths) {
    return walkSourceFiles(rootDirectory);
  }

  return includePaths
    .map((filePath) =>
      normalizeRelativeFilePath(
        path.isAbsolute(filePath) ? path.relative(rootDirectory, filePath) : filePath,
      ),
    )
    .filter((filePath) => SOURCE_FILE_PATTERN.test(filePath));
};
