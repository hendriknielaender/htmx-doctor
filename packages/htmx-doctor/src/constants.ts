export const SOURCE_FILE_PATTERN =
  /\.(?:tsx?|jsx?|mjs|cjs|html?|twig|njk|liquid|erb|ejs|hbs|handlebars|mustache|jinja2?|jinja|templ|php)$/i;

export const SCRIPT_SOURCE_FILE_PATTERN = /\.(?:tsx?|jsx?|mjs|cjs)$/i;

export const TEMPLATE_SOURCE_FILE_PATTERN =
  /\.(?:html?|twig|njk|liquid|erb|ejs|hbs|handlebars|mustache|jinja2?|jinja|templ|php)$/i;

export const HTMX_ATTRIBUTE_PATTERN = /\bhx-[a-z0-9:-]+\s*=/i;

export const HTMX_SCRIPT_PATTERN = /htmx(?:\.min)?\.js|htmx\.org/i;

export const HTMX_POLL_INTERVAL_WARNING_THRESHOLD_MS = 2_000;

export const HTMX_INPUT_TRIGGER_DELAY_WARNING_THRESHOLD_MS = 250;

export const HTMX_CONCURRENT_FORM_REQUEST_THRESHOLD = 2;

export const MOTION_LIBRARY_PACKAGES = new Set(["framer-motion", "motion"]);

export const MILLISECONDS_PER_SECOND = 1000;

export const PERFECT_SCORE = 100;

export const SCORE_GOOD_THRESHOLD = 75;

export const SCORE_OK_THRESHOLD = 50;

export const SCORE_BAR_WIDTH_CHARS = 50;

export const SUMMARY_BOX_HORIZONTAL_PADDING_CHARS = 1;

export const SUMMARY_BOX_OUTER_INDENT_CHARS = 2;

export const SCORE_API_URL = "https://www.htmx.doctor/api/score";

export const ESTIMATE_SCORE_API_URL = "https://www.htmx.doctor/api/estimate-score";

export const SHARE_BASE_URL = "https://www.htmx.doctor/share";

export const OPEN_BASE_URL = "https://www.htmx.doctor/open";

export const FETCH_TIMEOUT_MS = 10_000;

export const GIT_LS_FILES_MAX_BUFFER_BYTES = 50 * 1024 * 1024;

export const OFFLINE_MESSAGE =
  "You are offline, could not calculate score. Reconnect to calculate.";

export const DEFAULT_BRANCH_CANDIDATES = ["main", "master"];

export const ERROR_RULE_PENALTY = 1.5;

export const WARNING_RULE_PENALTY = 0.75;

export const ERROR_ESTIMATED_FIX_RATE = 0.85;

export const WARNING_ESTIMATED_FIX_RATE = 0.8;

export const MAX_KNIP_RETRIES = 5;

export const AMI_WEBSITE_URL = "https://ami.dev";

export const AMI_INSTALL_URL = `${AMI_WEBSITE_URL}/install.sh`;

export const AMI_RELEASES_URL = "https://github.com/millionco/ami-releases/releases";
