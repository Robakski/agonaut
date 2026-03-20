import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { hasLocale } from "next-intl";
import fs from "fs";
import path from "path";

function loadMessages(locale: string): Record<string, unknown> {
  const dir = path.join(process.cwd(), "messages", locale);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const messages: Record<string, unknown> = {};
  for (const file of files) {
    const ns = file.replace(".json", "");
    messages[ns] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return messages;
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // Always load English as base, then overlay locale-specific translations
  // This ensures missing keys fall back to English instead of showing blank
  const enMessages = loadMessages("en");
  const messages =
    locale === "en" ? enMessages : deepMerge(enMessages, loadMessages(locale));

  return {
    locale,
    messages,
  };
});
