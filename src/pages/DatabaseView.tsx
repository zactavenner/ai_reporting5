import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Filter, Users, Phone, TrendingUp, Mail, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { useClients } from '@/hooks/useClients';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/exportUtils';

const PAGE_SIZE = 150;

export default function DatabaseView() {
  const navigate = useNavigate();
  const { startDate, endDate } = useDateFilter();
  const { data: clients = [] } = useClients();
  const [activeTab, setActiveTab] = useState('leads');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [exportType, setExportType] = useState<'all' | 'emails' | 'phones'>('all');

  // Fetch all leads across all clients
  const { data: allLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['all-leads', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .gte('created_at', startDate)
        .lt('created_at', `${endDate}T24:00:00`)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all calls across all clients
  const { data: allCalls = [], isLoading: callsLoading } = useQuery({
    queryKey: ['all-calls', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('*, leads(name, email, phone)')
        .gte('created_at', startDate)
        .lt('created_at', `${endDate}T24:00:00`)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all showed calls
  const showedCalls = useMemo(() => allCalls.filter(c => c.showed), [allCalls]);

  // Fetch all funded investors (no date filter - shows all imported records)
  const { data: allFunded = [], isLoading: fundedLoading } = useQuery({
    queryKey: ['all-funded'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('funded_investors')
        .select('*, leads(name, email, phone)')
        .order('funded_at', { ascending: false })
        .limit(5000);
      
      if (error) throw error;
      return data || [];
    },
  });

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || 'Unknown';
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchQuery('');
  };

  // Filter data
  const filteredLeads = useMemo(() => {
    if (!searchQuery) return allLeads;
    const query = searchQuery.toLowerCase();
    return allLeads.filter((lead) =>
      (lead.name?.toLowerCase().includes(query)) ||
      (lead.email?.toLowerCase().includes(query)) ||
      (lead.phone?.includes(query))
    );
  }, [allLeads, searchQuery]);

  const filteredCalls = useMemo(() => {
    if (!searchQuery) return allCalls;
    const query = searchQuery.toLowerCase();
    return allCalls.filter((call) =>
      (call.leads?.name?.toLowerCase().includes(query)) ||
      (call.outcome?.toLowerCase().includes(query))
    );
  }, [allCalls, searchQuery]);

  const filteredShowedCalls = useMemo(() => {
    if (!searchQuery) return showedCalls;
    const query = searchQuery.toLowerCase();
    return showedCalls.filter((call) =>
      (call.leads?.name?.toLowerCase().includes(query)) ||
      (call.outcome?.toLowerCase().includes(query))
    );
  }, [showedCalls, searchQuery]);

  const filteredFunded = useMemo(() => {
    if (!searchQuery) return allFunded;
    const query = searchQuery.toLowerCase();
    return allFunded.filter((f) =>
      (f.name?.toLowerCase().includes(query)) ||
      (f.leads?.email?.toLowerCase().includes(query))
    );
  }, [allFunded, searchQuery]);

  // Get current data based on tab
  const getCurrentData = () => {
    switch (activeTab) {
      case 'leads': return filteredLeads;
      case 'calls': return filteredCalls;
      case 'showed': return filteredShowedCalls;
      case 'funded': return filteredFunded;
      default: return [];
    }
  };

  const currentData = getCurrentData();
  const totalPages = Math.ceil(currentData.length / PAGE_SIZE);
  const paginatedData = currentData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleExport = () => {
    const data = getCurrentData();
    let exportData: any[] = [];

    if (exportType === 'emails') {
      if (activeTab === 'leads') {
        exportData = data.filter((l: any) => l.email).map((l: any) => ({ email: l.email, name: l.name }));
      } else if (activeTab === 'funded') {
        exportData = data.filter((f: any) => f.leads?.email).map((f: any) => ({ email: f.leads?.email, name: f.name }));
      }
    } else if (exportType === 'phones') {
      if (activeTab === 'leads') {
        exportData = data.filter((l: any) => l.phone).map((l: any) => ({ phone: l.phone, name: l.name }));
      } else if (activeTab === 'calls') {
        exportData = data.filter((c: any) => c.leads?.phone).map((c: any) => ({ phone: c.leads?.phone, name: c.leads?.name }));
      }
    } else {
      exportData = data;
    }

    exportToCSV(exportData, `database-${activeTab}-${exportType}`);
  };

  const isLoading = leadsLoading || callsLoading || fundedLoading;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-2 border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
          <ThemeToggle />
        </div>
        <div className="mt-4">
          <h1 className="text-2xl font-bold">📊 Database</h1>
          <p className="text-sm text-muted-foreground">Aggregated records across all clients</p>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <DateRangeFilter showAddClient={false} />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-chart-1" />
                <span className="text-sm text-muted-foreground">Total Leads</span>
              </div>
              <p className="text-3xl font-bold tabular-nums mt-1">{allLeads.length.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-chart-2" />
                <span className="text-sm text-muted-foreground">Total Calls</span>
              </div>
              <p className="text-3xl font-bold tabular-nums mt-1">{allCalls.length.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-chart-3" />
                <span className="text-sm text-muted-foreground">Showed Calls</span>
              </div>
              <p className="text-3xl font-bold tabular-nums mt-1">{showedCalls.length.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-chart-4" />
                <span className="text-sm text-muted-foreground">Funded</span>
              </div>
              <p className="text-3xl font-bold tabular-nums mt-1">{allFunded.length.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Records Table */}
        <Card className="border-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-lg">All Records</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={exportType} onValueChange={(v: any) => setExportType(v)}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Info</SelectItem>
                    <SelectItem value="emails">Emails Only</SelectItem>
                    <SelectItem value="phones">Phones Only</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="mb-4">
                <TabsTrigger value="leads" className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Leads ({allLeads.length})
                </TabsTrigger>
                <TabsTrigger value="calls" className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  Calls ({allCalls.length})
                </TabsTrigger>
                <TabsTrigger value="showed" className="flex items-center gap-1">
                  <PhoneCall className="h-4 w-4" />
                  Showed ({showedCalls.length})
                </TabsTrigger>
                <TabsTrigger value="funded" className="flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  Funded ({allFunded.length})
                </TabsTrigger>
              </TabsList>

              {/* Search */}
              <div className="flex items-center gap-2 mb-4">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search records..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="max-w-sm"
                />
                <span className="text-sm text-muted-foreground">
                  Showing {paginatedData.length} of {currentData.length}
                </span>
              </div>

              {isLoading ? (
                <CashBagLoader message="Loading records..." />
              ) : (
                <>
                  {/* Leads Tab */}
                  <TabsContent value="leads" className="mt-0">
                    <ScrollArea className="h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2">
                            <TableHead>Client</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((lead: any) => (
                            <TableRow key={lead.id} className="hover:bg-muted/50">
                              <TableCell><Badge variant="outline">{getClientName(lead.client_id)}</Badge></TableCell>
                              <TableCell className="font-mono text-sm tabular-nums">
                                {new Date(lead.created_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="font-medium">{lead.name || 'Unknown'}</TableCell>
                              <TableCell>{lead.email || '-'}</TableCell>
                              <TableCell>{lead.phone || '-'}</TableCell>
                              <TableCell>{lead.source}</TableCell>
                              <TableCell>
                                {lead.is_spam ? (
                                  <Badge variant="destructive">Spam</Badge>
                                ) : (
                                  <Badge className="bg-green-600">{lead.status || 'new'}</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  {/* Calls Tab */}
                  <TabsContent value="calls" className="mt-0">
                    <ScrollArea className="h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2">
                            <TableHead>Client</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Type</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((call: any) => (
                            <TableRow key={call.id} className="hover:bg-muted/50">
                              <TableCell><Badge variant="outline">{getClientName(call.client_id)}</Badge></TableCell>
                              <TableCell className="font-mono text-sm tabular-nums">
                                {call.scheduled_at ? new Date(call.scheduled_at).toLocaleString() : '-'}
                              </TableCell>
                              <TableCell className="font-medium">{call.leads?.name || 'Unknown'}</TableCell>
                              <TableCell>{call.leads?.phone || '-'}</TableCell>
                              <TableCell>
                                {call.showed ? (
                                  <Badge className="bg-green-600">Showed</Badge>
                                ) : (
                                  <Badge variant="secondary">No Show</Badge>
                                )}
                              </TableCell>
                              <TableCell>{call.outcome || '-'}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{call.is_reconnect ? 'Reconnect' : 'Initial'}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  {/* Showed Calls Tab */}
                  <TabsContent value="showed" className="mt-0">
                    <ScrollArea className="h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2">
                            <TableHead>Client</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Summary</TableHead>
                            <TableHead>Quality</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((call: any) => (
                            <TableRow key={call.id} className="hover:bg-muted/50">
                              <TableCell><Badge variant="outline">{getClientName(call.client_id)}</Badge></TableCell>
                              <TableCell className="font-mono text-sm tabular-nums">
                                {call.scheduled_at ? new Date(call.scheduled_at).toLocaleString() : '-'}
                              </TableCell>
                              <TableCell className="font-medium">{call.leads?.name || 'Unknown'}</TableCell>
                              <TableCell>{call.leads?.phone || '-'}</TableCell>
                              <TableCell>{call.outcome || '-'}</TableCell>
                              <TableCell className="max-w-xs truncate">{call.summary || '-'}</TableCell>
                              <TableCell>
                                {call.quality_score ? (
                                  <Badge variant={call.quality_score >= 7 ? 'default' : 'secondary'}>
                                    {call.quality_score}/10
                                  </Badge>
                                ) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  {/* Funded Tab */}
                  <TabsContent value="funded" className="mt-0">
                    <ScrollArea className="h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2">
                            <TableHead>Client</TableHead>
                            <TableHead>Funded Date</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Days to Fund</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((investor: any) => (
                            <TableRow key={investor.id} className="hover:bg-muted/50">
                              <TableCell><Badge variant="outline">{getClientName(investor.client_id)}</Badge></TableCell>
                              <TableCell className="font-mono text-sm tabular-nums">
                                {new Date(investor.funded_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="font-medium">{investor.name || 'Unknown'}</TableCell>
                              <TableCell>{investor.leads?.email || '-'}</TableCell>
                              <TableCell>{investor.leads?.phone || '-'}</TableCell>
                              <TableCell className="text-right font-mono text-chart-2 tabular-nums">
                                ${Number(investor.funded_amount).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">
                                {investor.time_to_fund_days || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>
                </>
              )}
            </Tabs>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
