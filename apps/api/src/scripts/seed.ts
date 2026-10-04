import 'dotenv/config';
import mongoose from 'mongoose';
import { loadEnv } from '../config/env.js';
import { ConversationModel, MessageModel, User } from '../domain/models/index.js';
import { directKey, uuid } from '../lib/ids.js';
import { createClock } from '../lib/hlc.js';
import { hashPassword } from '../services/password.js';

/**
 * Idempotent development seed: three users, one direct and one group conversation with a few
 * messages. Safe to re-run; existing records are left untouched.
 *   pnpm --filter @chatverse/api seed
 */
const PASSWORD = 'password123!';
const USERS = [
  { username: 'alice', email: 'alice@example.com', displayName: 'Alice Liddell' },
  { username: 'bob', email: 'bob@example.com', displayName: 'Bob Builder' },
  { username: 'carol', email: 'carol@example.com', displayName: 'Carol Danvers' },
];

async function main(): Promise<void> {
  const env = loadEnv();
  await mongoose.connect(env.MONGODB_URI);
  const clock = createClock(env.NODE_ID);
  const passwordHash = await hashPassword(PASSWORD);

  const users = await Promise.all(
    USERS.map((u) =>
      User.findOneAndUpdate(
        { username: u.username },
        { $setOnInsert: { ...u, passwordHash } },
        { upsert: true, new: true },
      ),
    ),
  );
  const [alice, bob, carol] = users as [
    (typeof users)[number],
    (typeof users)[number],
    (typeof users)[number],
  ];
  console.warn(
    `users: ${users.map((u) => `${u!.username} (${u!._id})`).join(', ')} — password "${PASSWORD}"`,
  );

  const key = directKey(alice!._id.toString(), bob!._id.toString());
  let direct = await ConversationModel.findOne({ directKey: key });
  if (!direct) {
    direct = await ConversationModel.create({
      kind: 'direct',
      createdBy: alice!._id,
      directKey: key,
      participants: [alice!, bob!].map((u) => ({ userId: u._id, role: 'member' })),
    });
    const texts: Array<[typeof alice, string]> = [
      [alice, 'Hey Bob, did you see the new sequencing design?'],
      [bob, 'Yes! Dense per-conversation seqs make gap detection trivial.'],
      [alice, 'Exactly. And the HLC gives us a global order on top.'],
    ];
    let seq = 0;
    for (const [sender, text] of texts) {
      seq += 1;
      await MessageModel.create({
        conversationId: direct._id,
        seq,
        clientMsgId: uuid(),
        senderId: sender!._id,
        kind: 'text',
        text,
        hlc: clock.tick(),
      });
    }
    direct.headSeq = seq;
    await direct.save();
  }

  const groupName = 'ChatVerse Research';
  let group = await ConversationModel.findOne({
    kind: 'group',
    name: groupName,
    createdBy: alice!._id,
  });
  if (!group) {
    group = await ConversationModel.create({
      kind: 'group',
      name: groupName,
      topic: 'Ordered delivery, E2EE and benchmarks',
      createdBy: alice!._id,
      participants: [
        { userId: alice!._id, role: 'owner' },
        { userId: bob!._id, role: 'admin' },
        { userId: carol!._id, role: 'member' },
      ],
    });
    await MessageModel.create({
      conversationId: group._id,
      seq: 1,
      clientMsgId: uuid(),
      senderId: carol!._id,
      kind: 'text',
      text: 'Welcome to the research group 👋',
      hlc: clock.tick(),
    });
    group.headSeq = 1;
    await group.save();
  }

  console.warn(`conversations: direct=${direct._id} group=${group._id}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
