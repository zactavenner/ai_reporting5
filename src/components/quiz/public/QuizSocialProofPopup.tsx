import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SOCIAL_PROOF_MESSAGES = [
  'John from Texas just qualified',
  'Sarah from California started the quiz',
  'Michael from New York just qualified',
  'Emily from Florida completed the quiz',
];

export function QuizSocialProofPopup() {
  const [visible, setVisible] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
      setTimeout(() => setVisible(false), 4000);
    }, 5000 + Math.random() * 5000);

    const interval = setInterval(() => {
      setMessageIndex(i => (i + 1) % SOCIAL_PROOF_MESSAGES.length);
      setVisible(true);
      setTimeout(() => setVisible(false), 4000);
    }, 15000);

    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-4 left-4 z-50 bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-sm"
        >
          <p className="text-foreground font-medium">{SOCIAL_PROOF_MESSAGES[messageIndex]}</p>
          <p className="text-xs text-muted-foreground">Just now</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
