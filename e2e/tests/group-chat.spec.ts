import { expect, test } from '@playwright/test';
import {
  createGroup,
  expectMessage,
  makeUser,
  messageTexts,
  newSignedInPage,
  openConversation,
  openInfoPanel,
  sendMessage,
} from './helpers';

test.describe('end-to-end encrypted group chat', () => {
  test('three members see every message in the same order; a removed member stops receiving', async ({
    browser,
  }) => {
    const alice = makeUser('alice');
    const bob = makeUser('bob');
    const carol = makeUser('carol');
    const a = await newSignedInPage(browser, alice);
    const b = await newSignedInPage(browser, bob);
    const c = await newSignedInPage(browser, carol);

    const groupName = `Research ${Date.now().toString(36)}`;
    await createGroup(c.page, [alice, bob], groupName, { encrypted: true });
    await openConversation(a.page, groupName);
    await openConversation(b.page, groupName);

    const texts = ['carol: welcome everyone', 'alice: hello from alice', 'bob: bob checking in'];
    await sendMessage(c.page, texts[0]!);
    for (const p of [a.page, b.page, c.page]) await expectMessage(p, texts[0]!);
    await sendMessage(a.page, texts[1]!);
    for (const p of [a.page, b.page, c.page]) await expectMessage(p, texts[1]!);
    await sendMessage(b.page, texts[2]!);
    for (const p of [a.page, b.page, c.page]) await expectMessage(p, texts[2]!);

    // Same order (seq order) on every member.
    for (const p of [a.page, b.page, c.page]) {
      await expect(messageTexts(p)).toHaveText(texts);
    }

    // Carol (owner) removes Bob; the sender key is rotated for the remaining members.
    const panel = await openInfoPanel(c.page);
    await expect(panel.getByRole('heading', { name: /Members \(3\)/ })).toBeVisible();
    await panel
      .getByRole('listitem')
      .filter({ hasText: bob.displayName })
      .getByRole('button', { name: 'remove' })
      .click();
    await expect(panel.getByRole('heading', { name: /Members \(2\)/ })).toBeVisible();

    // Bob loses the conversation entirely.
    await expect(b.page.getByRole('complementary', { name: 'Conversations' })).not.toContainText(
      groupName,
    );

    await sendMessage(c.page, 'carol: bob is gone now');
    await expectMessage(c.page, 'carol: bob is gone now');
    await expectMessage(a.page, 'carol: bob is gone now');
    await expect(b.page.getByText('carol: bob is gone now')).toHaveCount(0);

    await a.context.close();
    await b.context.close();
    await c.context.close();
  });
});
