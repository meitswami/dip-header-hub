import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Activity, CheckCircle2, Clock, Plus, MessageSquare, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CaseCollaborationProps {
  caseId: string;
}

export default function CaseCollaboration({ caseId }: CaseCollaborationProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activities, setActivities] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!caseId) return;
    loadData();
    // Realtime subscriptions
    const actChannel = supabase
      .channel(`activity-${caseId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `case_id=eq.${caseId}` },
        (payload) => { setActivities(prev => [payload.new as any, ...prev].slice(0, 50)); }
      )
      .subscribe();

    return () => { supabase.removeChannel(actChannel); };
  }, [caseId]);

  async function loadData() {
    setLoading(true);
    const [actRes, taskRes, profilesRes] = await Promise.all([
      supabase.from('activity_logs').select('*').eq('case_id', caseId).order('created_at', { ascending: false }).limit(50),
      supabase.from('case_tasks').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name'),
    ]);
    if (actRes.data) setActivities(actRes.data);
    if (taskRes.data) setTasks(taskRes.data);
    if (profilesRes.data) {
      const map: Record<string, string> = {};
      profilesRes.data.forEach(p => { map[p.id] = p.full_name; });
      setProfiles(map);
    }
    setLoading(false);
  }

  async function addTask() {
    if (!newTaskTitle.trim() || !user) return;
    const { error } = await supabase.from('case_tasks').insert({
      case_id: caseId,
      title: newTaskTitle.trim(),
      created_by: user.id,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }

    await supabase.from('activity_logs').insert({
      case_id: caseId,
      user_id: user.id,
      action: 'task_created',
      details: `Created task: ${newTaskTitle.trim()}`,
    });

    setNewTaskTitle('');
    loadData();
    toast({ title: 'Task created' });
  }

  async function updateTaskStatus(taskId: string, status: string) {
    await supabase.from('case_tasks').update({ status }).eq('id', taskId);
    if (user) {
      await supabase.from('activity_logs').insert({
        case_id: caseId,
        user_id: user.id,
        action: 'task_updated',
        details: `Marked task as ${status}`,
      });
    }
    loadData();
  }

  const priorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'text-destructive border-destructive/30';
      case 'medium': return 'text-warning border-warning/30';
      default: return 'text-muted-foreground border-border';
    }
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'done': return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'in_progress': return <Clock className="h-4 w-4 text-warning" />;
      default: return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />;
    }
  };

  if (loading) return <Card><CardContent className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card>;

  return (
    <Tabs defaultValue="tasks">
      <TabsList>
        <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
        <TabsTrigger value="activity">Activity Log ({activities.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="tasks" className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add a new task..."
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
              />
              <Button onClick={addTask} size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
            </div>
          </CardContent>
        </Card>

        {['todo', 'in_progress', 'done'].map(status => {
          const statusTasks = tasks.filter(t => t.status === status);
          if (statusTasks.length === 0) return null;
          return (
            <div key={status}>
              <h4 className="text-sm font-medium text-muted-foreground mb-2 capitalize">{status.replace('_', ' ')} ({statusTasks.length})</h4>
              <div className="space-y-2">
                {statusTasks.map(task => (
                  <Card key={task.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <button onClick={() => updateTaskStatus(task.id, status === 'done' ? 'todo' : status === 'todo' ? 'in_progress' : 'done')}>
                        {statusIcon(task.status)}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          by {profiles[task.created_by] || 'Unknown'} • {new Date(task.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="outline" className={priorityColor(task.priority)}>{task.priority}</Badge>
                      <Select value={task.status} onValueChange={v => updateTaskStatus(task.id, v)}>
                        <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">To Do</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </TabsContent>

      <TabsContent value="activity">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No activity recorded yet</p>
            ) : (
              <div className="space-y-3">
                {activities.map(a => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <div className="p-1.5 rounded-full bg-muted mt-0.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p>
                        <span className="font-medium">{profiles[a.user_id] || 'Unknown'}</span>
                        <span className="text-muted-foreground"> {a.details || a.action}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
