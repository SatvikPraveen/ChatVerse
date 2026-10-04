import { expect, test } from '@playwright/test';
import { loginViaUi, makeUser, registerViaUi } from './helpers';

test.describe('authentication', () => {
  test('register lands in the app shell, logout and login round-trip, wrong password is rejected', async ({
    page,
  }) => {
    const user = makeUser('auth');
    await registerViaUi(page, user);
    await expect(page.getByText('No conversations yet')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Conversations' })).toContainText(
      user.displayName,
    );

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // The session is gone: a direct visit to /app bounces back to /login.
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/);

    await loginViaUi(page, user, 'definitely-not-the-password');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await loginViaUi(page, user);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('complementary', { name: 'Conversations' })).toContainText(
      user.displayName,
    );

    // Reloading resumes the persisted session.
    await page.reload();
    await expect(page.getByRole('complementary', { name: 'Conversations' })).toBeVisible();
  });
});
