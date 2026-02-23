import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock, MapPin, Phone, Wifi, Radio, Filter } from 'lucide-react';

interface TimelineReconstructionProps {
  caseId: string;
}

interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'call' | 'data' | 'tower' | 'location_change';
  title: string;
  description: string;
  location?: string;
  lat?: number;
  lng?: number;
  number?: string;
  metadata?: Record<string, any>;
}

export default function TimelineReconstruction({ caseId }: TimelineReconstructionProps) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [filterNumber, setFilterNumber] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    if (!caseId) return;
    loadTimeline();
  }, [caseId]);

  async function loadTimeline() {
    setLoading(true);

    const [cdrRes, ipdrRes, towerRes] = await Promise.all([
      supabase.from('cdr_records').select('*').eq('case_id', caseId).order('call_date', { ascending: true }).limit(2000),
      supabase.from('ipdr_records').select('*').eq('case_id', caseId).order('session_start', { ascending: true }).limit(1000),
      supabase.from('tower_dump_records').select('*').eq('case_id', caseId).order('event_time', { ascending: true }).limit(1000),
    ]);

    const timeline: TimelineEvent[] = [];

    // CDR events
    cdrRes.data?.forEach(r => {
      if (!r.call_date) return;
      timeline.push({
        id: r.id,
        timestamp: r.call_date,
        type: 'call',
        title: `${r.call_type || 'Call'}: ${r.calling_number || '?'} → ${r.called_number || '?'}`,
        description: `Duration: ${r.duration ? `${Math.floor(r.duration / 60)}m ${r.duration % 60}s` : 'N/A'} | IMEI: ${r.imei || 'N/A'}`,
        location: r.tower_location || undefined,
        lat: r.tower_lat || undefined,
        lng: r.tower_lng || undefined,
        number: r.calling_number || r.called_number || undefined,
        metadata: { cell_id: r.cell_id, operator: r.operator, imei: r.imei },
      });
    });

    // IPDR events
    ipdrRes.data?.forEach(r => {
      if (!r.session_start) return;
      timeline.push({
        id: r.id,
        timestamp: r.session_start,
        type: 'data',
        title: `Data Session: ${r.msisdn || r.source_ip || '?'}`,
        description: `${r.data_volume ? `${(r.data_volume / 1024).toFixed(0)} KB` : ''} ${r.protocol || ''} → ${r.destination_ip || ''}:${r.destination_port || ''}`.trim(),
        location: r.tower_location || undefined,
        number: r.msisdn || undefined,
        metadata: { cell_id: r.cell_id, imei: r.imei },
      });
    });

    // Tower dump events
    towerRes.data?.forEach(r => {
      if (!r.event_time) return;
      timeline.push({
        id: r.id,
        timestamp: r.event_time,
        type: 'tower',
        title: `Tower Activity: ${r.mobile_number || r.imei || '?'}`,
        description: `Cell: ${r.cell_id || 'N/A'} | IMSI: ${r.imsi || 'N/A'}`,
        location: r.tower_location || undefined,
        lat: r.tower_lat || undefined,
        lng: r.tower_lng || undefined,
        number: r.mobile_number || undefined,
        metadata: { cell_id: r.cell_id, imei: r.imei, imsi: r.imsi },
      });
    });

    // Detect location changes
    const sorted = timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Group by number and detect rapid location changes
    const numberLocations: Record<string, { timestamp: string; location: string }[]> = {};
    sorted.forEach(e => {
      if (e.number && e.location) {
        if (!numberLocations[e.number]) numberLocations[e.number] = [];
        numberLocations[e.number].push({ timestamp: e.timestamp, location: e.location });
      }
    });

    Object.entries(numberLocations).forEach(([num, locs]) => {
      for (let i = 1; i < locs.length; i++) {
        if (locs[i].location !== locs[i - 1].location) {
          const timeDiff = (new Date(locs[i].timestamp).getTime() - new Date(locs[i - 1].timestamp).getTime()) / 60000;
          if (timeDiff < 30) {
            timeline.push({
              id: `loc_${num}_${i}`,
              timestamp: locs[i].timestamp,
              type: 'location_change',
              title: `⚡ Rapid Movement: ${num.slice(-4)}`,
              description: `${locs[i - 1].location} → ${locs[i].location} in ${timeDiff.toFixed(0)} min`,
              number: num,
            });
          }
        }
      }
    });

    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    setEvents(timeline);
    setLoading(false);
  }

  const filtered = events.filter(e => {
    if (filterType !== 'all' && e.type !== filterType) return false;
    if (filterNumber && !e.number?.includes(filterNumber) && !e.title.includes(filterNumber)) return false;
    if (dateRange.start && new Date(e.timestamp) < new Date(dateRange.start)) return false;
    if (dateRange.end && new Date(e.timestamp) > new Date(dateRange.end + 'T23:59:59')) return false;
    return true;
  });

  const typeIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="h-4 w-4 text-primary" />;
      case 'data': return <Wifi className="h-4 w-4 text-chart-2" />;
      case 'tower': return <Radio className="h-4 w-4 text-chart-3" />;
      case 'location_change': return <MapPin className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'call': return 'border-primary/30 bg-primary/5';
      case 'data': return 'border-chart-2/30 bg-chart-2/5';
      case 'tower': return 'border-chart-3/30 bg-chart-3/5';
      case 'location_change': return 'border-destructive/30 bg-destructive/5';
      default: return 'border-border';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground">Reconstructing timeline...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Event Type</span>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="call">Calls</SelectItem>
                  <SelectItem value="data">Data Sessions</SelectItem>
                  <SelectItem value="tower">Tower Activity</SelectItem>
                  <SelectItem value="location_change">Location Changes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Phone Number</span>
              <Input placeholder="Filter by number..." value={filterNumber} onChange={e => setFilterNumber(e.target.value)} className="w-40 h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">From</span>
              <Input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} className="w-36 h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">To</span>
              <Input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} className="w-36 h-8 text-sm" />
            </div>
            <Badge variant="secondary" className="h-8">{filtered.length} events</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Events', count: events.length, icon: Clock },
          { label: 'Calls', count: events.filter(e => e.type === 'call').length, icon: Phone },
          { label: 'Data Sessions', count: events.filter(e => e.type === 'data').length, icon: Wifi },
          { label: 'Location Alerts', count: events.filter(e => e.type === 'location_change').length, icon: MapPin },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 flex items-center gap-3">
              <s.icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold">{s.count}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No events to display</p>
            <p className="text-sm">Upload CDR/IPDR/Tower data to reconstruct the timeline</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
          <div className="space-y-1">
            {filtered.slice(0, 200).map((event, i) => {
              const showDate = i === 0 || new Date(event.timestamp).toDateString() !== new Date(filtered[i - 1].timestamp).toDateString();
              return (
                <div key={event.id}>
                  {showDate && (
                    <div className="relative flex items-center py-2">
                      <div className="absolute left-4 w-4 h-4 rounded-full bg-primary border-2 border-background z-10" />
                      <span className="ml-14 text-sm font-semibold text-primary">
                        {new Date(event.timestamp).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )}
                  <div className="relative flex items-start gap-3 py-1">
                    <div className="absolute left-[21px] w-2.5 h-2.5 rounded-full bg-muted border border-border z-10 mt-2" />
                    <div className={`ml-12 flex-1 p-2.5 rounded-lg border text-sm ${typeColor(event.type)}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {typeIcon(event.type)}
                          <span className="font-medium truncate">{event.title}</span>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(event.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-6">{event.description}</p>
                      {event.location && (
                        <p className="text-xs mt-1 ml-6 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {event.location}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length > 200 && (
              <div className="ml-12 p-3 text-center text-sm text-muted-foreground">
                Showing first 200 of {filtered.length} events. Use filters to narrow down.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
