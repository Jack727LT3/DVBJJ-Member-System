#!/usr/bin/env node
/**
 * Push pending SQL migrations to Supabase using the Management API.
 *
 * One-time setup (save these in web/.env.local — never commit):
 *   SUPABASE_ACCESS_TOKEN=sbp_...   from https://supabase.com/dashboard/account/tokens
 *   SUPABASE_PROJECT_ID=abcdefgh    from Project Settings → General → Reference ID
 *
 * Usage:
 *   node scripts/push-supabase-migrations.mjs
 *   node scripts/push-supabase-migrations.mjs 0021 0022
 */
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnvLocal();

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;

if (!token || !projectId) {
  console.error(`
Missing credentials. Add these to web/.env.local (do not commit):

  SUPABASE_ACCESS_TOKEN=sbp_...
  SUPABASE_PROJECT_ID=your-project-ref

Get them from:
  Token  → https://supabase.com/dashboard/account/tokens
  Ref ID → Project Settings → General → Reference ID
`);
  process.exit(1);
}

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
const filters = process.argv.slice(2);

async function runSql(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  let files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (filters.length > 0) {
    files = files.filter((f) => filters.some((x) => f.includes(x)));
  }

  if (files.length === 0) {
    console.error("No migration files matched.");
    process.exit(1);
  }

  console.log(`Pushing ${files.length} migration(s) to project ${projectId}…`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    process.stdout.write(`  ${file} … `);
    await runSql(sql, file);
    console.log("ok");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
