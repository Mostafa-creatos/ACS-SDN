import { test, expect } from '@playwright/test';

test.describe('RBAC Multi-tenant UI Validation', () => {
  test('Platform Admin can invite users and manage cross-tenant access', async ({ page }) => {
    // 1. Log in as Platform Admin
    await page.goto('/login');
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'admin');
    await page.click('button[type="submit"]');

    // 2. Navigate to Users & Access
    await expect(page.locator('text=Users & Access')).toBeVisible();
    await page.click('text=Users & Access');

    // 3. Invite a user
    await page.click('text=Invite User');
    await page.fill('input[type="text"]', 'new_tenant_admin');
    await page.selectOption('select', 'tenant_admin');
    await page.click('text=Invite');

    // 4. Verify Platform Admin specific UI elements are visible
    await expect(page.locator('text=Manage Tenants').first()).toBeVisible();
  });

  test('Tenant Admin cannot see Platform Admin options', async ({ page }) => {
    // 1. Log in as Tenant Admin (mock)
    await page.goto('/login');
    await page.fill('input[type="text"]', 'user');
    await page.fill('input[type="password"]', 'user');
    await page.click('button[type="submit"]');

    // 2. Navigate to Users & Access
    await page.click('text=Users & Access');

    // 3. Verify Platform Admin options are hidden
    await expect(page.locator('text=Manage Tenants')).toHaveCount(0);
    
    // 4. Try to invite a user
    await page.click('text=Invite User');
    
    // 5. Assert Platform Admin role is NOT an option
    const dropdownText = await page.locator('select').innerText();
    expect(dropdownText).not.toContain('Platform Admin');
  });
});
