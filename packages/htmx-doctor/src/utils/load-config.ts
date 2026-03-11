import fs from "node:fs";
import path from "node:path";
import type { HtmxDoctorConfig } from "../types.js";
import { isFile } from "./is-file.js";
import { isPlainObject } from "./is-plain-object.js";

const CONFIG_FILENAMES = ["htmx-doctor.config.json", "react-doctor.config.json"];
const PACKAGE_JSON_CONFIG_KEYS = ["htmxDoctor", "reactDoctor"];

const readConfigFile = (configFilePath: string): HtmxDoctorConfig | null => {
  try {
    const fileContent = fs.readFileSync(configFilePath, "utf-8");
    const parsed: unknown = JSON.parse(fileContent);
    if (isPlainObject(parsed)) {
      return parsed as HtmxDoctorConfig;
    }
    console.warn(`Warning: ${path.basename(configFilePath)} must be a JSON object, ignoring.`);
  } catch (error) {
    console.warn(
      `Warning: Failed to parse ${path.basename(configFilePath)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return null;
};

export const loadConfig = (rootDirectory: string): HtmxDoctorConfig | null => {
  for (const configFilename of CONFIG_FILENAMES) {
    const configFilePath = path.join(rootDirectory, configFilename);
    if (isFile(configFilePath)) {
      const loadedConfig = readConfigFile(configFilePath);
      if (loadedConfig) {
        return loadedConfig;
      }
    }
  }

  const packageJsonPath = path.join(rootDirectory, "package.json");
  if (isFile(packageJsonPath)) {
    try {
      const fileContent = fs.readFileSync(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(fileContent);
      for (const packageJsonConfigKey of PACKAGE_JSON_CONFIG_KEYS) {
        const embeddedConfig = packageJson[packageJsonConfigKey];
        if (isPlainObject(embeddedConfig)) {
          return embeddedConfig as HtmxDoctorConfig;
        }
      }
    } catch {
      return null;
    }
  }

  return null;
};
