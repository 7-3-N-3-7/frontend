import { BeforeAll, AfterAll, Before, After, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium, Browser, request } from '@playwright/test';
import { CustomWorld } from './CustomWorld';

let browser: Browser;

// 60-second default timeout for network requests / browser launch
setDefaultTimeout(60 * 1000);

// Runs once per worker thread before ANY scenarios execute
BeforeAll(async function () {
  browser = await chromium.launch({ headless: true });
});

// Runs BEFORE EVERY scenario, guaranteeing a fresh, isolated state
Before(async function (this: CustomWorld) {
  this.context = await browser.newContext();
  this.page = await this.context.newPage();
  this.apiContext = await request.newContext();
});

// Runs AFTER EVERY scenario, aggressively wiping the state
After(async function (this: CustomWorld) {
  if (this.page) await this.page.close();
  if (this.context) await this.context.close();
  if (this.apiContext) await this.apiContext.dispose();
});

// Runs once per worker thread after ALL scenarios execute
AfterAll(async function () {
  if (browser) await browser.close();
});
