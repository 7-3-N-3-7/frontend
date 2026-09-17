import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../support/CustomWorld';

const FRONTEND_URL = 'http://localhost';

// Note: Arrow functions '() =>' break the 'this' context in Javascript.
// You MUST use 'function () {}' so Cucumber can bind 'this' to CustomWorld.

Given('I navigate to the frontend application', async function (this: CustomWorld) {
  await this.page!.goto(FRONTEND_URL);
});

When('I log in as {string} with password {string}', async function (this: CustomWorld, username, password) {
  await this.page!.click('text="Login"');
  await this.page!.fill('input[name="loginName"]', username);
  await this.page!.click('button[type="submit"]:has-text("next")');
  
  await this.page!.fill('input[name="password"]', password);
  await this.page!.click('button[type="submit"]:has-text("next")');
  
  await this.page!.waitForURL(FRONTEND_URL);
});

Then('I should see the welcome message containing role {string}, organization {string}, and service {string}', async function (this: CustomWorld, role, organization, service) {
  const attributeString = `role: ${role}, organization: ${organization}, service: ${service}`;
  await expect(this.page!.getByText(new RegExp(`welcome .*, you have attributes, ${attributeString}`))).toBeVisible();
});
