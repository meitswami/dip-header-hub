import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSpeechToText, useTextToSpeech } from '@/hooks/useSpeech';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, Bot, User, MessageSquare, Mic, MicOff, Volume2, VolumeX, Languages, Check, CheckCheck, FileSpreadsheet, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

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
  const [numberSuggestions, setNumberSuggestions] = useState<{ number: string; count: number }[]>([]);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [viewNumber, setViewNumber] = useState<string | null>(null);
  const [viewRecords, setViewRecords] = useState<any[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamAbortRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stt = useSpeechToText();
  const tts = useTextToSpeech();

  const [historyLoading, setHistoryLoading] = useState(false);
  const [styleLevel, setStyleLevel] = useState<'simple' | 'intermediate' | 'expert'>('simple');

  useEffect(() => {
    api.getCases().then(data => setCases(data)).catch(() => setCases([]));
  }, []);

  useEffect(() => {
    if (!selectedCase) { setMessages([]); return; }
    setHistoryLoading(true);
    api.getChatLogs(selectedCase)
      .then(data => {
        if (data?.length) {
          setMessages(data.map((d: { role: string; content: string; created_at: string | null }) => ({
            role: d.role as 'user' | 'assistant',
            content: d.content,
            timestamp: d.created_at ? new Date(d.created_at) : new Date(),
          })));
        } else {
          setMessages([]);
        }
        setHistoryLoading(false);
      })
      .catch(() => { setMessages([]); setHistoryLoading(false); });
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

  const [personSuggestions, setPersonSuggestions] = useState<{ label: string; number: string }[]>([]);
  const [triggerChar, setTriggerChar] = useState<'@' | '#' | null>(null);
  const [triggerStart, setTriggerStart] = useState(0);
  const [selectedNumbersForInsert, setSelectedNumbersForInsert] = useState<Set<string>>(new Set());
  const [quickSuggestions, setQuickSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedCase || !input) {
      setNumberSuggestions([]);
      setPersonSuggestions([]);
      setTriggerChar(null);
      setSuggestionOpen(false);
      return;
    }
    const lastAt = input.lastIndexOf('@');
    const lastHash = input.lastIndexOf('#');
    const atActive = lastAt >= 0 && (lastHash < 0 || lastAt > lastHash);
    const hashActive = lastHash >= 0 && (lastAt < 0 || lastHash > lastAt);

    if (atActive) {
      const fragment = input.slice(lastAt + 1).split(/\s/)[0] || '';
      setTriggerChar('@');
      setTriggerStart(lastAt);
      setSuggestionOpen(true);
      setNumberSuggestions([]);
      const t = setTimeout(async () => {
        try {
          const [profiles, aliases] = await Promise.all([
            api.getPersonProfiles(selectedCase),
            api.getAliases(selectedCase),
          ]);
          let list: { label: string; number: string }[] = [];
          profiles.forEach((p: { name: string; phone_numbers: string[] }) => {
            const nums = p.phone_numbers || [];
            nums.forEach((num: string) => list.push({ label: p.name || num, number: String(num) }));
          });
          aliases.forEach((a: { alias_name: string; phone_number: string }) =>
            list.push({ label: a.alias_name || a.phone_number, number: String(a.phone_number) })
          );
          const q = fragment.toLowerCase().trim();
          if (q) list = list.filter(x => x.label.toLowerCase().includes(q));
          setPersonSuggestions(list.slice(0, 20));
        } catch {
          setPersonSuggestions([]);
        }
      }, 200);
      return () => clearTimeout(t);
    }

    if (hashActive) {
      const fragment = input.slice(lastHash + 1).replace(/\s/g, '');
      const digits = fragment.replace(/\D/g, '');
      setTriggerChar('#');
      setTriggerStart(lastHash);
      setSelectedNumbersForInsert(new Set());
      if (digits.length >= 1) {
        const t = setTimeout(async () => {
          try {
            const list = await api.getNumbersSearch(selectedCase, digits);
            setNumberSuggestions(list.map(x => ({ number: x.number, count: x.count })));
            setPersonSuggestions([]);
            setSuggestionOpen(list.length > 0);
          } catch {
            setNumberSuggestions([]);
          }
        }, 300);
        return () => clearTimeout(t);
      } else {
        setNumberSuggestions([]);
        setSuggestionOpen(false);
      }
      return;
    }

    setTriggerChar(null);
    setNumberSuggestions([]);
    setPersonSuggestions([]);
    setSuggestionOpen(false);
  }, [selectedCase, input]);

  const openNumberView = async (num: string) => {
    setViewNumber(num);
    if (!selectedCase) return;
    try {
      const data = await api.getCdrSample(selectedCase, num);
      setViewRecords(data);
    } catch {
      setViewRecords([]);
    }
  };

  const toggleListening = () => {
    if (stt.isListening) stt.stopListening();
    else stt.startListening();
  };

  const stopStreaming = () => {
    streamAbortRef.current = true;
    abortControllerRef.current?.abort();
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
    streamAbortRef.current = false;
    abortControllerRef.current = new AbortController();

    // Rule-based FAQ / quick-action suggestions based on query category
    const q = userMsg.content.toLowerCase();
    const suggestions: string[] = [];
    if (/common\s+contacts?|common\s+numbers?|overlap/i.test(q)) {
      suggestions.push(
        'Show top common contacts between two numbers in this case.',
        'List numbers that frequently contact multiple suspects.',
        'Identify numbers that appear across multiple CDR files.'
      );
    } else if (/frequency|pattern|how\s+often|daily|hourly/i.test(q)) {
      suggestions.push(
        'Show hourly call pattern for a specific number.',
        'Compare day vs night call volume for the main suspect.',
        'Find numbers with unusually high call frequency.'
      );
    } else if (/timeline|sequence|chronolog/i.test(q)) {
      suggestions.push(
        'Summarize key call events on a specific date.',
        'Compare call timelines of two numbers on the same day.',
        'Highlight any long gaps in activity for a suspect.'
      );
    } else if (/anomal(y|ies)|suspicious|unusual|irregular/i.test(q)) {
      suggestions.push(
        'Flag numbers with very high night-call percentage.',
        'Find sudden spikes in calls for a number within a short period.',
        'List numbers that suddenly stop calling after a key date.'
      );
    } else if (/tower|cell\s*id|location|overlap/i.test(q)) {
      suggestions.push(
        'Find numbers that share the same tower frequently.',
        'Summarize most common cell IDs for the main suspect.',
        'Check for tower overlap between two suspects on a given date.'
      );
    }
    setQuickSuggestions(suggestions.slice(0, 3));

    try {
      const chatPayload = newMessages.map(m => ({ role: m.role, content: m.content }));

      const resp = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        signal: abortControllerRef.current?.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseId: selectedCase,
          messages: chatPayload,
          styleLevel,
        }),
      });

      const data = await resp.json().catch(() => ({} as any));
      if (!resp.ok || !data?.content) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'AI service unavailable. Try again.', timestamp: new Date() }]);
      } else {
        const content: string = data.content;
        setMessages(prev => [...prev, { role: 'assistant', content, timestamp: new Date() }]);
        if (autoSpeak && content) tts.speak(content);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'AI service unavailable. Try again.', timestamp: new Date() }]);
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
          <Select
            value={styleLevel}
            onValueChange={(v: 'simple' | 'intermediate' | 'expert') => setStyleLevel(v)}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="simple">Simple</SelectItem>
              <SelectItem value="intermediate">Intermediate talk</SelectItem>
              <SelectItem value="expert">Expert</SelectItem>
            </SelectContent>
          </Select>

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

      {/* Input area — use @ for person/alias, # for number suggestions (only when typing) */}
      <div className="px-4 py-3 bg-card border-t border-border rounded-b-lg">
        {quickSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            {quickSuggestions.map((s, idx) => (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setInput(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        )}
        {stt.isListening && (
          <div className="flex items-center gap-2 mb-2 text-xs text-destructive animate-pulse">
            <Mic className="h-3.5 w-3.5" />
            <span>Listening... speak in {stt.LANG_OPTIONS.find(l => l.value === stt.lang)?.label}</span>
          </div>
        )}
        <div className="relative flex items-end gap-2">
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
          <div className="flex-1 relative">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={selectedCase ? 'Use @ for person/alias, # for number...' : 'Select a case first...'}
              disabled={!selectedCase}
              className="min-h-[44px] max-h-32 resize-none rounded-2xl bg-muted/50"
              rows={1}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); return; }
                if (e.key === 'Backspace' && input.length > 0 && inputRef.current?.selectionStart === input.length) {
                  const match = input.match(/,?\s*\d{6,}\s*$/);
                  if (match) {
                    e.preventDefault();
                    setInput(input.slice(0, input.length - match[0].length));
                  }
                }
              }}
            />
            {suggestionOpen && triggerChar === '@' && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border bg-popover shadow-lg py-1 z-[100] max-h-48 overflow-auto">
                <p className="px-3 py-1 text-[10px] text-muted-foreground">@ Person / alias — click to insert</p>
                {personSuggestions.length > 0 ? (
                  personSuggestions.map(({ label, number }) => (
                    <button
                      key={`${label}-${number}`}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex justify-between items-center"
                      onClick={() => {
                        const before = input.slice(0, triggerStart);
                        const frag = input.slice(triggerStart + 1).split(/\s/)[0] || '';
                        const after = input.slice(triggerStart + 1 + frag.length);
                        setInput(`${before}@${label} (${number}) ${after}`.trimStart());
                        setSuggestionOpen(false);
                        setTriggerChar(null);
                      }}
                    >
                      <span>{label}</span>
                      <span className="text-xs text-muted-foreground font-mono">{number}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No persons or aliases in this case. Add from Person profiles or Data Upload → Mapping.</p>
                )}
              </div>
            )}
            {suggestionOpen && triggerChar === '#' && numberSuggestions.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border bg-popover shadow-lg py-1 z-50 max-h-56 overflow-auto">
                <p className="px-3 py-1 text-[10px] text-muted-foreground"># Numbers — tick to select multiple, then Insert. Backspace removes last number.</p>
                {numberSuggestions.map(({ number, count }) => (
                  <div key={number} className="flex items-center gap-2 px-3 py-2 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={selectedNumbersForInsert.has(number)}
                      onChange={() => {
                        setSelectedNumbersForInsert(prev => {
                          const next = new Set(prev);
                          if (next.has(number)) next.delete(number);
                          else next.add(number);
                          return next;
                        });
                      }}
                    />
                    <span className="font-mono flex-1">{number}</span>
                    <span className="text-xs text-muted-foreground">{count} rec</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => openNumberView(number)} title="View CDR">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="border-t px-3 py-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const before = input.slice(0, triggerStart);
                      const nums = [...selectedNumbersForInsert];
                      const inserted = nums.length ? nums.join(', ') : '';
                      setInput(nums.length ? `${before}${inserted} `.trimStart() : input);
                      setSuggestionOpen(false);
                      setTriggerChar(null);
                      setSelectedNumbersForInsert(new Set());
                    }}
                  >
                    Insert {selectedNumbersForInsert.size > 0 ? `(${selectedNumbersForInsert.size})` : ''}
                  </Button>
                </div>
              </div>
            )}
          </div>
          {loading ? (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="shrink-0 h-10 w-10 rounded-full"
              onClick={stopStreaming}
              title="Stop generating"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || !selectedCase}
              size="icon"
              className="shrink-0 h-10 w-10 rounded-full"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Dialog open={!!viewNumber} onOpenChange={open => !open && setViewNumber(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>CDR records for {viewNumber}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1 -mx-6 px-6">
            <p className="text-xs text-muted-foreground mb-2">
              <a href={selectedCase ? `/cases/${selectedCase}/records?type=cdr` : '#'} className="text-primary hover:underline">
                View full CDR files in Case Records →
              </a>
            </p>
            {viewRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">No records found for this number in this case.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Calling</th>
                    <th className="text-left py-2">Called</th>
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {viewRecords.map((r, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1 font-mono">{r.calling_number}</td>
                      <td className="py-1 font-mono">{r.called_number}</td>
                      <td className="py-1">{r.call_date || '—'}</td>
                      <td className="py-1">{r.call_type || '—'}</td>
                      <td className="py-1">{r.duration != null ? `${r.duration}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
