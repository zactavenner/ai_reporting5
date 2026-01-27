import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, LogIn, SkipForward } from 'lucide-react';
import { useAgencyMembers } from '@/hooks/useTasks';
import { useTeamMember } from '@/contexts/TeamMemberContext';
import { toast } from 'sonner';

interface TeamMemberLoginProps {
  onSkip: () => void;
  onSuccess: () => void;
}

export function TeamMemberLogin({ onSkip, onSuccess }: TeamMemberLoginProps) {
  const { data: members = [] } = useAgencyMembers();
  const { login } = useTeamMember();
  
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const selectedMember = members.find(m => m.id === selectedMemberId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!selectedMember) {
      setError('Please select your name');
      return;
    }
    
    // Password validation: lowercase name
    const expectedPassword = selectedMember.name.toLowerCase();
    
    if (password !== expectedPassword) {
      setError('Incorrect password');
      setPassword('');
      return;
    }
    
    setIsLoggingIn(true);
    try {
      await login({
        id: selectedMember.id,
        name: selectedMember.name,
        email: selectedMember.email,
        role: selectedMember.role,
      });
      toast.success(`Welcome back, ${selectedMember.name}!`);
      onSuccess();
    } catch (err) {
      setError('Failed to sign in. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-2 border-border">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <User className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Team Sign-In</CardTitle>
        <CardDescription>Sign in to track your activity</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Select Your Name</Label>
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose your name..." />
              </SelectTrigger>
              <SelectContent>
                {members.map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={error ? 'border-destructive' : ''}
            />
            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Hint: Your password is your name in lowercase
            </p>
          </div>
          
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onSkip}
            >
              <SkipForward className="h-4 w-4 mr-2" />
              Skip
            </Button>
            <Button 
              type="submit" 
              className="flex-1"
              disabled={!selectedMemberId || !password || isLoggingIn}
            >
              <LogIn className="h-4 w-4 mr-2" />
              {isLoggingIn ? 'Signing in...' : 'Sign In'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}