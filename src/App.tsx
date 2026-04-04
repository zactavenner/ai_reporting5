import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DateFilterProvider } from "@/contexts/DateFilterContext";
import { PasswordGate } from "@/components/auth/PasswordGate";

// Core reporting pages
import Index from "./pages/Index";
import ClientDetail from "./pages/ClientDetail";
import ClientRecords from "./pages/ClientRecords";
import DatabaseView from "./pages/DatabaseView";
import PublicReport from "./pages/PublicReport";
import SpamBlacklist from "./pages/SpamBlacklist";
import NotFound from "./pages/NotFound";
import ClientCreatives from "./pages/ClientCreatives";
import PublicCreatives from "./pages/PublicCreatives";
import MetaAdsOverlay from "./pages/MetaAdsOverlay";
import CreativeBriefs from "./pages/CreativeBriefs";

// Creative tools pages (from ad-verse-ally)
import StaticAdsPage from "./pages/StaticAdsPage";
import StaticCreativesPage from "./pages/StaticCreativesPage";
import BatchVideoPage from "./pages/BatchVideoPage";
import AdScrapingPage from "./pages/AdScrapingPage";
import AdVariationsPage from "./pages/AdVariationsPage";
import AvatarsPage from "./pages/AvatarsPage";
import BrollPage from "./pages/BrollPage";
import VideoEditorPage from "./pages/VideoEditorPage";
import AvatarAdGeneratorPage from "./pages/AvatarAdGeneratorPage";
import InstagramIntelPage from "./pages/InstagramIntelPage";
import HistoryPage from "./pages/HistoryPage";
import ExportHubPage from "./pages/ExportHubPage";
import ClientProjectsPage from "./pages/ClientProjectsPage";
import ProjectPage from "./pages/ProjectPage";

// Funnel Builder pages (from aicapitalraising)
import FunnelBuilderPage from "./pages/FunnelBuilderPage";
import FunnelBookingPage from "./pages/FunnelBookingPage";
import FunnelOnboardingPage from "./pages/FunnelOnboardingPage";
import FunnelAdminPage from "./pages/FunnelAdminPage";
import FunnelClientPage from "./pages/FunnelClientPage";
import FunnelDeckPage from "./pages/FunnelDeckPage";
import FunnelFulfillmentPage from "./pages/FunnelFulfillmentPage";
import FunnelInvestPage from "./pages/FunnelInvestPage";
import FunnelKickoffPage from "./pages/FunnelKickoffPage";
import FunnelAccessPage from "./pages/FunnelAccessPage";

// New pages from Reporting 6.0
import ClientOnboardingPage from "./pages/ClientOnboardingPage";
import SyncHealthPage from "./pages/SyncHealthPage";
import DailyReportPage from "./pages/DailyReportPage";
import DailyReportThankYouPage from "./pages/DailyReportThankYouPage";
import OfferDetailPage from "./pages/OfferDetailPage";
import QuizPage from "./pages/QuizPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <DateFilterProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Protected routes - require password */}
            <Route path="/" element={<PasswordGate><Index /></PasswordGate>} />
            <Route path="/client/:clientId" element={<PasswordGate><ClientDetail /></PasswordGate>} />
            <Route path="/client/:clientId/records" element={<PasswordGate><ClientRecords /></PasswordGate>} />
            <Route path="/client/:clientId/creatives" element={<PasswordGate><ClientCreatives /></PasswordGate>} />
            <Route path="/database" element={<PasswordGate><DatabaseView /></PasswordGate>} />
            <Route path="/spam-blacklist" element={<PasswordGate><SpamBlacklist /></PasswordGate>} />
            <Route path="/briefs" element={<PasswordGate><CreativeBriefs /></PasswordGate>} />

            {/* Creative Tools - from ad-verse-ally */}
            <Route path="/static-ads" element={<PasswordGate><StaticAdsPage /></PasswordGate>} />
            <Route path="/static-creatives" element={<PasswordGate><StaticCreativesPage /></PasswordGate>} />
            <Route path="/batch-video" element={<PasswordGate><BatchVideoPage /></PasswordGate>} />
            <Route path="/ad-scraping" element={<PasswordGate><AdScrapingPage /></PasswordGate>} />
            <Route path="/ad-variations" element={<PasswordGate><AdVariationsPage /></PasswordGate>} />
            <Route path="/avatars" element={<PasswordGate><AvatarsPage /></PasswordGate>} />
            <Route path="/broll" element={<PasswordGate><BrollPage /></PasswordGate>} />
            <Route path="/video-editor" element={<PasswordGate><VideoEditorPage /></PasswordGate>} />
            <Route path="/instagram-intel" element={<PasswordGate><InstagramIntelPage /></PasswordGate>} />
            <Route path="/history" element={<PasswordGate><HistoryPage /></PasswordGate>} />
            <Route path="/export" element={<PasswordGate><ExportHubPage /></PasswordGate>} />
            <Route path="/projects" element={<PasswordGate><ClientProjectsPage /></PasswordGate>} />
            <Route path="/projects/:projectId" element={<PasswordGate><ProjectPage /></PasswordGate>} />

            {/* Funnel Builder - from aicapitalraising */}
            <Route path="/funnel-builder" element={<PasswordGate><FunnelBuilderPage /></PasswordGate>} />
            <Route path="/funnel/:clientId/booking" element={<FunnelBookingPage />} />
            <Route path="/funnel/:clientId/onboarding" element={<FunnelOnboardingPage />} />
            <Route path="/funnel/:clientId/admin" element={<PasswordGate><FunnelAdminPage /></PasswordGate>} />
            <Route path="/funnel/:clientId/client" element={<FunnelClientPage />} />
            <Route path="/funnel/:clientId/deck" element={<FunnelDeckPage />} />
            <Route path="/funnel/:clientId/fulfillment" element={<PasswordGate><FunnelFulfillmentPage /></PasswordGate>} />
            <Route path="/funnel/:clientId/invest" element={<FunnelInvestPage />} />
            <Route path="/funnel/:clientId/kickoff" element={<FunnelKickoffPage />} />
            <Route path="/funnel/:clientId/access" element={<FunnelAccessPage />} />

            {/* New 6.0 routes */}
            <Route path="/client/:clientId/offer/:offerId" element={<PasswordGate><OfferDetailPage /></PasswordGate>} />
            <Route path="/sync-health" element={<PasswordGate><SyncHealthPage /></PasswordGate>} />
            <Route path="/daily" element={<PasswordGate><DailyReportPage /></PasswordGate>} />
            <Route path="/daily/thank-you" element={<PasswordGate><DailyReportThankYouPage /></PasswordGate>} />
            <Route path="/onboarding" element={<ClientOnboardingPage />} />

            {/* Public routes - no password required */}
            <Route path="/public/:token" element={<PublicReport />} />
            <Route path="/public/:token/creatives" element={<PublicCreatives />} />
            <Route path="/quiz/:slug" element={<QuizPage />} />
            <Route path="/meta-overlay" element={<MetaAdsOverlay />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </DateFilterProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
