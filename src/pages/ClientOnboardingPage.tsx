import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  ArrowRight, ArrowLeft, CheckCircle2, Building2, Target, Palette,
  Rocket, DollarSign, Users, Calendar, Globe, FileText, Upload,
  Phone, Clock, Video, Loader2,
} from 'lucide-react';

const steps = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'assets', label: 'Assets', icon: Palette },
  { id: 'kickoff', label: 'Kickoff', icon: Calendar },
  { id: 'review', label: 'Submit', icon: Rocket },
];

const fundTypes = [
  'Real Estate Fund', 'Multifamily Syndication', 'Single Family Fund',
  'Oil & Gas Fund', 'Land Fund', 'Private Equity', 'Venture Capital',
  'E-Commerce', 'SaaS', 'Service Business', 'Other',
];

const timelineOptions = ['30 days', '60 days', '90 days', '6 months', '12 months'];

function ChoiceGrid({ options, value, onChange, columns = 2 }: { options: string[]; value: string; onChange: (v: string) => void; columns?: number }) {
  return (
    <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left ${
            value === opt
              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
              : 'border-border text-foreground hover:border-primary/40 hover:bg-muted/50'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function ClientOnboardingPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [fundType, setFundType] = useState('');
  const [website, setWebsite] = useState('');

  const [raiseAmount, setRaiseAmount] = useState('');
  const [timeline, setTimeline] = useState('');
  const [minInvestment, setMinInvestment] = useState('');
  const [targetInvestor, setTargetInvestor] = useState('');
  const [pitchDeckLink, setPitchDeckLink] = useState('');

  const [budgetMode, setBudgetMode] = useState<'monthly' | 'daily'>('monthly');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [brandNotes, setBrandNotes] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  useEffect(() => {
    if (token) {
      supabase.from('clients').select('id, name, logo_url').eq('public_token', token).single()
        .then(({ data }) => {
          if (data) {
            setClientId(data.id);
            setClientName(data.name);
            setLogoUrl((data as any).logo_url);
          }
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  const budgetNum = Number(budgetAmount.replace(/,/g, '')) || 0;
  const monthlyBudget = budgetMode === 'monthly' ? budgetNum : Math.round(budgetNum * 30);
  const dailyBudget = budgetMode === 'daily' ? budgetNum : Math.round(budgetNum / 30);

  const canProceed = () => {
    switch (currentStep) {
      case 0: return contactName.trim() && contactEmail.trim() && contactPhone.replace(/\D/g, '').length >= 10 && fundType;
      case 1: return raiseAmount.trim() && timeline;
      case 2: return true;
      case 3: return true;
      default: return true;
    }
  };

  const handleSubmit = async () => {
    if (!clientId) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase.from('client_intake' as any) as any).insert({
        client_id: clientId,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        fund_type: fundType,
        raise_amount: raiseAmount,
        timeline,
        min_investment: minInvestment,
        target_investor: targetInvestor,
        pitch_deck_link: pitchDeckLink,
        budget_mode: budgetMode,
        budget_amount: budgetAmount,
        brand_notes: brandNotes,
        additional_notes: additionalNotes,
        kickoff_date: selectedDate,
        kickoff_time: selectedTime,
        status: 'submitted',
      });
      if (error) throw error;

      await supabase.from('clients').update({
        offer_description: `${fundType} - Raising $${raiseAmount}. ${targetInvestor ? `Target: ${targetInvestor}` : ''}`,
        website_url: website || undefined,
        description: additionalNotes || brandNotes || undefined,
      } as any).eq('id', clientId);

      setSubmitted(true);
      toast.success('Onboarding submitted!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => { if (currentStep < steps.length - 1) setCurrentStep(s => s + 1); else handleSubmit(); };
  const prev = () => { if (currentStep > 0) setCurrentStep(s => s - 1); };

  const getAvailableDates = () => {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  };

  const timeSlots = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!clientId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Invalid Link</h1>
          <p className="text-muted-foreground">This onboarding link is not valid. Please contact your account manager.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <motion.div className="text-center max-w-lg" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">You're All Set!</h1>
          <p className="text-muted-foreground mb-2">
            Thank you, <span className="text-foreground font-semibold">{contactName}</span>. We've received your onboarding details for <span className="text-foreground font-semibold">{clientName}</span>.
          </p>
          {selectedDate && selectedTime && (
            <p className="text-sm text-primary font-medium mb-4">
              Kickoff call requested for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {selectedTime}
            </p>
          )}
          <p className="text-sm text-muted-foreground">Our team will reach out within 24 hours.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-center gap-3">
          {logoUrl && <img src={logoUrl} alt={clientName} className="h-8 rounded" />}
          <span className="font-bold text-lg">{clientName}</span>
        </div>
      </header>

      <div className="border-b border-border bg-muted/30">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === currentStep;
              const isDone = i < currentStep;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    isActive ? 'bg-primary text-primary-foreground shadow-sm'
                    : isDone ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                  }`}>
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-xs font-semibold hidden sm:inline ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                  {i < steps.length - 1 && <div className="w-6 md:w-12 h-px bg-border mx-1" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
              {currentStep === 0 && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold">Tell us about your business</h2>
                    <p className="text-sm text-muted-foreground mt-1">Basic information about your company and primary contact.</p>
                  </div>
                  <div className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Contact Name <span className="text-destructive">*</span></label>
                        <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="John Smith" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Email <span className="text-destructive">*</span></label>
                        <Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="john@company.com" />
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Phone <span className="text-destructive">*</span></label>
                        <Input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Website</label>
                        <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://company.com" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Business Type <span className="text-destructive">*</span></label>
                      <ChoiceGrid options={fundTypes} value={fundType} onChange={setFundType} columns={3} />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold">Campaign goals</h2>
                    <p className="text-sm text-muted-foreground mt-1">Help us understand your objectives so we can tailor the campaign.</p>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> Revenue / raise target <span className="text-destructive">*</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                        <Input value={raiseAmount} onChange={e => setRaiseAmount(e.target.value.replace(/[^0-9,]/g, ''))} placeholder="1,000,000" className="pl-7" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Target timeline <span className="text-destructive">*</span></label>
                      <ChoiceGrid options={timelineOptions} value={timeline} onChange={setTimeline} columns={3} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Minimum investment / order value</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                        <Input value={minInvestment} onChange={e => setMinInvestment(e.target.value.replace(/[^0-9,]/g, ''))} placeholder="50,000" className="pl-7" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Pitch deck or sales materials</label>
                      <Input value={pitchDeckLink} onChange={e => setPitchDeckLink(e.target.value)} placeholder="https://drive.google.com/... or paste any link" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Target audience profile</label>
                      <Textarea value={targetInvestor} onChange={e => setTargetInvestor(e.target.value)} placeholder="e.g. Business owners aged 35-55, $250K+ household income..." rows={3} />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold">Brand & budget</h2>
                    <p className="text-sm text-muted-foreground mt-1">Share any existing materials so we can hit the ground running.</p>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> Ad budget</label>
                      <div className="flex items-center gap-2 mb-2">
                        {(['monthly', 'daily'] as const).map(m => (
                          <button key={m} type="button" onClick={() => setBudgetMode(m)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                              budgetMode === m ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:border-primary/40'
                            }`}>{m.charAt(0).toUpperCase() + m.slice(1)}</button>
                        ))}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                        <Input value={budgetAmount} onChange={e => setBudgetAmount(e.target.value.replace(/[^0-9,]/g, ''))} placeholder={budgetMode === 'monthly' ? '10,000' : '333'} className="pl-7" />
                      </div>
                      {budgetNum > 0 && <p className="text-xs text-muted-foreground mt-1">{budgetMode === 'monthly' ? `≈ $${dailyBudget.toLocaleString()}/day` : `≈ $${monthlyBudget.toLocaleString()}/month`}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Brand guidelines or notes</label>
                      <Textarea value={brandNotes} onChange={e => setBrandNotes(e.target.value)} placeholder="Colors, fonts, tone-of-voice..." rows={3} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Anything else we should know?</label>
                      <Textarea value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} placeholder="Compliance requirements, specific platforms, deadlines..." rows={3} />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold">Book your kickoff call</h2>
                    <p className="text-sm text-muted-foreground mt-1">Select a time for your onboarding call with our team.</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Video className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold">30-min Kickoff Call</h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 30 min</span>
                          <span className="flex items-center gap-1"><Video className="w-3 h-3" /> Zoom</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Select a date</label>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {getAvailableDates().map(date => {
                            const d = new Date(date + 'T12:00:00');
                            return (
                              <button key={date} type="button" onClick={() => setSelectedDate(date)}
                                className={`p-3 rounded-lg border text-center transition-all ${
                                  selectedDate === date ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40 hover:bg-muted/50'
                                }`}>
                                <div className="text-[10px] font-medium uppercase opacity-70">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                                <div className="text-lg font-bold">{d.getDate()}</div>
                                <div className="text-[10px] opacity-70">{d.toLocaleDateString('en-US', { month: 'short' })}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {selectedDate && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                          <label className="text-sm font-medium">Select a time</label>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {timeSlots.map(time => (
                              <button key={time} type="button" onClick={() => setSelectedTime(time)}
                                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                                  selectedTime === time ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40 hover:bg-muted/50'
                                }`}>{time}</button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                      {selectedDate && selectedTime && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg bg-primary/5 border border-primary/20 p-4 flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                          <div className="text-sm">
                            <span className="font-semibold text-foreground">{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                            <span className="text-muted-foreground"> at </span>
                            <span className="font-semibold text-foreground">{selectedTime}</span>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold">Review & submit</h2>
                    <p className="text-sm text-muted-foreground mt-1">Confirm everything looks good before we get started.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Contact</h3>
                        <button onClick={() => setCurrentStep(0)} className="text-xs text-primary hover:underline font-medium">Edit</button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{contactName}</span></div>
                        <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{fundType}</span></div>
                        <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{contactEmail}</span></div>
                        <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{contactPhone}</span></div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Goals</h3>
                        <button onClick={() => setCurrentStep(1)} className="text-xs text-primary hover:underline font-medium">Edit</button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div><span className="text-muted-foreground">Target:</span> <span className="font-medium">${raiseAmount}</span></div>
                        <div><span className="text-muted-foreground">Timeline:</span> <span className="font-medium">{timeline}</span></div>
                        {minInvestment && <div><span className="text-muted-foreground">Min Investment:</span> <span className="font-medium">${minInvestment}</span></div>}
                      </div>
                    </div>
                    {(selectedDate && selectedTime) && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-primary" />
                        <div className="text-sm">
                          <span className="font-semibold">Kickoff:</span>{' '}
                          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {selectedTime}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
            <Button variant="ghost" onClick={prev} disabled={currentStep === 0} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={next} disabled={!canProceed() || submitting} className="gap-2 min-w-[140px]">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> :
                currentStep === steps.length - 1 ? <><Rocket className="w-4 h-4" /> Submit</> :
                <>Continue <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
