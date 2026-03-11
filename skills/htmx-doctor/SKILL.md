name: htmx-doctor
description: Run after making HTMX changes to catch request, swap, and markup issues early.
version: 1.0.0

---

# HTMX Doctor

Scans HTMX templates and scripts for security, performance, correctness, and accessibility issues. Outputs a 0-100 score with actionable diagnostics.

## Usage

```bash
npx -y htmx-doctor@latest . --verbose --diff
```

## Workflow

Run after making changes to catch issues early. Fix errors first, then re-run to verify the score improved.
