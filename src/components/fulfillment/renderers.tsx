import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function ResearchRenderer({ content }: { content: any }) {
  if (!content || content.raw) return <pre className="text-sm text-muted-foreground whitespace-pre-wrap">{content?.raw || 'No content'}</pre>;

  const sections = [
    { key: 'industry_overview', label: 'Industry Overview' },
    { key: 'asset_class_trends', label: 'Asset Class Trends' },
    { key: 'market_opportunity', label: 'Market Opportunity' },
    { key: 'supply_demand', label: 'Supply & Demand' },
    { key: 'demographic_tailwinds', label: 'Demographic Tailwinds' },
    { key: 'competitive_landscape', label: 'Competitive Landscape' },
    { key: 'timing_factors', label: 'Timing Factors' },
    { key: 'why_asset_class', label: 'Why This Asset Class' },
    { key: 'why_market', label: 'Why This Market' },
    { key: 'why_now', label: 'Why Now' },
    { key: 'why_operator', label: 'Why This Operator' },
  ];

  const stats = content.key_statistics || [];
  const news = content.recent_news || [];
  const sources = content._grounding_sources || [];

  return (
    <div className="space-y-6">
      {stats.length > 0 && (
        <div>
          <h4 className="font-display font-bold text-foreground mb-3 text-sm">Key Statistics</h4>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.map((s: any, i: number) => (
              <Card key={i} className="border-primary/20 bg-primary/5">
                <CardContent className="p-3">
                  <p className="font-bold text-foreground text-lg">{s.stat}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.context}</p>
                  {s.source && <p className="text-[10px] text-muted-foreground/60 mt-1">Source: {s.source}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {sections.map(({ key, label }) => content[key] && (
          <Card key={key} className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {content[key]}
            </CardContent>
          </Card>
        ))}
      </div>

      {news.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recent News & Developments</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {news.map((item: any, i: number) => (
              <p key={i} className="text-sm text-muted-foreground">• {typeof item === 'string' ? item : item.headline || item.title || JSON.stringify(item)}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {sources.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Research Sources</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {sources.map((src: any, i: number) => (
              <a key={i} href={src.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline block truncate">
                {src.title || src.uri}
              </a>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AnglesRenderer({ content }: { content: any }) {
  const angles = Array.isArray(content) ? content : [];
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {angles.map((angle: any, i: number) => (
        <Card key={i} className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">{angle.title}</CardTitle>
              <Badge variant="outline" className="text-[9px]">Angle {i + 1}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium text-foreground">"{angle.hook}"</p>
            <p className="text-muted-foreground"><span className="font-medium text-foreground/80">Emotion:</span> {angle.emotional_driver}</p>
            <p className="text-muted-foreground"><span className="font-medium text-foreground/80">Why it works:</span> {angle.why_it_works}</p>
            <p className="text-muted-foreground"><span className="font-medium text-foreground/80">Use case:</span> {angle.use_case}</p>
            {angle.ad_hooks && (
              <div>
                <p className="font-medium text-foreground/80 text-xs mb-1">Ad Hooks:</p>
                {angle.ad_hooks.map((h: string, j: number) => (
                  <p key={j} className="text-xs text-muted-foreground">• {h}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EmailsRenderer({ content }: { content: any }) {
  const emails = Array.isArray(content) ? content : [];
  return (
    <div className="space-y-4">
      {emails.map((email: any, i: number) => (
        <Card key={i} className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Email {email.sequence_step || i + 1}: {email.subject}
              </CardTitle>
              <Badge variant="outline" className="text-[9px]">{email.purpose}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{email.preview_text}</p>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {email.body}
            <div className="mt-3 pt-3 border-t border-border">
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">{email.cta_text}</Badge>
              {email.angle_used && <span className="ml-2 text-xs text-muted-foreground">Angle: {email.angle_used}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SMSRenderer({ content }: { content: any }) {
  const messages = Array.isArray(content) ? content : [];
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {messages.map((sms: any, i: number) => (
        <Card key={i} className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Step {sms.sequence_step || i + 1}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px]">{sms.purpose}</Badge>
                <span className="text-[10px] text-muted-foreground">{sms.character_count} chars</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-foreground bg-muted/50 p-3 rounded-lg">{sms.message}</p>
            <p className="text-xs text-muted-foreground">Timing: {sms.timing}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AdCopyRenderer({ content }: { content: any }) {
  const ads = Array.isArray(content) ? content : [];
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {ads.map((ad: any, i: number) => (
        <Card key={i} className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">{ad.headline}</CardTitle>
              <div className="flex gap-1">
                <Badge variant="outline" className="text-[9px]">{ad.platform}</Badge>
                <Badge variant="outline" className="text-[9px]">v{ad.variation}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">{ad.primary_text}</p>
            <p className="text-xs text-muted-foreground">{ad.description}</p>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">{ad.cta}</Badge>
              <span className="text-[10px] text-muted-foreground">Angle: {ad.angle}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ScriptsRenderer({ content }: { content: any }) {
  const scripts = Array.isArray(content) ? content : [];
  return (
    <div className="space-y-4">
      {scripts.map((script: any, i: number) => (
        <Card key={i} className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">{script.title}</CardTitle>
              <div className="flex gap-1">
                <Badge variant="outline" className="text-[9px]">{script.type}</Badge>
                <Badge variant="outline" className="text-[9px]">{script.format}</Badge>
                <Badge variant="outline" className="text-[9px]">~{script.duration_estimate}s</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-foreground/80 mb-1">Hook</p>
              <p className="text-foreground font-medium bg-primary/5 p-2 rounded">{script.hook}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/80 mb-1">Body</p>
              <p className="text-muted-foreground whitespace-pre-line">{script.body}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/80 mb-1">CTA</p>
              <p className="text-primary font-medium">{script.cta}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CreativesRenderer({ content }: { content: any }) {
  if (!content) return null;
  const statics = content.static_concepts || [];
  const videos = content.video_concepts || [];

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-display font-bold text-foreground mb-3">Static Ad Concepts</h4>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statics.map((c: any, i: number) => (
            <Card key={i} className="border-border">
              <CardContent className="p-4 space-y-2">
                <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs">
                  {c.format}
                </div>
                <p className="font-semibold text-sm text-foreground">{c.headline}</p>
                <p className="text-xs text-muted-foreground">{c.supporting_text}</p>
                <p className="text-[10px] text-muted-foreground/70">Visual: {c.visual_direction}</p>
                <p className="text-[10px] text-muted-foreground/70">Layout: {c.layout_idea}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-display font-bold text-foreground mb-3">Video Concepts</h4>
        <div className="grid md:grid-cols-2 gap-4">
          {videos.map((v: any, i: number) => (
            <Card key={i} className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{v.style}</CardTitle>
                  <Badge variant="outline" className="text-[9px]">{v.format}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground"><span className="font-medium text-foreground/80">Setting:</span> {v.setting}</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground/80">Hook:</span> {v.hook_concept}</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground/80">Caption:</span> {v.caption_direction}</p>
                {v.visual_scenes && (
                  <div>
                    <p className="font-medium text-foreground/80 text-xs mb-1">Scenes:</p>
                    {v.visual_scenes.map((s: string, j: number) => (
                      <p key={j} className="text-xs text-muted-foreground">• {s}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReportRenderer({ content }: { content: any }) {
  if (!content) return null;
  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6 text-center">
          <h2 className="font-display text-xl font-bold text-foreground">{content.title}</h2>
          {content.subtitle && <p className="text-sm text-muted-foreground mt-1">{content.subtitle}</p>}
        </CardContent>
      </Card>

      {[
        { key: 'executive_summary', label: 'Executive Summary' },
        { key: 'market_opportunity', label: 'Market Opportunity' },
        { key: 'why_now', label: 'Why Now' },
        { key: 'strategy_overview', label: 'Strategy Overview' },
        { key: 'operator_advantage', label: 'Operator Advantage' },
      ].map(({ key, label }) => content[key] && (
        <Card key={key} className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{content[key]}</CardContent>
        </Card>
      ))}

      {content.faqs && (
        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">FAQs</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {content.faqs.map((faq: any, i: number) => (
              <div key={i}>
                <p className="text-sm font-medium text-foreground">{faq.question}</p>
                <p className="text-sm text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {content.cta_heading && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6 text-center">
            <h3 className="font-display font-bold text-foreground">{content.cta_heading}</h3>
            <p className="text-sm text-muted-foreground mt-1">{content.cta_body}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function FunnelRenderer({ content }: { content: any }) {
  if (!content) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      {content.landing_page && (
        <Card className="border-border">
          <CardHeader><CardTitle className="text-sm">Landing Page</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-bold text-lg text-foreground">{content.landing_page.headline}</p>
            <p className="text-muted-foreground">{content.landing_page.subheadline}</p>
            {content.landing_page.body_sections?.map((s: any, i: number) => (
              <div key={i}>
                <p className="font-medium text-foreground">{s.heading}</p>
                <p className="text-muted-foreground">{s.copy}</p>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Badge className="bg-primary/10 text-primary border-primary/20">{content.landing_page.cta_primary}</Badge>
              {content.landing_page.cta_secondary && <Badge variant="outline">{content.landing_page.cta_secondary}</Badge>}
            </div>
          </CardContent>
        </Card>
      )}

      {content.thank_you_page && (
        <Card className="border-border">
          <CardHeader><CardTitle className="text-sm">Thank You Page</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-bold text-foreground">{content.thank_you_page.headline}</p>
            <p className="text-muted-foreground">{content.thank_you_page.body}</p>
            {content.thank_you_page.next_steps?.map((s: string, i: number) => (
              <p key={i} className="text-muted-foreground">• {s}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {content.booking_page && (
        <Card className="border-border">
          <CardHeader><CardTitle className="text-sm">Booking Page</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-bold text-foreground">{content.booking_page.headline}</p>
            <p className="text-muted-foreground">{content.booking_page.subheadline}</p>
            {content.booking_page.bullet_points?.map((b: string, i: number) => (
              <p key={i} className="text-muted-foreground">✓ {b}</p>
            ))}
            {content.booking_page.urgency_note && (
              <p className="text-primary text-xs font-medium">{content.booking_page.urgency_note}</p>
            )}
          </CardContent>
        </Card>
      )}

      {content.investor_portal_intro && (
        <Card className="border-border">
          <CardHeader><CardTitle className="text-sm">Investor Portal Messaging</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-bold text-foreground">{content.investor_portal_intro.headline}</p>
            <p className="text-muted-foreground">{content.investor_portal_intro.body}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
