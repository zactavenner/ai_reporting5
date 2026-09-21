# Week 4 AI marketing inside Reporting 5.0

## Scope and refreshed evidence
Planning only, checked September 21, 2026, approximately 05:53–05:56 UTC. No code, data, credentials, deployments, schedules, ads, paid renders, or messages changed. Only this plan is written; `roadmap.md` remains untouched under the planning-only restriction. Calendar sender setup remains a separate blocked task, not part of this authorization.

Live aggregates confirm: 21 active clients; 23 KPI rows with **zero nonzero** `guardrails.target_cpql` or `qualification_lag_days`; 718 phone records, all `awaiting_recording`, zero recording links, transcripts, or analyzed records; 3 meeting records (1 internal-quarantined, 2 unverified-quarantined), one nonempty transcript; 34 meeting activities, one QA timestamp, CRM statuses 33 `not_applicable`/1 `skipped`; 3 quarantined sheet deliveries. These are not successful client-call captures.

Research has 294 `creative_intel_findings`; `knowledge_base_documents`, `client_brain`, and `content_queue` are empty, but **44 offers and 9 offer files exist**. Empty inspected stores do not prove missing capabilities elsewhere.

Sales Agent, Media Buyer, and Reporting have September 20 `last_run_at`; other enabled roles are older. Separate ledgers show `agent_task_runs`: 264 completed/10,876 failed; `agent_runs`: 17,716 completed/532 failed/1,634 running, latest entries September 14. These are lifetime aggregates across different runners, not a common success rate. Trace each role to its actual runner and artifact before declaring health. All 72 inspected cron jobs are active, including existing Media Buyer reviews, MeetGeek polling, and transcription processing; active schedules do not prove useful outcomes.

The inspected Media Buyer SOP documentation still describes **review preview, disabled numeric proposals, and unverified authenticated acceptance/deployed revision**. No live endpoint invocation was performed here.

## Operating model and controls
- **Agency acquisition:** attract agency customers into the HPA account; measure qualified agency opportunities, signed retainers, collected fees, retention and delivery margin.
- **Client investor:** isolate each fund's offer, audience, consent, qualification, appointments, commitments and cleared funding. Never treat investor capital as agency revenue or capital/spend as revenue ROAS. Non-investment clients need their own qualification policies.
- Keep existing roles: Account Manager owns client approvals and routing; Sales Agent owns call QA/nurture recommendations; Reporting owns reconciled measurement; Copywriter owns voice/copy; Video Ads and Static Ads own production; Media Buyer owns test recommendations; Jeremy/Zac owns agency exceptions and priorities. Do not create duplicate agents or broaden permissions. Assign finance and sales sign-off to existing authorized people, not new access roles.
- Reuse existing client Settings/Connections, offers, Tasks, AI Review, AI Meetings, AI Studio, Creative Library, Huddle and More tools. No new app/database/sidebar taxonomy.
- Each workflow separates **received → validated → processed → reviewed → approved → dispatched → readback verified → business outcome reconciled**. Store independent states where stages differ; “sent,” a model answer, or `last_run_at` never means booked, funded, published, or paid.
- Every job binds verified actor, client, source identity/version, purpose, input hash, approval scope, attempt/lease, provider ID and readback. Reuse appropriate existing ledgers; extend only after schema/permission review. No universal generic executor.
- Approval identifies exact client, recipients/channel, content/version, date window, spend ceiling and expiry. Edits invalidate approval. Recheck reply, opt-out/DND, booking and human takeover **at dispatch**, not just enrollment. Cancel pending contact after suppression; one workflow/contact dedupe key prevents overlapping sequences.
- Server authorization and tenant checks precede privileged reads and writes; public links expose only their permitted client. No time-only/host-email attribution; internal HPA calls stay internal. Treat imported content as untrusted, never as tool instructions.
- Bounded jobs: transient 429/5xx backoff, capped attempts and explicit dead letters; auth/denial/config failures stop. Ambiguous paid/send submissions enter reconciliation hold, never fresh automatic resubmission. Verify destination IDs/readback before completion.

## Workstreams: reuse, changes and acceptance

### 1. Approved knowledge and brand voice
**Reuse:** `src/components/offers/{ClientOffersSection,OfferAssetHub}.tsx`, `src/components/onboarding/OfferReviewGate.tsx`, `src/components/ai/KnowledgeBasePanel.tsx`, `src/hooks/{useClientOffers,useOfferFiles,useKnowledgeBase}.ts`; `client_offers`, `client_offer_files`, `client_brain`. Offer detail route: `/client/:clientId/offer/:offerId`.
**Change:** assemble a versioned approved pack from these sources: ICP, voice samples, offer terms, proof with citations/expiry, prohibited claims, CTA, disclosures and channel rules. Separate agency-wide process knowledge from client facts; never overwrite canonical offers from generated copy. Show provenance and approval freshness in production. Brand voice is not permission to clone a person's audio voice.
**Owner/trigger:** Account Manager collects; Copywriter drafts; client approves factual claims; Zac approves agency pack. Source changes mark dependent outputs stale and enqueue review, not automatic publication.
**Acceptance:** approve one pack, retrieve exact citations, test conflicting/expired sources and wrong-client access, edit a term and confirm stale approvals cannot generate/send. No invented proof, guarantees or borrowed investor terms.

### 2. Contextual CRM nurture, reactivation and no-show recovery
**Reuse:** `/?tab=outreach`, `/setter`, `/ghl-workflows`; `useOutreach.ts`, `useGhlClientWorkflows.ts`, `parse-nurture-sequence`, `sync-lead-dispositions`, `enrich-lead-retargetiq`, `bulk-enrich-account-worker`; existing contacts, timelines, workflow history and enrichment jobs.
**Change:** parsing copy is not a sending engine. Inventory existing GHL enrollments before adding a sequence; assign one system as enrollment/send owner. Build reviewed cohorts using lifecycle, consent, last reply, appointment status, verified qualification and approved pack. Enrichment supplies sourced suggestions, not consent or authoritative accreditation. Draft separate new-lead, dormant and confirmed no-show paths with human handoff.
**Owner/trigger:** Sales Agent recommends; Account Manager/client sales owner approves. Prefer existing CRM webhooks for booking, reply, opt-out and disposition; future follow-ups use documented delayed jobs if supported, otherwise reuse a justified existing due-work processor. Do not add parallel polling schedules.
**Acceptance:** sandbox fixtures for reply-before-send, opt-out mid-sequence, reschedule, duplicate webhook, human takeover and cross-client contacts. Pilot previewed recipients first; later one explicitly approved small cohort. Completion requires provider message/workflow readback; outcome requires a matched reply/booking, not enrichment or enrollment.

### 3. Calls, QA, role reports and financial reconciliation
**Reuse:** `/?tab=ai-meetings`, `/?tab=call-transcripts`; `AIMeetingsTab.tsx`, `useCallTranscripts.ts`; `call-transcription`, `_shared/transcription.ts`, `meetgeek-webhook`, `_shared/{meetingAttribution,meetgeekQuality,meetingSheetDelivery}.ts`, `meeting-sheet-delivery`; `phone_call_records`, `meeting_records`, `meeting_call_activity`. Reporting: `daily-report-run`, `agency-daily-report-coordinator`; finance: `sync-ghl-payments`, `stripe-payments`, `run-reconciliation`, `useBillingData.ts` and funded records.
**Change:** fix recording availability/consent before paying for transcription. Trace one authorized recording through complete decodable audio, transcript completeness, exact appointment/contact attribution, evidence-backed QA and durable report delivery. Keep quarantined historical records excluded; no bulk replay. Shared transcription source uses `openai/gpt-4o-mini-transcribe`, not Whisper; preserve working provider selection while validating full-audio handling.
Reports: rep gets coaching/action items; sales lead gets QA and exceptions; Account Manager gets client health; Media Buyer gets aggregated objection/quality cohorts; Zac gets agency-level exceptions. Review recipient access before any send.
Financial reconciliation must separately verify transaction identity, settlement/refunds, installments and deduplication against CRM/funding ownership. Existing aggregate discrepancy checks and payment imports alone do not certify cleared investor capital. AI-mentioned “funded” remains a suggestion.
**Owner/trigger:** Sales Agent on verified recording availability; Reporting on authoritative transaction/status updates. Human sales/finance owners resolve conflicts.
**Acceptance:** one new authorized client call through transcript→QA→approved CRM note/sheet readback; internal and simultaneous-client negative tests; partial audio rejection; one installment/refund fixture reconciles without duplicate investor/capital counts. Report generation and delivery have separate statuses. No automatic stage changes from QA.

### 4. Competitor, ads and organic research / searchable swipe files
**Reuse:** `AdScrapingPage.tsx`, `InstagramIntelPage.tsx`, `SwipeFileTab.tsx`, `useSwipeFile.ts`, `useAdScraping.ts`, `scrape-fb-ads`, `run-instagram-scrape`, `creative-library-sync`; `scraped_ads`, `swipe_file`, `creative_intel_findings`. Library: `/?tab=creative-library`.
**Change:** unify search/filter/provenance across existing stores, retaining source URL/date, rights, niche, hook, format and observed metric type. Add client/agency scope checks: current swipe hook queries without a client filter, so verify server policies before reuse. Distinguish competitor observations from own verified results; imported ads are not evidence of profitable spend. YouTube research coverage needs capability verification, not a new vendor by default.
**Owner/trigger:** Media Buyer sets watchlist; Copywriter tags; operator starts bounded refresh or reuses existing creative-intel cadence after approval.
**Acceptance:** retrieve a known item by hook/source, dedupe repeated imports, block another client's private evidence, preserve stale/unavailable metrics; retain library's $200 minimum spend and static CPL ≤$150 filters.

### 5. Own outcomes → creative tests, VSL/webinar/funnel improvements
**Reuse:** `CreativeAnalytics.tsx`, `WinningAdsGallery.tsx`, `AdVariationsPage.tsx`, `useAdRegeneration.ts`, `useRunAttribution.ts`→`run-attribution`, funnel hooks/components and `/?tab=funnel-builder`; creative briefs/iterations and existing funnel variants.
**Change:** create an evidence card linking approved anonymized objection/QA cohorts and matured outcomes to hypothesis, control, one changed variable, offer/creative version, evaluation window, primary metric and stopping rule. Attribution hook currently reports campaign attribution; do not call it proven organic multi-touch attribution. VSL/webinar scripts and funnel steps use the same claims approvals.
**Owner/trigger:** Reporting validates cohort; Sales Agent supplies objections; creative roles propose; Media Buyer reviews; client approves claims. Trigger after minimum mature evidence, not every new lead.
**Acceptance:** trace one hypothesis back to authorized evidence and forward to variant/outcome; reject insufficient samples and immature qualification; no causal “winner” from CTR alone. Launch remains separately approved.

### 6. Longform → clips, carousels, email and YouTube packages
**Reuse:** AI Studio (`/?tab=ai-studio`), `MasterVideoWorkflow.tsx`, `useMasterVideoProject.ts`, `master-video-generate`, `ai-studio-video-poll`, `_shared/masterVideoContract.ts`; `HyperframesEditor.tsx`, existing render worker, assets/batch jobs and `content_queue`.
**Change:** add source-owned repurposing manifests: rights/consent, full transcript, verified segment timings, source asset and output lineage. Editing/caption layers exist; source inspection does not establish automated longform clip extraction or full publishing support. Build bounded extraction/packaging only after validating worker capability. Package clips, carousel panels, email drafts and YouTube title/description/thumbnail suggestions for review; keep clean source separate. Master-video approvals live in its project/ledger, not assumed to be generic AI Review approvals.
**Owner/trigger:** Video Ads selects segments; Static Ads/Copywriter package; Account Manager approves destination. Start from one approved longform source. Per-output paid consent and caps; never automatic full-batch generation.
**Acceptance:** exact source segments and approved text, durable resume/no double billing, playable/downloadable outputs; edit invalidates approval. Publishing requires supported existing account capability, exact asset/channel approval and provider post-ID readback; otherwise export/manual publish with recorded URL. Track UTMs and matched downstream outcomes without claiming unsupported view-through attribution.

### 7. Interactive agency lead magnet pilot
**Reuse:** `QuizBuilderTab.tsx`, `QuizPage.tsx`, `useQuizFunnels.ts`, `quiz_funnels`, `quiz_submissions`, `/?tab=funnel-quiz`, existing funnel/deck/booking components. Builder exists; public route and submission security must be verified before release.
**Change:** pilot an **Agency Growth Readiness Scorecard**, not investor accreditation: deterministic questions, transparent scoring, personalized recommendations and optional agency discovery booking. Use only HPA acquisition scope, approved agency proof and separate consent. No arbitrary AI score or client confidential benchmarks.
**Owner/trigger:** Zac chooses ICP/offer; Copywriter drafts; Reporting owns scoring. Explicit submission produces one result; booking confirmed only by CRM/calendar readback.
**Acceptance:** mobile/desktop, accessible completion, repeat submission dedupe, no-consent/no-contact path, tenant/public-access tests, attribution to agency qualified opportunity. Publish/traffic requires separate approval.

### 8. Owner assistant: exceptions, health, margin and capacity
**Reuse:** `/huddle`, `HuddlePage.tsx`, `AccountManagerPage.tsx`, `AgencyStatsBar.tsx`, `useBillingData.ts`, tasks/commitments, Jeremy and Account Manager roles; `dispatch-scheduled-agents`, `agent_task_runs`, `agent_runs`.
**Change:** evidence-backed exception inbox, not another agent: overdue decisions, stale integrations, unreviewed claims, call gaps, approval bottlenecks, collection risks and sales/production capacity. AgencyStatsBar includes estimated revenue; label it separately from cash collected. Margin needs approved labor allocation, vendor/media exclusions and cost periods; show unavailable until reconciled. Never infer real capacity from task counts alone.
**Owner/trigger:** Account Manager routes; Reporting computes; Zac prioritizes. Reuse Huddle/digest after acceptance; event-driven exceptions dedupe by client/cause/version and clear only on verified resolution.
**Acceptance:** each exception links to source and accountable person; stale evidence is visible; finance fixtures reconcile; unauthorized team members cannot see margin/billing; failed runner does not produce a healthy badge.

## Media Buyer policy: keep review-only until gates pass
Reuse `/media-buyer`, `MediaBuyerSopPreview.tsx`, `_shared/mediaBuyerSop{,Read,Request,Review}.ts`, `media-buyer-sop-review`, and the existing Media Buyer—not a second executor.

| DAILY USD | Core / Test / Retarget | Weekly concepts + total variants |
|---|---|---|
| $200 | 160 / 40 / 0 | 2 + 2 = 4 |
| $300 | 210 / 60 / 30 | 2 + 3 = 5 |
| $500 | 350 / 100 / 50 | 3 + 3 = 6 |
| $1,000 | 700 / 200 / 100 | 4 + 4 = 8 |

Unavailable retargeting returns to core; custom budgets need custom plans. Assets are not launch quotas. Cold start: one campaign, one prospecting ad set, 3–6 ads within approved pilot loss. Test duration = max(3 days, 3 × target CPQL / actual daily test spend) + qualification lag.

Dependencies: client-approved CPQL/qualification and funding lags, daily/monthly caps, offer proof, sales capacity, matured QL cohorts, account-timezone windows, tracking coverage, client-wide budget baseline and change history. Preserve DATA BLOCKED vs CONFIGURATION NEEDED and null vs zero. No numeric proposals until baseline/total budget sources pass. Scale candidates require ≥7 complete stable days, preferably ≥10 matured QLs, downstream quality/headroom/capacity, ≤20% increase/no stacking. Human-applied recommendations only; verify real signed-in per-client review and deployed revision before any existing schedule cutover. Acceptance includes shared-budget/multi-account, timezone, lag, partial-read and unauthorized-client tests.

## Ordered delivery, rollout and decisions
1. **Foundation:** inventory runner→ledger→artifact paths, permissions, integrations and existing schedules; define completion contracts and approved client policy. Diagnose current recording and runner failures. No automatic activation.
2. **One agency + one client pilot:** approved packs, call/finance truth and draft-only CRM cohorts. Choose an explicitly consenting investment client with recording access, unambiguous mapping and sales owner; HPA acquisition stays separate. Do not default to all 21 active clients.
3. **Evidence to production:** searchable research, one objection-led test and one longform package; mocked providers first, then separately approved bounded real acceptance. Media Buyer remains blocked where inputs are missing.
4. **Agency pilot:** scorecard, Huddle exceptions and reconciled margin/capacity; then one expressly approved outbound/publish cohort if ready.
5. **Controlled expansion:** pilot→three eligible clients→remaining eligible clients. Per-client gate: pack, consent, mappings, targets, source freshness, owner, cost ceiling, suppression and end-to-end readback pass. Blocked clients stay visible with exact dependency. Pause failed workflow only; retain audit and prior outputs.

**Cost controls:** per-client/job/day ceilings for enrichment, transcription, research, models and renders; hash-cache unchanged sources; minimum evidence thresholds; duration/page/recipient limits and budget reservation before submission. Reuse durable jobs and existing cadences after owner approval; no new permanent polling for this plan. Reconcile ambiguous costs and holds before retry. No provider/tool changes without a demonstrated unsupported requirement and explicit decision.

**Release validation:** targeted regression tests plus real authorized dashboard entry using existing portal identity; no fabricated auth session. Test tenant isolation, duplicates/concurrency, suppression races, stale approvals, incomplete data, 429/5xx exhaustion, terminal denials and ambiguous submit/readback. Record artifact IDs and verification evidence per stage; neither a successful test suite nor a running schedule alone certifies live business outcomes.

**Client/owner decisions before implementation:** select pilot fund and agency ICP; approve source packs/disclosures, qualification criteria/lags and financial authority; confirm recording rights/retention and access; choose channels, consent windows, human handoff and recipient roles; set per-client cost/media caps and production capacity; confirm scorecard CTA and publishing destinations; supply labor/vendor costs for margin. Existing connection scopes, recording access, deployed source parity, public quiz routing and YouTube publishing remain unverified—not reasons yet to select new tools.

Approval of this plan authorizes a subsequent scoped implementation discussion, **not** outbound sends, paid production, ad execution, schedule activation or publication; those retain explicit per-action approval gates.
