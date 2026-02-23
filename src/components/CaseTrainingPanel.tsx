import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { useLang } from '@/hooks/useLang';
import {
  trainCase, getLastTrainingLog, getAllTrainingLogs,
  computeDataHash, generateTrainingLogText
} from '@/lib/caseTraining';
import {
  Brain, Loader2, CheckCircle, Download, FileText, Clock, AlertCircle
} from 'lucide-react';
import jsPDF from 'jspdf';

interface Props {
  caseId: string;
}

export default function CaseTrainingPanel({ caseId }: Props) {
  const { user } = useAuth();
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasNewData, setHasNewData] = useState(true);
  const [lastLog, setLastLog] = useState<any>(null);
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    checkStatus();
  }, [caseId]);

  async function checkStatus() {
    setChecking(true);
    const [last, { hash }] = await Promise.all([
      getLastTrainingLog(caseId),
      computeDataHash(caseId),
    ]);
    setLastLog(last);
    setHasNewData(!last || last.data_snapshot_hash !== hash);
    setChecking(false);
  }

  async function handleTrain() {
    if (!user) return;
    setLoading(true);
    try {
      const result = await trainCase(caseId, user.id);
      if (result.alreadyTrained) {
        toast({ title: t('common.no_new_data'), description: 'AI is already up to date with this case data.' });
      } else {
        toast({ title: 'AI Training Complete', description: 'Case profile updated successfully.' });
      }
      setLastLog(result.log);
      setHasNewData(false);
    } catch (err: any) {
      toast({ title: 'Training failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function loadAllLogs() {
    const logs = await getAllTrainingLogs(caseId);
    setAllLogs(logs);
    setShowLogs(true);
  }

  function exportPDF() {
    const doc = new jsPDF();
    const text = generateTrainingLogText(allLogs);
    const lines = doc.splitTextToSize(text, 170);
    let y = 20;
    lines.forEach((line: string) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(9);
      doc.text(line, 14, y);
      y += 5;
    });
    doc.save(`AI_Training_Log_${caseId.slice(0, 8)}.pdf`);
  }

  function exportDocx() {
    const text = generateTrainingLogText(allLogs);
    const blob = new Blob([text], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI_Training_Log_${caseId.slice(0, 8)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (checking) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          {t('common.train_ai')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Button
            onClick={handleTrain}
            disabled={loading || !hasNewData}
            variant={hasNewData ? 'default' : 'outline'}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : hasNewData ? (
              <Brain className="mr-2 h-4 w-4" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            {loading ? 'Training...' : hasNewData ? t('common.train_ai') : 'Up to date'}
          </Button>

          <Button variant="outline" size="sm" onClick={loadAllLogs}>
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            {t('common.training_logs')}
          </Button>
        </div>

        {!hasNewData && lastLog && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-success" />
            Last trained: {new Date(lastLog.created_at).toLocaleString()}
          </p>
        )}

        {hasNewData && lastLog && (
          <p className="text-xs text-warning flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            New data available since last training
          </p>
        )}

        {showLogs && allLogs.length > 0 && (
          <div className="border border-border rounded-lg mt-3">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="text-sm font-medium">{t('common.training_logs')} ({allLogs.length})</span>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={exportPDF}>
                  <Download className="mr-1 h-3.5 w-3.5" /> PDF
                </Button>
                <Button variant="ghost" size="sm" onClick={exportDocx}>
                  <FileText className="mr-1 h-3.5 w-3.5" /> DOCX
                </Button>
              </div>
            </div>
            <ScrollArea className="max-h-48">
              <div className="p-3 space-y-2">
                {allLogs.map((log, i) => (
                  <div key={log.id} className="text-xs border-b border-border pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Training #{allLogs.length - i}</span>
                      <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <pre className="text-muted-foreground mt-1 whitespace-pre-wrap font-mono text-[10px] leading-relaxed">
                      {log.summary}
                    </pre>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
