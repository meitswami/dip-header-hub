import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Loader2, MapPin, Navigation, Flame, Shield, Play, Pause, SkipBack, SkipForward, Plus, Trash2 } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Circle, Popup, useMap, useMapEvents } from 'react-leaflet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface LocationPoint {
  lat: number;
  lng: number;
  label: string;
  time: string;
  type: 'cdr' | 'tower' | 'ipdr';
  details?: string;
  id?: string;
}

interface Geofence {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  color: string;
  active: boolean;
}

function FitBounds({ points }: { points: LocationPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [points, map]);
  return null;
}

function HeatmapLayer({ points, visible }: { points: LocationPoint[]; visible: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!visible || points.length === 0) return;
    const heatData = points.map(p => [p.lat, p.lng, 0.6] as [number, number, number]);
    const heat = (L as any).heatLayer(heatData, {
      radius: 25, blur: 15, maxZoom: 17, max: 1.0,
      gradient: { 0.2: '#2563eb', 0.4: '#06b6d4', 0.6: '#10b981', 0.8: '#f59e0b', 1.0: '#ef4444' },
    }).addTo(map);
    return () => { map.removeLayer(heat); };
  }, [map, points, visible]);
  return null;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

const COLORS = { cdr: '#3b82f6', tower: '#ef4444', ipdr: '#10b981' };

export default function TowerMap({ caseId }: { caseId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [points, setPoints] = useState<LocationPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<'all' | 'cdr' | 'tower' | 'ipdr'>('all');
  const [showMovement, setShowMovement] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Time slider
  const [timeEnabled, setTimeEnabled] = useState(false);
  const [timeIndex, setTimeIndex] = useState(100);
  const [playing, setPlaying] = useState(false);

  // Geofencing
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [showGeofenceDialog, setShowGeofenceDialog] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [newFence, setNewFence] = useState({ name: '', lat: '', lng: '', radius: '500' });
  const [geofenceAlerts, setGeofenceAlerts] = useState<{ point: LocationPoint; fence: Geofence }[]>([]);

  useEffect(() => {
    async function load() {
      const [cdrRes, towerRes, fenceRes] = await Promise.all([
        supabase.from('cdr_records').select('id,lat,lng,call_date,calling_number,called_number,call_type,location,cell_id').eq('case_id', caseId).not('lat', 'is', null).not('lng', 'is', null).order('call_date', { ascending: true }).limit(500),
        supabase.from('tower_dump_records').select('id,lat,lng,timestamp,msisdn,location,cell_id,imei').eq('case_id', caseId).not('lat', 'is', null).not('lng', 'is', null).order('timestamp', { ascending: true }).limit(500),
        supabase.from('geofences').select('*').eq('case_id', caseId).eq('active', true),
      ]);

      const pts: LocationPoint[] = [];
      (cdrRes.data || []).forEach(r => {
        if (r.lat && r.lng) pts.push({ lat: r.lat, lng: r.lng, label: r.calling_number || r.called_number || 'Unknown', time: r.call_date || '', type: 'cdr', details: `${r.call_type || 'Call'} | Cell: ${r.cell_id || '—'} | ${r.location || '—'}`, id: r.id });
      });
      (towerRes.data || []).forEach(r => {
        if (r.lat && r.lng) pts.push({ lat: r.lat, lng: r.lng, label: r.msisdn || r.imei || 'Unknown', time: r.timestamp || '', type: 'tower', details: `Cell: ${r.cell_id || '—'} | ${r.location || '—'}`, id: r.id });
      });
      setPoints(pts);
      setGeofences((fenceRes.data || []).map((f: any) => ({ id: f.id, name: f.name, center_lat: f.center_lat, center_lng: f.center_lng, radius_meters: f.radius_meters, color: f.color || '#ef4444', active: f.active })));
      setLoading(false);
    }
    load();
  }, [caseId]);

  // Compute geofence alerts
  useEffect(() => {
    if (geofences.length === 0 || points.length === 0) { setGeofenceAlerts([]); return; }
    const alerts: { point: LocationPoint; fence: Geofence }[] = [];
    const toRad = (d: number) => d * Math.PI / 180;
    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 6371000;
      const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    points.forEach(p => {
      geofences.forEach(f => {
        const dist = haversine(p.lat, p.lng, f.center_lat, f.center_lng);
        if (dist <= f.radius_meters) alerts.push({ point: p, fence: f });
      });
    });
    setGeofenceAlerts(alerts);
  }, [geofences, points]);

  // Time slider playback
  useEffect(() => {
    if (!playing || !timeEnabled) return;
    const interval = setInterval(() => {
      setTimeIndex(prev => {
        if (prev >= 100) { setPlaying(false); return 100; }
        return prev + 1;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [playing, timeEnabled]);

  const filtered = useMemo(() => layer === 'all' ? points : points.filter(p => p.type === layer), [points, layer]);

  const sortedByTime = useMemo(() => {
    return [...filtered].filter(p => p.time).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [filtered]);

  const visiblePoints = useMemo(() => {
    if (!timeEnabled || sortedByTime.length === 0) return filtered;
    const cutoff = Math.ceil((timeIndex / 100) * sortedByTime.length);
    return sortedByTime.slice(0, cutoff);
  }, [filtered, sortedByTime, timeEnabled, timeIndex]);

  const movementLine = useMemo(() => {
    if (!showMovement) return [];
    const sorted = [...visiblePoints].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return sorted.map(p => [p.lat, p.lng] as [number, number]);
  }, [visiblePoints, showMovement]);

  const currentTimeLabel = useMemo(() => {
    if (!timeEnabled || sortedByTime.length === 0) return '';
    const idx = Math.min(Math.ceil((timeIndex / 100) * sortedByTime.length) - 1, sortedByTime.length - 1);
    if (idx < 0) return '';
    return new Date(sortedByTime[idx].time).toLocaleString();
  }, [timeEnabled, timeIndex, sortedByTime]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (pickingLocation) {
      setNewFence(prev => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
      setPickingLocation(false);
    }
  }, [pickingLocation]);

  const addGeofence = async () => {
    if (!newFence.name || !newFence.lat || !newFence.lng || !user) return;
    const { data, error } = await supabase.from('geofences').insert({
      case_id: caseId, name: newFence.name, zone_type: 'circle',
      center_lat: parseFloat(newFence.lat), center_lng: parseFloat(newFence.lng),
      radius_meters: parseFloat(newFence.radius) || 500, created_by: user.id,
    }).select().single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    if (data) setGeofences(prev => [...prev, { id: data.id, name: data.name, center_lat: data.center_lat!, center_lng: data.center_lng!, radius_meters: data.radius_meters!, color: data.color || '#ef4444', active: true }]);
    setNewFence({ name: '', lat: '', lng: '', radius: '500' });
    setShowGeofenceDialog(false);
    toast({ title: 'Geofence created', description: `Zone "${data.name}" is now active` });
  };

  const deleteGeofence = async (id: string) => {
    await supabase.from('geofences').delete().eq('id', id);
    setGeofences(prev => prev.filter(f => f.id !== id));
  };

  if (loading) return <Card><CardContent className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card>;

  if (points.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No location data available</p>
          <p className="text-sm mt-1">Upload CDR or Tower Dump records with lat/lng coordinates to see the map.</p>
        </CardContent>
      </Card>
    );
  }

  const center: [number, number] = [
    points.reduce((s, p) => s + p.lat, 0) / points.length,
    points.reduce((s, p) => s + p.lng, 0) / points.length,
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5" /> Tower & Movement Map
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={layer} onValueChange={(v: any) => setLayer(v)}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Layers</SelectItem>
                  <SelectItem value="cdr">CDR Only</SelectItem>
                  <SelectItem value="tower">Tower Only</SelectItem>
                </SelectContent>
              </Select>
              <Button variant={showMovement ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setShowMovement(!showMovement)}>
                <Navigation className="h-3 w-3 mr-1" /> Trail
              </Button>
              <Button variant={showHeatmap ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setShowHeatmap(!showHeatmap)}>
                <Flame className="h-3 w-3 mr-1" /> Heatmap
              </Button>
              <Button variant={timeEnabled ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => { setTimeEnabled(!timeEnabled); setTimeIndex(100); setPlaying(false); }}>
                <Play className="h-3 w-3 mr-1" /> Timeline
              </Button>
              <Dialog open={showGeofenceDialog} onOpenChange={setShowGeofenceDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    <Shield className="h-3 w-3 mr-1" /> Geofence
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Geofence Zone</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Zone Name</Label>
                      <Input placeholder="e.g. Suspect's residence" value={newFence.name} onChange={e => setNewFence(p => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Latitude</Label>
                        <Input placeholder="28.6139" value={newFence.lat} onChange={e => setNewFence(p => ({ ...p, lat: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="text-xs">Longitude</Label>
                        <Input placeholder="77.2090" value={newFence.lng} onChange={e => setNewFence(p => ({ ...p, lng: e.target.value }))} />
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => { setPickingLocation(true); setShowGeofenceDialog(false); }}>
                      <MapPin className="h-3 w-3 mr-1" /> Pick location on map
                    </Button>
                    <div>
                      <Label className="text-xs">Radius (meters)</Label>
                      <Input type="number" value={newFence.radius} onChange={e => setNewFence(p => ({ ...p, radius: e.target.value }))} />
                    </div>
                    <Button onClick={addGeofence} disabled={!newFence.name || !newFence.lat || !newFence.lng} className="w-full">
                      <Plus className="h-4 w-4 mr-1" /> Create Zone
                    </Button>
                  </div>
                  {geofences.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Active Zones</p>
                      {geofences.map(f => (
                        <div key={f.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm">
                          <div className="flex items-center gap-2">
                            <Shield className="h-3 w-3 text-destructive" />
                            <span>{f.name}</span>
                            <span className="text-xs text-muted-foreground">({f.radius_meters}m)</span>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteGeofence(f.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="flex gap-3 mt-2 flex-wrap">
            <Badge variant="outline" className="text-xs" style={{ borderColor: COLORS.cdr, color: COLORS.cdr }}>
              <span className="w-2 h-2 rounded-full mr-1.5 inline-block" style={{ background: COLORS.cdr }} /> CDR ({points.filter(p => p.type === 'cdr').length})
            </Badge>
            <Badge variant="outline" className="text-xs" style={{ borderColor: COLORS.tower, color: COLORS.tower }}>
              <span className="w-2 h-2 rounded-full mr-1.5 inline-block" style={{ background: COLORS.tower }} /> Tower ({points.filter(p => p.type === 'tower').length})
            </Badge>
            {showHeatmap && <Badge variant="outline" className="text-xs border-orange-400 text-orange-500"><Flame className="w-3 h-3 mr-1" /> Heatmap</Badge>}
            {geofenceAlerts.length > 0 && (
              <Badge variant="destructive" className="text-xs"><Shield className="w-3 h-3 mr-1" /> {geofenceAlerts.length} zone alerts</Badge>
            )}
            {pickingLocation && <Badge className="text-xs bg-primary animate-pulse">Click map to set location</Badge>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Time slider */}
          {timeEnabled && (
            <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center gap-3">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setTimeIndex(0); setPlaying(false); }}><SkipBack className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPlaying(!playing)}>
                {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setTimeIndex(100); setPlaying(false); }}><SkipForward className="h-3 w-3" /></Button>
              <div className="flex-1">
                <Slider value={[timeIndex]} min={0} max={100} step={1} onValueChange={([v]) => { setTimeIndex(v); setPlaying(false); }} />
              </div>
              <span className="text-xs text-muted-foreground min-w-[140px] text-right font-mono">{currentTimeLabel}</span>
            </div>
          )}
          <div className="h-[500px] w-full rounded-b-lg overflow-hidden">
            <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitBounds points={visiblePoints} />
              <HeatmapLayer points={visiblePoints} visible={showHeatmap} />
              <MapClickHandler onClick={handleMapClick} />
              {/* Geofence circles */}
              {geofences.map(f => (
                <Circle key={f.id} center={[f.center_lat, f.center_lng]} radius={f.radius_meters}
                  pathOptions={{ color: f.color, fillColor: f.color, fillOpacity: 0.1, weight: 2, dashArray: '6 4' }}>
                  <Popup><div className="text-xs"><p className="font-semibold">{f.name}</p><p>Radius: {f.radius_meters}m</p><p>{geofenceAlerts.filter(a => a.fence.id === f.id).length} records inside zone</p></div></Popup>
                </Circle>
              ))}
              {showMovement && movementLine.length > 1 && (
                <Polyline positions={movementLine} pathOptions={{ color: '#6366f1', weight: 2, opacity: 0.6, dashArray: '8 4' }} />
              )}
              {!showHeatmap && visiblePoints.map((p, i) => {
                const inZone = geofenceAlerts.some(a => a.point === p);
                return (
                  <CircleMarker key={i} center={[p.lat, p.lng]} radius={inZone ? 8 : 6}
                    pathOptions={{ color: inZone ? '#ef4444' : COLORS[p.type], fillColor: inZone ? '#ef4444' : COLORS[p.type], fillOpacity: inZone ? 1 : 0.8, weight: inZone ? 3 : 2 }}>
                    <Popup>
                      <div className="text-xs space-y-1">
                        <p className="font-semibold">{p.label}</p>
                        {p.time && <p>{new Date(p.time).toLocaleString()}</p>}
                        {p.details && <p className="text-muted-foreground">{p.details}</p>}
                        <Badge variant="outline" className="text-[10px]">{p.type.toUpperCase()}</Badge>
                        {inZone && <Badge variant="destructive" className="text-[10px] ml-1">IN ZONE</Badge>}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {/* Geofence alerts panel */}
      {geofenceAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-destructive" /> Geofence Alerts ({geofenceAlerts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {geofenceAlerts.slice(0, 30).map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-destructive/5 border border-destructive/20 text-sm">
                  <Shield className="h-4 w-4 text-destructive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono font-medium">{a.point.label}</span>
                    <span className="text-muted-foreground mx-2">in</span>
                    <span className="font-medium">{a.fence.name}</span>
                  </div>
                  {a.point.time && <span className="text-xs text-muted-foreground shrink-0">{new Date(a.point.time).toLocaleString()}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
