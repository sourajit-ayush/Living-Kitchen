import { createTranslator, IntlErrorCode, type IntlError } from "next-intl";
import { describe, expect, it } from "vitest";
import bn from "@/i18n/bn.json";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import { routing } from "@/i18n/routing";

function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

const MESSAGES = { en, hi, bn };

describe("i18n messages", () => {
  it("every locale has a messages file", () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...routing.locales].sort());
  });

  it.each(["hi", "bn"] as const)("%s has exactly the same keys as en", (locale) => {
    expect(keyPaths(MESSAGES[locale]).sort()).toEqual(keyPaths(en).sort());
  });

  it("has no empty strings (except deliberately blank unit labels)", () => {
    const allowedEmpty = new Set(["Units.piece"]);
    const values = (obj: Record<string, unknown>, prefix = ""): [string, unknown][] =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object"
          ? values(v as Record<string, unknown>, `${prefix}${k}.`)
          : [[`${prefix}${k}`, v]],
      );
    for (const messages of Object.values(MESSAGES)) {
      for (const [path, value] of values(messages)) {
        if (!allowedEmpty.has(path)) expect(value, path).not.toBe("");
      }
    }
  });

  it.each(["en", "hi", "bn"] as const)("every %s message is valid ICU syntax", (locale) => {
    const broken: string[] = [];
    const t = createTranslator({
      locale,
      messages: MESSAGES[locale],
      onError: (e: IntlError) => {
        // Missing argument values are expected here (none are passed); bad syntax is not.
        if (e.code === IntlErrorCode.INVALID_MESSAGE) broken.push(e.message);
      },
    });
    for (const path of keyPaths(MESSAGES[locale])) {
      if (/\.\d+$/.test(path)) continue; // array items are read with t.raw
      t(path as never);
    }
    expect(broken).toEqual([]);
  });
});
