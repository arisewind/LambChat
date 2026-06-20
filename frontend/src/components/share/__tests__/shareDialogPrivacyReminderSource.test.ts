import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const shareDialogSource = readFileSync(
  join(import.meta.dirname, "../ShareDialog.tsx"),
  "utf8",
);

const enLocale = readFileSync(
  join(import.meta.dirname, "../../../i18n/locales/en.json"),
  "utf8",
);

const zhLocale = readFileSync(
  join(import.meta.dirname, "../../../i18n/locales/zh.json"),
  "utf8",
);

test("share dialog renders a privacy reminder before creating links", () => {
  assert.match(shareDialogSource, /share\.privacyReminder/);
  assert.match(shareDialogSource, /AlertTriangle/);
});

test("share privacy reminder is localized for open-source friendly copy", () => {
  assert.match(enLocale, /"privacyReminder"/);
  assert.match(
    enLocale,
    /remove personal information, secrets, contact details, account data/,
  );
  assert.match(zhLocale, /"privacyReminder"/);
  assert.match(zhLocale, /移除个人隐私、密钥、联系方式、账号信息/);
});
