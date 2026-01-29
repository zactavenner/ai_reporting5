import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Loader2 } from 'lucide-react';
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
  const [isLoggingIn, setIsLoggingIn] = useState<string | null>(null);

  const handleMemberClick = async (member: typeof members[0]) => {
    setIsLoggingIn(member.id);
    try {
      await login({
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
      });
      toast.success(`Welcome back, ${member.name}!`);
      onSuccess();
    } catch (err) {
      toast.error('Failed to sign in. Please try again.');
    } finally {
      setIsLoggingIn(null);
    }
  };

  return (
    <Card className="w-full max-w-md border-2 border-border">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <User className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Who's logging in?</CardTitle>
        <CardDescription>Click your name to continue</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Responsive grid of name buttons */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {members.map(member => (
            <Button
              key={member.id}
              variant="outline"
              className="h-auto py-3 px-4 flex flex-col items-center gap-1"
              onClick={() => handleMemberClick(member)}
              disabled={!!isLoggingIn}
            >
              {isLoggingIn === member.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span className="font-medium">{member.name}</span>
                  {member.role === 'admin' && (
                    <Badge variant="secondary" className="text-xs">Admin</Badge>
                  )}
                </>
              )}
            </Button>
          ))}
        </div>

        {/* Separator + Skip */}
        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            or
          </span>
        </div>

        <Button 
          variant="ghost" 
          className="w-full" 
          onClick={onSkip}
          disabled={!!isLoggingIn}
        >
          Skip - Continue as Guest
        </Button>
      </CardContent>
    </Card>
  );
}
