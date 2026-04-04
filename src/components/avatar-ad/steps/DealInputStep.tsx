import { useAvatarAd } from '@/context/AvatarAdContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, FileText, Sparkles } from 'lucide-react';
import { INVESTMENT_TYPE_LABELS, CTA_LABELS } from '@/lib/avatar-ad-prompts';
import type { InvestmentType, TargetInvestor, CTAType } from '@/types/avatar-ad';

const TEST_DATA = {
  investmentType: 'land_development' as InvestmentType,
  projectName: 'Barn Caves',
  location: 'Lake Havasu, Arizona',
  keyMetric: '$50K invested, $149K projected return',
  minInvestment: '$50,000',
  targetInvestor: 'accredited' as TargetInvestor,
  usp: 'Team with over $3B in completed transactions across multiple cycles. Lake Havasu attracts 1M+ annual visitors.',
  ctaType: 'click_link' as CTAType,
  customScript: `$50,000 invested. $149,000 projected return through the Barn Caves development in Lake Havasu.
Led by a team with over $3B in completed transactions across multiple cycles, this opportunity is built on experience, execution, and disciplined underwriting.
Lake Havasu sits at the intersection of Arizona and California, attracting approximately 1M+ annual visitors driven by boating, tourism, and year-round recreation demand from surrounding high-density markets.
If you're an investor seeking access, click below to review the details and submit your information to connect with our team.`,
};

export function DealInputStep() {
  const { state, updateDeal, setStep } = useAvatarAd();
  const deal = state.deal;

  const canProceed = deal.investmentType && deal.projectName && deal.location && deal.keyMetric && deal.minInvestment;

  const handleLoadTestData = () => updateDeal(TEST_DATA);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Step 1: Deal Information
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleLoadTestData} className="gap-1.5 text-xs">
            <Sparkles className="h-3 w-3" /> Load Test Data
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Investment Type</Label>
            <Select value={deal.investmentType} onValueChange={v => updateDeal({ investmentType: v as InvestmentType })}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {Object.entries(INVESTMENT_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Project Name</Label>
            <Input value={deal.projectName || ''} onChange={e => updateDeal({ projectName: e.target.value })} placeholder='e.g. "Barn Caves"' />
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Location</Label>
            <Input value={deal.location || ''} onChange={e => updateDeal({ location: e.target.value })} placeholder='e.g. "Lake Havasu, Arizona"' />
          </div>
          <div className="space-y-2">
            <Label>Key Financial Metric</Label>
            <Input value={deal.keyMetric || ''} onChange={e => updateDeal({ keyMetric: e.target.value })} placeholder='e.g. "$50K invested, $149K projected return"' />
          </div>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Minimum Investment</Label>
            <Input value={deal.minInvestment || ''} onChange={e => updateDeal({ minInvestment: e.target.value })} placeholder='e.g. "$50,000"' />
          </div>
          <div className="space-y-2">
            <Label>Target Investor</Label>
            <Select value={deal.targetInvestor} onValueChange={v => updateDeal({ targetInvestor: v as TargetInvestor })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="accredited">Accredited Only</SelectItem>
                <SelectItem value="sophisticated">Sophisticated Investors</SelectItem>
                <SelectItem value="all">All Investors</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>CTA Type</Label>
            <Select value={deal.ctaType} onValueChange={v => updateDeal({ ctaType: v as CTAType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CTA_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {deal.ctaType === 'custom' && (
          <div className="space-y-2">
            <Label>Custom CTA Text</Label>
            <Input value={deal.customCta || ''} onChange={e => updateDeal({ customCta: e.target.value })} placeholder="Enter your custom CTA..." />
          </div>
        )}

        {/* USP */}
        <div className="space-y-2">
          <Label>Unique Selling Proposition</Label>
          <Textarea
            value={deal.usp || ''}
            onChange={e => updateDeal({ usp: e.target.value })}
            placeholder='e.g. "Team with $3B+ in completed transactions"'
            rows={3}
          />
        </div>

        {/* Custom Script */}
        <div className="space-y-2">
          <Label>Custom Script (optional — skip auto-generation)</Label>
          <Textarea
            value={deal.customScript || ''}
            onChange={e => updateDeal({ customScript: e.target.value })}
            placeholder="Paste your script here to skip auto-generation..."
            rows={5}
            className="font-mono text-sm"
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={() => setStep('script')} disabled={!canProceed} className="gap-2">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
