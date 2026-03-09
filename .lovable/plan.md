

# Maximum Enrichment: Waterfall + Spouse + Full Financial/Company Data

## What We're Building

A complete enrichment overhaul that captures **everything** RetargetIQ returns, implements **waterfall enrichment** (try Phone → Email → Address → IP cross-referencing), stores **all identities** including spouse/household members, and syncs all phones/emails back to the contact record.

## Current State vs Target

**Now**: We capture ~15 fields from the primary identity only. We stop at the first match and ignore additional identities (spouse). Most of the `data` object (100+ fields) goes into `raw_data` JSON and is never queryable.

**Target**: Capture 25+ queryable columns, store ALL identities (primary + spouse), do waterfall enrichment across all available lookup methods, and store ALL phones/emails tied to that person.

## Database Migration

Add columns to `lead_enrichment`:

```text
-- Financial
discretionary_income     text        ← finances.discretionaryIncome
financial_power          integer     ← finances.financialPower (1-10)
net_worth                text        ← data.householdNetWorth
net_worth_midpoint       integer     ← data.householdNetWorthMidpoint
home_ownership           text        ← data.homeOwnership
home_value               integer     ← data.homeValue
median_home_value        integer     ← data.medianHomeValue
mortgage_amount          integer     ← data.mortgageAmount
owns_investments         boolean     ← data.ownsInvestments
is_investor              boolean     ← data.investor
owns_stocks_bonds        boolean     ← data.ownsStocksAndBonds

-- Demographics
education                text        ← data.education
occupation               text        ← data.occupationDetail
occupation_type          text        ← data.occupationType (White/Blue Collar)
occupation_category      text        ← data.occupationCategory
marital_status           text        ← data.maritalStatus
age                      integer     ← data.age
generation               text        ← data.generation
ethnicity                text        ← data.ethnicGroup
language                 text        ← data.language
urbanicity               text        ← data.urbanicity

-- Household
household_adults         integer     ← data.householdAdults
household_persons        integer     ← data.householdPersons
has_children             boolean     ← data.householdChild
dwelling_type            text        ← data.dwellingType
length_of_residence      integer     ← data.lengthOfResidence
is_veteran               boolean     ← data.householdVeteran

-- Company (store ALL companies, not just first)
companies                jsonb       ← enrichData.companies[] (full array)

-- Spouse / additional identities
spouse_data              jsonb       ← identities[1+] (all non-primary identities)
is_primary_identity      boolean     ← true for identity[0]
retargetiq_id            integer     ← enrichData.id (for cross-referencing)

-- Enrichment metadata
enrichment_methods_used  text[]      ← tracks which lookups succeeded
enrichment_match_count   integer     ← how many identities returned
```

## Edge Function: Waterfall Enrichment (`enrich-lead-retargetiq`)

### Waterfall Strategy
Since enrichment is unlimited, try ALL available methods and merge the best data:

```text
1. Phone lookup   → if phone available
2. Email lookup   → if email available
3. Address lookup → if name+address/city/state available
4. Cross-reference: if step 1 returned emails, re-enrich by those emails
5. Cross-reference: if step 2 returned phones, re-enrich by those phones
6. Merge: take the richest identity across all results
```

### Spouse Handling
- The API returns `identities[]` array — identity[0] is primary, identity[1+] are household members (spouse)
- Store ALL identities: primary goes into the main columns, additional identities go into `spouse_data` JSONB
- Each spouse gets their own phones/emails/companies captured

### Full Data Extraction
Extract EVERYTHING from the `data` object into queryable columns instead of relying on `raw_data`.

## Files Modified

### 1. Database Migration
- Add ~30 new columns to `lead_enrichment`

### 2. `supabase/functions/enrich-lead-retargetiq/index.ts`
- Implement waterfall: try all lookup methods, not just first match
- Cross-reference: use returned emails/phones to do additional lookups
- Merge results: pick richest identity data across all attempts
- Capture ALL identities (spouse) into `spouse_data`
- Extract full `data` object fields into new columns
- Store all companies as JSONB array
- Track which methods were used and match count

### 3. `src/hooks/useLeadEnrichment.ts`
- Update `LeadEnrichment` interface with all new fields

### 4. `src/components/records/EnrichmentSection.tsx`
- Add Financial Profile section (Net Worth, Income, Credit, Home Value, Investments)
- Add Demographics section (Education, Occupation, Age, Marital Status)
- Add Household section (Dwelling, Children, Residence Length)
- Add ALL Companies (not just first), with SIC codes and industry
- Add Spouse section showing household member data
- Show all phones/emails with carrier/quality metadata

### 5. `src/pages/DatabaseView.tsx`
- Add filterable columns: Net Worth, Home Ownership, Investor, Occupation, Education
- Extend enrichment filters for new financial fields

### 6. `supabase/functions/enrich-all-funded/index.ts`
- Update to pass all available contact data for waterfall enrichment

