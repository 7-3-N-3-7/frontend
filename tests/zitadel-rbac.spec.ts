import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost';

// Define the 3 Roles, Organizations, and Services
const ROLES = ['Admin', 'Editor', 'Viewer'];
const ORGANIZATIONS = ['Acme Corp', 'Globex', 'Initech'];
const SERVICES = ['Billing', 'Analytics', 'Support'];

// Helper to generate the test users based on the requirements
// The user mentioned ~15 users, we'll generate a representative list 
// covering the combinations they requested.
const testUsers = [
  { username: 'admin_acme_billing', password: 'Password1!', role: 'Admin', organization: 'Acme Corp', service: 'Billing' },
  { username: 'editor_acme_analytics', password: 'Password1!', role: 'Editor', organization: 'Acme Corp', service: 'Analytics' },
  { username: 'viewer_acme_support', password: 'Password1!', role: 'Viewer', organization: 'Acme Corp', service: 'Support' },
  { username: 'admin_globex_analytics', password: 'Password1!', role: 'Admin', organization: 'Globex', service: 'Analytics' },
  { username: 'editor_globex_support', password: 'Password1!', role: 'Editor', organization: 'Globex', service: 'Support' },
  { username: 'viewer_globex_billing', password: 'Password1!', role: 'Viewer', organization: 'Globex', service: 'Billing' },
  { username: 'admin_initech_support', password: 'Password1!', role: 'Admin', organization: 'Initech', service: 'Support' },
  { username: 'editor_initech_billing', password: 'Password1!', role: 'Editor', organization: 'Initech', service: 'Billing' },
  { username: 'viewer_initech_analytics', password: 'Password1!', role: 'Viewer', organization: 'Initech', service: 'Analytics' },
  // ... (You can expand this list up to the 15 or 27 combinations you need)
];

test.describe('Frontend RBAC Display Verification', () => {
  
  // Data-driven tests: Playwright will create an individual test case for every user in the array
  for (const user of testUsers) {
    test(`Verify attributes display for ${user.username} (${user.role}/${user.organization}/${user.service})`, async ({ page }) => {
      
      // 1. Navigate to the Frontend
      await page.goto(FRONTEND_URL);
      
      // 2. Trigger the login flow (Assuming a standard login button redirects to Zitadel)
      await page.click('text="Login"');
      
      // 3. Complete Zitadel Authentication
      // (Adjust selectors based on Zitadel's standard login form)
      await page.fill('input[name="loginName"]', user.username);
      await page.click('button[type="submit"]:has-text("next")');
      
      await page.fill('input[name="password"]', user.password);
      await page.click('button[type="submit"]:has-text("next")');
      
      // 4. Wait for redirect back to the Frontend application
      await page.waitForURL(FRONTEND_URL);
      
      // 5. Construct the expected welcome message
      const expectedMessage = `welcome ${user.username}, you have attributes, role: ${user.role}, organization: ${user.organization}, service: ${user.service}`;
      
      // 6. Assert that the exact string is visible on the frontend dashboard
      await expect(page.getByText(expectedMessage)).toBeVisible();
    });
  }
});

