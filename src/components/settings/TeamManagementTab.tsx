import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Pencil, Trash2, Users, Loader2 } from 'lucide-react';
import { useAgencyPods, useCreatePod, useUpdatePod, useDeletePod, useUpdateMemberPod, AgencyPod } from '@/hooks/useAgencyPods';
import { useAgencyMembers, useAddAgencyMember, AgencyMember } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const PRESET_COLORS = [
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#84cc16', // Lime
];

export function TeamManagementTab() {
  const { data: pods = [], isLoading: loadingPods } = useAgencyPods();
  const { data: members = [], isLoading: loadingMembers } = useAgencyMembers();
  const createPod = useCreatePod();
  const updatePod = useUpdatePod();
  const deletePod = useDeletePod();
  const addMember = useAddAgencyMember();
  const updateMemberPod = useUpdateMemberPod();
  const queryClient = useQueryClient();

  const [showAddPod, setShowAddPod] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingPod, setEditingPod] = useState<AgencyPod | null>(null);
  const [editingMember, setEditingMember] = useState<AgencyMember | null>(null);
  
  // Pod form state
  const [podName, setPodName] = useState('');
  const [podDescription, setPodDescription] = useState('');
  const [podColor, setPodColor] = useState(PRESET_COLORS[0]);
  
  // Member form state
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('member');
  const [memberPodId, setMemberPodId] = useState<string>('');

  // Count members per pod
  const memberCountByPod = members.reduce((acc, member) => {
    const podId = (member as any).pod_id || 'unassigned';
    acc[podId] = (acc[podId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleCreatePod = async () => {
    if (!podName.trim()) return;
    await createPod.mutateAsync({
      name: podName.trim(),
      description: podDescription.trim() || undefined,
      color: podColor,
    });
    setPodName('');
    setPodDescription('');
    setPodColor(PRESET_COLORS[0]);
    setShowAddPod(false);
  };

  const handleUpdatePod = async () => {
    if (!editingPod || !podName.trim()) return;
    await updatePod.mutateAsync({
      id: editingPod.id,
      name: podName.trim(),
      description: podDescription.trim() || null,
      color: podColor,
    });
    setEditingPod(null);
    setPodName('');
    setPodDescription('');
  };

  const handleDeletePod = async (podId: string) => {
    if (!confirm('Are you sure? Members in this pod will become unassigned.')) return;
    await deletePod.mutateAsync(podId);
  };

  const handleAddMember = async () => {
    if (!memberName.trim() || !memberEmail.trim()) return;
    await addMember.mutateAsync({
      name: memberName.trim(),
      email: memberEmail.trim(),
      role: memberRole,
    });
    
    // If pod selected, update after creation
    if (memberPodId) {
      // Get the latest members to find the new one
      const { data: newMembers } = await supabase
        .from('agency_members')
        .select('*')
        .eq('email', memberEmail.trim())
        .single();
      
      if (newMembers) {
        await updateMemberPod.mutateAsync({
          memberId: newMembers.id,
          podId: memberPodId,
        });
      }
    }
    
    setMemberName('');
    setMemberEmail('');
    setMemberRole('member');
    setMemberPodId('');
    setShowAddMember(false);
  };

  const handleUpdateMemberPod = async (memberId: string, podId: string | null) => {
    await updateMemberPod.mutateAsync({ memberId, podId });
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) return;
    const { error } = await supabase
      .from('agency_members')
      .delete()
      .eq('id', memberId);
    
    if (error) {
      toast.error('Failed to delete member');
    } else {
      queryClient.invalidateQueries({ queryKey: ['agency-members'] });
      toast.success('Member removed');
    }
  };

  const startEditPod = (pod: AgencyPod) => {
    setEditingPod(pod);
    setPodName(pod.name);
    setPodDescription(pod.description || '');
    setPodColor(pod.color);
  };

  if (loadingPods || loadingMembers) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pods Section */}
      <div className="border-2 border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Pods
            </h4>
            <p className="text-sm text-muted-foreground">
              Organize team members into functional groups
            </p>
          </div>
          <Dialog open={showAddPod} onOpenChange={setShowAddPod}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Pod
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Pod</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Pod Name</Label>
                  <Input
                    value={podName}
                    onChange={(e) => setPodName(e.target.value)}
                    placeholder="e.g., Media Buying"
                  />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Input
                    value={podDescription}
                    onChange={(e) => setPodDescription(e.target.value)}
                    placeholder="What does this pod handle?"
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="flex gap-2 mt-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setPodColor(color)}
                        className={`w-8 h-8 rounded-full border-2 transition-transform ${
                          podColor === color ? 'scale-110 border-foreground' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <Button onClick={handleCreatePod} disabled={!podName.trim() || createPod.isPending} className="w-full">
                  {createPod.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create Pod
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-2">
          {pods.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No pods created yet
            </p>
          ) : (
            pods.map((pod) => (
              <div
                key={pod.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-background"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: pod.color }}
                  />
                  <div>
                    <span className="font-medium">{pod.name}</span>
                    {pod.description && (
                      <p className="text-xs text-muted-foreground">{pod.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {memberCountByPod[pod.id] || 0} members
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEditPod(pod)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeletePod(pod.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit Pod Dialog */}
      <Dialog open={!!editingPod} onOpenChange={(open) => !open && setEditingPod(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pod</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Pod Name</Label>
              <Input
                value={podName}
                onChange={(e) => setPodName(e.target.value)}
                placeholder="e.g., Media Buying"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={podDescription}
                onChange={(e) => setPodDescription(e.target.value)}
                placeholder="What does this pod handle?"
              />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setPodColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      podColor === color ? 'scale-110 border-foreground' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <Button onClick={handleUpdatePod} disabled={!podName.trim() || updatePod.isPending} className="w-full">
              {updatePod.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Members Section */}
      <div className="border-2 border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Team Members</h4>
            <p className="text-sm text-muted-foreground">
              Assign members to pods for organized task management
            </p>
          </div>
          <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="john@agency.com"
                    type="email"
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={memberRole} onValueChange={setMemberRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Assign to Pod</Label>
                  <Select value={memberPodId || 'unassigned'} onValueChange={(val) => setMemberPodId(val === 'unassigned' ? '' : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select pod..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {pods.map((pod) => (
                        <SelectItem key={pod.id} value={pod.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: pod.color }}
                            />
                            {pod.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleAddMember}
                  disabled={!memberName.trim() || !memberEmail.trim() || addMember.isPending}
                  className="w-full"
                >
                  {addMember.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Add Member
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-2">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No team members yet
            </p>
          ) : (
            members.map((member) => {
              const memberPod = pods.find((p) => p.id === (member as any).pod_id);
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-background"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                      {(member.name || 'N/A').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-medium">{member.name || 'Unknown'}</span>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {member.role}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={(member as any).pod_id || 'unassigned'}
                      onValueChange={(val) => handleUpdateMemberPod(member.id, val === 'unassigned' ? null : val)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Unassigned">
                          {memberPod ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: memberPod.color }}
                              />
                              {memberPod.name}
                            </div>
                          ) : (
                            'Unassigned'
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {pods.map((pod) => (
                          <SelectItem key={pod.id} value={pod.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: pod.color }}
                              />
                              {pod.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteMember(member.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
