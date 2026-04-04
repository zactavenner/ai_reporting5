import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface QuizContactData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface QuizContactFormProps {
  onSubmit: (data: QuizContactData) => void;
}

export function QuizContactForm({ onSubmit }: QuizContactFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ firstName, lastName, email, phone });
  };

  return (
    <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
      <h2 className="text-xl font-bold text-center mb-4">Your Information</h2>
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
        <Input placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
      </div>
      <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
      <Input type="tel" placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} required />
      <Button type="submit" className="w-full h-12 text-base font-semibold">Continue</Button>
    </motion.form>
  );
}
