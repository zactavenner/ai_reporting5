import { useMemo } from 'react';
import { QuizFunnel, useQuizSubmissions } from '@/hooks/useQuizFunnels';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Users, CheckCircle, Calendar, MousePointerClick } from 'lucide-react';
import { format } from 'date-fns';

interface QuizStatsPanelProps {
  funnel: QuizFunnel;
  onBack: () => void;
}

export function QuizStatsPanel({ funnel, onBack }: QuizStatsPanelProps) {
  const { data: submissions = [], isLoading } = useQuizSubmissions(funnel.id);

  const stats = useMemo(() => {
    const total = submissions.length;
    const completed = submissions.filter(s => s.completed).length;
    const withContact = submissions.filter(s => s.email).length;
    const withBooking = submissions.filter(s => s.booking_date).length;

    const questionCount = (funnel.questions as any[])?.length || 0;
    const stepCounts: Record<number, number> = {};
    submissions.forEach(s => {
      for (let i = 0; i <= s.step_reached; i++) {
        stepCounts[i] = (stepCounts[i] || 0) + 1;
      }
    });

    // Answer distributions per question
    const answerDist: Record<number, Record<string, number>> = {};
    submissions.forEach(s => {
      const answers = s.answers as Record<string, string>;
      Object.entries(answers).forEach(([key, value]) => {
        const idx = parseInt(key.replace('q', ''));
        if (!isNaN(idx)) {
          if (!answerDist[idx]) answerDist[idx] = {};
          answerDist[idx][value] = (answerDist[idx][value] || 0) + 1;
        }
      });
    });

    return { total, completed, withContact, withBooking, stepCounts, questionCount, answerDist };
  }, [submissions, funnel]);

  const questions = (funnel.questions as any[]) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-bold">Stats: {funnel.name}</h2>
          <p className="text-xs text-muted-foreground">{submissions.length} total submissions</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <MousePointerClick className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Started</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{stats.withContact}</p>
            <p className="text-xs text-muted-foreground">Contacts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{stats.withBooking}</p>
            <p className="text-xs text-muted-foreground">Bookings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</p>
            <p className="text-xs text-muted-foreground">Completion Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Drop-off */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Step-by-Step Drop-off</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {questions.map((q: any, i: number) => {
              const count = stats.stepCounts[i] || 0;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-8">Q{i + 1}</span>
                  <div className="flex-1">
                    <div className="h-6 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/80 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-medium w-16 text-right">{count} ({pct}%)</span>
                </div>
              );
            })}
            {funnel.collect_contact && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-8">📋</span>
                <div className="flex-1">
                  <div className="h-6 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${stats.total > 0 ? Math.round((stats.withContact / stats.total) * 100) : 0}%` }} />
                  </div>
                </div>
                <span className="text-sm font-medium w-16 text-right">{stats.withContact}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Answer Distribution */}
      {questions.map((q: any, i: number) => {
        const dist = stats.answerDist[i];
        if (!dist) return null;
        const total = Object.values(dist).reduce((a, b) => a + b, 0);
        return (
          <Card key={i}>
            <CardHeader><CardTitle className="text-sm">Q{i + 1}: {q.question}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([answer, count]) => (
                <div key={answer} className="flex items-center gap-3">
                  <span className="text-sm flex-1 truncate">{answer}</span>
                  <div className="w-32">
                    <div className="h-4 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full" style={{ width: `${total > 0 ? Math.round((count / total) * 100) : 0}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right">{count} ({total > 0 ? Math.round((count / total) * 100) : 0}%)</span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* Recent Submissions Table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Recent Submissions</CardTitle></CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No submissions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Date</th>
                    <th className="text-left py-2 px-2">Name</th>
                    <th className="text-left py-2 px-2">Email</th>
                    <th className="text-left py-2 px-2">Phone</th>
                    <th className="text-left py-2 px-2">Step</th>
                    <th className="text-left py-2 px-2">Complete</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.slice(0, 50).map(s => (
                    <tr key={s.id} className="border-b border-border/50">
                      <td className="py-2 px-2 text-muted-foreground">{format(new Date(s.created_at), 'MMM d, h:mm a')}</td>
                      <td className="py-2 px-2">{[s.first_name, s.last_name].filter(Boolean).join(' ') || '—'}</td>
                      <td className="py-2 px-2">{s.email || '—'}</td>
                      <td className="py-2 px-2">{s.phone || '—'}</td>
                      <td className="py-2 px-2">{s.step_reached}</td>
                      <td className="py-2 px-2">{s.completed ? '✅' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
