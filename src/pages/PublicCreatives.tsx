import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, Image, CheckCircle2, Clock, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreativeApproval } from '@/components/creative/CreativeApproval';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { useClientByToken } from '@/hooks/useClients';
import { useClientSettings } from '@/hooks/useClientSettings';
import { useCreatives } from '@/hooks/useCreatives';
import { DateFilterProvider } from '@/contexts/DateFilterContext';
import { TeamMemberProvider } from '@/contexts/TeamMemberContext';

function PublicCreativesContent() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading } = useClientByToken(token);
  const { data: clientSettings } = useClientSettings(client?.id);
  const { data: creatives = [] } = useCreatives(client?.id || '');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <CashBagLoader message="Loading creatives..." />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center rounded-2xl border bg-card p-10 max-w-md shadow-lg">
          <h1 className="text-2xl font-bold mb-2">Not Found</h1>
          <p className="text-muted-foreground">This link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  const publicLinkPassword = clientSettings?.public_link_password;
  const publicCreatives = creatives.filter(c => c.status !== 'draft');
  const pendingCount = publicCreatives.filter(c => c.status === 'pending').length;
  const approvedCount = publicCreatives.filter(c => c.status === 'approved' || c.status === 'launched').length;

  const content = (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Premium Client Header */}
      <header className="relative overflow-hidden border-b border-border/40 bg-gradient-to-r from-background via-background to-muted/20">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/public/${token}`)} className="rounded-xl gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to Report
            </Button>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted/40 border border-border/30">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground">Live Review Portal</span>
            </div>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <Image className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
                  <p className="text-sm text-muted-foreground/60">Creative Review & Approval</p>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex items-center gap-4">
              {pendingCount > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/5 border border-amber-500/15">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-sm font-bold text-amber-600">{pendingCount}</p>
                    <p className="text-[10px] text-amber-600/60">Awaiting Review</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/5 border border-green-500/15">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-sm font-bold text-green-600">{approvedCount}</p>
                  <p className="text-[10px] text-green-600/60">Approved</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/30 border border-border/30">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-bold">{publicCreatives.length}</p>
                  <p className="text-[10px] text-muted-foreground/60">Total</p>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions for client */}
          {pendingCount > 0 && (
            <div className="mt-5 flex items-start gap-3 px-5 py-3.5 rounded-2xl bg-amber-500/[0.04] border border-amber-500/10">
              <MessageSquare className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">You have {pendingCount} creative{pendingCount > 1 ? 's' : ''} to review</p>
                <p className="text-xs text-muted-foreground mt-0.5">Review each creative below. You can approve, request revisions, or leave comments. Your feedback helps us deliver better results.</p>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <CreativeApproval
          clientId={client.id}
          clientName={client.name}
          isPublicView={true}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-xs text-muted-foreground/40">Powered by Creative Studio</p>
        </div>
      </footer>
    </div>
  );

  return content;
}

export default function PublicCreatives() {
  return (
    <DateFilterProvider>
      <TeamMemberProvider>
        <PublicCreativesContent />
      </TeamMemberProvider>
    </DateFilterProvider>
  );
}
