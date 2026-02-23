import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSpeechToText, useTextToSpeech } from '@/hooks/useSpeech';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, Bot, User, MessageSquare, Mic, MicOff, Volume2, VolumeX, Languages, Check, CheckCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type Message = { role: 'user' | 'assistant'; content: string; timestamp: Date };

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 max-w-[85%]">
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1 items-center h-5">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg, onSpeak, isSpeaking }: { msg: Message; onSpeak: () => void; isSpeaking: boolean }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''} max-w-[85%] ${isUser ? 'ml-auto' : 'mr-auto'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-primary' : 'bg-primary/10'
      }`}>
        {isUser
          ? <User className="h-4 w-4 text-primary-foreground" />
          : <Bot className="h-4 w-4 text-primary" />
        }
      </div>

      {/* Bubble */}
      <div className="flex flex-col gap-1">
        <div className={`relative px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md'
            : 'bg-card border border-border text-card-foreground rounded-2xl rounded-bl-md'
        }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Timestamp + status */}
        <div className={`flex items-center gap-1 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
          {isUser && <CheckCheck className="h-3 w-3 text-primary/70" />}
          {!isUser && (
            <button
              onClick={onSpeak}
              className="text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              {isSpeaking
                ? <VolumeX className="h-3 w-3" />
                : <Volume2 className="h-3 w-3" />
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AIChat() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [cases, setCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState(searchParams.get('case') || '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stt = useSpeechToText();
  const tts = useTextToSpeech();

  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    supabase.from('cases').select('id, title').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setCases(data); });
  }, []);

  // Load chat history when case changes
  useEffect(() => {
    if (!selectedCase) { setMessages([]); return; }
    setHistoryLoading(true);
    supabase
      .from('chat_logs')
      .select('content, role, created_at')
      .eq('case_id', selectedCase)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data?.length) {
          setMessages(data.map((d: any) => ({
            role: d.role as 'user' | 'assistant',
            content: d.content,
            timestamp: new Date(d.created_at),
          })));
        } else {
          setMessages([]);
        }
        setHistoryLoading(false);
      });
  }, [selectedCase]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (stt.transcript) setInput(stt.transcript);
  }, [stt.transcript]);

  useEffect(() => {
    tts.setLang(stt.lang);
  }, [stt.lang]);

  const toggleListening = () => {
    if (stt.isListening) stt.stopListening();
    else stt.startListening();
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedCase || loading) return;
    const userMsg: Message = { role: 'user', content: input.trim(), timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    stt.resetTranscript();
    if (stt.isListening) stt.stopListening();
    setLoading(true);

    try {
      const ollamaRaw = localStorage.getItem('dip-ollama-settings');
      const ollamaSettings = ollamaRaw ? JSON.parse(ollamaRaw) : {};
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          caseId: selectedCase,
          ollamaUrl: ollamaSettings.url,
          ollamaModel: ollamaSettings.model,
        }),
      });

      if (!resp.ok || !resp.body) throw new Error('AI request failed');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let assistantSoFar = '';
      const assistantTimestamp = new Date();

      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
          }
          return [...prev, { role: 'assistant', content: assistantSoFar, timestamp: assistantTimestamp }];
        });
      };

      let streamDone = false;
      while (!streamDone) {
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
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (autoSpeak && assistantSoFar) tts.speak(assistantSoFar);

      if (user && assistantSoFar) {
        await supabase.from('chat_logs').insert([
          { case_id: selectedCase, user_id: user.id, content: userMsg.content, role: 'user' },
          { case_id: selectedCase, user_id: user.id, content: assistantSoFar, role: 'assistant' },
        ] as any);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + (err.message || 'Failed to get response'), timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border rounded-t-lg gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">AI Investigation Analyst</h1>
            <p className="text-[11px] text-muted-foreground">
              {loading ? '● typing...' : '● online'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={stt.lang} onValueChange={(v: any) => stt.setLang(v)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <Languages className="h-3.5 w-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stt.LANG_OPTIONS.map(l => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={autoSpeak ? 'default' : 'outline'}
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  if (tts.isSpeaking) tts.stop();
                  setAutoSpeak(!autoSpeak);
                }}
              >
                {autoSpeak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{autoSpeak ? 'Auto-speak ON' : 'Auto-speak OFF'}</TooltipContent>
          </Tooltip>

          <Select value={selectedCase} onValueChange={setSelectedCase}>
            <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="Select case..." /></SelectTrigger>
            <SelectContent>
              {cases.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Chat area with subtle pattern background */}
      <div className="flex-1 min-h-0 bg-muted/30 relative">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />

        <ScrollArea className="h-full">
          <div className="p-4 space-y-3 min-h-full flex flex-col">
            {historyLoading ? (
              <div className="flex-1 flex items-center justify-center py-20 text-muted-foreground">
                <Bot className="h-5 w-5 animate-spin mr-2" /> Loading chat history...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-20">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-primary/50" />
                </div>
                <p className="font-medium text-foreground">Start an investigation query</p>
                <p className="text-sm mt-1">Ask in English, Hindi, or Hinglish — type or use voice</p>
                <div className="flex items-center gap-3 mt-4 text-xs">
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-card border border-border">
                    <Mic className="h-3 w-3" /> Voice
                  </span>
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-card border border-border">
                    <Volume2 className="h-3 w-3" /> Auto-speak
                  </span>
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-card border border-border">
                    <Languages className="h-3 w-3" /> Multi-lang
                  </span>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => {
                  const showDate = i === 0 || msg.timestamp.toDateString() !== messages[i - 1].timestamp.toDateString();
                  return (
                    <div key={i}>
                      {showDate && (
                        <div className="flex justify-center my-2">
                          <span className="text-[10px] bg-muted text-muted-foreground px-3 py-1 rounded-full">
                            {msg.timestamp.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      )}
                      <ChatBubble
                        msg={msg}
                        onSpeak={() => {
                          if (tts.isSpeaking) tts.stop();
                          else tts.speak(msg.content);
                        }}
                        isSpeaking={tts.isSpeaking}
                      />
                    </div>
                  );
                })}
                {loading && messages[messages.length - 1]?.role !== 'assistant' && <TypingIndicator />}
              </>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Input area */}
      <div className="px-4 py-3 bg-card border-t border-border rounded-b-lg">
        {stt.isListening && (
          <div className="flex items-center gap-2 mb-2 text-xs text-destructive animate-pulse">
            <Mic className="h-3.5 w-3.5" />
            <span>Listening... speak in {stt.LANG_OPTIONS.find(l => l.value === stt.lang)?.label}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          {stt.isSupported && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={stt.isListening ? 'destructive' : 'outline'}
                  size="icon"
                  className="shrink-0 h-10 w-10 rounded-full"
                  onClick={toggleListening}
                  disabled={!selectedCase}
                >
                  {stt.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{stt.isListening ? 'Stop recording' : 'Voice input'}</TooltipContent>
            </Tooltip>
          )}
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={selectedCase ? 'Type a message...' : 'Select a case first...'}
            disabled={!selectedCase}
            className="min-h-[44px] max-h-32 resize-none rounded-2xl bg-muted/50"
            rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || !selectedCase || loading}
            size="icon"
            className="shrink-0 h-10 w-10 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
