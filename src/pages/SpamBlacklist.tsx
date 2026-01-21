import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Shield, Mail, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { 
  useSpamBlacklist, 
  useAddToBlacklist, 
  useRemoveFromBlacklist,
  useSpamLeads 
} from '@/hooks/useSpamBlacklist';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function SpamBlacklist() {
  const navigate = useNavigate();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newType, setNewType] = useState('email_domain');
  const [newValue, setNewValue] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newIp, setNewIp] = useState('');

  const { data: blacklist = [], isLoading } = useSpamBlacklist();
  const { data: spamLeads = [], isLoading: leadsLoading } = useSpamLeads();
  const addToBlacklist = useAddToBlacklist();
  const removeFromBlacklist = useRemoveFromBlacklist();

  const handleAdd = () => {
    if (!newValue.trim()) return;
    addToBlacklist.mutate({
      type: newType,
      value: newValue.trim(),
      reason: newReason.trim() || undefined,
      ip_address: newIp.trim() || undefined,
    }, {
      onSuccess: () => {
        setNewValue('');
        setNewReason('');
        setNewIp('');
        setAddDialogOpen(false);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CashBagLoader message="Loading blacklist..." />
      </div>
    );
  }

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
        <div className="mt-4 flex items-center gap-3">
          <Shield className="h-6 w-6 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold">Spam & Blacklist Management</h1>
            <p className="text-sm text-muted-foreground">
              Manage blocked email domains, IP addresses, and view spam leads
            </p>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-7xl mx-auto">
        <Tabs defaultValue="blacklist">
          <TabsList>
            <TabsTrigger value="blacklist">Blacklist ({blacklist.length})</TabsTrigger>
            <TabsTrigger value="spam-leads">Spam Leads ({spamLeads.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="blacklist" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">
                Email domains and IP addresses that will auto-mark leads as spam
              </p>
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add to Blacklist
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add to Blacklist</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <label className="text-sm font-medium">Type</label>
                      <Select value={newType} onValueChange={setNewType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email_domain">Email Domain</SelectItem>
                          <SelectItem value="ip_address">IP Address</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        {newType === 'email_domain' ? 'Domain (e.g., spam.com)' : 'IP Address'}
                      </label>
                      <Input 
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder={newType === 'email_domain' ? 'example.com' : '192.168.1.1'}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Reason (optional)</label>
                      <Input 
                        value={newReason}
                        onChange={(e) => setNewReason(e.target.value)}
                        placeholder="Known spam domain"
                      />
                    </div>
                    {newType === 'email_domain' && (
                      <div>
                        <label className="text-sm font-medium">Associated IP (optional)</label>
                        <Input 
                          value={newIp}
                          onChange={(e) => setNewIp(e.target.value)}
                          placeholder="IP address if known"
                        />
                      </div>
                    )}
                    <Button 
                      onClick={handleAdd} 
                      className="w-full"
                      disabled={!newValue.trim() || addToBlacklist.isPending}
                    >
                      Add to Blacklist
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="border-2 border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2">
                    <TableHead className="font-bold">Type</TableHead>
                    <TableHead className="font-bold">Value</TableHead>
                    <TableHead className="font-bold">Reason</TableHead>
                    <TableHead className="font-bold">IP Address</TableHead>
                    <TableHead className="font-bold">Added</TableHead>
                    <TableHead className="font-bold w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blacklist.map((entry) => (
                    <TableRow key={entry.id} className="border-b">
                      <TableCell>
                        <Badge variant={entry.type === 'email_domain' ? 'secondary' : 'outline'}>
                          {entry.type === 'email_domain' ? (
                            <><Mail className="h-3 w-3 mr-1" /> Domain</>
                          ) : (
                            <><Globe className="h-3 w-3 mr-1" /> IP</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">{entry.value}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.reason || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{entry.ip_address || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeFromBlacklist.mutate(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {blacklist.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No entries in blacklist
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="spam-leads" className="space-y-4">
            <p className="text-muted-foreground">
              Leads that have been automatically marked as spam based on blacklist rules
            </p>
            
            {leadsLoading ? (
              <div className="flex justify-center py-8">
                <CashBagLoader message="Loading spam leads..." />
              </div>
            ) : (
              <div className="border-2 border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-2">
                      <TableHead className="font-bold">Name</TableHead>
                      <TableHead className="font-bold">Email</TableHead>
                      <TableHead className="font-bold">Phone</TableHead>
                      <TableHead className="font-bold">Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spamLeads.map((lead) => (
                      <TableRow key={lead.id} className="border-b">
                        <TableCell>{lead.name || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">{lead.email || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">{lead.phone || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(lead.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {spamLeads.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No spam leads found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
