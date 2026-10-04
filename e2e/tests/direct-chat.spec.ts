import type { Conversation } from '@chatverse/protocol';
import { expect, test } from '@playwright/test';
import {
  apiAccessToken,
  apiGet,
  expectMessage,
  makeUser,
  newSignedInPage,
  openConversation,
  openInfoPanel,
  sendMessage,
  startDirectChat,
} from './helpers';

test.describe('end-to-end encrypted direct chat', () => {
  test('two browsers exchange messages the server cannot read and agree on a safety number', async ({
    browser,
    request,
  }) => {
    const alice = makeUser('alice');
    const bob = makeUser('bob');
    const a = await newSignedInPage(browser, alice);
    const b = await newSignedInPage(browser, bob);

    const conversationId = await startDirectChat(a.page, bob, { encrypted: true });
    await expect(a.page.getByRole('heading', { name: new RegExp(bob.displayName) })).toBeVisible();

    await sendMessage(a.page, 'hi bob, this is alice');
    await expectMessage(a.page, 'hi bob, this is alice');

    // Bob is pushed the new conversation and can open it from the sidebar.
    await openConversation(b.page, alice.displayName);
    await expectMessage(b.page, 'hi bob, this is alice');

    await sendMessage(b.page, 'hi alice, bob here');
    await expectMessage(b.page, 'hi alice, bob here');
    await expectMessage(a.page, 'hi alice, bob here');

    // Both sides derive the same safety number from the two identity keys.
    const aPanel = await openInfoPanel(a.page);
    const bPanel = await openInfoPanel(b.page);
    await expect(aPanel).toContainText('End-to-end encrypted');
    const aNumber = aPanel.getByTestId('safety-number');
    const bNumber = bPanel.getByTestId('safety-number');
    await expect(aNumber).toHaveText(/^(\d{5} ){11}\d{5}$/);
    await expect(bNumber).toHaveText(await aNumber.innerText());

    // The server stored only ciphertext: no preview text exists for an encrypted conversation.
    const token = await apiAccessToken(request, alice);
    const conversation = await apiGet<Conversation>(
      request,
      token,
      `/conversations/${conversationId}`,
    );
    expect(conversation.encrypted).toBe(true);
    expect(conversation.headSeq).toBeGreaterThanOrEqual(2);
    expect(conversation.lastMessage).not.toBeNull();
    expect(conversation.lastMessage?.text).toBeNull();
    expect(conversation.lastMessage?.kind).toBe('encrypted');

    await a.context.close();
    await b.context.close();
  });
});
