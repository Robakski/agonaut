#!/usr/bin/env npx tsx
/**
 * i18n Key Validation Script
 * Ensures all locales have the same keys as English (source of truth).
 * Run: npx tsx scripts/check-i18n.ts
 * Returns exit code 1 if any keys are missing.
 */

import fs from "fs";
import path from "path";

const MESSAGES_DIR = path.join(__dirname, "..", "messages");
const SOURCE_LOCALE = "en";

function loadNamespace(locale: string): Record<string, unknown> {
  const dir = path.join(MESSAGES_DIR, locale);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const result: Record<string, unknown> = {};
  for (const file of files) {
    const ns = file.replace(".json", "");
    result[ns] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return result;
}

function flatPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  const paths: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null) {
      paths.push(...flatPaths(v, p));
    } else {
      paths.push(p);
    }
  }
  return paths;
}

// Get all locales
const locales = fs
  .readdirSync(MESSAGES_DIR)
  .filter((f) => fs.statSync(path.join(MESSAGES_DIR, f)).isDirectory());

console.log(`📋 Locales found: ${locales.join(", ")}`);

const enMessages = loadNamespace(SOURCE_LOCALE);
const enKeys = new Set(flatPaths(enMessages));
console.log(`📦 English keys: ${enKeys.size}\n`);

let hasErrors = false;

for (const locale of locales) {
  if (locale === SOURCE_LOCALE) continue;

  const messages = loadNamespace(locale);
  const keys = new Set(flatPaths(messages));

  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));

  if (missing.length === 0 && extra.length === 0) {
    console.log(`✅ ${locale}: ${keys.size} keys — all good`);
  } else {
    if (missing.length > 0) {
      hasErrors = true;
      console.log(`❌ ${locale}: ${missing.length} MISSING keys:`);
      for (const k of missing) console.log(`   - ${k}`);
    }
    if (extra.length > 0) {
      console.log(`⚠️  ${locale}: ${extra.length} extra keys (not in EN):`);
      for (const k of extra) console.log(`   + ${k}`);
    }
  }
}

console.log("");
if (hasErrors) {
  console.log("💥 i18n validation FAILED — missing keys found");
  process.exit(1);
} else {
  console.log("🎉 i18n validation PASSED — all locales in sync");
}
