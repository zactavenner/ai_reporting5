import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Building2, Target, Globe, Palette, BarChart3, Mail, MessageSquare,
  Video, Image, Megaphone, FileText
} from 'lucide-react';
import { ClientOffersSection } from '@/components/offers/ClientOffersSection';
import AssetGeneratorTab from './AssetGeneratorTab';
import {
  ResearchRenderer, AnglesRenderer, EmailsRenderer, SMSRenderer,
  AdCopyRenderer, ScriptsRenderer, CreativesRenderer, ReportRenderer, FunnelRenderer,
} from './renderers';

interface Client {
  id: string;
  name: string;
  description?: string | null;
  offer_description?: string | null;
  website_url?: string | null;
  industry?: string | null;
  brand_colors?: string[] | null;
  brand_fonts?: string[] | null;
  client_type?: string | null;
  logo_url?: string | null;
  product_url?: string | null;
}

function ClientOverview({ client }: { client: Client }) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                {client.logo_url ? (
                  <img src={client.logo_url} alt={client.name} className="w-8 h-8 rounded object-cover" />
                ) : (
                  <Building2 className="w-5 h-5 text-primary" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Company</p>
                <p className="font-semibold text-foreground">{client.name}</p>
              </div>
            </div>
            <div className="space-y-1.5 text-sm">
              {client.industry && <p className="text-muted-foreground">Industry: {client.industry}</p>}
              {client.client_type && (
                <Badge variant="outline" className="text-[10px]">{client.client_type}</Badge>
              )}
              {client.website_url && (
                <a href={client.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs">
                  <Globe className="w-3 h-3" /> {client.website_url}
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Offer / Description</p>
                <p className="font-semibold text-foreground text-sm truncate">{client.offer_description || client.description || '—'}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {client.offer_description || client.description || 'No description added yet.'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Palette className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Brand</p>
                <p className="font-semibold text-foreground text-sm">Colors & Fonts</p>
              </div>
            </div>
            <div className="space-y-2">
              {client.brand_colors && client.brand_colors.length > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {client.brand_colors.map((color, i) => (
                    <div
                      key={i}
                      className="w-7 h-7 rounded-md border border-border shadow-sm"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No brand colors set</p>
              )}
              {client.brand_fonts && client.brand_fonts.length > 0 ? (
                <div className="flex gap-1 flex-wrap">
                  {client.brand_fonts.map((font, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{font}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No brand fonts set</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <ClientOffersSection
        clientId={client.id}
        clientName={client.name}
      />
    </div>
  );
}

export function ClientFulfillmentWorkspace({ client }: { client: Client }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Offers & Fulfillment</h2>
        <p className="text-sm text-muted-foreground">
          Onboarding data, brand assets, and AI-generated marketing collateral for {client.name}
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="research" className="text-xs">Research</TabsTrigger>
          <TabsTrigger value="angles" className="text-xs">Angles</TabsTrigger>
          <TabsTrigger value="emails" className="text-xs">Emails</TabsTrigger>
          <TabsTrigger value="sms" className="text-xs">SMS</TabsTrigger>
          <TabsTrigger value="adcopy" className="text-xs">Ad Copy</TabsTrigger>
          <TabsTrigger value="scripts" className="text-xs">Scripts</TabsTrigger>
          <TabsTrigger value="creatives" className="text-xs">Creatives</TabsTrigger>
          <TabsTrigger value="report" className="text-xs">Report</TabsTrigger>
          <TabsTrigger value="funnel" className="text-xs">Funnel</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><ClientOverview client={client} /></TabsContent>
        <TabsContent value="research">
          <AssetGeneratorTab client={client} assetType="research" icon={BarChart3} title="Research Engine" description="AI-powered market research, industry analysis, and opportunity identification." renderContent={(c) => <ResearchRenderer content={c} />} />
        </TabsContent>
        <TabsContent value="angles">
          <AssetGeneratorTab client={client} assetType="angles" icon={Target} title="Marketing Angles" description="Generate 6-10 marketing angles with hooks, emotional drivers, and use cases." renderContent={(c) => <AnglesRenderer content={c} />} />
        </TabsContent>
        <TabsContent value="emails">
          <AssetGeneratorTab client={client} assetType="emails" icon={Mail} title="Email Sequences" description="Generate nurture email sequences with subject lines, preview text, and CTAs." renderContent={(c) => <EmailsRenderer content={c} />} />
        </TabsContent>
        <TabsContent value="sms">
          <AssetGeneratorTab client={client} assetType="sms" icon={MessageSquare} title="SMS Sequences" description="Generate SMS follow-up, reminder, and re-engagement sequences." renderContent={(c) => <SMSRenderer content={c} />} />
        </TabsContent>
        <TabsContent value="adcopy">
          <AssetGeneratorTab client={client} assetType="adcopy" icon={Megaphone} title="Ad Copy" description="Generate ad copy variations per angle — primary text, headlines, and descriptions." renderContent={(c) => <AdCopyRenderer content={c} />} />
        </TabsContent>
        <TabsContent value="scripts">
          <AssetGeneratorTab client={client} assetType="scripts" icon={Video} title="Video Scripts" description="Generate avatar, B-roll, UGC, and VSL scripts with hooks and CTAs." renderContent={(c) => <ScriptsRenderer content={c} />} />
        </TabsContent>
        <TabsContent value="creatives">
          <AssetGeneratorTab client={client} assetType="creatives" icon={Image} title="Creative Concepts" description="Static and video ad concepts with visual direction and layout ideas." renderContent={(c) => <CreativesRenderer content={c} />} />
        </TabsContent>
        <TabsContent value="report">
          <AssetGeneratorTab client={client} assetType="report" icon={FileText} title="Special Report" description="Generate a lead magnet report — cover page, executive summary, market opportunity." renderContent={(c) => <ReportRenderer content={c} />} />
        </TabsContent>
        <TabsContent value="funnel">
          <AssetGeneratorTab client={client} assetType="funnel" icon={Globe} title="Funnel Copy" description="Landing page, thank you page, booking page, and investor portal copy." renderContent={(c) => <FunnelRenderer content={c} />} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
