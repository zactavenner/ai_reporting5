// DRAFT — NOT RUN. Generates one scoped agent key for agent-tasks-api.
//
//   deno run --allow-env --allow-write=/home/box/secrets scripts/generate-agent-key.ts \
//     --name claude --member-id <agency_members.id> \
//     --scopes tasks:read,tasks:create,tasks:update,comments:read,comments:create [--rate 60] [--expires-days 90]
//
// - The plaintext key is written ONLY to /home/box/secrets/agent-keys/<name>.env (mode 0600)
//   as AGENT_KEY_<NAME>=... It is never printed.
// - A SQL insert containing only the prefix + SHA-256 hash is written to
//   /home/box/secrets/agent-keys/<name>.insert.sql for an approved operator to run.
// - AGENT_KEY_PEPPER (optional) must equal the edge function's AGENT_KEY_PEPPER secret.
import { parseArgs } from "jsr:@std/cli@1/parse-args";

const ALLOWED = ["tasks:read", "tasks:create", "tasks:update", "comments:read", "comments:create", "comments:update"];
const OUT_DIR = "/home/box/secrets/agent-keys";

const args = parseArgs(Deno.args, { string: ["name", "member-id", "scopes", "rate", "expires-days"] });
const name = String(args.name || "").toLowerCase();
if (!/^[a-z][a-z0-9-]{1,40}$/.test(name)) throw new Error("--name must be lowercase letters/digits/dashes");
const memberId = args["member-id"] ? String(args["member-id"]) : null;
if (memberId && !/^[0-9a-f-]{36}$/i.test(memberId)) throw new Error("--member-id must be a UUID");
const scopes = String(args.scopes || "tasks:read,comments:read").split(",").map((s) => s.trim()).filter(Boolean);
for (const s of scopes) if (!ALLOWED.includes(s)) throw new Error(`scope not allowed: ${s}`);
const rate = Math.min(Math.max(Number(args.rate || 60), 1), 600);
const expiresDays = args["expires-days"] ? Number(args["expires-days"]) : 90;

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const prefix = `hpa_ak_${hex(crypto.getRandomValues(new Uint8Array(4)))}`;
const key = `${prefix}_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
const pepper = Deno.env.get("AGENT_KEY_PEPPER") ?? "";
const hash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pepper + key))));

await Deno.mkdir(OUT_DIR, { recursive: true, mode: 0o700 });
const envPath = `${OUT_DIR}/${name}.env`;
await Deno.writeTextFile(envPath, `AGENT_KEY_${name.toUpperCase().replace(/-/g, "_")}=${key}\n`, { mode: 0o600, createNew: true });

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sql = `insert into public.agent_api_keys (name, member_id, key_prefix, key_hash, scopes, rate_limit_per_min, expires_at, created_by)
values (${q(name)}, ${memberId ? q(memberId) : "null"}, ${q(prefix)}, ${q(hash)}, array[${scopes.map(q).join(",")}]::text[], ${rate}, now() + interval '${expiresDays} days', 'generate-agent-key');
`;
await Deno.writeTextFile(`${OUT_DIR}/${name}.insert.sql`, sql, { mode: 0o600, createNew: true });

console.log(`Created key "${name}" (prefix ${prefix}). Plaintext saved to ${envPath}; hash-only SQL saved next to it.`);
