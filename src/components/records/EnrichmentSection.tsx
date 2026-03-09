import { Sparkles, Building2, MapPin, CreditCard, Car, Briefcase, Loader2, Home, GraduationCap, Users, Heart, Shield, DollarSign, TrendingUp, Phone, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { LeadEnrichment } from '@/hooks/useLeadEnrichment';

interface EnrichmentSectionProps {
  enrichment: LeadEnrichment | null | undefined;
  isLoading: boolean;
  isEnriching: boolean;
  onEnrich: () => void;
  canEnrich: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export function EnrichmentSection({
  enrichment,
  isLoading,
  isEnriching,
  onEnrich,
  canEnrich,
  isOpen,
  onToggle,
}: EnrichmentSectionProps) {
  const hasData = !!enrichment;

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors">
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Lead Enrichment
          {hasData && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-chart-4/10 text-chart-4 border-chart-4/20">
              Enriched
            </Badge>
          )}
          {hasData && enrichment.enrichment_methods_used && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {enrichment.enrichment_methods_used.join('+')}
            </Badge>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-3">
        {!hasData && !isLoading && (
          <div className="text-center py-3">
            <p className="text-sm text-muted-foreground mb-2">No enrichment data yet</p>
            {canEnrich && (
              <Button size="sm" variant="outline" disabled={isEnriching} onClick={onEnrich} className="gap-1.5">
                {isEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Enrich Lead
              </Button>
            )}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasData && (
          <div className="space-y-3">
            {/* Identity */}
            {(enrichment.first_name || enrichment.last_name) && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Identity
                </p>
                <p className="text-sm font-medium">
                  {[enrichment.first_name, enrichment.last_name].filter(Boolean).join(' ')}
                </p>
                {enrichment.gender && <p className="text-xs text-muted-foreground">Gender: {enrichment.gender}</p>}
                {enrichment.age && <p className="text-xs text-muted-foreground">Age: {enrichment.age}</p>}
                {enrichment.birth_date && <p className="text-xs text-muted-foreground">DOB: {enrichment.birth_date}</p>}
                {enrichment.marital_status && <p className="text-xs text-muted-foreground">Marital: {enrichment.marital_status}</p>}
                {enrichment.generation && <p className="text-xs text-muted-foreground">Generation: {enrichment.generation}</p>}
                {enrichment.ethnicity && <p className="text-xs text-muted-foreground">Ethnicity: {enrichment.ethnicity}</p>}
                {enrichment.language && <p className="text-xs text-muted-foreground">Language: {enrichment.language}</p>}
              </div>
            )}

            {/* Address */}
            {enrichment.address && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Address
                </p>
                <p className="text-sm">{enrichment.address}</p>
                {enrichment.urbanicity && <p className="text-xs text-muted-foreground">Area: {enrichment.urbanicity}</p>}
              </div>
            )}

            {/* Financial Profile */}
            {(enrichment.net_worth || enrichment.household_income || enrichment.credit_range || enrichment.home_value || enrichment.is_investor) && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Financial Profile
                </p>
                {enrichment.net_worth && <p className="text-sm">Net Worth: <span className="font-medium">{enrichment.net_worth}</span></p>}
                {enrichment.household_income && <p className="text-sm">Income: {enrichment.household_income}</p>}
                {enrichment.discretionary_income && <p className="text-sm">Discretionary: {enrichment.discretionary_income}</p>}
                {enrichment.credit_range && <p className="text-sm">Credit: {enrichment.credit_range}</p>}
                {enrichment.financial_power != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Financial Power:</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{enrichment.financial_power}/10</Badge>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {enrichment.is_investor && <Badge className="bg-chart-2/20 text-chart-2 border-chart-2/30 text-[10px] px-1.5 py-0">Investor</Badge>}
                  {enrichment.owns_investments && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Owns Investments</Badge>}
                  {enrichment.owns_stocks_bonds && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Stocks & Bonds</Badge>}
                </div>
              </div>
            )}

            {/* Home */}
            {(enrichment.home_ownership || enrichment.home_value) && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Home className="h-3 w-3" /> Home
                </p>
                {enrichment.home_ownership && <p className="text-sm">{enrichment.home_ownership}</p>}
                {enrichment.home_value != null && <p className="text-sm">Value: ${enrichment.home_value.toLocaleString()}</p>}
                {enrichment.mortgage_amount != null && <p className="text-sm">Mortgage: ${enrichment.mortgage_amount.toLocaleString()}</p>}
                {enrichment.dwelling_type && <p className="text-xs text-muted-foreground">Type: {enrichment.dwelling_type}</p>}
                {enrichment.length_of_residence != null && <p className="text-xs text-muted-foreground">Residence: {enrichment.length_of_residence} yrs</p>}
              </div>
            )}

            {/* Household */}
            {(enrichment.household_persons || enrichment.has_children != null || enrichment.is_veteran) && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> Household
                </p>
                {enrichment.household_persons != null && <p className="text-sm">{enrichment.household_persons} person(s), {enrichment.household_adults || '?'} adult(s)</p>}
                <div className="flex flex-wrap gap-1.5">
                  {enrichment.has_children && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Has Children</Badge>}
                  {enrichment.is_veteran && <Badge variant="outline" className="text-[10px] px-1.5 py-0">🎖 Veteran</Badge>}
                </div>
              </div>
            )}

            {/* Education & Occupation */}
            {(enrichment.education || enrichment.occupation) && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <GraduationCap className="h-3 w-3" /> Education & Career
                </p>
                {enrichment.education && <p className="text-sm">🎓 {enrichment.education}</p>}
                {enrichment.occupation && <p className="text-sm">{enrichment.occupation}</p>}
                {enrichment.occupation_type && <p className="text-xs text-muted-foreground">Type: {enrichment.occupation_type}</p>}
                {enrichment.occupation_category && <p className="text-xs text-muted-foreground">Category: {enrichment.occupation_category}</p>}
              </div>
            )}

            {/* Companies */}
            {enrichment.companies && enrichment.companies.length > 0 && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> Companies ({enrichment.companies.length})
                </p>
                {enrichment.companies.map((c: any, i: number) => (
                  <div key={i} className="space-y-0.5">
                    {c.title && <p className="text-sm font-medium">{c.title}</p>}
                    {c.company && <p className="text-sm">{c.company}</p>}
                    {c.industry && <p className="text-xs text-muted-foreground">{c.industry}</p>}
                    {c.linkedin && (
                      <a href={c.linkedin.startsWith('http') ? c.linkedin : `https://${c.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        LinkedIn →
                      </a>
                    )}
                    {i < enrichment.companies!.length - 1 && <hr className="border-border/50 my-1" />}
                  </div>
                ))}
              </div>
            )}

            {/* Fallback: single company if no companies array */}
            {(!enrichment.companies || enrichment.companies.length === 0) && (enrichment.company_name || enrichment.company_title) && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> Company
                </p>
                {enrichment.company_title && <p className="text-sm font-medium">{enrichment.company_title}</p>}
                {enrichment.company_name && <p className="text-sm">{enrichment.company_name}</p>}
                {enrichment.linkedin_url && (
                  <a href={enrichment.linkedin_url.startsWith('http') ? enrichment.linkedin_url : `https://${enrichment.linkedin_url}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                    LinkedIn Profile →
                  </a>
                )}
              </div>
            )}

            {/* All Phones */}
            {enrichment.enriched_phones && enrichment.enriched_phones.length > 0 && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Phones ({enrichment.enriched_phones.length})
                </p>
                {enrichment.enriched_phones.map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <p className="text-sm font-mono">{p.phone || p}</p>
                    {p.type && <Badge variant="outline" className="text-[10px] px-1 py-0">{p.type}</Badge>}
                    {p.carrier && <span className="text-[10px] text-muted-foreground">{p.carrier}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* All Emails */}
            {enrichment.enriched_emails && enrichment.enriched_emails.length > 0 && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Emails ({enrichment.enriched_emails.length})
                </p>
                {enrichment.enriched_emails.map((e: any, i: number) => (
                  <p key={i} className="text-sm">{e.email || e}</p>
                ))}
              </div>
            )}

            {/* Vehicles */}
            {enrichment.vehicles && enrichment.vehicles.length > 0 && (
              <div className="bg-muted/50 p-2.5 rounded space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Car className="h-3 w-3" /> Vehicles
                </p>
                {enrichment.vehicles.map((v: any, i: number) => (
                  <p key={i} className="text-sm">{[v.year, v.make, v.model].filter(Boolean).join(' ')}</p>
                ))}
              </div>
            )}

            {/* Spouse / Household Members */}
            {enrichment.spouse_data && enrichment.spouse_data.length > 0 && (
              <div className="bg-muted/50 p-2.5 rounded space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Heart className="h-3 w-3" /> Household Members ({enrichment.spouse_data.length})
                </p>
                {enrichment.spouse_data.map((s: any, i: number) => (
                  <div key={i} className="border-l-2 border-border pl-2 space-y-0.5">
                    <p className="text-sm font-medium">{[s.firstName, s.lastName].filter(Boolean).join(' ')}</p>
                    {s.age && <span className="text-xs text-muted-foreground">Age {s.age}</span>}
                    {s.occupation && <p className="text-xs text-muted-foreground">{s.occupation}</p>}
                    {s.phones?.length > 0 && <p className="text-xs text-muted-foreground">📱 {(s.phones[0]?.phone || s.phones[0])}</p>}
                    {s.emails?.length > 0 && <p className="text-xs text-muted-foreground">✉️ {(s.emails[0]?.email || s.emails[0])}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Re-enrich button */}
            {canEnrich && (
              <Button size="sm" variant="ghost" disabled={isEnriching} onClick={onEnrich} className="w-full gap-1.5 text-xs">
                {isEnriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Re-enrich
              </Button>
            )}

            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Enriched {new Date(enrichment.enriched_at).toLocaleDateString()}
              </p>
              {enrichment.enrichment_match_count != null && (
                <p className="text-[10px] text-muted-foreground">
                  {enrichment.enrichment_match_count} identit{enrichment.enrichment_match_count === 1 ? 'y' : 'ies'}
                </p>
              )}
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
