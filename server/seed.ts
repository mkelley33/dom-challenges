import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { faker } from '@faker-js/faker';

interface SeedProfile {
  id: string;
  displayName: string;
  createdAt: string;
}

interface SeedFixtureRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

faker.seed(20260809);

const profile: SeedProfile = {
  id: 'local',
  displayName: faker.person.firstName(),
  createdAt: new Date('2026-08-09T00:00:00.000Z').toISOString(),
};

// Fixture rows back the list-rendering and performance challenges in later phases,
// where a challenge needs realistic volume rather than three hand-written <li>s.
const fixtureRows: SeedFixtureRow[] = Array.from({ length: 500 }, () => ({
  id: faker.string.uuid(),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  role: faker.helpers.arrayElement(['admin', 'editor', 'viewer']),
}));

const db = { profiles: [profile], progress: [], fixtureRows };

const outputPath = join(dirname(fileURLToPath(import.meta.url)), 'db.json');
writeFileSync(outputPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
process.stdout.write(`Seeded ${outputPath} with ${String(fixtureRows.length)} fixture rows\n`);
