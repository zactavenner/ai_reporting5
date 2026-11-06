import { describe, expect, it } from 'vitest';
import { sandboxConsent } from './sandbox';
import { AnnuityService, frozenClock } from './service';
import { emptyUtm } from './rules';
import type { Actor } from './types';

const admin: Actor = { kind: 'platform_admin', id: 'load_admin' };

describe('annuity synthetic load', () => {
  it('measures a 740-lead in-memory day without treating it as acquisition performance', async () => {
    const clock = frozenClock('2026-11-09T21:00:00.000Z');
    const service = AnnuityService.create({ clock });
    const configured = await service.configure(admin, {
      phoneDefaultCountry: 'US',
      cogsPerLeadCents: 3700,
      shareCap: 1,
      bands: [{ id: 'band_load', label: 'Load band', minCents: 1, maxCents: null, routable: true, active: true }],
      prices: [{ product: 'per_lead', capitalBandId: 'band_load', amountCents: 12_000 }],
      buyers: [
        {
          id: 'buyer_load',
          name: 'Synthetic load buyer',
          verificationStatus: 'verified_configuration_only',
          licensedStates: ['TX'],
          capitalBandIds: ['band_load'],
          dailyCapacity: 740,
          budgetRemainingCents: 740 * 12_000,
          distribution: 'exclusive',
          deliveryEnabled: true,
          active: true,
        },
      ],
    });
    expect(configured.ok).toBe(true);

    const samples: number[] = [];
    const started = performance.now();
    for (let index = 0; index < 740; index += 1) {
      const sampleStarted = performance.now();
      const phone = `512555${String(1000 + index).slice(-4)}`;
      const intake = await service.intake(admin, {
        firstName: 'Load',
        lastName: String(index),
        email: `load${index}@example.test`,
        phone,
        state: 'TX',
        capitalAmountCents: 20_000_000,
        utm: emptyUtm({ content: 'load', source: 'synthetic' }),
        consent: sandboxConsent(),
      });
      if (!intake.ok) throw new Error(intake.message);
      const routed = await service.route(admin, intake.value.lead.id, 'per_lead');
      if (!routed.ok) throw new Error(routed.message);
      const decided = await service.decide(admin, routed.value.offers[0].id, 'accept', `load-${index}`);
      if (!decided.ok) throw new Error(decided.message);
      samples.push(performance.now() - sampleStarted);
    }
    const elapsedMs = performance.now() - started;
    const sorted = [...samples].sort((a, b) => a - b);
    const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
    const counts = await service.counts(admin);
    const ledger = await service.ledger(admin);
    const report = {
      benchmarkNote: '740 is another operator reported daily volume used only as a synthetic workload size. It is not this CRM\'s media or acquisition performance.',
      leads: 740,
      operationsPerLead: ['intake', 'route', 'accept'],
      elapsedMs: Number(elapsedMs.toFixed(2)),
      throughputLeadsPerSecond: Number((740 / (elapsedMs / 1000)).toFixed(2)),
      perLeadMs: {
        min: Number(sorted[0].toFixed(3)),
        p50: Number(percentile(50).toFixed(3)),
        p95: Number(percentile(95).toFixed(3)),
        max: Number(sorted[sorted.length - 1].toFixed(3)),
      },
      realizedRevenueCents: ledger.ok ? ledger.value.realized.revenueCents : null,
      realizedCogsCents: ledger.ok ? ledger.value.realized.cogsCents : null,
      contributionCents: ledger.ok ? ledger.value.realized.contributionCents : null,
      deliveries: counts.ok ? counts.value.deliveries : null,
      messagesSent: counts.ok ? counts.value.messagesSent : null,
    };
    console.log(JSON.stringify(report));
    expect(counts.ok && counts.value.leads).toBe(740);
    expect(counts.ok && counts.value.deliveries).toBe(740);
    expect(counts.ok && counts.value.messagesSent).toBe(0);
    expect(ledger.ok && ledger.value.realized.revenueCents).toBe(740 * 12_000);
    expect(ledger.ok && ledger.value.realized.cogsCents).toBe(740 * 3700);
    expect(ledger.ok && ledger.value.realized.contributionCents).toBe(740 * (12_000 - 3700));
    expect(report.elapsedMs).toBeGreaterThan(0);
    expect(report.elapsedMs).toBeLessThan(60_000);
  });
});
