import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/tendermatch_test';
process.env.JWT_SECRET = 'test-secret-that-is-longer-than-thirty-two-characters';

const { hashPassword, verifyPassword } = require('../src/services/passwordService');
const { parseLocalTenderData } = require('../src/services/extractionService');
const { evaluatePersonnelMatch } = require('../src/services/matchingService');

test('password hashes are salted and only validate the original password', async () => {
  const hash = await hashPassword('a long, unique test password');
  assert.equal(await verifyPassword('a long, unique test password', hash), true);
  assert.equal(await verifyPassword('a different password', hash), false);
  assert.match(hash, /^scrypt\$/);
});

test('local extraction leaves unsupported fields unavailable instead of inventing them', () => {
  const parsed = parseLocalTenderData('Title: Supply of office chairs', 'manual');
  assert.equal(parsed.title, 'Supply of office chairs');
  assert.equal(parsed.value, null);
  assert.equal(parsed.deadline, null);
  assert.equal(parsed.personnel_requirements, null);
  assert.equal(parsed.confidence_score, 30);
});

test('local extraction scores only evidence it found', () => {
  const parsed = parseLocalTenderData(
    'Title: Server upgrade\nClosing Date: 31-12-2026\nValue: 2500000\nRequires ISO 27001',
    'manual',
  );
  assert.equal(parsed.sector, 'IT');
  assert.equal(parsed.value, 2500000);
  assert.equal(parsed.confidence_score, 100);
});

test('personnel evaluation rejects an unmet explicit requirement', () => {
  assert.equal(
    evaluatePersonnelMatch('B.Tech engineer with 5 years experience', 'B.Tech engineer with 3 years experience'),
    false,
  );
  assert.equal(
    evaluatePersonnelMatch('B.Tech engineer with 3 years experience', 'B.Tech engineer with 5 years experience'),
    true,
  );
});
