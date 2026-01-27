import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lock, LogOut, User } from 'lucide-react';
import { TeamMemberLogin } from './TeamMemberLogin';
import { TeamMemberProvider, useTeamMember } from '@/contexts/TeamMemberContext';

const CORRECT_PASSWORD = 'HPA';
const SESSION_KEY = 'dashboard_auth';

interface PasswordGateProps {
  children: React.ReactNode;
}

function PasswordGateContent({ children }: PasswordGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showTeamLogin, setShowTeamLogin] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const { currentMember, logout } = useTeamMember();

  useEffect(() => {
    // Check if already authenticated in this session
    const storedAuth = sessionStorage.getItem(SESSION_KEY);
    if (storedAuth === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === CORRECT_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setIsAuthenticated(true);
      setShowTeamLogin(true);
      setError('');
    } else {
      setError('Incorrect password');
      setPassword('');
    }
  };

  const handleTeamLoginSuccess = () => {
    setShowTeamLogin(false);
  };

  const handleTeamLoginSkip = () => {
    setShowTeamLogin(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Show team login after main password
  if (isAuthenticated && showTeamLogin && !currentMember) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <TeamMemberLogin onSkip={handleTeamLoginSkip} onSuccess={handleTeamLoginSuccess} />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="relative">
        {/* Team member header badge */}
        {currentMember && (
          <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-card border-2 border-border px-3 py-2 rounded-lg shadow-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{currentMember.name}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 ml-1"
              onClick={logout}
              title="Sign out"
            >
              <LogOut className="h-3 w-3" />
            </Button>
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-2 border-border">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Capital Raising Dashboard</CardTitle>
          <CardDescription>Enter password to access the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={error ? 'border-destructive' : ''}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive mt-2">{error}</p>
              )}
            </div>
            <Button type="submit" className="w-full">
              Access Dashboard
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function PasswordGate({ children }: PasswordGateProps) {
  return (
    <TeamMemberProvider>
      <PasswordGateContent>{children}</PasswordGateContent>
    </TeamMemberProvider>
  );
}
