import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { hasLocale } from "next-intl";
import fs from "fs";
import path from "path";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // Load all namespace files from messages/<locale>/ directory
  const dir = path.join(process.cwd(), "messages", locale);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const messages: Record<string, unknown> = {};
  for (const file of files) {
    const ns = file.replace(".json", "");
    messages[ns] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  }

  return {
    locale,
    messages,
  };
});
