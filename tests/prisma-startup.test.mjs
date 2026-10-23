import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaService } from '../dist/prisma/prisma.service.js';

test('startup waits for a real database probe after creating the lazy pool', async () => {
  let finishProbe;
  const probe = new Promise(resolve => { finishProbe = resolve; });
  const calls = [];
  let initialized = false;
  const startup = PrismaService.prototype.onModuleInit.call({
    $connect: async () => { calls.push('connect'); },
    ping: async () => { calls.push('ping'); await probe; },
  }).then(() => { initialized = true; });

  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['connect', 'ping']);
  assert.equal(initialized, false);
  finishProbe();
  await startup;
  assert.equal(initialized, true);
});

test('an unreachable database fails startup and releases the pool', async () => {
  const outage = new Error('database unreachable');
  let disconnected = false;
  await assert.rejects(PrismaService.prototype.onModuleInit.call({
    $connect: async () => {},
    ping: async () => { throw outage; },
    $disconnect: async () => { disconnected = true; },
  }), error => error === outage);
  assert.equal(disconnected, true);
});
