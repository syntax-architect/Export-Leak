import { describe, expect, it } from "vitest";
import { getDictionary, translate } from "../index";

describe("Prompt 18: i18n Scaffolding", () => {
  it("returns default English dictionary", () => {
    const dict = getDictionary("en");
    expect(dict.common.appName).toBe("ExportLeak");
    expect(dict.common.retry).toBe("Retry");
    expect(dict.nav.overview).toBe("Overview");
  });

  it("translates keys for Hindi locale", () => {
    const hiRetry = translate("common", "retry", "hi");
    expect(hiRetry).toBe("पुनः प्रयास करें");
    const hiDaysLeft = translate("dashboard", "daysLeft", "hi");
    expect(hiDaysLeft).toBe("दिन शेष");
  });

  it("falls back to English when an unmapped locale is requested", () => {
    // @ts-expect-error Testing fallback for unknown locale
    const text = translate("common", "save", "fr");
    expect(text).toBe("Save");
  });
});
