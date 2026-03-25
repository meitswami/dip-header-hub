import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, BarChart3, MapPin, Network } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis
} from 'recharts';

interface CDRVisualizationProps {
  caseId: string;
}

export default function CDRVisualization({ caseId }: CDRVisualizationProps) {
  const [loading, setLoading] = useState(true);
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [contactData, setContactData] = useState<any[]>([]);
  const [towerData, setTowerData] = useState<any[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);

  const COLORS = [
    'hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
    'hsl(var(--chart-4))', 'hsl(var(--chart-5))', '#8884d8', '#82ca9d',
    '#ffc658', '#ff7300', '#00C49F'
  ];

  useEffect(() => {
    if (!caseId) return;
    loadData();
  }, [caseId]);

  async function loadData() {
    setLoading(true);
    try {
      const cdrRecords = await api.getCaseCdr(caseId, 1000);
      if (!cdrRecords?.length) {
        setLoading(false);
        return;
      }

    // Call frequency timeline (by date)
    const dateMap: Record<string, { date: string; incoming: number; outgoing: number; total: number }> = {};
    cdrRecords.forEach(r => {
      if (!r.call_date) return;
      const date = new Date(r.call_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      if (!dateMap[date]) dateMap[date] = { date, incoming: 0, outgoing: 0, total: 0 };
      dateMap[date].total++;
      if (r.call_type?.toLowerCase().includes('incoming')) dateMap[date].incoming++;
      else dateMap[date].outgoing++;
    });
    setTimelineData(Object.values(dateMap));

    // Top contacts (network graph data)
    const contactMap: Record<string, number> = {};
    cdrRecords.forEach(r => {
      const num = r.called_number || r.calling_number || 'Unknown';
      contactMap[num] = (contactMap[num] || 0) + 1;
    });
    const sorted = Object.entries(contactMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([number, calls]) => ({
        number: number.length > 10 ? '...' + number.slice(-6) : number,
        fullNumber: number,
        calls,
      }));
    setContactData(sorted);

    // Hourly distribution
    const hourMap: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hourMap[i] = 0;
    cdrRecords.forEach(r => {
      if (!r.call_date) return;
      const hour = new Date(r.call_date).getHours();
      hourMap[hour]++;
    });
    setHourlyData(Object.entries(hourMap).map(([hour, count]) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      calls: count,
      isNight: Number(hour) >= 23 || Number(hour) < 5,
    })));

    // Tower location scatter
    const towers = cdrRecords
      .filter(r => r.tower_lat && r.tower_lng)
      .map(r => ({
        lat: r.tower_lat!,
        lng: r.tower_lng!,
        location: r.tower_location || `${r.tower_lat?.toFixed(4)}, ${r.tower_lng?.toFixed(4)}`,
        count: 1,
      }));
    // Aggregate by approximate location
    const towerMap: Record<string, { lat: number; lng: number; location: string; count: number }> = {};
    towers.forEach(t => {
      const key = `${t.lat?.toFixed(3)}_${t.lng?.toFixed(3)}`;
      if (!towerMap[key]) towerMap[key] = { ...t };
      else towerMap[key].count++;
    });
    setTowerData(Object.values(towerMap));
    } catch {
      setTimelineData([]);
      setContactData([]);
      setHourlyData([]);
      setTowerData([]);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground">Loading visualization data...</span>
        </CardContent>
      </Card>
    );
  }

  if (timelineData.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No CDR data to visualize</p>
          <p className="text-sm">Upload CDR records to see analysis charts</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="timeline" className="space-y-4">
      <TabsList>
        <TabsTrigger value="timeline"><BarChart3 className="h-4 w-4 mr-1" /> Call Timeline</TabsTrigger>
        <TabsTrigger value="contacts"><Network className="h-4 w-4 mr-1" /> Top Contacts</TabsTrigger>
        <TabsTrigger value="hourly"><BarChart3 className="h-4 w-4 mr-1" /> Hourly Pattern</TabsTrigger>
        <TabsTrigger value="towers"><MapPin className="h-4 w-4 mr-1" /> Tower Locations</TabsTrigger>
      </TabsList>

      <TabsContent value="timeline">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Call Frequency Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--card-foreground))',
                  }}
                />
                <Legend />
                <Bar dataKey="incoming" fill="hsl(var(--chart-2))" name="Incoming" radius={[2, 2, 0, 0]} />
                <Bar dataKey="outgoing" fill="hsl(var(--primary))" name="Outgoing" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="contacts">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 10 Contacted Numbers</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={contactData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis dataKey="number" type="category" width={80} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--card-foreground))',
                    }}
                    formatter={(v: any, _: any, p: any) => [v, `Number: ${p.payload.fullNumber}`]}
                  />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie data={contactData} dataKey="calls" nameKey="number" cx="50%" cy="50%" outerRadius={120} label={({ number, percent }) => `${number} (${(percent * 100).toFixed(0)}%)`}>
                    {contactData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--card-foreground))',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="hourly">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hourly Call Distribution (Night hours highlighted)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--card-foreground))',
                  }}
                />
                <Bar dataKey="calls" name="Calls" radius={[3, 3, 0, 0]}>
                  {hourlyData.map((entry, i) => (
                    <Cell key={i} fill={entry.isNight ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                <span>Day hours</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(var(--destructive))' }} />
                <span>Night hours (11 PM – 5 AM)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="towers">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tower Location Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {towerData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={350}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="lng" name="Longitude" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="lat" name="Latitude" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <ZAxis dataKey="count" range={[50, 400]} name="Calls" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--card-foreground))',
                      }}
                      formatter={(v: any, name: string) => [v, name]}
                    />
                    <Scatter data={towerData} fill="hsl(var(--primary))" />
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Tower Locations ({towerData.length} unique)</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {towerData.slice(0, 9).map((t, i) => (
                      <div key={i} className="text-xs bg-muted rounded-md px-2 py-1.5 flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-primary shrink-0" />
                        <span className="truncate">{t.location}</span>
                        <span className="text-muted-foreground ml-auto">({t.count})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>No tower location data available in CDR records</p>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
