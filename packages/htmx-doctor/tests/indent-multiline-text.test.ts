import { describe, expect, it } from "vitest";
import { indentMultilineText } from "../src/utils/indent-multiline-text.js";

describe("indentMultilineText", () => {
  it("adds the prefix to a single line", () => {
    const indentedText = indentMultilineText("Error: Something happened", "    ");

    expect(indentedText).toBe("    Error: Something happened");
  });

  it("adds the prefix to every line in multiline text", () => {
    const explanation =
      "Warning: Destructive hx-delete request is missing hx-confirm\n\nHTMX Doctor recommends explicit confirmation for destructive requests.\n* Add hx-confirm before sending the request.\n* Prefer a dedicated form when the action cannot be safely undone.";

    const indentedText = indentMultilineText(explanation, "    ");

    expect(indentedText).toBe(
      "    Warning: Destructive hx-delete request is missing hx-confirm\n    \n    HTMX Doctor recommends explicit confirmation for destructive requests.\n    * Add hx-confirm before sending the request.\n    * Prefer a dedicated form when the action cannot be safely undone.",
    );
  });
});
