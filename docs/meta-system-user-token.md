# Per-client Meta System User Token

Each client can have a Meta **system user** token. When it is saved and `active`
(and not expired), every Meta pull for that client uses it. Otherwise pulls use
exactly the same token as before (legacy `meta_system_user_token` column →
`meta_access_token` → `META_SHARED_ACCESS_TOKEN`, or the function's own inline
order). Nothing existing was rotated, cleared or migrated.

## Storage
- `client_meta_system_tokens` (service role only, RLS on, no client policies):
  AES-256-GCM ciphertext bound to the client id + metadata (system user id/name,
  last4, scopes, expiry, per-ad-account access, status, timestamps).
- Key: auto-generated runtime secret `META_SYSTEM_TOKEN_ENC_KEY` (never entered by
  hand, never in the database). Supabase Vault could not be used by the build
  tooling, so this replaces it with the same "no manual key" property.
- `meta_token_usage_log` (service role only): one row per resolution —
  `function_name`, `source` (`system_user_vault` | `system_user_legacy_column` |
  `client` | `master` | `none`), `fallback_reason`.

## Server use
`resolveClientMetaToken(sb, client, functionName, { legacy })` in
`supabase/functions/_shared/metaSystemToken.ts` returns a handle:
- `handle.fetch(t => url, init?)` — one call; if Meta rejects the system token
  (OAuth 190 / 102 / 10 / 200-299) the row is set to `needs_attention` and the
  call is retried once with the fallback token.
- `handle.preflight(t => url)` — for functions with many calls on one token
  variable: one cheap read, fall back if rejected, then use the returned token.

## Endpoints (responses are metadata only — the token is never returned)

Status payload:
```json
{ "client_id": "uuid", "status": "not_set|active|invalid|needs_attention",
  "using": "system_user|user_token", "system_user_id": "…", "system_user_name": "…",
  "token_last4": "ABCD", "scopes": ["ads_read"], "expires_at": null,
  "data_access_expires_at": null, "ad_account_access": { "123": { "ok": true, "name": "…", "account_status": 1 } },
  "saved_at": "…", "saved_by": "…", "last_validated_at": "…", "last_used_at": "…", "last_error": null }
```

### Dashboard — `meta-system-token` (POST, `authorizeOperator`)
Body `{ action: "status" | "set" | "delete" | "revalidate", client_id, token? }`.
Returns the status payload (`set` adds `saved: true|false`). A token Meta rejects
returns 200 with `saved: false`, `error: "meta_token_invalid"`, `message`, and is
not stored.

### Agents — `connections-api` (`authorizeOperator`)
| Method | Path | Body |
|---|---|---|
| GET | `/clients/:id/meta-system-token` | — |
| PUT | `/clients/:id/meta-system-token` | `{ "token": "…" }` |
| DELETE | `/clients/:id/meta-system-token` | — |
| POST | `/clients/:id/meta-system-token/validate` | — |

Success: `{ "data": <status>, "saved"?: bool }`. Errors:
`{ "error": { "code", "message" }, "data": <status|null> }` (rejected token → 422
`meta_token_invalid`).

### Agents — `external-data-api` (existing password auth)
Actions `meta_system_token_status | meta_system_token_set | meta_system_token_delete |
meta_system_token_validate` with `{ client_id, token? }`. Same `data` / `error`
shape (error code is a string here). Listed in `list_tables.composite_actions`.

`delete` only removes the token from Reporting 5.0; nothing is revoked at Meta.
Every set/replace/reject/delete/re-check writes a `client_settings_audit` row
(`entity_type = meta_system_token`, source `dashboard` or `agent_api`) without
the token value.
