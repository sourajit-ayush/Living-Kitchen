// Applies supabase/migrations/*.sql in order, each once, each in a transaction.
// Usage: pnpm db:migrate   (reads SUPABASE_DB_URL from .env.local; never prints it)
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set in .env.local (see .env.example).");
  process.exit(1);
}

const dir = path.join(import.meta.dirname, "..", "supabase", "migrations");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  // Bookkeeping lives outside `public`, so it isn't exposed through the Supabase API.
  await client.query(`create schema if not exists lk_meta;
    create table if not exists lk_meta.migrations (name text primary key, applied_at timestamptz not null default now());
    revoke all on schema lk_meta from public;`);
  const { rows } = await client.query("select name from lk_meta.migrations");
  const applied = new Set(rows.map((r) => r.name));
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    process.stdout.write(`applying ${file} … `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into lk_meta.migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("ok");
      count++;
    } catch (error) {
      await client.query("rollback");
      console.log("failed");
      console.error(`  ${error.message}`);
      process.exit(1);
    }
  }
  console.log(count ? `${count} migration(s) applied.` : "Database is up to date.");
} finally {
  await client.end();
}
