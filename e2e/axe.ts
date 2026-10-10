import Builder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * AxeBuilder that lets entrance animations finish before it measures. Mid-fade, text is
 * part-transparent, so axe reads a blended colour and reports contrast that isn't there at rest
 * (seen as flaky 4.2–4.4:1 failures on the busy full suite). Endless loops (steam, pulses) are
 * ignored; after 3 s it measures anyway.
 */
export default class AxeBuilder extends Builder {
  private readonly target: Page;

  constructor(options: ConstructorParameters<typeof Builder>[0]) {
    super(options);
    this.target = options.page;
  }

  async analyze() {
    await this.target
      .waitForFunction(
        () =>
          document
            .getAnimations()
            .every(
              (a) =>
                a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity,
            ),
        null,
        { timeout: 3000, polling: 100 },
      )
      .catch(() => undefined);
    return super.analyze();
  }
}
