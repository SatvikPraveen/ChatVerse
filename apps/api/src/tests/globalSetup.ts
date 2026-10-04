import { MongoMemoryServer } from 'mongodb-memory-server';
import type { GlobalSetupContext } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/** One in-memory MongoDB for the whole run; each test file wipes the collections it uses. */
export default async function setup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'chatverse_test' } });
  provide('mongoUri', mongod.getUri('chatverse_test'));
  return async () => {
    await mongod.stop();
  };
}
