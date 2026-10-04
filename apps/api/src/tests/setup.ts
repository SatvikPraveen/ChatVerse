import { inject } from 'vitest';

// Runs in every worker before the test file: provide the env the server needs. Secrets are
// deliberately fixed, test-only strings.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = inject('mongoUri');
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-0123456789';
process.env.NODE_ID = 'test-node';
process.env.LOG_LEVEL = 'silent';
process.env.PORT = '0';
delete process.env.REDIS_URL;
