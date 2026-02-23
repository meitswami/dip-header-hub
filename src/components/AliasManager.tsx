import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/hooks/use-toast';
import { UserCheck, Plus, Trash2, Upload, Loader2 } from 'lucide-react';

interface Props {
  caseId: string;
}

type Alias = {
  id: string;
  phone_number: string;
  alias_name: string;
  confidence: string | null;
  photo_url: string | null;
};

export default function AliasManager({ caseId }: Props) {
  const { user } = useAuth();
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadAliases();
  }, [caseId]);

  async function loadAliases() {
    const { data } = await supabase
      .from('aliases')
      .select('id, phone_number, alias_name, confidence, photo_url')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });
    if (data) setAliases(data);
    setLoading(false);
  }

  async function addAlias() {
    if (!phone.trim() || !name.trim() || !user) return;
    setAdding(true);
    const { error } = await supabase.from('aliases').insert({
      case_id: caseId,
      phone_number: phone.trim(),
      alias_name: name.trim(),
      created_by: user.id,
    });
    if (error) {
      toast({ title: 'Failed to add alias', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Alias added' });
      setPhone('');
      setName('');
      loadAliases();
    }
    setAdding(false);
  }

  async function uploadPhoto(aliasId: string, file: File) {
    const filePath = `${caseId}/alias_${aliasId}_${Date.now()}.${file.name.split('.').pop()}`;
    const { error: uploadErr } = await supabase.storage
      .from('evidence')
      .upload(filePath, file);
    if (uploadErr) {
      toast({ title: 'Upload failed', description: uploadErr.message, variant: 'destructive' });
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('evidence').getPublicUrl(filePath);

    await supabase.from('aliases').update({ photo_url: filePath }).eq('id', aliasId);
    toast({ title: 'Photo uploaded' });
    loadAliases();
  }

  async function deleteAlias(id: string) {
    if (!confirm('Delete this alias?')) return;
    await supabase.from('aliases').delete().eq('id', id);
    loadAliases();
  }

  function getPhotoUrl(path: string | null) {
    if (!path) return '';
    const { data } = supabase.storage.from('evidence').getPublicUrl(path);
    return data.publicUrl;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-primary" />
          Phone Aliases ({aliases.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add new alias */}
        <div className="flex gap-2">
          <Input
            placeholder="Phone number"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Alias name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="flex-1"
          />
          <Button size="sm" onClick={addAlias} disabled={adding || !phone.trim() || !name.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        {/* Alias list */}
        {loading ? (
          <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : aliases.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No aliases mapped yet</p>
        ) : (
          <div className="space-y-2">
            {aliases.map(alias => (
              <div key={alias.id} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                <div className="relative group">
                  <Avatar className="h-10 w-10">
                    {alias.photo_url ? (
                      <AvatarImage src={getPhotoUrl(alias.photo_url)} alt={alias.alias_name} />
                    ) : null}
                    <AvatarFallback className="text-xs">{alias.alias_name.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <label className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 cursor-pointer rounded-full transition-opacity">
                    <Upload className="h-3.5 w-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        if (e.target.files?.[0]) uploadPhoto(alias.id, e.target.files[0]);
                      }}
                    />
                  </label>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{alias.alias_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{alias.phone_number}</p>
                </div>
                {alias.confidence && (
                  <span className="text-xs text-muted-foreground">{alias.confidence}</span>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteAlias(alias.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
