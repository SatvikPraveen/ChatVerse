import type { Deps } from '../deps.js';
import { createAuthService, type AuthService } from './auth.service.js';
import { createConversationsService, type ConversationsService } from './conversations.service.js';
import { createKeysService, type KeysService } from './keys.service.js';
import { createMessagesService, type MessagesService } from './messages.service.js';
import { createPresenceService, type PresenceService } from './presence.service.js';
import { createPushService, type PushService } from './push.service.js';
import { createReceiptsService, type ReceiptsService } from './receipts.service.js';
import { createSequencer, type Sequencer } from './sequencer.js';
import { createUploadsService, type UploadsService } from './uploads.service.js';
import { createUsersService, type UsersService } from './users.service.js';

export interface Services {
  auth: AuthService;
  users: UsersService;
  conversations: ConversationsService;
  sequencer: Sequencer;
  messages: MessagesService;
  receipts: ReceiptsService;
  presence: PresenceService;
  keys: KeysService;
  push: PushService;
  uploads: UploadsService;
}

export function createServices(deps: Deps): Services {
  const auth = createAuthService(deps);
  const users = createUsersService();
  const presence = createPresenceService(deps);
  const conversations = createConversationsService(deps, {
    membershipChanged: (ids) => presence.invalidateContacts(ids),
  });
  const sequencer = createSequencer(deps);
  const push = createPushService(deps, presence);
  const messages = createMessagesService(deps, conversations, sequencer, push);
  const receipts = createReceiptsService(deps, conversations);
  const keys = createKeysService();
  const uploads = createUploadsService(deps);
  return {
    auth,
    users,
    conversations,
    sequencer,
    messages,
    receipts,
    presence,
    keys,
    push,
    uploads,
  };
}
