import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { FrontendBddWorld } from "./world.ts";

export interface VisualSnapshotOptions {
  locator?: Locator;
  mask?: Locator[];
  fullPage?: boolean;
  keepFocus?: boolean;
  threshold?: number;
  maxDiffRatio?: number;
}

export function getVisualPlatform(): "alpine" | "linux" {
  return fs.existsSync("/etc/alpine-release") ? "alpine" : "linux";
}

export async function stabilizePageForSnapshot(
  page: Page,
  keepFocus = false
): Promise<void> {
  await page.evaluate(async (shouldKeepFocus) => {
    const styleId = "__bdd_visual_freeze";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = [
        "*, *::before, *::after {",
        "  transition-duration: 0s !important;",
        "  transition-delay: 0s !important;",
        "  animation-duration: 0s !important;",
        "  animation-delay: 0s !important;",
        "  caret-color: transparent !important;",
        "  scroll-behavior: auto !important;",
        "}",
      ].join("\n");
      document.head.appendChild(style);
    }

    if ((document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }

    if (!shouldKeepFocus && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, keepFocus);
}

function normalizePngCanvas(src: PNG, width: number, height: number): PNG {
  if (src.width === width && src.height === height) {
    return src;
  }
  const dst = new PNG({ width, height, fill: true });
  for (let i = 0; i < dst.data.length; i += 4) {
    dst.data[i] = 255;
    dst.data[i + 1] = 255;
    dst.data[i + 2] = 255;
    dst.data[i + 3] = 255;
  }
  PNG.bitblt(src, dst, 0, 0, src.width, src.height, 0, 0);
  return dst;
}

function composeThreePanelPng(baseline: PNG, actual: PNG, diff: PNG): Buffer {
  const panelWidth = Math.max(baseline.width, actual.width, diff.width);
  const panelHeight = Math.max(baseline.height, actual.height, diff.height);
  const gap = 8;
  const combined = new PNG({
    width: panelWidth * 3 + gap * 2,
    height: panelHeight,
    fill: true,
  });

  // Neutral slate divider background between Baseline | Actual | Diff panels
  for (let i = 0; i < combined.data.length; i += 4) {
    combined.data[i] = 226;
    combined.data[i + 1] = 232;
    combined.data[i + 2] = 240;
    combined.data[i + 3] = 255;
  }

  const baseCanvas = normalizePngCanvas(baseline, panelWidth, panelHeight);
  const actualCanvas = normalizePngCanvas(actual, panelWidth, panelHeight);
  const diffCanvas = normalizePngCanvas(diff, panelWidth, panelHeight);

  PNG.bitblt(baseCanvas, combined, 0, 0, panelWidth, panelHeight, 0, 0);
  PNG.bitblt(actualCanvas, combined, 0, 0, panelWidth, panelHeight, panelWidth + gap, 0);
  PNG.bitblt(diffCanvas, combined, 0, 0, panelWidth, panelHeight, (panelWidth + gap) * 2, 0);

  return PNG.sync.write(combined);
}

export async function assertVisualSnapshot(
  world: FrontendBddWorld,
  name: string,
  opts: VisualSnapshotOptions = {}
): Promise<void> {
  const page = world.page ?? (await world.ensurePlaywrightPage());
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const platform = getVisualPlatform();
  const baselineDir = path.resolve(process.cwd(), "features", "visual-baselines", platform);
  const baselinePath = path.join(baselineDir, `${safeName}.png`);
  const diffDir = path.resolve(process.cwd(), "reports", "visual-diffs");

  await stabilizePageForSnapshot(page, Boolean(opts.keepFocus));

  let actualBuffer: Buffer;
  const screenshotOpts = {
    animations: "disabled" as const,
    mask: opts.mask,
    maskColor: "#94a3b8",
  };

  if (opts.locator) {
    await opts.locator.waitFor({ state: "visible", timeout: 15000 });
    await opts.locator.scrollIntoViewIfNeeded();
    actualBuffer = await opts.locator.screenshot(screenshotOpts);
  } else {
    actualBuffer = await page.screenshot({
      ...screenshotOpts,
      fullPage: Boolean(opts.fullPage),
    });
  }

  if (process.env.UPDATE_VISUAL_BASELINES === "true") {
    fs.mkdirSync(baselineDir, { recursive: true });
    fs.writeFileSync(baselinePath, actualBuffer);
    return;
  }

  fs.mkdirSync(diffDir, { recursive: true });

  if (!fs.existsSync(baselinePath)) {
    const actualOutPath = path.join(diffDir, `${safeName}-${platform}-actual.png`);
    fs.writeFileSync(actualOutPath, actualBuffer);
    await world.attach(actualBuffer, "image/png");
    throw new Error(
      `Missing visual baseline for '${safeName}' on platform '${platform}' at ${baselinePath}. ` +
        `Actual screenshot saved to ${actualOutPath}. Run 'npm run test:bdd:ui:update' to create baselines.`
    );
  }

  const baselinePng = PNG.sync.read(fs.readFileSync(baselinePath));
  const actualPng = PNG.sync.read(actualBuffer);

  const width = Math.max(baselinePng.width, actualPng.width);
  const height = Math.max(baselinePng.height, actualPng.height);
  const sizeMismatch =
    baselinePng.width !== actualPng.width || baselinePng.height !== actualPng.height;

  const baseNorm = normalizePngCanvas(baselinePng, width, height);
  const actualNorm = normalizePngCanvas(actualPng, width, height);
  const diffPng = new PNG({ width, height });

  const threshold = opts.threshold ?? 0.12;
  const maxDiffRatio = opts.maxDiffRatio ?? 0.25;

  const mismatchedPixels = pixelmatch(baseNorm.data, actualNorm.data, diffPng.data, width, height, {
    threshold,
    includeAA: false,
    diffColor: [225, 29, 72],
    alpha: 0.25,
  });

  const totalPixels = width * height;
  const diffRatio = totalPixels > 0 ? mismatchedPixels / totalPixels : 0;

  if (sizeMismatch || diffRatio > maxDiffRatio) {
    const panelBuffer = composeThreePanelPng(baseNorm, actualNorm, diffPng);
    const panelPath = path.join(diffDir, `${safeName}-3panel.png`);
    fs.writeFileSync(panelPath, panelBuffer);
    await world.attach(panelBuffer, "image/png");

    throw new Error(
      `Visual regression mismatch for '${safeName}' (${platform}): ` +
        `baseline=${baselinePng.width}x${baselinePng.height}, actual=${actualPng.width}x${actualPng.height}, ` +
        `diffPixels=${mismatchedPixels}/${totalPixels} (${(diffRatio * 100).toFixed(3)}%, max ${(
          maxDiffRatio * 100
        ).toFixed(2)}%). ` +
        `3-panel comparison saved to ${panelPath}`
    );
  }
}
