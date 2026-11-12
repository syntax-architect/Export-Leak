import { expect, test } from "@playwright/test";

function parseRgb(color: string): [number, number, number] {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    throw new Error(`Could not parse color: ${color}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(fg: string, bg: string): number {
  const l1 = luminance(parseRgb(fg));
  const l2 = luminance(parseRgb(bg));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

test.describe("Design system responsive & dark mode checks", () => {
  test("renders /design without horizontal overflow at 360px and switches DataTable to CardList", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/design");

    await expect(page.getByRole("heading", { name: "Design System Showcase" })).toBeVisible();

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);

    // Mobile CardList is visible, Desktop table is hidden below 768px
    await expect(page.getByTestId("data-table-mobile")).toBeVisible();
    await expect(page.getByTestId("data-table-desktop")).toBeHidden();

    // Mobile bottom tab bar is visible
    await expect(page.getByRole("navigation", { name: "Mobile bottom navigation" })).toBeVisible();

    // Switch to dark mode and verify contrast + zero overflow
    await page.getByTestId("design-theme-switch").click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    const darkColors = await page.evaluate(() => {
      const bodyStyle = getComputedStyle(document.body);
      const heading = document.querySelector("h1");
      const headingStyle = heading ? getComputedStyle(heading) : bodyStyle;
      return {
        bodyText: bodyStyle.color,
        bodyBg: bodyStyle.backgroundColor,
        headingText: headingStyle.color,
      };
    });

    expect(contrast(darkColors.bodyText, darkColors.bodyBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkColors.headingText, darkColors.bodyBg)).toBeGreaterThanOrEqual(4.5);

    const overflowDark = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    expect(overflowDark).toBeLessThanOrEqual(0);
  });

  test("renders DataTable as a desktop table and shows sidebar at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/design");

    await expect(page.getByRole("heading", { name: "Design System Showcase" })).toBeVisible();

    // Desktop table is visible, Mobile CardList is hidden >= 768px
    await expect(page.getByTestId("data-table-desktop")).toBeVisible();
    await expect(page.getByTestId("data-table-desktop").locator("table")).toBeVisible();
    await expect(page.getByTestId("data-table-mobile")).toBeHidden();

    // Desktop sidebar is visible
    await expect(
      page.getByRole("complementary", { name: "Primary sidebar navigation" })
    ).toBeVisible();

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
