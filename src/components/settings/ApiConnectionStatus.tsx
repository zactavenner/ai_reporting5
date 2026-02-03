import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type ConnectionStatus = 'success' | 'error' | 'pending' | 'not_configured';

interface ApiConnectionStatusProps {
  contacts: ConnectionStatus;
  calendars: ConnectionStatus;
  opportunities: ConnectionStatus;
  errors?: {
    contacts?: string;
    calendars?: string;
    opportunities?: string;
  };
  compact?: boolean;
  unified?: boolean; // New prop for single unified indicator
}

// Get overall status from all three APIs
function getOverallStatus(
  contacts: ConnectionStatus,
  calendars: ConnectionStatus,
  opportunities: ConnectionStatus
): { status: 'success' | 'error' | 'pending' | 'partial'; label: string } {
  // If any are pending, overall is pending
  if (contacts === 'pending' || calendars === 'pending' || opportunities === 'pending') {
    return { status: 'pending', label: 'Testing...' };
  }
  
  // If all three are success, overall is success
  if (contacts === 'success' && calendars === 'success' && opportunities === 'success') {
    return { status: 'success', label: 'All APIs Connected' };
  }
  
  // If any has an error, overall is error
  if (contacts === 'error' || calendars === 'error' || opportunities === 'error') {
    return { status: 'error', label: 'Connection Error' };
  }
  
  // Partial - some are not configured but none are errors
  return { status: 'partial', label: 'Partially Configured' };
}

function StatusIcon({ status, error }: { status: ConnectionStatus; error?: string }) {
  if (status === 'pending') {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  }
  if (status === 'success') {
    return <CheckCircle className="h-3 w-3 text-chart-2" />;
  }
  if (status === 'error') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <XCircle className="h-3 w-3 text-destructive cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{error || 'Connection failed'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return <AlertCircle className="h-3 w-3 text-muted-foreground" />;
}

function UnifiedStatusIcon({ 
  contacts, 
  calendars, 
  opportunities, 
  errors 
}: { 
  contacts: ConnectionStatus; 
  calendars: ConnectionStatus; 
  opportunities: ConnectionStatus;
  errors?: { contacts?: string; calendars?: string; opportunities?: string };
}) {
  const overall = getOverallStatus(contacts, calendars, opportunities);
  
  const statusDetails = [
    { label: 'Contacts', status: contacts, error: errors?.contacts },
    { label: 'Calendars', status: calendars, error: errors?.calendars },
    { label: 'Opportunities', status: opportunities, error: errors?.opportunities },
  ];
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center cursor-help">
            {overall.status === 'pending' && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {overall.status === 'success' && (
              <CheckCircle className="h-4 w-4 text-chart-2" />
            )}
            {overall.status === 'error' && (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            {overall.status === 'partial' && (
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-1.5">
            <p className="font-semibold text-xs">{overall.label}</p>
            <div className="space-y-1">
              {statusDetails.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  {item.status === 'success' && <CheckCircle className="h-3 w-3 text-chart-2" />}
                  {item.status === 'error' && <XCircle className="h-3 w-3 text-destructive" />}
                  {item.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {item.status === 'not_configured' && <AlertCircle className="h-3 w-3 text-muted-foreground" />}
                  <span>{item.label}: {item.status}</span>
                </div>
              ))}
            </div>
            {(errors?.contacts || errors?.calendars || errors?.opportunities) && (
              <div className="mt-1 pt-1 border-t border-border">
                {errors?.contacts && <p className="text-xs text-destructive">Contacts: {errors.contacts}</p>}
                {errors?.calendars && <p className="text-xs text-destructive">Calendars: {errors.calendars}</p>}
                {errors?.opportunities && <p className="text-xs text-destructive">Opportunities: {errors.opportunities}</p>}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ApiConnectionStatus({
  contacts,
  calendars,
  opportunities,
  errors = {},
  compact = true,
  unified = false,
}: ApiConnectionStatusProps) {
  // Unified mode: single green/red indicator
  if (unified) {
    return (
      <UnifiedStatusIcon
        contacts={contacts}
        calendars={calendars}
        opportunities={opportunities}
        errors={errors}
      />
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-0.5">
                <span className="text-[10px] text-muted-foreground">C</span>
                <StatusIcon status={contacts} error={errors.contacts} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Contacts: {contacts}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-0.5">
                <span className="text-[10px] text-muted-foreground">Cal</span>
                <StatusIcon status={calendars} error={errors.calendars} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Calendars: {calendars}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-0.5">
                <span className="text-[10px] text-muted-foreground">O</span>
                <StatusIcon status={opportunities} error={errors.opportunities} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Opportunities: {opportunities}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <StatusIcon status={contacts} error={errors.contacts} />
        <span className="text-sm">Contacts</span>
        {contacts === 'error' && errors.contacts && (
          <span className="text-xs text-destructive">{errors.contacts}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <StatusIcon status={calendars} error={errors.calendars} />
        <span className="text-sm">Calendars</span>
        {calendars === 'error' && errors.calendars && (
          <span className="text-xs text-destructive">{errors.calendars}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <StatusIcon status={opportunities} error={errors.opportunities} />
        <span className="text-sm">Opportunities</span>
        {opportunities === 'error' && errors.opportunities && (
          <span className="text-xs text-destructive">{errors.opportunities}</span>
        )}
      </div>
    </div>
  );
}
