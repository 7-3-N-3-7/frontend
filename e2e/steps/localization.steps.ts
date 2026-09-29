import { When, Then } from '@cucumber/cucumber';
import { page } from './app.steps.ts';
import assert from 'assert';

When('I click the language switcher and select {string}', async function (language: string) {
  // Assuming a generic data-testid strategy for robust tests
  await page.click('[data-testid="language-switcher"]');
  await page.click(`[data-testid="language-option-${language.toLowerCase()}"]`);
});

Then('the navigation menu should display {string}', async function (expectedText: string) {
  // Wait for the navigation item to be visible and check its text
  const navItem = page.locator('[data-testid="nav-overview"]');
  await navItem.waitFor({ state: 'visible' });
  const text = await navItem.textContent();
  assert.strictEqual(text?.trim(), expectedText);
});
