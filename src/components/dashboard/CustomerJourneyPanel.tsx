import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  MapPin,
  MousePointerClick,
  PhoneCall,
  DollarSign,
  Calendar,
  ArrowRight,
  User,
  Globe,
  Megaphone,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { useLeadJourney, LeadTouchpoint } from '@/hooks/useAttribution';
import type { Lead } from '@/hooks/useLeadsAndCalls';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerJourneyPanelProps {
  leads: Lead[];
  clientId?: string;
}

// ─── Touchpoint icon / colour helper ──────────────────────────────────────────

const TOUCHPOINT_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  ad_click:       { icon: <MousePointerClick className="w-4 h-4" />, color: 'bg-blue-500',   label: 'Ad Click' },
  page_view:      { icon: <Globe className="w-4 h-4" />,            color: 'bg-indigo-500',  label: 'Page View' },
  form_submit:    { icon: <MapPin className="w-4 h-4" />,           color: 'bg-green-500',   label: 'Form Submit' },
  call_booked:    { icon: <PhoneCall className="w-4 h-4" />,        color: 'bg-amber-500',   label: 'Call Booked' },
  call_showed:    { icon: <PhoneCall className="w-4 h-4" />,        color: 'bg-emerald-500', label: 'Call Showed' },
  call_completed: { icon: <PhoneCall className="w-4 h-4" />,        color: 'bg-teal-500',    label: 'Call Completed' },
  funded:         { icon: <DollarSign className="w-4 h-4" />,       color: 'bg-yellow-500',  label: 'Funded' },
  campaign:       { icon: <Megaphone className="w-4 h-4" />,        color: 'bg-purple-500',  label: 'Campaign' },
};

function touchpointMeta(type: string) {
  return TOUCHPOINT_CONFIG[type] ?? {
    icon: <ArrowRight className="w-4 h-4" />,
    color: 'bg-muted-foreground',
    label: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

// ─── Timeline node ────────────────────────────────────────────────────────────

function TouchpointNode({ tp, isLast }: { tp: LeadTouchpoint; isLast: boolean }) {
  const { icon, color, label } = touchpointMeta(tp.touchpoint_type);

  return (
    <div className="flex gap-3 relative">
      {/* Vertical line */}
      {!isLast && (
        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
      )}

      {/* Dot */}
      <div
        className={`shrink-0 mt-1 flex h-8 w-8 items-center justify-center rounded-full text-white ${color}`}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="pb-6 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{label}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {tp.touchpoint_type}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground mt-0.5">
          <Calendar className="inline w-3 h-3 mr-1 -mt-px" />
          {format(new Date(tp.timestamp), 'MMM d, yyyy h:mm a')}
        </p>

        {/* Attribution details */}
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {tp.utm_source && (
            <span>
              <span className="font-medium text-foreground">Source:</span> {tp.utm_source}
            </span>
          )}
          {tp.utm_campaign && (
            <span>
              <span className="font-medium text-foreground">Campaign:</span> {tp.utm_campaign}
            </span>
          )}
          {tp.landing_page_url && (
            <span className="truncate max-w-[260px]">
              <span className="font-medium text-foreground">URL:</span> {tp.landing_page_url}
            </span>
          )}
        </div>

        {/* Extra metadata */}
        {tp.metadata && Object.keys(tp.metadata).length > 0 && (
          <div className="mt-1 text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1 inline-block">
            {Object.entries(tp.metadata).map(([k, v]) => (
              <span key={k} className="mr-3">
                <span className="font-medium">{k}:</span> {String(v)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function CustomerJourneyPanel({ leads, clientId }: CustomerJourneyPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | undefined>();
  const [showResults, setShowResults] = useState(false);

  // Filter leads by search query (name, email, phone)
  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return leads
      .filter(
        (l) =>
          (l.name && l.name.toLowerCase().includes(q)) ||
          (l.email && l.email.toLowerCase().includes(q)) ||
          (l.phone && l.phone.includes(q)),
      )
      .slice(0, 20);
  }, [leads, searchQuery]);

  // Fetch touchpoints for selected lead
  const { data: touchpoints = [], isLoading: journeyLoading } = useLeadJourney(selectedLeadId);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId),
    [leads, selectedLeadId],
  );

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          Customer Journey
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Search ─────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            className="pl-9 h-9 text-sm"
          />

          {/* Dropdown results */}
          {showResults && filteredLeads.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
              <ScrollArea className="max-h-60">
                {filteredLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => {
                      setSelectedLeadId(lead.id);
                      setSearchQuery(lead.name || lead.email || lead.id);
                      setShowResults(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                  >
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{lead.name || '(unnamed)'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.email} {lead.phone && `· ${lead.phone}`}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {lead.source}
                    </Badge>
                  </button>
                ))}
              </ScrollArea>
            </div>
          )}
        </div>

        {/* ── Selected lead summary ──────────────────────── */}
        {selectedLead && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5">
            <User className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{selectedLead.name || '(unnamed)'}</p>
              <p className="text-xs text-muted-foreground truncate">
                {selectedLead.email}
                {selectedLead.phone && ` · ${selectedLead.phone}`}
                {selectedLead.source && ` · ${selectedLead.source}`}
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {touchpoints.length} touchpoint{touchpoints.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        )}

        {/* ── Timeline ───────────────────────────────────── */}
        {selectedLeadId && journeyLoading && (
          <p className="text-sm text-muted-foreground text-center py-6">Loading journey...</p>
        )}

        {selectedLeadId && !journeyLoading && touchpoints.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No touchpoints recorded for this lead.
          </p>
        )}

        {touchpoints.length > 0 && (
          <ScrollArea className="max-h-[420px] pr-2">
            <div className="pl-1 pt-1">
              {touchpoints.map((tp, idx) => (
                <TouchpointNode key={tp.id} tp={tp} isLast={idx === touchpoints.length - 1} />
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Empty state when no lead selected */}
        {!selectedLeadId && (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Search for a lead above to view their customer journey timeline.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
