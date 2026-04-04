import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ShieldCheck, Users, ArrowRight, CheckCircle, TrendingUp, Building2,
  Shield, Award, Star, BadgeCheck, Crown, Gem, Heart, ThumbsUp, Trophy,
  Landmark, Lock, Globe, DollarSign, Percent, Clock, Briefcase, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuizFunnelBySlug, useCreateQuizSubmission, useUpdateQuizSubmission, QuizQuestion } from '@/hooks/useQuizFunnels';
import { QuizQuestionStep } from '@/components/quiz/public/QuizQuestionStep';
import { QuizContactForm, QuizContactData } from '@/components/quiz/public/QuizContactForm';
import { QuizScheduleStep } from '@/components/quiz/public/QuizScheduleStep';
import { QuizSocialProofPopup } from '@/components/quiz/public/QuizSocialProofPopup';
import { QuizFooterDisclaimer } from '@/components/quiz/public/QuizFooterDisclaimer';
import { QuizDQPage } from '@/components/quiz/public/QuizDQPage';
import { Loader2 } from 'lucide-react';

type Phase = 'landing' | 'quiz' | 'contact' | 'calendar' | 'thanks' | 'dq';

const ICON_MAP: Record<string, React.ReactNode> = {
  'shield': <Shield className="w-4 h-4" />,
  'award': <Award className="w-4 h-4" />,
  'users': <Users className="w-4 h-4" />,
  'star': <Star className="w-4 h-4" />,
  'badge-check': <BadgeCheck className="w-4 h-4" />,
  'crown': <Crown className="w-4 h-4" />,
  'gem': <Gem className="w-4 h-4" />,
  'heart': <Heart className="w-4 h-4" />,
  'thumbs-up': <ThumbsUp className="w-4 h-4" />,
  'trophy': <Trophy className="w-4 h-4" />,
  'building': <Building2 className="w-4 h-4" />,
  'landmark': <Landmark className="w-4 h-4" />,
  'lock': <Lock className="w-4 h-4" />,
  'globe': <Globe className="w-4 h-4" />,
  'trending': <TrendingUp className="w-4 h-4" />,
  'dollar': <DollarSign className="w-4 h-4" />,
  'percent': <Percent className="w-4 h-4" />,
  'clock': <Clock className="w-4 h-4" />,
  'briefcase': <Briefcase className="w-4 h-4" />,
};

function QuizHeader({ brandName, brandLogoUrl }: { brandName: string; brandLogoUrl?: string | null }) {
  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container max-w-6xl mx-auto px-4 py-2 flex items-center justify-center">
        <div className="h-[45px] flex items-center justify-center">
          {brandLogoUrl ? (
            <img src={brandLogoUrl} alt={brandName} className="h-[45px] w-auto object-contain" />
          ) : (
            <span className="font-display text-xl tracking-[0.3em] uppercase text-foreground">{brandName}</span>
          )}
        </div>
      </div>
    </header>
  );
}

export default function QuizPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { data: funnel, isLoading } = useQuizFunnelBySlug(slug);
  const createSubmission = useCreateQuizSubmission();
  const updateSubmission = useUpdateQuizSubmission();

  const [phase, setPhase] = useState<Phase>('landing');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const questions: QuizQuestion[] = (funnel?.questions as QuizQuestion[]) || [];
  const totalSteps = questions.length + (funnel?.collect_contact ? 1 : 0) + (funnel?.show_calendar ? 1 : 0);

  const getCurrentStepIndex = () => {
    if (phase === 'quiz') return currentQ;
    if (phase === 'contact') return questions.length;
    if (phase === 'calendar') return questions.length + (funnel?.collect_contact ? 1 : 0);
    return 0;
  };

  const startQuiz = async () => {
    if (!funnel) return;
    try {
      const result = await createSubmission.mutateAsync({
        quiz_funnel_id: funnel.id,
        client_id: funnel.client_id,
        utm_source: searchParams.get('utm_source') || null,
        utm_medium: searchParams.get('utm_medium') || null,
        utm_campaign: searchParams.get('utm_campaign') || null,
        utm_content: searchParams.get('utm_content') || null,
        utm_term: searchParams.get('utm_term') || null,
      });
      setSubmissionId(result.id);
    } catch (e) {
      console.error('Failed to create submission', e);
    }
    setPhase('quiz');
  };

  const handleAnswer = async (value: string) => {
    const key = `q${currentQ}`;
    const newAnswers = { ...answers, [key]: value };
    setAnswers(newAnswers);

    if (submissionId) {
      updateSubmission.mutate({ id: submissionId, answers: newAnswers, step_reached: currentQ + 1 });
    }

    const currentQuestion = questions[currentQ];
    if (currentQ === 0 && value === 'No' && currentQuestion?.question?.toLowerCase().includes('accredited')) {
      setTimeout(() => setPhase('dq'), 300);
      return;
    }

    setTimeout(() => {
      if (currentQ < questions.length - 1) {
        setCurrentQ(currentQ + 1);
      } else if (funnel?.collect_contact) {
        setPhase('contact');
      } else if (funnel?.show_calendar) {
        setPhase('calendar');
      } else {
        if (submissionId) updateSubmission.mutate({ id: submissionId, completed: true });
        setPhase('thanks');
      }
    }, 300);
  };

  const handleContact = async (data: QuizContactData) => {
    if (submissionId) {
      await updateSubmission.mutateAsync({
        id: submissionId,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
        step_reached: questions.length + 1,
      });
    }
    if (funnel?.show_calendar) {
      setPhase('calendar');
    } else {
      if (submissionId) updateSubmission.mutate({ id: submissionId, completed: true });
      setPhase('thanks');
    }
  };

  const handleBooking = async (date: Date, time: string) => {
    if (submissionId) {
      await updateSubmission.mutateAsync({
        id: submissionId,
        booking_date: date.toISOString(),
        booking_time: time,
        completed: true,
        step_reached: totalSteps,
      });
    }
    setPhase('thanks');
  };

  const handleDQSubmit = (data: { firstName: string; lastName: string; email: string; phone: string }) => {
    if (submissionId) {
      updateSubmission.mutate({
        id: submissionId,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
        completed: true,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!funnel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Quiz not found</p>
      </div>
    );
  }

  const heroStats = (funnel.hero_stats as Array<{ value: string; label: string }>) || [];
  const bottomStats = (funnel.bottom_stats as Array<{ icon: string; value: string; label: string }>) || [];
  const brandName = funnel.brand_name || 'Quiz';

  if (phase === 'dq') {
    return <QuizDQPage brandName={brandName} brandLogoUrl={funnel.brand_logo_url} onSubmit={handleDQSubmit} />;
  }

  if (phase === 'landing') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <QuizSocialProofPopup />
        <QuizHeader brandName={brandName} brandLogoUrl={funnel.brand_logo_url} />
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center max-w-2xl mx-auto">
            {funnel.badge_text && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground mb-8">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                {funnel.badge_text}
              </motion.div>
            )}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-foreground mb-4 leading-tight">
              {(funnel.hero_heading || funnel.title)}
            </h1>
            <p className="text-muted-foreground text-base md:text-lg mb-8">{funnel.hero_description || funnel.subtitle}</p>
            {heroStats.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mb-8 max-w-md mx-auto">
                {heroStats.map((stat, index) => (
                  <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * (index + 1) }} className="bg-muted/50 rounded-lg p-4 text-left">
                    <div className="text-xl md:text-2xl font-bold text-primary">{stat.value}</div>
                    <div className="text-xs md:text-sm text-muted-foreground">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            )}
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
              <Button size="lg" onClick={startQuiz} className="w-full max-w-sm h-14 text-lg font-semibold gap-2">
                {funnel.cta_text || 'See If You Qualify'}
                <ChevronRight className="w-5 h-5" />
              </Button>
            </motion.div>
            <p className="text-xs text-muted-foreground mt-4">Takes less than 60 seconds</p>
          </motion.div>
        </main>
        {bottomStats.length > 0 && (
          <div className="border-t border-border bg-muted/30 py-4">
            <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
              {bottomStats.map((stat) => (
                <span key={stat.label} className="flex items-center gap-1.5">
                  {ICON_MAP[stat.icon] || <TrendingUp className="w-4 h-4" />}
                  {stat.value} {stat.label}
                </span>
              ))}
            </div>
          </div>
        )}
        <QuizFooterDisclaimer brandName={brandName} disclaimerText={funnel.disclaimer_text} />
      </div>
    );
  }

  if (phase === 'thanks') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <QuizHeader brandName={brandName} brandLogoUrl={funnel.brand_logo_url} />
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="container max-w-lg text-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-primary/10 mb-8">
              <CheckCircle className="h-10 w-10 text-primary" />
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="font-display text-3xl md:text-4xl font-semibold mb-4">
              {funnel.thank_you_heading || "You're All Set!"}
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-muted-foreground text-base md:text-lg leading-relaxed">
              {funnel.thank_you_message || 'Our team will be in touch shortly.'}
            </motion.p>
          </div>
        </div>
        <QuizFooterDisclaimer brandName={brandName} disclaimerText={funnel.disclaimer_text} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <QuizSocialProofPopup />
      <QuizHeader brandName={brandName} brandLogoUrl={funnel.brand_logo_url} />
      <main className="flex-1 flex flex-col items-center py-4 md:py-6 px-4">
        <div className="text-center mb-4 md:mb-6 max-w-xl w-full flex-shrink-0">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-foreground mb-4 leading-tight">{funnel.title}</h1>
          {funnel.subtitle && <p className="text-muted-foreground text-base md:text-lg">{funnel.subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 mb-8">
          {Array.from({ length: totalSteps }, (_, step) => {
            const current = getCurrentStepIndex();
            return <div key={step} className={`h-2 rounded-full transition-all duration-300 ${step === current ? 'w-8 bg-primary' : step < current ? 'w-2 bg-primary/50' : 'w-2 bg-border'}`} />;
          })}
        </div>
        <div className="flex-1 flex items-start justify-center w-full pt-2">
          <AnimatePresence mode="wait">
            {phase === 'quiz' && questions[currentQ] && (
              <QuizQuestionStep key={`q-${currentQ}`} question={questions[currentQ].question} subtext={questions[currentQ].subtext} options={questions[currentQ].options} selectedValue={answers[`q${currentQ}`] || ''} onSelect={handleAnswer} />
            )}
            {phase === 'contact' && <QuizContactForm key="contact" onSubmit={handleContact} />}
            {phase === 'calendar' && <QuizScheduleStep key="calendar" onConfirm={handleBooking} calendarUrl={funnel.calendar_url} />}
          </AnimatePresence>
        </div>
      </main>
      <QuizFooterDisclaimer brandName={brandName} disclaimerText={funnel.disclaimer_text} />
    </div>
  );
}
