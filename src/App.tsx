import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DateFilterProvider } from "@/contexts/DateFilterContext";
import { PasswordGate } from "@/components/auth/PasswordGate";
import Index from "./pages/Index";
import ClientDetail from "./pages/ClientDetail";
import ClientRecords from "./pages/ClientRecords";
import DatabaseView from "./pages/DatabaseView";
import PublicReport from "./pages/PublicReport";
import SpamBlacklist from "./pages/SpamBlacklist";
import NotFound from "./pages/NotFound";
 import ClientCreatives from "./pages/ClientCreatives";
 import PublicCreatives from "./pages/PublicCreatives";

const queryClient = new QueryClient();

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
            
            {/* Public routes - no password required */}
            <Route path="/public/:token" element={<PublicReport />} />
             <Route path="/public/:token/creatives" element={<PublicCreatives />} />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </DateFilterProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
