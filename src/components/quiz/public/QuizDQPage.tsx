import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { XCircle } from 'lucide-react';

interface QuizDQPageProps {
  brandName: string;
  brandLogoUrl?: string | null;
  onSubmit: (data: { firstName: string; lastName: string; email: string; phone: string }) => void;
}

export function QuizDQPage({ brandName, brandLogoUrl, onSubmit }: QuizDQPageProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ firstName, lastName, email, phone });
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center space-y-6">
        <div className="rounded-full bg-destructive/10 p-4 w-fit mx-auto">
          <XCircle className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">We're Sorry</h1>
        <p className="text-muted-foreground">Based on your responses, this opportunity may not be the right fit at this time.</p>
        
        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-3 text-left">
            <p className="text-sm text-muted-foreground text-center">Leave your info and we'll notify you of future opportunities:</p>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} />
              <Input placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
            <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <Input type="tel" placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
            <Button type="submit" className="w-full">Stay Updated</Button>
          </form>
        ) : (
          <p className="text-sm text-primary font-medium">Thank you! We'll keep you informed.</p>
        )}
      </motion.div>
    </div>
  );
}
