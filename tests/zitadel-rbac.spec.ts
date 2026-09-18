import { test, expect } from '@playwright/test';

const TEST_PASSWORD = process.env.ZITADEL_TEST_PASSWORD;
const BASE_URL = (process.env.BASE_URL || 'http://localhost').replace(/\/$/, '');

// Representative 3x3 matrix subset: each role appears in each organization once.
const testUsers = [
  { username: 'admin_acme_billing', role: 'Admin', organization: 'Acme Corp', service: 'Billing' },
  { username: 'editor_acme_analytics', role: 'Editor', organization: 'Acme Corp', service: 'Analytics' },
  { username: 'viewer_acme_support', role: 'Viewer', organization: 'Acme Corp', service: 'Support' },
  { username: 'admin_globex_analytics', role: 'Admin', organization: 'Globex', service: 'Analytics' },
  { username: 'editor_globex_support', role: 'Editor', organization: 'Globex', service: 'Support' },
  { username: 'viewer_globex_billing', role: 'Viewer', organization: 'Globex', service: 'Billing' },
  { username: 'admin_initech_support', role: 'Admin', organization: 'Initech', service: 'Support' },
  { username: 'editor_initech_billing', role: 'Editor', organization: 'Initech', service: 'Billing' },
  { username: 'viewer_initech_analytics', role: 'Viewer', organization: 'Initech', service: 'Analytics' },
  // ... (You can expand this list up to the 15 or 27 combinations you need)
];

test.describe('Frontend RBAC Display Verification', () => {
  test.skip(process.env.ENABLE_ZITADEL_RBAC_E2E !== 'true', 'Enable with ENABLE_ZITADEL_RBAC_E2E=true once login flow is available.');
  test.skip(!TEST_PASSWORD, 'Set ZITADEL_TEST_PASSWORD to run Zitadel authentication tests.');
  
  // Data-driven tests: Playwright will create an individual test case for every user in the array
  for (const user of testUsers) {
    test(`Verify attributes display for ${user.username} (${user.role}/${user.organization}/${user.service})`, async ({ page }) => {
      
      // 1. Navigate to the Frontend
      await page.goto('/');
      
      // 2. Trigger the login flow (Assuming a standard login button redirects to Zitadel)
      await page.click('text="Login"');
      
      // 3. Complete Zitadel Authentication
      // (Adjust selectors based on Zitadel's standard login form)
      await page.fill('input[name="loginName"]', user.username);
      await page.click('button[type="submit"]:has-text("next")');
      
      await page.fill('input[name="password"]', TEST_PASSWORD ?? '');
      await page.click('button[type="submit"]:has-text("next")');
      
      // 4. Wait for redirect back to the Frontend application
      await page.waitForURL((url) => url.toString().startsWith(BASE_URL));
      
      // 5. Construct the expected welcome message
      const expectedMessage = `welcome ${user.username}, you have attributes, role: ${user.role}, organization: ${user.organization}, service: ${user.service}`;
      
      // 6. Assert that the exact string is visible on the frontend dashboard
      await expect(page.getByText(expectedMessage)).toBeVisible();
    });
  }
});
