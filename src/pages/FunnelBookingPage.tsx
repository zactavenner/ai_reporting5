import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import logo from '@/assets/logo-aicra.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Phone, Clock, Video, ArrowRight, CheckCircle2, CalendarIcon, Loader2, Shield } from 'lucide-react';
import { format, addDays, isBefore, startOfDay, getDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCalendarSlots } from '@/hooks/useCalendarSlots';

type Step = 'phone' | 'calendar' | 'confirmed';

function BookingStepIndicator({ step }: { step: Step }) {
  const steps = [
    { key: 'phone', label: 'Your Info' },
    { key: 'calendar', label: 'Pick a Time' },
    { key: 'confirmed', label: 'Confirmed' },
  ] as const;

  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center gap-1 w-full">
      {steps.map((s, i) => {
        const isDone = i < currentIdx;
        const isActive = s.key === step;
        return (
          <div key={s.key} className="flex items-center gap-1 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                  isDone
                    ? 'bg-primary text-primary-foreground'
                    : isActive
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-xs font-medium truncate ${
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 ${
                  isDone ? 'bg-primary' : 'bg-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CallDetails({
  selectedDate,
  selectedTime,
}: {
  selectedDate?: Date;
  selectedTime: string | null;
}) {
  return (
    <div className="space-y-5">
      <div>
        <span className="text-[10px] uppercase tracking-widest text-primary font-bold">
          AI Capital Raising
        </span>
        <h3 className="text-lg font-bold text-foreground mt-1 leading-tight">
          Discovery Call
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Learn how we help funds raise $1M–$50M+ from accredited investors using AI-driven systems.
        </p>
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <span>30 Minutes</span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Video className="w-4 h-4 text-primary" />
          </div>
          <span>Zoom Video Call</span>
        </div>
        {selectedDate && (
          <div className="flex items-center gap-3 text-foreground font-medium">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarIcon className="w-4 h-4 text-primary" />
            </div>
            <span>
              {format(selectedDate, 'EEE, MMM d, yyyy')}
              {selectedTime && ` at ${selectedTime}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Placeholder time slots used for blurred preview only
const previewSlots = ['01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM'];

export default function BookingPage() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const today = useMemo(() => startOfDay(new Date()), []);

  // Dynamic calendar ID + real-time slots from GHL
  const { calendarId, slots, loadingSlots } = useCalendarSlots({
    route: '/book',
    selectedDate,
  });

  const isPhoneValid = phone.replace(/\D/g, '').length >= 10;

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneValid) return;

    try {
      await supabase.functions.invoke('lead-intake', {
        body: {
          name,
          email,
          phone,
          source: 'booking-page',
          status: 'new',
        },
      });
    } catch (err) {
      console.error('Lead intake error:', err);
    }

    setStep('calendar');
  };

  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime || loading) return;
    setLoading(true);

    try {
      const [timePart, ampm] = selectedTime.split(' ');
      const [h, m] = timePart.split(':').map(Number);
      const hour24 = ampm === 'PM' && h !== 12 ? h + 12 : ampm === 'AM' && h === 12 ? 0 : h;
      const startTime = new Date(selectedDate);
      startTime.setHours(hour24, m, 0, 0);

      await supabase.functions.invoke('ghl-sync', {
        body: {
          action: 'sync-booking',
          name,
          email,
          phone,
          calendarId: calendarId || '35XuJAAvPdr0w5Tf9sPf',
          startTime: startTime.toISOString(),
          title: `30-min Discovery Call - ${name}`,
        },
      });

      // Update the lead status to 'booked'
      try {
        const { data: existingLeads } = await (supabase
          .from('leads') as any)
          .select('id')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(1);

        if (existingLeads && existingLeads.length > 0) {
          await supabase
            .from('leads')
            .update({
              status: 'booked' as const,
              appointment_date: startTime.toISOString(),
            })
            .eq('id', existingLeads[0].id);
        }
      } catch (updateErr) {
        console.error('Lead status update error:', updateErr);
      }

      setStep('confirmed');
    } catch (err) {
      console.error('Booking error:', err);
      toast.error('Booking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const disabledDays = (date: Date) => {
    const day = getDay(date);
    return isBefore(date, today) || day === 0 || day === 6;
  };

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      {/* Header */}
      <header className="bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/">
            <img src={logo} alt="AI Capital Raising Accelerator" className="h-7" />
          </a>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5" />
            <span>256-bit encrypted</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto">
          {/* Widget Card */}
          <div className="bg-background rounded-2xl border border-border shadow-lg overflow-hidden">
            {/* Step indicator */}
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <BookingStepIndicator step={step} />
            </div>

            {/* Phone Step */}
            {step === 'phone' && (
              <div className="flex flex-col lg:flex-row">
                <div className="lg:w-72 shrink-0 p-6 lg:p-8 lg:border-r border-border">
                  <CallDetails selectedDate={selectedDate} selectedTime={selectedTime} />
                </div>

                <div className="flex-1 p-6 lg:p-8">
                  <form onSubmit={handlePhoneSubmit} className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Enter your details</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        We'll capture your info first, then you'll pick a time.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Full Name</label>
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="John Smith"
                          required
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Email</label>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="john@example.com"
                          required
                          className="h-11"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Phone Number <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+1 (555) 000-0000"
                          required
                          className="h-11 pl-10"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Required for call confirmation & reminder
                      </p>
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full h-12 font-semibold text-base gap-2"
                      disabled={!isPhoneValid}
                    >
                      Continue to Schedule
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </form>

                  {/* Blurred Calendar Preview */}
                  <div className="mt-6 relative rounded-xl overflow-hidden border border-border">
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center">
                      <div className="bg-background/90 border border-border rounded-lg px-5 py-3 shadow-sm flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">
                          Fill in your details to unlock calendar
                        </span>
                      </div>
                    </div>
                    <div className="p-4 opacity-40 pointer-events-none select-none">
                      <div className="flex gap-6">
                        <Calendar
                          mode="single"
                          disabled={() => true}
                          fromDate={today}
                          toDate={addDays(today, 60)}
                          className="rounded-lg"
                        />
                        <div className="space-y-2 min-w-[120px] hidden sm:block">
                          {previewSlots.map((time) => (
                            <div
                              key={time}
                              className="px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground"
                            >
                              {time}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Calendar Step */}
            {step === 'calendar' && (
              <div className="flex flex-col lg:flex-row">
                <div className="lg:w-72 shrink-0 p-6 lg:p-8 lg:border-r border-border">
                  <CallDetails selectedDate={selectedDate} selectedTime={selectedTime} />
                  <div className="mt-6 pt-5 border-t border-border">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <span>
                        Booking for <span className="text-foreground font-medium">{name}</span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{email}</p>
                    <button
                      onClick={() => setStep('phone')}
                      className="text-xs text-primary hover:underline mt-2 font-medium"
                    >
                      Edit details
                    </button>
                  </div>
                </div>

                <div className="flex-1 p-6 lg:p-8">
                  <h2 className="text-xl font-bold text-foreground mb-1">Select a date & time</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Choose an available slot that works for you.
                  </p>

                  <div className="flex flex-col lg:flex-row gap-6">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => {
                        setSelectedDate(d);
                        setSelectedTime(null);
                      }}
                      disabled={disabledDays}
                      fromDate={today}
                      toDate={addDays(today, 60)}
                      className="rounded-xl border border-border pointer-events-auto"
                    />

                    {selectedDate && (
                      <div className="space-y-2 min-w-[150px]">
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">
                          {format(selectedDate, 'EEE, MMM d')}
                        </p>
                        {loadingSlots ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Loading availability…</span>
                          </div>
                        ) : slots.length > 0 ? (
                          slots.map((time) => (
                            <button
                              key={time}
                              onClick={() => setSelectedTime(time)}
                              className={`w-full px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                                selectedTime === time
                                  ? 'bg-primary text-primary-foreground border-primary shadow-md'
                                  : 'border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
                              }`}
                            >
                              {time}
                            </button>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground py-4">
                            No available slots for this date. Try another day.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedDate && selectedTime && (
                    <div className="mt-8">
                      <Button
                        size="lg"
                        className="w-full sm:w-auto h-12 font-semibold text-base gap-2 px-10"
                        onClick={handleConfirm}
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Booking...
                          </>
                        ) : (
                          <>
                            Confirm Booking <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Confirmed Step */}
            {step === 'confirmed' && (
              <div className="p-10 md:p-16 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
                  You're Booked!
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto mb-2">
                  Your AI Capital Raising Discovery Call is confirmed for{' '}
                  <span className="text-foreground font-semibold">
                    {selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')}
                  </span>{' '}
                  at <span className="text-foreground font-semibold">{selectedTime}</span>.
                </p>
                <p className="text-sm text-muted-foreground">
                  A confirmation has been sent to{' '}
                  <span className="text-foreground font-medium">{email}</span>
                </p>
                <div className="mt-8 flex items-center justify-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> 30 Min
                  </div>
                  <div className="w-px h-4 bg-border" />
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-primary" /> Zoom
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            By scheduling, you agree to our Terms of Service. We will never share your information.
          </p>
        </div>
      </main>
    </div>
  );
}
