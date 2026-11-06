import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Users, FileText, TrendingUp, DollarSign, Play, Sparkles, ImageIcon, Pencil, Check, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useClients } from "@/hooks/useClients";
import { useClientOffers, useCreateOffer, useUpdateOffer } from "@/hooks/useClientOffers";
import { TemplateLibrary, type TemplateRow } from "./TemplateLibrary";
import { StaticGenerator } from "./StaticGenerator";
import { VideoPipeline } from "./VideoPipeline";
import { subDays } from "date-fns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIStudioTab } from "@/components/ai/AIStudioTab";

/**
 * Content → Video Ads / Static Ads tabs.
 * Client info + offer summary on top, top-performing creatives under
 * $100 CPL (empty state when nothing is running), and the shared
 * template library that AI agents can also see and add to.
 */

interface Props {
  mediaType: "video" | "static";
  onOpenStudio: () => void;
}

interface MetaAdRow {
  id: string;
  name: string;
  media_type: string | null;
  thumbnail_url: string | null;
  full_image_url: string | null;
  image_url: string | null;
  video_thumbnail_url: string | null;
  video_source_url: string | null;
  spend: number | null;
  attributed_leads: number | null;
  cost_per_lead: number | null;
  effective_status: string | null;
}

const CPL_CAP = 100;
const fmtMoney = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function ContentAdsTab({ mediaType, onOpenStudio }: Props) {
  const { data: clients = [] } = useClients();
  const sorted = useMemo(
    () =>
      clients
        .filter((c) => c.status === "active" || c.status === "onboarding")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );

  const storageKey = `content-ads:last-client`;
  const [selectedClientId, setSelectedClientId] = useState<string>(
    () => localStorage.getItem(storageKey) || ""
  );
  const selected = sorted.find((c) => c.id === selectedClientId) || sorted[0];
  const clientId = selected?.id || "";

  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<TemplateRow[]>([]);
  const [view, setView] = useState<"create" | "top" | "templates">("create");

  const handleSelectionChange = (ids: string[], rows?: TemplateRow[]) => {
    setSelectedTemplates(ids);
    if (rows) setSelectedRows(rows);
  };

  const handleClientChange = (id: string) => {
    setSelectedClientId(id);
    localStorage.setItem(storageKey, id);
  };

  // Latest offer = the offer summary shown under the client name. Editable
  // inline; saving writes back to the client's offer record.
  const { data: offers = [] } = useClientOffers(clientId);
  const primaryOffer = offers[0] || null;
  const offerSummary = primaryOffer
    ? [primaryOffer.title, primaryOffer.description].filter(Boolean).join(" — ")
    : "";

  const createOffer = useCreateOffer();
  const updateOffer = useUpdateOffer();
  const [editingOffer, setEditingOffer] = useState(false);
  const [offerTitle, setOfferTitle] = useState("");
  const [offerDesc, setOfferDesc] = useState("");
  const [savingOffer, setSavingOffer] = useState(false);

  const startOfferEdit = () => {
    setOfferTitle(primaryOffer?.title || "");
    setOfferDesc(primaryOffer?.description || "");
    setEditingOffer(true);
  };

  const saveOffer = async () => {
    if (!offerTitle.trim()) {
      toast.error("The offer needs a title");
      return;
    }
    setSavingOffer(true);
    try {
      if (primaryOffer) {
        await updateOffer.mutateAsync({
          id: primaryOffer.id,
          clientId,
          updates: { title: offerTitle.trim(), description: offerDesc.trim() },
        });
      } else {
        await createOffer.mutateAsync({
          client_id: clientId,
          title: offerTitle.trim(),
          description: offerDesc.trim(),
          offer_type: "lead_gen",
        } as any);
      }
      setEditingOffer(false);
      toast.success("Offer saved to the client");
    } catch {
      // the hooks toast the specific error
    } finally {
      setSavingOffer(false);
    }
  };

  // Top performing creatives under $100 CPL, last 7 days, matching media type.
  const sevenDaysAgo = subDays(new Date(), 7).toISOString();
  const { data: topAds = [], isLoading: adsLoading } = useQuery({
    queryKey: ["content-ads-top-creatives", clientId, mediaType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ads")
        .select(
          "id, name, media_type, thumbnail_url, full_image_url, image_url, video_thumbnail_url, video_source_url, spend, attributed_leads, cost_per_lead, effective_status"
        )
        .eq("client_id", clientId)
        .gte("synced_at", sevenDaysAgo)
        .gt("spend", 0)
        .gt("cost_per_lead", 0)
        .lt("cost_per_lead", CPL_CAP)
        .order("spend", { ascending: false })
        .limit(40);
      if (error) throw error;
      const rows = (data || []) as MetaAdRow[];
      return rows
        .filter((a) => {
          const isVideo = !!a.video_source_url || (a.media_type || "").toLowerCase().includes("video");
          return mediaType === "video" ? isVideo : !isVideo;
        })
        .slice(0, 12);
    },
    enabled: !!clientId,
  });

  const title = mediaType === "video" ? "Video Ads" : "Static Ads";

  return (
    <div className="flex flex-col gap-4">
      {/* Client header */}
      <Card className="p-3 sm:p-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-primary/10 grid place-items-center">
            {mediaType === "video" ? <Play className="h-5 w-5 text-primary" /> : <ImageIcon className="h-5 w-5 text-primary" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">{title}</h2>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Client offer, top creatives under ${CPL_CAP} CPL, and the shared template library.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={clientId} onValueChange={handleClientChange}>
            <SelectTrigger className="h-9 w-full sm:w-[260px] rounded-xl">
              <SelectValue placeholder="Pick a client" />
            </SelectTrigger>
            <SelectContent>
              {sorted.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {clientId && selected && (
        <>
          {/* Client info + offer summary */}
          <Card className="p-3 sm:p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">{selected.name}</h3>
                  <Badge variant="secondary" className="text-[10px] capitalize">{selected.status}</Badge>
                  {(selected as any).industry && (
                    <Badge variant="outline" className="text-[10px] capitalize">{(selected as any).industry}</Badge>
                  )}
                </div>
                {primaryOffer ? (
                  <div className="mt-2 flex items-start gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{primaryOffer.title}</p>
                      {primaryOffer.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{primaryOffer.description}</p>
                      )}
                      <Badge variant="outline" className="text-[9px] mt-1 capitalize">{primaryOffer.offer_type}</Badge>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    No offer saved for this client yet — add one in the Huddle connections panel.
                  </p>
                )}
              </div>

            </div>
          </Card>

          <Tabs value={view} onValueChange={(v) => setView(v as any)}>
            <TabsList className="h-9 rounded-xl">
              <TabsTrigger value="create" className="rounded-lg text-xs">Create</TabsTrigger>
              <TabsTrigger value="top" className="rounded-lg text-xs">Top performers</TabsTrigger>
              <TabsTrigger value="templates" className="rounded-lg text-xs">
                Templates{selectedTemplates.length > 0 ? ` · ${selectedTemplates.length}` : ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {view === "create" && (
            <div className="flex flex-col gap-4">
              {mediaType === "static" && (
                <Card className="p-3 sm:p-4">
                  <StaticGenerator clientId={clientId} clientName={selected.name} offerSummary={offerSummary} />
                </Card>
              )}
              <div className="h-[calc(100dvh-14rem)] min-h-[640px]">
                <AIStudioTab
                  key={`${clientId}-${mediaType}`}
                  clientId={clientId}
                  clientName={selected.name}
                  lockedAgent={mediaType === "video" ? "slug:video_ads" : "slug:static_ads"}
                />
              </div>
            </div>
          )}

          {/* Top creatives under $100 CPL */}
          {view === "top" && (
          <Card className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Top performers under ${CPL_CAP} CPL</h3>
              <span className="text-[10px] text-muted-foreground">last 7 days</span>
            </div>
            {adsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="aspect-square animate-pulse bg-muted/50" />
                ))}
              </div>
            ) : topAds.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Nothing running under ${CPL_CAP} CPL right now.
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  Creatives appear here once the client has live ads producing leads below the cap.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {topAds.map((ad) => {
                  const thumb =
                    ad.video_thumbnail_url || ad.thumbnail_url || ad.full_image_url || ad.image_url;
                  return (
                    <Card key={ad.id} className="overflow-hidden group hover:ring-1 hover:ring-primary/30 transition-all">
                      <div className="relative aspect-square bg-muted/30">
                        {thumb ? (
                          <img src={thumb} alt={ad.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-muted-foreground/40 text-[10px]">
                            No preview
                          </div>
                        )}
                        {ad.video_source_url && (
                          <div className="absolute inset-0 grid place-items-center pointer-events-none">
                            <div className="h-8 w-8 rounded-full bg-background/70 grid place-items-center">
                              <Play className="h-3.5 w-3.5 text-foreground" />
                            </div>
                          </div>
                        )}
                        <Badge className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-[9px] gap-0.5">
                          <DollarSign className="h-2.5 w-2.5" />
                          {fmtMoney(ad.cost_per_lead)} CPL
                        </Badge>
                      </div>
                      <div className="p-2">
                        <p className="text-[10px] font-medium truncate">{ad.name}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {fmtMoney(ad.spend)} spend · {ad.attributed_leads ?? 0} leads
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>

          )}

          {/* Template library */}
          {view === "templates" && (
          <Card className="p-3 sm:p-4">
            <TemplateLibrary
              kind={mediaType === "video" ? "video" : "image"}
              clientId={clientId}
              selectedIds={selectedTemplates}
              onSelectionChange={setSelectedTemplates}
            />
            {selectedTemplates.length > 0 && (
              <>
                <Separator className="my-3" />
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedTemplates.length} template{selectedTemplates.length > 1 ? "s" : ""} selected
                  </Badge>
                  <Button size="sm" className="h-8 text-xs" onClick={() => setView("create")}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Recreate selected
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelectedTemplates([])}>
                    Clear selection
                  </Button>
                </div>
              </>
            )}
          </Card>
          )}
        </>
      )}
    </div>
  );
}
