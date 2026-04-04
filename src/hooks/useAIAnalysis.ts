import { useState, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface MetricsContext {
  clientName?: string;
  totalAdSpend?: number;
  leads?: number;
  calls?: number;
  showedCalls?: number;
  costPerLead?: number;
  costPerCall?: number;
  costPerShow?: number;
  fundedInvestors?: number;
  fundedDollars?: number;
  costPerInvestor?: number;
  costOfCapital?: number;
  showedPercent?: number;
}

type AIModel = 'gemini' | 'openai';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

export function useAIAnalysis() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (
    input: string, 
    context: MetricsContext,
    existingMessages: Message[],
    model: AIModel = 'gemini',
    files?: File[]
  ) => {
    const userMsg: Message = { role: 'user', content: input };
    const allMessages = [...existingMessages, userMsg];
    setMessages(allMessages);
    setIsLoading(true);

    let assistantContent = '';

    try {
      const fileContents: { name: string; type: string; content: string }[] = [];
      if (files && files.length > 0) {
        for (const file of files) {
          const content = await fileToBase64(file);
          fileContents.push({ name: file.name, type: file.type, content });
        }
      }

      const selectedModel = model === 'openai' ? 'openai/gpt-5' : 'google/gemini-3-flash-preview';

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-analysis`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: allMessages,
            context,
            model: selectedModel,
            files: fileContents,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) throw new Error('Rate limit exceeded.');
        if (response.status === 402) throw new Error('AI credits exhausted.');
        throw new Error('Failed to get AI response');
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      const updateAssistant = (newChunk: string) => {
        assistantContent += newChunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
          }
          return [...prev, { role: 'assistant', content: assistantContent }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) updateAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isLoading, sendMessage, clearMessages };
}
