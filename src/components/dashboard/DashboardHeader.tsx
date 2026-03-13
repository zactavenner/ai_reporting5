import { Settings2, Shield, Database, LogOut, User, FileDown, FileText } from 'lucide-react';
import { usePendingBriefsCount } from '@/hooks/useCreativeBriefs';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { exportDashboardPDF } from '@/lib/exportUtils';

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  onGlobalSettings?: () => void;
  onAgencySettings?: () => void;
  onSpamBlacklist?: () => void;
  onDatabase?: () => void;
  onBriefs?: () => void;
  currentMemberName?: string;
  onLogout?: () => void;
}

export function DashboardHeader({ 
  title, 
  subtitle, 
  onGlobalSettings,
  onAgencySettings,
  onSpamBlacklist,
  onDatabase,
  onBriefs,
  currentMemberName,
  onLogout,
}: DashboardHeaderProps) {
  const { data: pendingCount = 0 } = usePendingBriefsCount();
  return (
    <header className="border-b border-border bg-card/80 apple-blur sticky top-0 z-30 px-5 sm:px-8 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground font-bold text-xs tracking-tight">HPA</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={exportDashboardPDF} title="Export PDF">
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
          {onAgencySettings && (
            <Button variant="ghost" size="sm" onClick={onAgencySettings}>
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          )}
          {onSpamBlacklist && (
            <Button variant="ghost" size="sm" onClick={onSpamBlacklist}>
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Spam</span>
            </Button>
          )}
          {onDatabase && (
            <Button variant="ghost" size="sm" onClick={onDatabase}>
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Database</span>
            </Button>
          )}
          {onBriefs && (
            <Button variant="ghost" size="sm" onClick={onBriefs} className="relative">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Briefs</span>
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full h-4 min-w-[16px] flex items-center justify-center text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </Button>
          )}
          <ThemeToggle />
          {currentMemberName && onLogout && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
              <div className="hidden sm:flex items-center gap-1.5 text-sm">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-sm">{currentMemberName}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="h-8 px-2"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
