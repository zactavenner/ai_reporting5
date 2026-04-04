import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SyncOverviewTab } from '@/components/sync-health/SyncOverviewTab';
import { WebhookFeedTab } from '@/components/sync-health/WebhookFeedTab';
import { SyncLogsTab } from '@/components/sync-health/SyncLogsTab';
import { Activity, Radio, ScrollText } from 'lucide-react';

export default function SyncHealthPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sync Health Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor GHL webhooks, sync status, and data pipeline health.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" className="gap-1.5">
              <Activity className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1.5">
              <Radio className="h-4 w-4" /> Webhooks
            </TabsTrigger>
            <TabsTrigger value="sync-logs" className="gap-1.5">
              <ScrollText className="h-4 w-4" /> Sync Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <SyncOverviewTab />
          </TabsContent>
          <TabsContent value="webhooks" className="mt-4">
            <WebhookFeedTab />
          </TabsContent>
          <TabsContent value="sync-logs" className="mt-4">
            <SyncLogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
