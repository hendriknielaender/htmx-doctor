import fs from "node:fs";
import path from "node:path";
import {
  HTMX_ATTRIBUTE_PATTERN,
  HTMX_CONCURRENT_FORM_REQUEST_THRESHOLD,
  HTMX_INPUT_TRIGGER_DELAY_WARNING_THRESHOLD_MS,
  HTMX_POLL_INTERVAL_WARNING_THRESHOLD_MS,
} from "../constants.js";
import type { Diagnostic } from "../types.js";
import { isPlainObject } from "./is-plain-object.js";
import { listSourceFiles } from "./list-source-files.js";
import { parseDurationToMilliseconds } from "./parse-duration-to-milliseconds.js";

interface LineAndColumn {
  line: number;
  column: number;
}

interface ParsedTag {
  tagName: string;
  attributes: Record<string, string>;
  startIndex: number;
}

interface ParsedFormBlock {
  attributes: Record<string, string>;
  startIndex: number;
  innerContent: string;
}

const REQUEST_ATTRIBUTE_NAMES = ["hx-get", "hx-post", "hx-put", "hx-patch", "hx-delete"];

const DELETE_CONFIRM_HELP =
  'Add `hx-confirm="Are you sure?"` or move the destructive request behind an explicit form confirmation step';
const INPUT_TRIGGER_DELAY_HELP =
  'Use `hx-trigger="input changed delay:300ms"` so fast typing does not fan out one request per keystroke';
const BODY_OUTER_HTML_SWAP_HELP =
  "Target a wrapper inside `<body>` or use `innerHTML` when replacing larger page sections";
const POLLING_TOO_FREQUENT_HELP =
  "Prefer SSE/WebSockets for near-real-time updates, or increase the polling interval above 2 seconds";
const FORM_MISSING_SYNC_HELP =
  'Add `hx-sync="closest form:abort"` or another sync strategy so concurrent form requests do not race';
const INLINE_EVALUATION_HELP =
  "Move inline HTMX JavaScript to a separate listener or compute the value server-side instead of evaluating it in markup";
const INLINE_SECRET_HELP =
  "Do not ship API keys or bearer tokens in `hx-headers`; mint the header server-side or proxy the request through your backend";
const ABSOLUTE_REQUEST_URL_HELP =
  "Use relative URLs like `/events` so HTMX only calls routes you control and same-origin protections remain effective";
const ALLOW_EVAL_CONFIG_HELP =
  "Set `htmx.config.allowEval = false` unless you intentionally depend on `hx-on` or `js:` evaluation in markup";
const ALLOW_SCRIPT_TAGS_CONFIG_HELP =
  "Set `htmx.config.allowScriptTags = false` unless every swapped HTMX response is fully trusted";
const HISTORY_CACHE_SIZE_CONFIG_HELP =
  'Set `htmx.config.historyCacheSize = 0` or add `hx-history="false"` on sensitive pages to avoid caching private HTML in localStorage';
const SELF_REQUESTS_ONLY_CONFIG_HELP =
  "Keep `htmx.config.selfRequestsOnly = true`, or add a strict `htmx:validateUrl` allowlist before enabling cross-origin HTMX requests";
const SELF_REQUESTS_ONLY_WITH_ALLOWLIST_CONFIG_HELP =
  "Prefer `htmx.config.selfRequestsOnly = true` when possible. If cross-origin HTMX requests are required, keep the `htmx:validateUrl` allowlist narrow";

const START_TAG_PATTERN = /<([A-Za-z][A-Za-z0-9:-]*)(\s[^<>]*?)?>/g;
const ATTRIBUTE_PATTERN =
  /([:@A-Za-z][A-Za-z0-9:._-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const FORM_BLOCK_PATTERN = /<form\b([^<>]*?)>([\s\S]*?)<\/form>/gi;
const POLLING_TRIGGER_PATTERN = /\bevery\s+([0-9]+(?:\.[0-9]+)?(?:ms|s|m))/i;
const INPUT_TRIGGER_PATTERN = /\b(?:keyup|input)\b/i;
const DELAY_PATTERN = /\bdelay:([0-9]+(?:\.[0-9]+)?(?:ms|s|m))/i;
const HX_ON_ATTRIBUTE_PATTERN = /^hx-on(?::|--)/i;
const JS_EVALUATION_PREFIX_PATTERN = /^\s*(?:javascript|js):/i;
const INLINE_SECRET_PATTERN =
  /\b(?:authorization|bearer|api[-_ ]?key|access[-_ ]?token|x-api-key)\b/i;
const HTMX_CONFIG_ASSIGNMENT_PATTERN =
  /htmx\.config\.(allowEval|allowScriptTags|historyCacheSize|selfRequestsOnly)\s*=\s*([^\n;<]+)/g;
const HTMX_VALIDATE_URL_EVENT_PATTERN = /\bhtmx:validateUrl\b/;
const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const buildLineStartOffsets = (fileContent: string): number[] => {
  const lineStartOffsets = [0];

  for (let index = 0; index < fileContent.length; index++) {
    if (fileContent[index] === "\n") {
      lineStartOffsets.push(index + 1);
    }
  }

  return lineStartOffsets;
};

const getLineAndColumn = (lineStartOffsets: number[], targetIndex: number): LineAndColumn => {
  let lowIndex = 0;
  let highIndex = lineStartOffsets.length - 1;

  while (lowIndex <= highIndex) {
    const middleIndex = Math.floor((lowIndex + highIndex) / 2);
    const startOffset = lineStartOffsets[middleIndex];
    const nextOffset =
      middleIndex + 1 < lineStartOffsets.length
        ? lineStartOffsets[middleIndex + 1]
        : Number.POSITIVE_INFINITY;

    if (targetIndex < startOffset) {
      highIndex = middleIndex - 1;
      continue;
    }

    if (targetIndex >= nextOffset) {
      lowIndex = middleIndex + 1;
      continue;
    }

    return {
      line: middleIndex + 1,
      column: targetIndex - startOffset + 1,
    };
  }

  return { line: 1, column: 1 };
};

const getAttributeValue = (
  doubleQuotedValue: string | undefined,
  singleQuotedValue: string | undefined,
  bareValue: string | undefined,
): string => doubleQuotedValue ?? singleQuotedValue ?? bareValue ?? "";

const parseAttributes = (attributeSource: string): Record<string, string> => {
  const parsedAttributes: Record<string, string> = {};

  for (const matchedAttribute of attributeSource.matchAll(ATTRIBUTE_PATTERN)) {
    const attributeName = matchedAttribute[1]?.toLowerCase();
    if (!attributeName) {
      continue;
    }

    parsedAttributes[attributeName] = getAttributeValue(
      matchedAttribute[2],
      matchedAttribute[3],
      matchedAttribute[4],
    );
  }

  return parsedAttributes;
};

const parseTags = (fileContent: string): ParsedTag[] => {
  const parsedTags: ParsedTag[] = [];

  for (const matchedTag of fileContent.matchAll(START_TAG_PATTERN)) {
    const tagName = matchedTag[1]?.toLowerCase();
    if (!tagName) {
      continue;
    }

    parsedTags.push({
      tagName,
      attributes: parseAttributes(matchedTag[2] ?? ""),
      startIndex: matchedTag.index ?? 0,
    });
  }

  return parsedTags;
};

const parseFormBlocks = (fileContent: string): ParsedFormBlock[] => {
  const parsedFormBlocks: ParsedFormBlock[] = [];

  for (const matchedForm of fileContent.matchAll(FORM_BLOCK_PATTERN)) {
    parsedFormBlocks.push({
      attributes: parseAttributes(matchedForm[1] ?? ""),
      startIndex: matchedForm.index ?? 0,
      innerContent: matchedForm[2] ?? "",
    });
  }

  return parsedFormBlocks;
};

const parseBooleanLiteral = (value: string): boolean | null => {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  return null;
};

const parseNumberLiteral = (value: string): number | null => {
  const trimmedValue = value.trim();

  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(trimmedValue)) {
    return null;
  }

  const parsedNumber = Number(trimmedValue);
  return Number.isFinite(parsedNumber) ? parsedNumber : null;
};

const hasRequestAttribute = (attributes: Record<string, string>): boolean =>
  REQUEST_ATTRIBUTE_NAMES.some((attributeName) => attributeName in attributes);

const isAbsoluteUrl = (value: string): boolean => ABSOLUTE_URL_PATTERN.test(value.trim());

const createDiagnostic = (
  filePath: string,
  startIndex: number,
  lineStartOffsets: number[],
  rule: string,
  severity: Diagnostic["severity"],
  message: string,
  help: string,
  category: string,
): Diagnostic => {
  const location = getLineAndColumn(lineStartOffsets, startIndex);

  return {
    filePath,
    plugin: "htmx-doctor",
    rule,
    severity,
    message,
    help,
    line: location.line,
    column: location.column,
    category,
  };
};

const findConfigDiagnosticsForValue = (
  filePath: string,
  startIndex: number,
  lineStartOffsets: number[],
  configKey: string,
  configValue: unknown,
  hasValidateUrlHandler: boolean,
): Diagnostic[] => {
  if (configKey === "allowEval" && configValue === true) {
    return [
      createDiagnostic(
        filePath,
        startIndex,
        lineStartOffsets,
        "config-allow-eval-enabled",
        "warning",
        "`htmx.config.allowEval` is enabled, so HTMX can evaluate inline JavaScript features at runtime",
        ALLOW_EVAL_CONFIG_HELP,
        "Security",
      ),
    ];
  }

  if (configKey === "allowScriptTags" && configValue === true) {
    return [
      createDiagnostic(
        filePath,
        startIndex,
        lineStartOffsets,
        "config-allow-script-tags-enabled",
        "warning",
        "`htmx.config.allowScriptTags` is enabled, so swapped content can execute inline `<script>` tags",
        ALLOW_SCRIPT_TAGS_CONFIG_HELP,
        "Security",
      ),
    ];
  }

  if (configKey === "historyCacheSize" && typeof configValue === "number" && configValue > 0) {
    return [
      createDiagnostic(
        filePath,
        startIndex,
        lineStartOffsets,
        "config-history-cache-enabled",
        "warning",
        "`htmx.config.historyCacheSize` stores HTMX page snapshots in localStorage",
        HISTORY_CACHE_SIZE_CONFIG_HELP,
        "Security",
      ),
    ];
  }

  if (configKey === "selfRequestsOnly" && configValue === false) {
    return [
      createDiagnostic(
        filePath,
        startIndex,
        lineStartOffsets,
        "config-self-requests-only-disabled",
        "warning",
        "`htmx.config.selfRequestsOnly` is disabled, so HTMX requests are no longer limited to the current origin",
        hasValidateUrlHandler
          ? SELF_REQUESTS_ONLY_WITH_ALLOWLIST_CONFIG_HELP
          : SELF_REQUESTS_ONLY_CONFIG_HELP,
        "Security",
      ),
    ];
  }

  return [];
};

const findDeleteWithoutConfirmationDiagnostics = (
  filePath: string,
  parsedTags: ParsedTag[],
  lineStartOffsets: number[],
): Diagnostic[] =>
  parsedTags.flatMap((parsedTag) =>
    "hx-delete" in parsedTag.attributes && !("hx-confirm" in parsedTag.attributes)
      ? [
          createDiagnostic(
            filePath,
            parsedTag.startIndex,
            lineStartOffsets,
            "delete-missing-confirm",
            "warning",
            "Destructive `hx-delete` request is missing `hx-confirm`",
            DELETE_CONFIRM_HELP,
            "Security",
          ),
        ]
      : [],
  );

const findAbsoluteRequestUrlDiagnostics = (
  filePath: string,
  parsedTags: ParsedTag[],
  lineStartOffsets: number[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const parsedTag of parsedTags) {
    for (const requestAttributeName of REQUEST_ATTRIBUTE_NAMES) {
      const requestValue = parsedTag.attributes[requestAttributeName];
      if (!requestValue || !isAbsoluteUrl(requestValue)) {
        continue;
      }

      diagnostics.push(
        createDiagnostic(
          filePath,
          parsedTag.startIndex,
          lineStartOffsets,
          "absolute-request-url",
          "warning",
          `HTMX request uses an absolute URL in \`${requestAttributeName}\` instead of an app-relative route`,
          ABSOLUTE_REQUEST_URL_HELP,
          "Security",
        ),
      );
      break;
    }
  }

  return diagnostics;
};

const findInputTriggerWithoutDelayDiagnostics = (
  filePath: string,
  parsedTags: ParsedTag[],
  lineStartOffsets: number[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const parsedTag of parsedTags) {
    if (!hasRequestAttribute(parsedTag.attributes)) {
      continue;
    }

    const triggerValue = parsedTag.attributes["hx-trigger"];
    if (!triggerValue || !INPUT_TRIGGER_PATTERN.test(triggerValue)) {
      continue;
    }

    const matchedDelay = triggerValue.match(DELAY_PATTERN);
    if (!matchedDelay?.[1]) {
      diagnostics.push(
        createDiagnostic(
          filePath,
          parsedTag.startIndex,
          lineStartOffsets,
          "input-trigger-missing-delay",
          "warning",
          "Interactive HTMX trigger fires on every keystroke without a debounce delay",
          INPUT_TRIGGER_DELAY_HELP,
          "Performance",
        ),
      );
      continue;
    }

    const delayMilliseconds = parseDurationToMilliseconds(matchedDelay[1]);
    if (
      delayMilliseconds !== null &&
      delayMilliseconds < HTMX_INPUT_TRIGGER_DELAY_WARNING_THRESHOLD_MS
    ) {
      diagnostics.push(
        createDiagnostic(
          filePath,
          parsedTag.startIndex,
          lineStartOffsets,
          "input-trigger-missing-delay",
          "warning",
          "Interactive HTMX trigger uses an aggressive debounce delay that can still overwhelm the server",
          INPUT_TRIGGER_DELAY_HELP,
          "Performance",
        ),
      );
    }
  }

  return diagnostics;
};

const findBodyOuterHtmlSwapDiagnostics = (
  filePath: string,
  parsedTags: ParsedTag[],
  lineStartOffsets: number[],
): Diagnostic[] =>
  parsedTags.flatMap((parsedTag) => {
    const targetValue = parsedTag.attributes["hx-target"]?.trim().toLowerCase();
    const swapValue = parsedTag.attributes["hx-swap"]?.toLowerCase() ?? "";

    if (targetValue !== "body" || !swapValue.includes("outerhtml")) {
      return [];
    }

    return [
      createDiagnostic(
        filePath,
        parsedTag.startIndex,
        lineStartOffsets,
        "body-outerhtml-swap",
        "warning",
        '`hx-target="body"` with `outerHTML` does not swap the page shell predictably',
        BODY_OUTER_HTML_SWAP_HELP,
        "Correctness",
      ),
    ];
  });

const findPollingTooFrequentDiagnostics = (
  filePath: string,
  parsedTags: ParsedTag[],
  lineStartOffsets: number[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const parsedTag of parsedTags) {
    const triggerValue = parsedTag.attributes["hx-trigger"];
    if (!triggerValue) {
      continue;
    }

    const matchedPollingTrigger = triggerValue.match(POLLING_TRIGGER_PATTERN);
    if (!matchedPollingTrigger?.[1]) {
      continue;
    }

    const pollingIntervalMilliseconds = parseDurationToMilliseconds(matchedPollingTrigger[1]);
    if (
      pollingIntervalMilliseconds === null ||
      pollingIntervalMilliseconds >= HTMX_POLL_INTERVAL_WARNING_THRESHOLD_MS
    ) {
      continue;
    }

    diagnostics.push(
      createDiagnostic(
        filePath,
        parsedTag.startIndex,
        lineStartOffsets,
        "polling-too-frequent",
        "warning",
        "HTMX polling interval is short enough to create avoidable request pressure",
        POLLING_TOO_FREQUENT_HELP,
        "Performance",
      ),
    );
  }

  return diagnostics;
};

const findFormMissingSyncDiagnostics = (
  filePath: string,
  parsedFormBlocks: ParsedFormBlock[],
  lineStartOffsets: number[],
): Diagnostic[] =>
  parsedFormBlocks.flatMap((parsedFormBlock) => {
    const requestCount = [
      ...parsedFormBlock.innerContent.matchAll(/\bhx-(?:get|post|put|patch|delete)\s*=/gi),
    ].length;

    if (
      requestCount < HTMX_CONCURRENT_FORM_REQUEST_THRESHOLD ||
      "hx-sync" in parsedFormBlock.attributes
    ) {
      return [];
    }

    return [
      createDiagnostic(
        filePath,
        parsedFormBlock.startIndex,
        lineStartOffsets,
        "form-missing-sync",
        "warning",
        "Form contains multiple HTMX requests without an `hx-sync` coordination strategy",
        FORM_MISSING_SYNC_HELP,
        "Correctness",
      ),
    ];
  });

const findInlineEvaluationDiagnostics = (
  filePath: string,
  parsedTags: ParsedTag[],
  lineStartOffsets: number[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const parsedTag of parsedTags) {
    for (const [attributeName, attributeValue] of Object.entries(parsedTag.attributes)) {
      const usesInlineEvaluation =
        (attributeName === "hx-vals" || attributeName === "hx-vars") &&
        JS_EVALUATION_PREFIX_PATTERN.test(attributeValue);
      const usesInlineEventHandler = HX_ON_ATTRIBUTE_PATTERN.test(attributeName);

      if (!usesInlineEvaluation && !usesInlineEventHandler) {
        continue;
      }

      diagnostics.push(
        createDiagnostic(
          filePath,
          parsedTag.startIndex,
          lineStartOffsets,
          "inline-evaluation",
          usesInlineEvaluation ? "error" : "warning",
          usesInlineEvaluation
            ? "HTMX attribute evaluates JavaScript at runtime via `js:`"
            : "HTMX markup uses inline `hx-on` JavaScript handlers",
          INLINE_EVALUATION_HELP,
          "Security",
        ),
      );
      break;
    }
  }

  return diagnostics;
};

const findInlineSecretDiagnostics = (
  filePath: string,
  parsedTags: ParsedTag[],
  lineStartOffsets: number[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const parsedTag of parsedTags) {
    const headersValue = parsedTag.attributes["hx-headers"];
    if (!headersValue || !INLINE_SECRET_PATTERN.test(headersValue)) {
      continue;
    }

    diagnostics.push(
      createDiagnostic(
        filePath,
        parsedTag.startIndex,
        lineStartOffsets,
        "headers-secret-literal",
        "error",
        "`hx-headers` appears to embed an authorization credential directly in markup",
        INLINE_SECRET_HELP,
        "Security",
      ),
    );
  }

  return diagnostics;
};

const findMetaConfigDiagnostics = (
  filePath: string,
  parsedTags: ParsedTag[],
  lineStartOffsets: number[],
  hasValidateUrlHandler: boolean,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const parsedTag of parsedTags) {
    if (
      parsedTag.tagName !== "meta" ||
      parsedTag.attributes.name?.trim().toLowerCase() !== "htmx-config"
    ) {
      continue;
    }

    const contentValue = parsedTag.attributes.content;
    if (!contentValue) {
      continue;
    }

    let parsedConfig: unknown;

    try {
      parsedConfig = JSON.parse(contentValue);
    } catch {
      continue;
    }

    if (!isPlainObject(parsedConfig)) {
      continue;
    }

    for (const [configKey, configValue] of Object.entries(parsedConfig)) {
      diagnostics.push(
        ...findConfigDiagnosticsForValue(
          filePath,
          parsedTag.startIndex,
          lineStartOffsets,
          configKey,
          configValue,
          hasValidateUrlHandler,
        ),
      );
    }
  }

  return diagnostics;
};

const findAssignmentConfigDiagnostics = (
  filePath: string,
  fileContent: string,
  lineStartOffsets: number[],
  hasValidateUrlHandler: boolean,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const matchedAssignment of fileContent.matchAll(HTMX_CONFIG_ASSIGNMENT_PATTERN)) {
    const configKey = matchedAssignment[1];
    const rawValue = matchedAssignment[2];

    if (!configKey || !rawValue) {
      continue;
    }

    const parsedValue =
      configKey === "historyCacheSize"
        ? parseNumberLiteral(rawValue)
        : parseBooleanLiteral(rawValue);

    if (parsedValue === null) {
      continue;
    }

    diagnostics.push(
      ...findConfigDiagnosticsForValue(
        filePath,
        matchedAssignment.index ?? 0,
        lineStartOffsets,
        configKey,
        parsedValue,
        hasValidateUrlHandler,
      ),
    );
  }

  return diagnostics;
};

const scanFileForDiagnostics = (
  filePath: string,
  fileContent: string,
  hasValidateUrlHandler: boolean,
): Diagnostic[] => {
  const lineStartOffsets = buildLineStartOffsets(fileContent);
  const parsedTags = parseTags(fileContent);
  const parsedFormBlocks = HTMX_ATTRIBUTE_PATTERN.test(fileContent)
    ? parseFormBlocks(fileContent)
    : [];

  const diagnostics = [
    ...findMetaConfigDiagnostics(filePath, parsedTags, lineStartOffsets, hasValidateUrlHandler),
    ...findAssignmentConfigDiagnostics(
      filePath,
      fileContent,
      lineStartOffsets,
      hasValidateUrlHandler,
    ),
  ];

  if (!HTMX_ATTRIBUTE_PATTERN.test(fileContent)) {
    return diagnostics;
  }

  return [
    ...diagnostics,
    ...findAbsoluteRequestUrlDiagnostics(filePath, parsedTags, lineStartOffsets),
    ...findDeleteWithoutConfirmationDiagnostics(filePath, parsedTags, lineStartOffsets),
    ...findInputTriggerWithoutDelayDiagnostics(filePath, parsedTags, lineStartOffsets),
    ...findBodyOuterHtmlSwapDiagnostics(filePath, parsedTags, lineStartOffsets),
    ...findPollingTooFrequentDiagnostics(filePath, parsedTags, lineStartOffsets),
    ...findFormMissingSyncDiagnostics(filePath, parsedFormBlocks, lineStartOffsets),
    ...findInlineEvaluationDiagnostics(filePath, parsedTags, lineStartOffsets),
    ...findInlineSecretDiagnostics(filePath, parsedTags, lineStartOffsets),
  ];
};

export const runOxlint = async (
  rootDirectory: string,
  includePaths?: string[],
): Promise<Diagnostic[]> => {
  if (includePaths !== undefined && includePaths.length === 0) {
    return [];
  }

  const readableSourceFiles = listSourceFiles(rootDirectory, includePaths).flatMap((filePath) => {
    const absoluteFilePath = path.join(rootDirectory, filePath);

    try {
      return [
        {
          filePath,
          fileContent: fs.readFileSync(absoluteFilePath, "utf-8"),
        },
      ];
    } catch {
      return [];
    }
  });

  const hasValidateUrlHandler = readableSourceFiles.some(({ fileContent }) =>
    HTMX_VALIDATE_URL_EVENT_PATTERN.test(fileContent),
  );
  const diagnostics: Diagnostic[] = [];

  for (const { filePath, fileContent } of readableSourceFiles) {
    diagnostics.push(...scanFileForDiagnostics(filePath, fileContent, hasValidateUrlHandler));
  }

  return diagnostics;
};
