# Staged database changes (not applied)

Files here are reviewed before they are applied. They are not in `drizzle/migrations`, so nothing runs them.

- `weekly_report_deliveries.sql`: the delivery ledger for Weekly Client Report PDFs. Until it is applied, the `weekly-client-report` function reports "Delivery ledger not installed" and refuses to send.

Weekly report delivery also needs these steps, in order:
1. Apply `weekly_report_deliveries.sql` as a migration.
2. Create the private storage bucket `weekly-client-reports`.
3. Review a dry run, then set `WEEKLY_REPORT_DISPATCH_ARMED = true` in `_shared/weeklyReport/core.ts` and the server flag `WEEKLY_REPORT_DELIVERY_ARMED=true`.
4. Send one client at a time with the confirmation phrase. No scheduler is wired up. Add one only after the first pilot sends have been reviewed.
