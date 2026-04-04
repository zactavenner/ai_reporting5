import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

interface QuizScheduleStepProps {
  onConfirm: (date: Date, time: string) => void;
  calendarUrl?: string | null;
}

export function QuizScheduleStep({ onConfirm, calendarUrl }: QuizScheduleStepProps) {
  if (calendarUrl) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-2xl">
        <iframe src={calendarUrl} className="w-full h-[600px] rounded-xl border border-border" />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-md">
      <Card>
        <CardContent className="py-12 text-center">
          <Calendar className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Calendar scheduling will be available shortly.</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
