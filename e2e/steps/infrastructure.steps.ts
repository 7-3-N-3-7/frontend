import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../support/CustomWorld';

Given('the infrastructure is deployed', async function (this: CustomWorld) {
  // We no longer need to initialize the apiContext here.
  // The support/hooks.ts 'Before' hook does it automatically for every scenario!
});

When('I send a GET request to the ZITADEL health endpoint at {string}', async function (this: CustomWorld, url: string) {
  try {
    this.response = await this.apiContext!.get(url);
  } catch (error) {
    this.response = { status: () => 503, ok: () => false };
  }
});

When('I send a GET request to the Backend health endpoint at {string}', async function (this: CustomWorld, url: string) {
  try {
    this.response = await this.apiContext!.get(url);
    if (this.response.ok()) {
      this.responseBody = await this.response.json();
    }
  } catch (error) {
    this.response = { status: () => 503, ok: () => false };
  }
});

Then('I should receive a {int} OK status', async function (this: CustomWorld, expectedStatus: number) {
  expect(this.response.status()).toBe(expectedStatus);
});

Then('the response body should contain {string}', async function (this: CustomWorld, expectedText: string) {
  expect(JSON.stringify(this.responseBody)).toContain(expectedText);
});

When('I navigate to the frontend URL at {string}', async function (this: CustomWorld, url: string) {
  try {
    this.response = await this.page!.goto(url);
  } catch (error) {
    this.response = null;
  }
});

Then('the page should load successfully', async function (this: CustomWorld) {
  expect(this.response).not.toBeNull();
  expect(this.response.status()).toBe(200);
});
