import { PRODUCTION_SUPABASE_PROJECT_ID } from './types';

/**
 * The annuity module must not attach to the live Reporting CRM database.
 * Hosting stays on the current Lovable app. This guard is the code-side refusal;
 * it does not read credentials.
 */
export function assertAnnuityDatabaseTarget(supabaseUrl: string | undefined | null): void {
  if (!supabaseUrl) return;
  if (supabaseUrl.includes(PRODUCTION_SUPABASE_PROJECT_ID)) {
    throw new Error(
      `Annuity module refuses to connect to Supabase project ${PRODUCTION_SUPABASE_PROJECT_ID}. Pending SQL has not been applied there.`,
    );
  }
  throw new Error('Annuity live database connections are inactive. Use the in-memory synthetic service.');
}

export function annuityRuntimeStatus() {
  return {
    repositoryMatch: {
      supabaseProjectId: PRODUCTION_SUPABASE_PROJECT_ID,
      confirmedInRepo: true,
    },
    dataPlane: 'synthetic-memory' as const,
    liveDeliveryEnabled: false as const,
    sendsEnabled: false as const,
    vercelRequired: false as const,
    hosting: 'existing-lovable-vite-app' as const,
    migrationAppliedToSupabase: false as const,
    migrationPath: 'supabase/pending/annuity/20261106180000_annuity_module.sql',
  };
}
