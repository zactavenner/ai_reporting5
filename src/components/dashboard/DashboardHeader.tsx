import { Settings, Zap, Settings2, Shield, Database, LogOut, User, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  onGlobalSettings?: () => void;
  onAgencySettings?: () => void;
  onSpamBlacklist?: () => void;
  onDatabase?: () => void;
  currentMemberName?: string;
  onLogout?: () => void;
  lastSync?: Date;
  isRefreshing?: boolean;
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
  lastSync,
  isRefreshing,
}: DashboardHeaderProps) {
  return (
    <header className="border-b-2 border-border bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
            {isRefreshing ? (
              <RefreshCw className="h-3 w-3 animate-spin text-primary" />
            ) : (
              <Zap className="h-3 w-3 text-chart-2" />
            )}
            <span>
              {isRefreshing
                ? 'Syncing...'
                : `Last sync: ${lastSync ? formatDistanceToNow(lastSync, { addSuffix: true }) : 'Just now'}`
              }
            </span>
          </div>
          {onAgencySettings && (
            <Button variant="outline" size="sm" onClick={onAgencySettings}>
              <Settings2 className="h-4 w-4 mr-2" />
              Settings
            </Button>
          )}
          {onSpamBlacklist && (
            <Button variant="outline" size="sm" onClick={onSpamBlacklist}>
              <Shield className="h-4 w-4 mr-2" />
              Spam
            </Button>
          )}
          {onDatabase && (
            <Button variant="outline" size="sm" onClick={onDatabase}>
              <Database className="h-4 w-4 mr-2" />
              Database
            </Button>
          )}
          <ThemeToggle />
          {/* Team member logout - shown next to theme toggle */}
          {currentMemberName && onLogout && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
              <div className="flex items-center gap-1.5 text-sm">
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
