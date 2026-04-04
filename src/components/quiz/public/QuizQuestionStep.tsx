import { motion } from 'framer-motion';

interface QuizQuestionStepProps {
  question: string;
  subtext?: string;
  options: string[];
  selectedValue: string;
  onSelect: (value: string) => void;
}

export function QuizQuestionStep({ question, subtext, options, selectedValue, onSelect }: QuizQuestionStepProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-lg">
      <h2 className="text-xl md:text-2xl font-bold text-center mb-2">{question}</h2>
      {subtext && <p className="text-sm text-muted-foreground text-center mb-6">{subtext}</p>}
      <div className="space-y-3 mt-6">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={`w-full px-5 py-4 rounded-xl border text-left text-sm font-medium transition-all ${
              selectedValue === option
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:border-primary/40 hover:bg-muted/50'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
