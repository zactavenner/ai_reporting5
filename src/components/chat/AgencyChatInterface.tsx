import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Send, 
  Trash2, 
  Sparkles, 
  Mic, 
  MicOff,
  Paperclip,
  ChevronDown,
  Loader2,
  FileText,
  Image as ImageIcon,
  Film,
  MessageSquare,
  MoreVertical,
  Pencil,
  Check,
  X,
  ListTodo,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  useConversations, 
  useConversationMessages, 
  useCreateConversation,
  useDeleteConversation,
  useUpdateConversation,
  useAddMessage,
  ChatConversation,
} from '@/hooks/useChatConversations';
import { useAllTasks, useCreateTask, Task } from '@/hooks/useTasks';
import { Client } from '@/hooks/useClients';
import { AggregatedMetrics } from '@/hooks/useMetrics';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { toast } from 'sonner';

type AIModel = 'gemini' | 'openai';

interface AgencyChatInterfaceProps {
  clients: Client[];
  clientMetrics: Record<string, AggregatedMetrics>;
  agencyMetrics: AggregatedMetrics;
}

const modelLabels: Record<AIModel, string> = {
  gemini: 'Gemini 3 Flash',
  openai: 'GPT-5',
};

const quickQuestions = [
  "Which client needs immediate attention?",
  "Compare all clients' CPL performance",
  "What's the agency-wide conversion rate?",
  "Summarize all overdue tasks",
];

export function AgencyChatInterface({ clients, clientMetrics, agencyMetrics }: AgencyChatInterfaceProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<AIModel>('gemini');
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [editingConvoId, setEditingConvoId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  
  const { data: conversations = [] } = useConversations(undefined, 'agency');
  const { data: messages = [] } = useConversationMessages(selectedConversationId || undefined);
  const { data: allTasks = [] } = useAllTasks();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const updateConversation = useUpdateConversation();
  const addMessage = useAddMessage();
  const createTask = useCreateTask();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-select first conversation
  useEffect(() => {
    if (conversations.length > 0 && !selectedConversationId) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Build context for all clients + tasks
  const buildContext = useCallback(() => {
    const clientSummaries = clients.map(client => {
      const metrics = clientMetrics[client.id];
      if (!metrics) return null;
      return {
        name: client.name,
        id: client.id,
        status: client.status,
        adSpend: metrics.totalAdSpend,
        leads: metrics.totalLeads,
        calls: metrics.totalCalls,
        showedCalls: metrics.showedCalls,
        costPerLead: metrics.costPerLead,
        costPerCall: metrics.costPerCall,
        fundedInvestors: metrics.fundedInvestors,
        fundedDollars: metrics.fundedDollars,
        costOfCapital: metrics.costOfCapital,
      };
    }).filter(Boolean);

    // Add task summaries
    const taskSummaries = allTasks.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.due_date,
      clientId: task.client_id,
    }));

    return {
      agencyTotals: {
        totalAdSpend: agencyMetrics.totalAdSpend,
        totalLeads: agencyMetrics.totalLeads,
        totalCalls: agencyMetrics.totalCalls,
        showedCalls: agencyMetrics.showedCalls,
        costPerLead: agencyMetrics.costPerLead,
        costPerCall: agencyMetrics.costPerCall,
        fundedInvestors: agencyMetrics.fundedInvestors,
        fundedDollars: agencyMetrics.fundedDollars,
        costOfCapital: agencyMetrics.costOfCapital,
      },
      clients: clientSummaries,
      tasks: taskSummaries,
    };
  }, [clients, clientMetrics, agencyMetrics, allTasks]);

  const handleNewConversation = async () => {
    const newConvo = await createConversation.mutateAsync({ type: 'agency' });
    setSelectedConversationId(newConvo.id);
  };

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation.mutateAsync(id);
    if (selectedConversationId === id) {
      setSelectedConversationId(conversations.find(c => c.id !== id)?.id || null);
    }
  };

  const handleStartEditTitle = (convo: ChatConversation) => {
    setEditingConvoId(convo.id);
    setEditingTitle(convo.title);
  };

  const handleSaveTitle = async () => {
    if (editingConvoId && editingTitle.trim()) {
      await updateConversation.mutateAsync({ id: editingConvoId, title: editingTitle.trim() });
    }
    setEditingConvoId(null);
    setEditingTitle('');
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    
    let conversationId = selectedConversationId;
    
    // Create new conversation if none selected
    if (!conversationId) {
      const newConvo = await createConversation.mutateAsync({ 
        type: 'agency',
        title: input.slice(0, 50) + (input.length > 50 ? '...' : ''),
      });
      conversationId = newConvo.id;
      setSelectedConversationId(conversationId);
    }
    
    const message = input.trim();
    const context = buildContext();
    
    setInput('');
    setAttachments([]);
    setIsLoading(true);
    setStreamingContent('');
    
    // Save user message
    await addMessage.mutateAsync({
      conversationId,
      role: 'user',
      content: message,
    });
    
    try {
      // Build message history for context
      const messageHistory = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
      ];

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-analysis`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: messageHistory,
            context: {
              isAgencyLevel: true,
              canCreateTasks: true,
              ...context,
            },
            model,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        if (response.status === 402) {
          throw new Error('AI credits exhausted. Please add more credits.');
        }
        throw new Error('Failed to get AI response');
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let assistantContent = '';

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
            if (content) {
              assistantContent += content;
              setStreamingContent(assistantContent);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }
      
      // Save assistant message
      await addMessage.mutateAsync({
        conversationId,
        role: 'assistant',
        content: assistantContent,
      });
      
      // Check if AI wants to create a task
      const taskMatch = assistantContent.match(/\[CREATE_TASK\]([\s\S]*?)\[\/CREATE_TASK\]/);
      if (taskMatch) {
        try {
          const taskData = JSON.parse(taskMatch[1]);
          await createTask.mutateAsync({
            title: taskData.title,
            description: taskData.description,
            priority: taskData.priority || 'medium',
            client_id: taskData.clientId || null,
            due_date: taskData.dueDate || null,
            status: 'todo',
            stage: 'backlog',
          });
          toast.success(`Task created: ${taskData.title}`);
        } catch (e) {
          console.error('Failed to parse task creation:', e);
        }
      }
      
      setStreamingContent('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      await addMessage.mutateAsync({
        conversationId: conversationId!,
        role: 'assistant',
        content: `Error: ${errorMessage}`,
      });
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickQuestion = async (question: string) => {
    if (isLoading) return;
    setInput(question);
    setTimeout(() => handleSend(), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          
          try {
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                },
                body: JSON.stringify({ audio: base64Audio }),
              }
            );
            
            if (response.ok) {
              const { text } = await response.json();
              if (text) {
                setInput(prev => prev ? `${prev} ${text}` : text);
              }
            }
          } catch (error) {
            console.error('Transcription failed:', error);
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <ImageIcon className="h-3 w-3" />;
    if (file.type.startsWith('video/')) return <Film className="h-3 w-3" />;
    if (file.type.startsWith('audio/')) return <Mic className="h-3 w-3" />;
    return <FileText className="h-3 w-3" />;
  };

  // Combined messages with streaming
  const displayMessages = streamingContent 
    ? [...messages, { id: 'streaming', role: 'assistant', content: streamingContent, created_at: new Date().toISOString(), conversation_id: selectedConversationId || '' }]
    : messages;

  return (
    <div className="flex h-[500px] border-2 border-border rounded-lg overflow-hidden bg-card">
      {/* Sidebar - Conversation History */}
      <div className="w-64 border-r border-border flex flex-col bg-muted/30">
        <div className="p-3 border-b border-border">
          <Button onClick={handleNewConversation} className="w-full" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No conversations yet
              </p>
            ) : (
              conversations.map(convo => (
                <div
                  key={convo.id}
                  className={cn(
                    'group flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-muted transition-colors',
                    selectedConversationId === convo.id && 'bg-muted'
                  )}
                  onClick={() => setSelectedConversationId(convo.id)}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    {editingConvoId === convo.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="h-6 text-xs"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') handleSaveTitle();
                            if (e.key === 'Escape') setEditingConvoId(null);
                          }}
                        />
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); handleSaveTitle(); }}>
                          <Check className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium truncate">{convo.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(convo.updated_at), 'MMM d')}
                        </p>
                      </>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStartEditTitle(convo); }}>
                        <Pencil className="h-3 w-3 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDeleteConversation(convo.id); }}
                      >
                        <Trash2 className="h-3 w-3 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-semibold">Agency AI</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1">
                {modelLabels[model]}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setModel('gemini')}>
                Gemini 3 Flash
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setModel('openai')}>
                GPT-5
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {displayMessages.length === 0 && !selectedConversationId ? (
            <div className="space-y-4">
              <div className="text-center">
                <Sparkles className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Agency AI Assistant</h3>
                <p className="text-sm text-muted-foreground">
                  Ask about clients, metrics, tasks, or create new tasks with AI.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-6">
                {quickQuestions.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-2 px-3 whitespace-normal text-left"
                    onClick={() => handleQuickQuestion(q)}
                    disabled={isLoading}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Start a conversation...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] px-4 py-2 rounded-2xl text-sm',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted text-foreground rounded-bl-md'
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown>
                          {msg.content.replace(/\[CREATE_TASK\][\s\S]*?\[\/CREATE_TASK\]/g, '')}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && !streamingContent && (
                <div className="flex justify-start">
                  <div className="bg-muted px-4 py-2 rounded-2xl rounded-bl-md">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div className="px-4 py-2 border-t border-border">
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, i) => (
                <div key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
                  {getFileIcon(file)}
                  <span className="max-w-20 truncate">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4"
                    onClick={() => handleRemoveAttachment(i)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.txt"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant={isRecording ? 'destructive' : 'ghost'}
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about clients, tasks, or create tasks..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={((!input.trim() && attachments.length === 0) || isLoading)}
              size="icon"
              className="h-10 w-10 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
