import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Calendar, Phone, CheckCircle2, DollarSign, User, MapPin, Tag, Clock, Mail, Globe, Building, FileText, TrendingUp, Target } from 'lucide-react';

interface ActivityEvent {
  date: string;
  label: string;
  icon: React.ReactNode;
  type: 'lead' | 'call' | 'show' | 'commit' | 'funded' | 'info';
}

interface RecordActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordType: 'lead' | 'call' | 'funded_investor';
  record: any;
  lead?: any;
  calls?: any[];
  fundedRecord?: any;
}

export function RecordActivityModal({
  open,
  onOpenChange,
  recordType,
  record,
  lead,
  calls = [],
  fundedRecord,
}: RecordActivityModalProps) {
  if (!record) return null;

  // Build activity timeline
  const activities: ActivityEvent[] = [];

  // Add lead creation if available
  const leadRecord = recordType === 'lead' ? record : lead;
  if (leadRecord?.created_at) {
    activities.push({
      date: leadRecord.created_at,
      label: 'Lead Created',
      icon: <User className="h-4 w-4" />,
      type: 'lead',
    });
  }

  // Add calls
  const relevantCalls = recordType === 'call' ? [record] : calls;
  relevantCalls.forEach((call: any) => {
    if (call?.scheduled_at || call?.created_at) {
      activities.push({
        date: call.scheduled_at || call.created_at,
        label: call.is_reconnect ? 'Reconnect Call Booked' : 'Call Booked',
        icon: <Phone className="h-4 w-4" />,
        type: 'call',
      });
      
      if (call.showed) {
        activities.push({
          date: call.scheduled_at || call.created_at,
          label: call.is_reconnect ? 'Reconnect Call Showed' : 'Call Showed',
          icon: <CheckCircle2 className="h-4 w-4" />,
          type: 'show',
        });
      }
    }
  });

  // Add funded date
  const fundedData = recordType === 'funded_investor' ? record : fundedRecord;
  if (fundedData?.funded_at) {
    activities.push({
      date: fundedData.funded_at,
      label: `Funded $${Number(fundedData.funded_amount || 0).toLocaleString()}`,
      icon: <DollarSign className="h-4 w-4" />,
      type: 'funded',
    });
  }

  // Sort by date
  activities.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Get display title based on record type
  const getTitle = () => {
    switch (recordType) {
      case 'lead':
        return record.name || record.email || 'Lead Details';
      case 'call':
        return `Call - ${record.outcome || 'Details'}`;
      case 'funded_investor':
        return record.name || 'Funded Investor';
      default:
        return 'Record Details';
    }
  };

  const typeColors = {
    lead: 'bg-blue-500',
    call: 'bg-amber-500',
    show: 'bg-green-500',
    commit: 'bg-purple-500',
    funded: 'bg-emerald-500',
    info: 'bg-muted',
  };

  // Parse custom_fields if they exist
  const customFields = leadRecord?.custom_fields || {};
  const hasCustomFields = Object.keys(customFields).length > 0;

  // Parse questions if they exist
  const questions = leadRecord?.questions || [];
  const hasQuestions = Array.isArray(questions) && questions.length > 0;

  // Format custom field key for display
  const formatFieldKey = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  // Format custom field value for display
  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      // Check if it looks like a currency value
      if (value > 100) return `$${value.toLocaleString()}`;
      return value.toString();
    }
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Record Details */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Contact Information
              </h3>
              <div className="space-y-3">
                {(leadRecord || record) && (
                  <>
                    {(leadRecord?.name || record?.name) && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{leadRecord?.name || record?.name}</span>
                      </div>
                    )}
                    {(leadRecord?.email || record?.email) && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{leadRecord?.email || record?.email}</span>
                      </div>
                    )}
                    {(leadRecord?.phone || record?.phone) && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{leadRecord?.phone || record?.phone}</span>
                      </div>
                    )}
                    {leadRecord?.source && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="outline">{leadRecord.source}</Badge>
                      </div>
                    )}
                    {leadRecord?.assigned_user && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Assigned: {leadRecord.assigned_user}</span>
                      </div>
                    )}
                    {leadRecord?.pipeline_value > 0 && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-chart-2">
                          Pipeline: ${Number(leadRecord.pipeline_value).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Opportunity Status Section */}
              {leadRecord && (leadRecord.opportunity_status || leadRecord.opportunity_stage || leadRecord.opportunity_value > 0) && (
                <>
                  <Separator />
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Pipeline Status
                  </h3>
                  <div className="space-y-2 text-sm">
                    {leadRecord.opportunity_status && (
                      <div className="flex items-center gap-2">
                        <Target className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant={leadRecord.opportunity_status === 'won' ? 'success' : leadRecord.opportunity_status === 'lost' ? 'destructive' : 'secondary'} className="text-xs">
                          {leadRecord.opportunity_status.charAt(0).toUpperCase() + leadRecord.opportunity_status.slice(1)}
                        </Badge>
                      </div>
                    )}
                    {leadRecord.opportunity_stage && (
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Stage:</span>
                        <Badge variant="outline" className="text-xs">{leadRecord.opportunity_stage}</Badge>
                      </div>
                    )}
                    {leadRecord.opportunity_value > 0 && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Value:</span>
                        <span className="font-medium text-chart-2">${Number(leadRecord.opportunity_value).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Campaign Attribution */}
              {leadRecord && (leadRecord.campaign_name || leadRecord.ad_set_name || leadRecord.ad_id) && (
                <>
                  <Separator />
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Campaign Attribution
                  </h3>
                  <div className="space-y-2 text-sm">
                    {leadRecord.campaign_name && (
                      <div className="flex items-center gap-2">
                        <Building className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Campaign:</span>
                        <Badge variant="secondary" className="text-xs">{leadRecord.campaign_name}</Badge>
                      </div>
                    )}
                    {leadRecord.ad_set_name && (
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Ad Set:</span>
                        <Badge variant="secondary" className="text-xs">{leadRecord.ad_set_name}</Badge>
                      </div>
                    )}
                    {leadRecord.ad_id && (
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Ad ID:</span>
                        <Badge variant="outline" className="text-xs">{leadRecord.ad_id}</Badge>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* UTM Parameters */}
              {leadRecord && (leadRecord.utm_source || leadRecord.utm_medium || leadRecord.utm_campaign) && (
                <>
                  <Separator />
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    UTM Parameters
                  </h3>
                  <div className="space-y-2 text-sm">
                    {leadRecord.utm_source && (
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Source:</span>
                        <Badge variant="secondary" className="text-xs">{leadRecord.utm_source}</Badge>
                      </div>
                    )}
                    {leadRecord.utm_medium && (
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Medium:</span>
                        <Badge variant="secondary" className="text-xs">{leadRecord.utm_medium}</Badge>
                      </div>
                    )}
                    {leadRecord.utm_campaign && (
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Campaign:</span>
                        <Badge variant="secondary" className="text-xs">{leadRecord.utm_campaign}</Badge>
                      </div>
                    )}
                    {leadRecord.utm_content && (
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Content:</span>
                        <Badge variant="secondary" className="text-xs">{leadRecord.utm_content}</Badge>
                      </div>
                    )}
                    {leadRecord.utm_term && (
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Term:</span>
                        <Badge variant="secondary" className="text-xs">{leadRecord.utm_term}</Badge>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Questions/Answers from Form */}
              {hasQuestions && (
                <>
                  <Separator />
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Survey Responses
                  </h3>
                  <div className="space-y-3 text-sm">
                    {questions.map((q: any, idx: number) => (
                      <div key={idx} className="border-l-2 border-primary/20 pl-3">
                        <p className="text-muted-foreground text-xs">{q.question}</p>
                        <p className="font-medium">{formatFieldValue(q.answer)}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Custom Fields from Webhook */}
              {hasCustomFields && (
                <>
                  <Separator />
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Additional Information
                  </h3>
                  <div className="space-y-2 text-sm">
                    {Object.entries(customFields).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2">
                        <FileText className="h-3 w-3 text-muted-foreground mt-1" />
                        <div className="flex-1">
                          <span className="text-muted-foreground">{formatFieldKey(key)}:</span>
                          <span className="ml-2 font-medium">{formatFieldValue(value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Activity Timeline */}
            <div className="overflow-hidden flex flex-col">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">
                Activity Timeline
              </h3>
              {activities.length === 0 ? (
                <p className="text-muted-foreground text-sm">No activity recorded</p>
              ) : (
                <div className="relative pl-6 space-y-4">
                  {/* Timeline line */}
                  <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />
                  
                  {activities.map((activity, index) => (
                    <div key={index} className="relative flex items-start gap-3">
                      {/* Timeline dot */}
                      <div className={`absolute -left-6 mt-1 h-4 w-4 rounded-full ${typeColors[activity.type]} flex items-center justify-center`}>
                        <div className="text-white scale-75">
                          {activity.icon}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{activity.label}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(activity.date).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
