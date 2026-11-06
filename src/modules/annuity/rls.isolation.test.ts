import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/pending/annuity/20261106180000_annuity_module.sql',
);

describe('annuity disposable postgres isolation', () => {
  it('enforces tenant denial, idempotent accept, and inactive delivery on PGlite', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
    const db = await PGlite.create({ extensions: { pgcrypto } });
    await db.exec(readFileSync(migrationPath, 'utf8'));

    const band = await db.query<{ id: string }>(
      `INSERT INTO annuity.capital_bands (label, min_cents, max_cents, routable)
       VALUES ('synthetic', 1, NULL, true) RETURNING id`,
    );
    const bandId = band.rows[0].id;
    await expect(
      db.query(
        `INSERT INTO annuity.price_mappings (product, capital_band_id, amount_cents)
         VALUES ('per_lead', $1, 7900)`,
        [bandId],
      ),
    ).rejects.toThrow(/price_mappings/);

    await db.query(
      `INSERT INTO annuity.price_mappings (product, capital_band_id, amount_cents)
       VALUES ('per_lead', $1, 12000)`,
      [bandId],
    );
    await expect(db.query(`UPDATE annuity.runtime_lock SET sends_enabled = true`)).rejects.toThrow(/sends_enabled|check/i);
    await expect(db.query(`UPDATE annuity.runtime_lock SET live_delivery_enabled = true`)).rejects.toThrow(/live_delivery_enabled|check/i);

    const north = await db.query<{ id: string }>(
      `INSERT INTO annuity.buyers (display_name, verification_status, distribution, daily_capacity, budget_remaining_cents, delivery_enabled, active)
       VALUES ('Synthetic North', 'verified_configuration_only', 'exclusive', 5, 500000, true, true) RETURNING id`,
    );
    const south = await db.query<{ id: string }>(
      `INSERT INTO annuity.buyers (display_name, verification_status, distribution, daily_capacity, budget_remaining_cents, delivery_enabled, active)
       VALUES ('Synthetic South', 'verified_configuration_only', 'shared', 5, 500000, true, true) RETURNING id`,
    );
    await expect(
      db.query(
        `INSERT INTO annuity.buyers (display_name, verification_status, distribution, daily_capacity, budget_remaining_cents, delivery_enabled, active)
         VALUES ('Candidate', 'unverified_candidate', 'shared', 5, 500000, true, true)`,
      ),
    ).rejects.toThrow(/buyers|check/i);

    const lead = await db.query<{ id: string }>(
      `INSERT INTO annuity.leads (email_normalized, phone_e164, state_code, capital_amount_cents, capital_band_id, fit, disposition, consent)
       VALUES ('lead@example.test', '+15125550101', 'TX', 25000000, $1, 'in_band', 'unbooked', '{"textVersion":"sandbox-consent-v1"}'::jsonb)
       RETURNING id`,
      [bandId],
    );
    const delivery = await db.query<{ id: string }>(
      `INSERT INTO annuity.deliveries (lead_id, buyer_id, product, state, price_cents, attempt, distribution)
       VALUES ($1, $2, 'per_lead', 'offered', 12000, 1, 'exclusive') RETURNING id`,
      [lead.rows[0].id, north.rows[0].id],
    );
    await db.query(
      `INSERT INTO annuity.deliveries (lead_id, buyer_id, product, state, price_cents, attempt, distribution)
       VALUES ($1, $2, 'booked', 'offered', 18000, 1, 'shared')`,
      [lead.rows[0].id, south.rows[0].id],
    );
    await db.query(
      `INSERT INTO annuity.ledger_lines (lead_id, buyer_id, product, kind, recognition, status, amount_cents, idempotency_key)
       VALUES ($1, NULL, NULL, 'cogs', 'unrecognized', 'open', 3700, 'cogs-test')`,
      [lead.rows[0].id],
    );
    await expect(
      db.query(
        `INSERT INTO annuity.followup_messages (lead_id, sequence_key, template_key, status, scheduled_at, booking_generation)
         VALUES ($1, 'booked', 'sandbox', 'sent', now(), 1)`,
        [lead.rows[0].id],
      ),
    ).rejects.toThrow(/followup_messages|check/i);

    await db.query(
      `INSERT INTO annuity.sessions (token_hash, actor_role, buyer_id, expires_at)
       VALUES (encode(digest('token-north', 'sha256'), 'hex'), 'buyer', $1, now() + interval '1 day'),
              (encode(digest('token-south', 'sha256'), 'hex'), 'buyer', $2, now() + interval '1 day'),
              (encode(digest('token-admin', 'sha256'), 'hex'), 'platform_admin', NULL, now() + interval '1 day')`,
      [north.rows[0].id, south.rows[0].id],
    );

    await expect(db.query(`SET ROLE annuity_app`)).resolves.toBeTruthy();
    await expect(db.query(`SELECT * FROM annuity.deliveries`)).rejects.toThrow(/permission denied/i);

    await db.query(`RESET ROLE`);
    await db.query(`GRANT SELECT ON annuity.deliveries TO annuity_app`);
    await db.query(`SET ROLE annuity_app`);
    const forced = await db.query(`SELECT id FROM annuity.deliveries`);
    expect(forced.rows).toHaveLength(0);

    const northRows = await db.query<{ buyer_id: string }>(`SELECT * FROM annuity.list_deliveries('token-north')`);
    expect(northRows.rows).toHaveLength(1);
    expect(northRows.rows[0].buyer_id).toBe(north.rows[0].id);
    const southRows = await db.query<{ product: string }>(`SELECT * FROM annuity.list_deliveries('token-south')`);
    expect(southRows.rows.map((row) => row.product)).toEqual(['booked']);
    const adminRows = await db.query(`SELECT * FROM annuity.list_deliveries('token-admin')`);
    expect(adminRows.rows).toHaveLength(2);

    const northLedger = await db.query(`SELECT * FROM annuity.list_ledger('token-north')`);
    expect(northLedger.rows).toHaveLength(0);
    const adminLedger = await db.query<{ kind: string }>(`SELECT * FROM annuity.list_ledger('token-admin')`);
    expect(adminLedger.rows.map((row) => row.kind)).toContain('cogs');

    await expect(
      db.query(`SELECT annuity.decide_delivery('token-south', $1::uuid, 'accept', 'steal')`, [delivery.rows[0].id]),
    ).rejects.toThrow(/tenant_isolation/);

    await db.query(`RESET ROLE`);
    const unchanged = await db.query<{ state: string }>(`SELECT state FROM annuity.deliveries WHERE id = $1`, [delivery.rows[0].id]);
    expect(unchanged.rows[0].state).toBe('offered');

    await db.query(`SET ROLE annuity_app`);
    await db.query(`SELECT annuity.decide_delivery('token-north', $1::uuid, 'accept', 'accept-once')`, [delivery.rows[0].id]);
    await db.query(`SELECT annuity.decide_delivery('token-north', $1::uuid, 'accept', 'accept-once')`, [delivery.rows[0].id]);
    await expect(
      db.query(`SELECT annuity.decide_delivery('token-north', $1::uuid, 'reject', 'accept-once')`, [delivery.rows[0].id]),
    ).rejects.toThrow(/idempotency_conflict/);
    await db.query(`RESET ROLE`);

    const realized = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM annuity.ledger_lines WHERE delivery_id = $1 AND recognition = 'realized'`,
      [delivery.rows[0].id],
    );
    expect(realized.rows[0].count).toBe('1');
    const state = await db.query<{ state: string }>(`SELECT state FROM annuity.deliveries WHERE id = $1`, [delivery.rows[0].id]);
    expect(state.rows[0].state).toBe('accepted');
    await db.close();
  });
});
