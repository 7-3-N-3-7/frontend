import { Given, Then, BeforeAll, AfterAll, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from 'playwright';
import assert from 'assert';

setDefaultTimeout(60000);

let browser: Browser;
let page: Page;

BeforeAll(async function () {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  page = await context.newPage();
});

AfterAll(async function () {
  await browser.close();
});

Given('the application is loaded', async function () {
  // Use localhost:80, which is where Traefik routes the frontend in e2e-pipeline
  await page.goto('http://localhost');
});

Then('the title should be {string}', async function (expectedTitle: string) {
  const title = await page.title();
  assert.strictEqual(title, expectedTitle);
});
