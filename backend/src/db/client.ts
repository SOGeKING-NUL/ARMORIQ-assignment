import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sql = postgres(connectionString);

export async function initializeDatabase(): Promise<void> {
  try {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await sql.unsafe(statement);
    }

    console.log('[DB] Database schema initialized');
  } catch (error) {
    console.error('[DB] Failed to initialize database:', error);
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  await sql.end();
}
