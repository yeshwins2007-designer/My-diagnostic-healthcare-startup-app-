import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 6.19 stops auto-loading .env once a config file exists, so load it
// here. Deliberately hand-rolled rather than pulling in dotenv for one job.
for (const file of ['.env.local', '.env']) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) continue;
  for (const rawLine of fs.readFileSync(full, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // first file wins
    process.env[key] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx scripts/seed.ts',
  },
});
