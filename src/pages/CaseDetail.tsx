import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FolderOpen, Upload, MessageSquare, Users, Phone, Wifi,
  Radio, UserCheck, Loader2, ArrowLeft, Lightbulb, BarChart3, FileText,
  Network, Clock, Activity, MapPin
} from 'lucide-react';
import CDRVisualization from '@/components/CDRVisualization';
import CaseTrainingPanel from '@/components/CaseTrainingPanel';
import AliasManager from '@/components/AliasManager';
import CommonNumberAnalysis from '@/components/CommonNumberAnalysis';
import TimelineReconstruction from '@/components/TimelineReconstruction';
import CaseCollaboration from '@/components/CaseCollaboration';
import TowerMap from '@/components/TowerMap';
import CaseNotes from '@/components/CaseNotes';
import CaseDocumentManager from '@/components/CaseDocumentManager';
import PersonProfileManager from '@/components/PersonProfileManager';
import CaseDataSummary from '@/components/CaseDataSummary';
import CrossCDRCommonNumbers from '@/components/CrossCDRCommonNumbers';
import CaseTeamManager from '@/components/CaseTeamManager';
import DataAssignmentPanel from '@/components/DataAssignmentPanel';
import CaseKnowledgeBase from '@/components/CaseKnowledgeBase';

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const [caseData, setCaseData] = useState<any>(null);
  const [cdrFileCount, setCdrFileCount] = useState(0);
  const [ipdrFileCount, setIpdrFileCount] = useState(0);
  const [towerFileCount, setTowerFileCount] = useState(0);
  const [sdrFileCount, setSdrFileCount] = useState(0);
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getCase(id), api.getCaseStats(id)])
      .then(([caseRes, stats]) => {
        setCaseData(caseRes);
        setCdrFileCount(stats.cdr_count);
        setIpdrFileCount(stats.ipdr_count);
        setTowerFileCount(stats.tower_count);
        setSdrFileCount(stats.sdr_count);
        setInsights([]);
      })
      .catch(() => setCaseData(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!caseData) return <div className="text-center py-20 text-muted-foreground">Case not found</div>;

  const statusColor = (s: string) => {
    switch (s) {
      case 'active': return 'bg-success/15 text-success border-success/30';
      case 'closed': return 'bg-muted text-muted-foreground border-border';
      case 'pending': return 'bg-warning/15 text-warning border-warning/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link to="/cases"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{caseData.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {caseData.fir_number && <span>FIR: {caseData.fir_number}</span>}
            {caseData.sections && <span>| {caseData.sections}</span>}
          </div>
        </div>
        <Badge variant="outline" className={statusColor(caseData.status)}>{caseData.status}</Badge>
      </div>

      {/* Data summary cards — clickable to browse uploaded files */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'CDR Files', count: cdrFileCount, icon: Phone, type: 'cdr' },
          { label: 'IPDR Files', count: ipdrFileCount, icon: Wifi, type: 'ipdr' },
          { label: 'Tower Dumps', count: towerFileCount, icon: Radio, type: 'tower_dump' },
          { label: 'SDR Files', count: sdrFileCount, icon: UserCheck, type: 'sdr' },
        ].map(d => (
          <Link key={d.label} to={`/cases/${id}/records?type=${d.type}`}>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
                <d.icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xl font-bold">{d.count}</p>
                  <p className="text-xs text-muted-foreground">{d.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Data Summary */}
      <CaseDataSummary caseId={id!} />

      {/* Case Notes */}
      <CaseNotes caseId={id!} />

      {/* Documents */}
      <CaseDocumentManager caseId={id!} />

      {/* AI Knowledge Base (universal document understanding + RAG) */}
      <CaseKnowledgeBase caseId={id!} />

      {/* Persons */}
      <PersonProfileManager caseId={id!} />

      {/* Case Team */}
      <CaseTeamManager caseId={id!} />

      {/* Data Access Assignments */}
      <DataAssignmentPanel caseId={id!} />

      {/* AI Training Panel + Alias Manager */}
      <div className="grid gap-4 md:grid-cols-2">
        <CaseTrainingPanel caseId={id!} />
        <AliasManager caseId={id!} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList className="flex-wrap">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="analysis"><BarChart3 className="h-4 w-4 mr-1" /> CDR Analysis</TabsTrigger>
          <TabsTrigger value="common"><Network className="h-4 w-4 mr-1" /> Common Numbers</TabsTrigger>
          <TabsTrigger value="timeline"><Clock className="h-4 w-4 mr-1" /> Timeline</TabsTrigger>
          <TabsTrigger value="map"><MapPin className="h-4 w-4 mr-1" /> Map</TabsTrigger>
          <TabsTrigger value="collaboration"><Activity className="h-4 w-4 mr-1" /> Collaboration</TabsTrigger>
          <TabsTrigger value="insights">Insights ({insights.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Complainant:</span> <span className="font-medium">{caseData.complainant || '—'}</span></div>
                <div><span className="text-muted-foreground">Accused:</span> <span className="font-medium">{caseData.accused || '—'}</span></div>
                <div><span className="text-muted-foreground">Case Date:</span> <span className="font-medium">{caseData.case_date || '—'}</span></div>
                <div><span className="text-muted-foreground">Created:</span> <span className="font-medium">{new Date(caseData.created_at).toLocaleString()}</span></div>
              </div>
              {caseData.description && <p className="mt-4 text-sm text-muted-foreground">{caseData.description}</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="analysis">
          <CDRVisualization caseId={id!} />
        </TabsContent>
        <TabsContent value="common">
          <div className="space-y-4">
            <CrossCDRCommonNumbers caseId={id!} />
            <CommonNumberAnalysis caseId={id!} />
          </div>
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineReconstruction caseId={id!} />
        </TabsContent>
        <TabsContent value="map">
          <TowerMap caseId={id!} />
        </TabsContent>
        <TabsContent value="collaboration">
          <CaseCollaboration caseId={id!} />
        </TabsContent>
        <TabsContent value="insights">
          {insights.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground"><Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-40" /><p>No insights yet. Upload CDR data to generate analysis.</p></CardContent></Card>
          ) : (
            <div className="space-y-3">
              {insights.map(ins => (
                <Card key={ins.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Lightbulb className="h-5 w-5 text-warning mt-0.5" />
                      <div>
                        <p className="font-medium">{ins.title}</p>
                        <p className="text-sm text-muted-foreground">{ins.description}</p>
                        <Badge variant="outline" className="mt-2">{ins.insight_type}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Button asChild variant="outline"><Link to={`/upload?case=${id}`}><Upload className="mr-2 h-4 w-4" /> Upload Data</Link></Button>
        <Button asChild variant="outline"><Link to={`/chat?case=${id}`}><MessageSquare className="mr-2 h-4 w-4" /> AI Analyst</Link></Button>
        <Button asChild variant="outline"><Link to={`/documents?case=${id}`}><FileText className="mr-2 h-4 w-4" /> Documents</Link></Button>
      </div>
    </div>
  );
}
