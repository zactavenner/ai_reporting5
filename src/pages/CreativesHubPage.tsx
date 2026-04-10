import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { useTeamMember } from '@/contexts/TeamMemberContext';
import { useClients } from '@/hooks/useClients';
import { useAllCreatives } from '@/hooks/useAllCreatives';
import { CreativesHubOverview } from '@/components/creatives-hub/CreativesHubOverview';
import { CreativesHubNav } from '@/components/creatives-hub/CreativesHubNav';
import { AIScriptStudio } from '@/components/creatives-hub/AIScriptStudio';
import { VideoAdsStudio } from '@/components/creatives-hub/VideoAdsStudio';
import { StaticAdsStudio } from '@/components/creatives-hub/StaticAdsStudio';
import { AdResearchCenter } from '@/components/creatives-hub/AdResearchCenter';
import { CreativeReviewPortal } from '@/components/creatives-hub/CreativeReviewPortal';
import { CreativePerformanceDash } from '@/components/creatives-hub/CreativePerformanceDash';

export type HubSection = 'overview' | 'scripts' | 'video' | 'static' | 'research' | 'review' | 'performance';

const CreativesHubPage = () => {
  const navigate = useNavigate();
  const { currentMember, logout } = useTeamMember();
  const { data: clients = [] } = useClients();
  const { data: allCreatives = [] } = useAllCreatives();
  const [activeSection, setActiveSection] = useState<HubSection>('overview');
  const [sidebarTab, setSidebarTab] = useState('creatives-hub');

  const pendingCreatives = allCreatives.filter(c => c.status === 'pending');

  const statusCounts = {
    all: allCreatives.length,
    pending: allCreatives.filter(c => c.status === 'pending').length,
    approved: allCreatives.filter(c => c.status === 'approved').length,
    launched: allCreatives.filter(c => c.status === 'launched').length,
    revisions: allCreatives.filter(c => c.status === 'revisions').length,
    rejected: allCreatives.filter(c => c.status === 'rejected').length,
  };

  const handleSidebarNav = (tab: string) => {
    if (tab === 'creatives-hub') {
      setActiveSection('overview');
    } else if (tab === 'dashboard') {
      navigate('/');
    } else {
      navigate(`/?tab=${tab}`);
    }
    setSidebarTab(tab);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar
          activeTab={sidebarTab}
          onTabChange={handleSidebarNav}
          pendingCreativeCount={pendingCreatives.length}
          isAdmin={currentMember?.role === 'admin'}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader
            currentMemberName={currentMember?.name}
            onLogout={currentMember ? logout : undefined}
          />

          <main className="flex-1 overflow-auto">
            {/* Hero gradient header */}
            <div className="relative overflow-hidden border-b border-border/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-violet-500/[0.03]" />
              <div className="relative px-8 pt-8 pb-4">
                <div className="max-w-7xl mx-auto">
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text">
                      Creatives Hub
                    </h1>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                      AI-Powered
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-2xl">
                    Generate, manage, and optimize ad creatives across every format. From AI scripts to hyper-realistic visuals — all in one place.
                  </p>

                  {/* Navigation pills */}
                  <div className="mt-6">
                    <CreativesHubNav
                      activeSection={activeSection}
                      onSectionChange={setActiveSection}
                      statusCounts={statusCounts}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Content area */}
            <div className="px-8 py-6">
              <div className="max-w-7xl mx-auto">
                {activeSection === 'overview' && (
                  <SectionErrorBoundary sectionName="Creatives Overview">
                    <CreativesHubOverview
                      clients={clients}
                      creatives={allCreatives}
                      statusCounts={statusCounts}
                      onNavigate={setActiveSection}
                    />
                  </SectionErrorBoundary>
                )}

                {activeSection === 'scripts' && (
                  <SectionErrorBoundary sectionName="AI Script Studio">
                    <AIScriptStudio clients={clients} />
                  </SectionErrorBoundary>
                )}

                {activeSection === 'video' && (
                  <SectionErrorBoundary sectionName="Video Ads Studio">
                    <VideoAdsStudio clients={clients} />
                  </SectionErrorBoundary>
                )}

                {activeSection === 'static' && (
                  <SectionErrorBoundary sectionName="Static Ads Studio">
                    <StaticAdsStudio />
                  </SectionErrorBoundary>
                )}

                {activeSection === 'research' && (
                  <SectionErrorBoundary sectionName="Ad Research">
                    <AdResearchCenter clients={clients} />
                  </SectionErrorBoundary>
                )}

                {activeSection === 'review' && (
                  <SectionErrorBoundary sectionName="Creative Review">
                    <CreativeReviewPortal
                      clients={clients}
                      creatives={allCreatives}
                      statusCounts={statusCounts}
                    />
                  </SectionErrorBoundary>
                )}

                {activeSection === 'performance' && (
                  <SectionErrorBoundary sectionName="Performance">
                    <CreativePerformanceDash
                      clients={clients}
                      creatives={allCreatives}
                    />
                  </SectionErrorBoundary>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CreativesHubPage;
