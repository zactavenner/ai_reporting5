import { Settings, Zap, Settings2, Shield, Database, LogOut, User, FileDown } from 'lucide-react';
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
  currentMemberName,
  onLogout,
}: DashboardHeaderProps) {
  return (
    <header className="border-b-2 border-border bg-card px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {/* Brand mark */}
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground font-bold text-sm">HPA</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground mr-2">
            <Zap className="h-3 w-3 text-chart-2" />
            <span>Last sync: 2 min ago</span>
          </div>
          <Button variant="outline" size="sm" onClick={exportDashboardPDF} title="Export PDF">
            <FileDown className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
          {onAgencySettings && (
            <Button variant="outline" size="sm" onClick={onAgencySettings}>
              <Settings2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          )}
          {onSpamBlacklist && (
            <Button variant="outline" size="sm" onClick={onSpamBlacklist}>
              <Shield className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Spam</span>
            </Button>
          )}
          {onDatabase && (
            <Button variant="outline" size="sm" onClick={onDatabase}>
              <Database className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Database</span>
            </Button>
          )}
          <ThemeToggle />
          {currentMemberName && onLogout && (
            <div className="flex items-center gap-2 ml-1 sm:ml-2 pl-1 sm:pl-2 border-l border-border">
              <div className="hidden sm:flex items-center gap-1.5 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{currentMemberName}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="h-8 px-2"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
