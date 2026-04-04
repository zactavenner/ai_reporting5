import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, ArrowLeft, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DailyReportThankYouPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const name = searchParams.get('name') || 'Team Member';
  const type = searchParams.get('type') as 'sod' | 'eod' | null;

  const isSOD = type === 'sod';
  const Icon = isSOD ? Sun : Moon;
  const title = isSOD ? 'SOD Report Submitted!' : 'EOD Report Submitted!';
  const subtitle = isSOD
    ? "Your priorities are locked in. Let's crush it today!"
    : "Great work today. Rest up and recharge!";

  return (
    <div className="container max-w-lg mx-auto py-16 px-4 flex items-center justify-center min-h-[80vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full"
      >
        <Card className="text-center">
          <CardContent className="py-12 space-y-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="flex justify-center"
            >
              <div className="rounded-full bg-primary/10 p-4">
                <CheckCircle2 className="h-12 w-12 text-primary" />
              </div>
            </motion.div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <Icon className="h-4 w-4" />
                <span>{isSOD ? 'Start of Day' : 'End of Day'}</span>
              </div>
              <h1 className="text-2xl font-bold">{title}</h1>
              <p className="text-muted-foreground">{subtitle}</p>
              <p className="text-sm text-muted-foreground/70">— {name}</p>
            </div>

            <div className="flex flex-col gap-2 pt-4">
              <Button onClick={() => navigate('/daily')} variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to Daily Reports
              </Button>
              <Button onClick={() => navigate('/')} variant="ghost" size="sm">
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
