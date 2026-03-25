import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, Send, Users, Loader2, FolderOpen } from 'lucide-react';

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  case_id: string | null;
  content: string;
  message_type: string;
  created_at: string;
  sender_name?: string;
}

interface StaffProfile {
  id: string;
  full_name: string;
}

interface CaseOption {
  id: string;
  title: string;
}

export default function StaffMessages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('dm');
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [selectedCase, setSelectedCase] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').order('full_name').then(({ data }) => {
      if (data) setStaff(data.filter(s => s.id !== user?.id));
    });
    supabase.from('cases').select('id, title').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setCases(data);
    });
  }, [user?.id]);

  // Load DM messages
  useEffect(() => {
    if (tab !== 'dm' || !selectedRecipient || !user) return;
    loadDMs();
  }, [tab, selectedRecipient, user?.id]);

  // Load case messages
  useEffect(() => {
    if (tab !== 'case' || !selectedCase || !user) return;
    loadCaseMessages();
  }, [tab, selectedCase, user?.id]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('staff-messages-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_messages' }, (payload) => {
        const msg = payload.new as any;
        // Check if this message is relevant
        if (tab === 'dm' && ((msg.sender_id === user.id && msg.recipient_id === selectedRecipient) ||
            (msg.sender_id === selectedRecipient && msg.recipient_id === user.id))) {
          addMessageWithName(msg);
        } else if (tab === 'case' && msg.case_id === selectedCase) {
          addMessageWithName(msg);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, tab, selectedRecipient, selectedCase]);

  async function addMessageWithName(msg: any) {
    const sender = staff.find(s => s.id === msg.sender_id);
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, { ...msg, sender_name: sender?.full_name || (msg.sender_id === user?.id ? 'You' : 'Unknown') }];
    });
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  async function loadDMs() {
    setLoading(true);
    const { data } = await supabase
      .from('staff_messages')
      .select('*')
      .or(`and(sender_id.eq.${user!.id},recipient_id.eq.${selectedRecipient}),and(sender_id.eq.${selectedRecipient},recipient_id.eq.${user!.id})`)
      .is('case_id', null)
      .order('created_at', { ascending: true })
      .limit(100);

    if (data) {
      const named = data.map(m => ({
        ...m,
        sender_name: m.sender_id === user!.id ? 'You' : staff.find(s => s.id === m.sender_id)?.full_name || 'Unknown',
      }));
      setMessages(named);
    }
    setLoading(false);
    // Mark as read
    if (data?.length) {
      await supabase.from('staff_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', user!.id)
        .eq('sender_id', selectedRecipient)
        .is('read_at', null);
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
  }

  async function loadCaseMessages() {
    setLoading(true);
    const { data } = await supabase
      .from('staff_messages')
      .select('*')
      .eq('case_id', selectedCase)
      .is('recipient_id', null)
      .order('created_at', { ascending: true })
      .limit(100);

    if (data) {
      // Get sender names
      const senderIds = [...new Set(data.map(m => m.sender_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', senderIds);
      const nameMap: Record<string, string> = {};
      profiles?.forEach(p => { nameMap[p.id] = p.full_name; });

      setMessages(data.map(m => ({
        ...m,
        sender_name: m.sender_id === user!.id ? 'You' : nameMap[m.sender_id] || 'Unknown',
      })));
    }
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
  }

  async function sendMessage() {
    if (!newMessage.trim() || !user) return;
    setSending(true);

    const msg: any = {
      sender_id: user.id,
      content: newMessage.trim(),
      message_type: 'text',
    };

    if (tab === 'dm') {
      if (!selectedRecipient) { toast({ title: 'Select a recipient', variant: 'destructive' }); setSending(false); return; }
      msg.recipient_id = selectedRecipient;
    } else {
      if (!selectedCase) { toast({ title: 'Select a case', variant: 'destructive' }); setSending(false); return; }
      msg.case_id = selectedCase;
    }

    const { error } = await supabase.from('staff_messages').insert(msg);
    if (error) {
      toast({ title: 'Error sending', description: error.message, variant: 'destructive' });
    } else {
      setNewMessage('');
    }
    setSending(false);
  }

  const isConversationSelected = (tab === 'dm' && selectedRecipient) || (tab === 'case' && selectedCase);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Messages</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dm"><Users className="h-4 w-4 mr-1" /> Direct Messages</TabsTrigger>
          <TabsTrigger value="case"><FolderOpen className="h-4 w-4 mr-1" /> Case Discussions</TabsTrigger>
        </TabsList>

        <TabsContent value="dm">
          <div className="mb-3">
            <Select value={selectedRecipient} onValueChange={v => { setSelectedRecipient(v); setMessages([]); }}>
              <SelectTrigger><SelectValue placeholder="Select a staff member..." /></SelectTrigger>
              <SelectContent>
                {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        <TabsContent value="case">
          <div className="mb-3">
            <Select value={selectedCase} onValueChange={v => { setSelectedCase(v); setMessages([]); }}>
              <SelectTrigger><SelectValue placeholder="Select a case..." /></SelectTrigger>
              <SelectContent>
                {cases.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </TabsContent>
      </Tabs>

      <Card className="h-[500px] flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !isConversationSelected ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-2 opacity-40" />
              <p>Select a {tab === 'dm' ? 'recipient' : 'case'} to start</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-2 opacity-40" />
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`flex ${m.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                  m.sender_id === user?.id ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  {m.sender_id !== user?.id && (
                    <p className="text-[10px] font-medium mb-0.5 opacity-70">{m.sender_name}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                  <p className="text-[10px] opacity-60 mt-1 text-right">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </CardContent>

        {isConversationSelected && (
          <div className="p-3 border-t border-border flex gap-2">
            <Input
              placeholder="Type a message..."
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <Button size="icon" onClick={sendMessage} disabled={sending || !newMessage.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
