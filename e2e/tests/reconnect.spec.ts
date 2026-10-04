import { expect, test } from '@playwright/test';
import {
  composer,
  expectMessage,
  makeUser,
  messageTexts,
  messagesRegion,
  newSignedInPage,
  openConversation,
  sendMessage,
  startDirectChat,
} from './helpers';

test.describe('offline and reconnect', () => {
  test('a client that was offline catches up exactly once, in order, and flushes its outbox', async ({
    browser,
  }) => {
    const alice = makeUser('alice');
    const bob = makeUser('bob');
    const a = await newSignedInPage(browser, alice);
    const b = await newSignedInPage(browser, bob);

    await startDirectChat(a.page, bob, { encrypted: false });
    await sendMessage(a.page, 'before the outage');
    await openConversation(b.page, alice.displayName);
    await expectMessage(b.page, 'before the outage');

    // Bob drops off the network. The socket closes and the UI reports it.
    await b.context.setOffline(true);
    await expect(b.page.getByRole('status')).toContainText(/offline|Reconnecting/);

    await sendMessage(a.page, 'first while bob is away');
    await expectMessage(a.page, 'first while bob is away');
    await sendMessage(a.page, 'second while bob is away');
    await expectMessage(a.page, 'second while bob is away');

    // Bob types while offline: the message is queued durably in the outbox.
    await sendMessage(b.page, 'sent from the outbox');
    await expect(
      messagesRegion(b.page)
        .getByTestId('pending-text')
        .filter({ hasText: 'sent from the outbox' }),
    ).toHaveCount(1);

    await b.context.setOffline(false);
    await expect(b.page.getByRole('status')).toHaveCount(0);

    // Gap recovery: both missed messages arrive exactly once and in order.
    await expectMessage(b.page, 'first while bob is away');
    await expectMessage(b.page, 'second while bob is away');
    // Outbox flush: Bob's queued message is delivered with its original clientMsgId.
    await expectMessage(b.page, 'sent from the outbox');
    await expectMessage(a.page, 'sent from the outbox');

    await expect(messageTexts(b.page)).toHaveText([
      'before the outage',
      'first while bob is away',
      'second while bob is away',
      'sent from the outbox',
    ]);
    await expect(messageTexts(a.page)).toHaveText([
      'before the outage',
      'first while bob is away',
      'second while bob is away',
      'sent from the outbox',
    ]);
    await expect(composer(b.page)).toBeEnabled();

    await a.context.close();
    await b.context.close();
  });
});
