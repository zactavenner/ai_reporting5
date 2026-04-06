import { useState } from 'react';
import { useQuizFunnels, useCreateQuizFunnel, useDeleteQuizFunnel, QuizFunnel } from '@/hooks/useQuizFunnels';
import { QuizFunnelEditor } from './QuizFunnelEditor';
import { QuizStatsPanel } from './QuizStatsPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, ExternalLink, Trash2, BarChart3, Edit, Copy, Globe } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ClientFunnelsTabProps {
  clientId: string;
  clientName: string;
  clientSlug?: string | null;
  offerDescription?: string | null;
  logoUrl?: string | null;
}

export function ClientFunnelsTab({ clientId, clientName, clientSlug, offerDescription, logoUrl }: ClientFunnelsTabProps) {
  const [editingFunnel, setEditingFunnel] = useState<QuizFunnel | null>(null);
  const [viewingStats, setViewingStats] = useState<QuizFunnel | null>(null);

  const { data: funnels = [], isLoading } = useQuizFunnels(clientId);
  const createFunnel = useCreateQuizFunnel();
  const deleteFunnel = useDeleteQuizFunnel();

  const handleCreate = async () => {
    try {
      const slug = (clientSlug || clientName || 'quiz').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const result = await createFunnel.mutateAsync({
        client_id: clientId,
        name: `${clientName} Quiz`,
        title: `Invest in ${clientName}`,
        subtitle: 'Answer a few quick questions to see if you qualify.',
        hero_heading: `Invest in ${clientName}`,
        hero_description: offerDescription || 'A premium investment opportunity backed by an experienced team.',
        brand_name: clientName,
        brand_logo_url: logoUrl || null,
        slug,
        questions: [
          { question: 'Are you an accredited investor?', subtext: '(Earn $200K+ individually, $300K+ jointly, or $1M+ in assets.)', options: ['Yes', 'No'] },
          { question: "What's your ideal investment range?", subtext: '(Minimum investment is $50,000.)', options: ['$50,000 - $100,000', '$100,000 - $250,000', '$250,000 - $500,000', '$500,000 - $1,000,000', '$1,000,000+'] },
        ] as any,
        hero_stats: [
          { value: '22%+', label: 'Projected IRR' },
          { value: '10%', label: 'Preferred Return' },
          { value: 'Quarterly', label: 'Distributions' },
        ] as any,
        collect_contact: true,
        show_calendar: true,
        is_active: true,
      });
      setEditingFunnel(result);
      toast.success('Quiz funnel created with default template');
    } catch (e: any) {
      toast.error(e.message || 'Failed to create quiz');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFunnel.mutateAsync(id);
      toast.success('Quiz funnel deleted');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    }
  };

  const handleCopyLink = (funnel: QuizFunnel) => {
    const url = `${window.location.origin}/quiz/${funnel.slug || funnel.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Quiz funnel link copied!');
  };

  if (editingFunnel) {
    return <QuizFunnelEditor funnel={editingFunnel} onBack={() => setEditingFunnel(null)} />;
  }

  if (viewingStats) {
    return <QuizStatsPanel funnel={viewingStats} onBack={() => setViewingStats(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Funnel Builder
          </h2>
          <p className="text-sm text-muted-foreground">
            Create and manage qualifying quiz funnels for {clientName}
          </p>
        </div>
        <Button onClick={handleCreate} disabled={createFunnel.isPending}>
          <Plus className="h-4 w-4 mr-2" />
          New Funnel
        </Button>
      </div>

      {funnels.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Globe className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium mb-1">No funnels yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create a quiz funnel to start capturing and qualifying leads for {clientName}
            </p>
            <Button onClick={handleCreate} disabled={createFunnel.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Funnel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {funnels.map(funnel => (
            <Card key={funnel.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{funnel.name}</CardTitle>
                    {funnel.hero_heading && (
                      <p className="text-xs text-muted-foreground truncate max-w-[250px]">{funnel.hero_heading}</p>
                    )}
                  </div>
                  <Badge variant={funnel.is_active ? 'default' : 'secondary'}>
                    {funnel.is_active ? 'Live' : 'Draft'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {(funnel.questions as any[])?.length || 0} questions · 
                  {funnel.collect_contact ? ' Contact form' : ' No contact'} · 
                  {funnel.show_calendar ? ' Calendar' : ' No calendar'}
                </div>
                {funnel.slug && (
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded truncate">
                      /quiz/{funnel.slug}
                    </code>
                    {funnel.meta_pixel_id && (
                      <Badge variant="outline" className="text-[10px]">Pixel</Badge>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingFunnel(funnel)}>
                    <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setViewingStats(funnel)}>
                    <BarChart3 className="h-3.5 w-3.5 mr-1" /> Stats
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleCopyLink(funnel)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Link
                  </Button>
                  {funnel.slug && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/quiz/${funnel.slug}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive ml-auto">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this funnel?</AlertDialogTitle>
                        <AlertDialogDescription>This permanently deletes the funnel and all submissions.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(funnel.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}