import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PenLine, List, BookOpen, Plus, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface CaseNote {
  id: string;
  content: string;
  note_type: string;
  created_at: string;
  created_by: string;
}

export default function CaseNotes({ caseId }: { caseId: string }) {
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [caseId]);

  async function fetchNotes() {
    const { data, error } = await supabase
      .from('case_notes')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });
    if (data) setNotes(data);
    if (error) toast.error('Failed to load notes');
    setLoading(false);
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not authenticated'); setSaving(false); return; }

    const { error } = await supabase.from('case_notes').insert({
      case_id: caseId,
      content: newNote.trim(),
      created_by: user.id,
    });
    if (error) toast.error('Failed to add note');
    else {
      toast.success('Note added');
      setNewNote('');
      fetchNotes();
    }
    setSaving(false);
  }

  async function deleteNote(id: string) {
    const { error } = await supabase.from('case_notes').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else fetchNotes();
  }

  // Build paragraph (storywise) view — all notes joined as flowing narrative
  const paraContent = notes.map(n => n.content).join('\n\n');

  // Build pointers view — split each note into sentences/lines as bullet points
  const pointers = notes.flatMap(n =>
    n.content
      .split(/[\n]+/)
      .map(line => line.trim())
      .filter(Boolean)
  );

  const [open, setOpen] = useState(false);

  if (loading) return <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card>;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-lg font-semibold w-full text-left">
              <PenLine className="h-5 w-5 text-primary" />
              Case Notes
              <Badge variant="secondary" className="ml-2">{notes.length} entries</Badge>
              <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Add note input */}
            <div className="flex gap-2">
              <Textarea
                placeholder="Add details about the case at any stage..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                className="min-h-[60px] flex-1"
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.ctrlKey) addNote();
                }}
              />
              <Button onClick={addNote} disabled={saving || !newNote.trim()} size="sm" className="self-end">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Press Ctrl+Enter to submit</p>

            {notes.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No notes yet. Start adding details about this case.</p>
            ) : (
              <Tabs defaultValue="para" className="mt-2">
                <TabsList>
                  <TabsTrigger value="para"><BookOpen className="h-4 w-4 mr-1" /> Para (Storywise)</TabsTrigger>
                  <TabsTrigger value="pointers"><List className="h-4 w-4 mr-1" /> Pointers</TabsTrigger>
                </TabsList>

                <TabsContent value="para">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {paraContent}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="pointers">
                  <Card>
                    <CardContent className="pt-4">
                      <ul className="space-y-2">
                        {pointers.map((point, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            <span className="text-foreground">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}

            {/* Individual notes list for management */}
            {notes.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Manage individual notes ({notes.length})
                </summary>
                <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                  {notes.map(note => (
                    <div key={note.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/50 text-sm">
                      <span className="flex-1 whitespace-pre-wrap">{note.content}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive" onClick={() => deleteNote(note.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
