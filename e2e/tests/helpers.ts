import {
  expect,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';
import { API_URL } from '../playwright.config';

/** Every call registers a fresh user so specs never depend on existing data or on each other. */
const RUN = Date.now().toString(36);
let counter = 0;
export const PASSWORD = 'correct-horse-battery-staple';

export interface TestUser {
  username: string;
  email: string;
  displayName: string;
}

export function makeUser(name: string): TestUser {
  counter += 1;
  const username = `${name}_${RUN}${counter}`;
  return {
    username,
    email: `${username}@e2e.test`,
    displayName: name[0]!.toUpperCase() + name.slice(1),
  };
}

/** Register through the UI and wait for the app shell (sidebar) to be ready. */
export async function registerViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Display name').fill(user.displayName);
  await page.getByLabel(/^Username/).fill(user.username);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('complementary', { name: 'Conversations' })).toBeVisible();
}

export async function loginViaUi(page: Page, user: TestUser, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** A fresh browser context + page with a registered, signed-in user. */
export async function newSignedInPage(browser: Browser, user: TestUser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerViaUi(page, user);
  return { context, page };
}

export function messagesRegion(page: Page): Locator {
  return page.getByRole('region', { name: 'Messages' });
}

export function composer(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Message' });
}

export async function sendMessage(page: Page, text: string): Promise<void> {
  const box = composer(page);
  await box.fill(text);
  await box.press('Enter');
}

/** Confirmed (server-acknowledged) message bodies in display order. */
export function messageTexts(page: Page): Locator {
  return messagesRegion(page).getByTestId('message-text');
}

/** Wait until `text` is shown exactly once as a confirmed message (no pending duplicate). */
export async function expectMessage(page: Page, text: string): Promise<void> {
  await expect(messageTexts(page).filter({ hasText: text })).toHaveCount(1);
  await expect(
    messagesRegion(page).getByTestId('pending-text').filter({ hasText: text }),
  ).toHaveCount(0);
}

/** Open the "New conversation" dialog and pick participants by username. */
async function pickParticipants(page: Page, peers: TestUser[]): Promise<Locator> {
  await page.getByRole('button', { name: 'New conversation' }).click();
  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'New conversation' }),
  });
  await expect(dialog).toBeVisible();
  for (const peer of peers) {
    await dialog.getByLabel('Find people').fill(peer.username);
    await dialog
      .getByRole('listbox', { name: 'Search results' })
      .getByRole('button', { name: new RegExp(`@${peer.username}$`) })
      .click();
    await expect(dialog.getByRole('list', { name: 'Selected participants' })).toContainText(
      peer.displayName,
    );
  }
  return dialog;
}

async function setEncrypted(dialog: Locator, encrypted: boolean): Promise<void> {
  const box = dialog.getByRole('checkbox', { name: 'End-to-end encrypted' });
  if (encrypted) await box.check();
  else await box.uncheck();
}

/** Returns the conversation id from the URL once the chat is open. */
async function conversationIdFromUrl(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/app\/c\/[a-f0-9]{24}$/);
  return page.url().split('/').pop()!;
}

export async function startDirectChat(
  page: Page,
  peer: TestUser,
  opts: { encrypted: boolean },
): Promise<string> {
  const dialog = await pickParticipants(page, [peer]);
  await setEncrypted(dialog, opts.encrypted);
  await dialog.getByRole('button', { name: 'Start chat' }).click();
  const id = await conversationIdFromUrl(page);
  await expect(composer(page)).toBeVisible();
  return id;
}

export async function createGroup(
  page: Page,
  peers: TestUser[],
  name: string,
  opts: { encrypted: boolean },
): Promise<string> {
  const dialog = await pickParticipants(page, peers);
  await dialog.getByPlaceholder('Group name').fill(name);
  await setEncrypted(dialog, opts.encrypted);
  await dialog.getByRole('button', { name: 'Create group' }).click();
  const id = await conversationIdFromUrl(page);
  await expect(composer(page)).toBeVisible();
  return id;
}

/** Open a conversation from the sidebar by its title. */
export async function openConversation(page: Page, title: string): Promise<void> {
  await page
    .getByRole('complementary', { name: 'Conversations' })
    .getByRole('link', { name: new RegExp(title) })
    .first()
    .click();
  await expect(composer(page)).toBeVisible();
}

export async function openInfoPanel(page: Page): Promise<Locator> {
  const button = page.getByRole('button', { name: 'Conversation info' });
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  const panel = page.getByRole('complementary', { name: 'Conversation info' });
  await expect(panel).toBeVisible();
  return panel;
}

/** Log in over REST and return an access token for direct API assertions. */
export async function apiAccessToken(request: APIRequestContext, user: TestUser): Promise<string> {
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: user.email, password: PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { ok: true; data: { accessToken: string } };
  return body.data.accessToken;
}

export async function apiGet<T>(
  request: APIRequestContext,
  token: string,
  path: string,
): Promise<T> {
  const res = await request.get(`${API_URL}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { ok: true; data: T };
  return body.data;
}
