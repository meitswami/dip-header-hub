import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FileText, Download, Loader2, FileSpreadsheet, Scale } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function Reports() {
  const { toast } = useToast();
  const [cases, setCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState('');
  const [caseData, setCaseData] = useState<any>(null);
  const [evidenceLogs, setEvidenceLogs] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [chatLogs, setChatLogs] = useState<any[]>([]);
  const [cdrCount, setCdrCount] = useState(0);
  const [ipdrCount, setIpdrCount] = useState(0);
  const [towerCount, setTowerCount] = useState(0);
  const [sdrCount, setSdrCount] = useState(0);
  const [aliases, setAliases] = useState<any[]>([]);
  const [persons, setPersons] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    supabase.from('cases').select('id, title').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setCases(data); });
  }, []);

  useEffect(() => {
    if (!selectedCase) return;
    Promise.all([
      supabase.from('cases').select('*').eq('id', selectedCase).single(),
      supabase.from('evidence_logs').select('*').eq('case_id', selectedCase).order('created_at', { ascending: false }),
      supabase.from('investigation_insights').select('*').eq('case_id', selectedCase),
      supabase.from('chat_logs').select('*').eq('case_id', selectedCase).order('created_at', { ascending: true }),
      supabase.from('cdr_records').select('id', { count: 'exact', head: true }).eq('case_id', selectedCase),
      supabase.from('ipdr_records').select('id', { count: 'exact', head: true }).eq('case_id', selectedCase),
      supabase.from('tower_dump_records').select('id', { count: 'exact', head: true }).eq('case_id', selectedCase),
      supabase.from('sdr_records').select('id', { count: 'exact', head: true }).eq('case_id', selectedCase),
      supabase.from('aliases').select('*').eq('case_id', selectedCase),
      supabase.from('person_profiles').select('*').eq('case_id', selectedCase),
    ]).then(([cRes, eRes, iRes, chRes, cdrRes, ipdrRes, towerRes, sdrRes, aliasRes, personRes]) => {
      if (cRes.data) setCaseData(cRes.data);
      if (eRes.data) setEvidenceLogs(eRes.data);
      if (iRes.data) setInsights(iRes.data);
      if (chRes.data) setChatLogs(chRes.data);
      setCdrCount(cdrRes.count || 0);
      setIpdrCount(ipdrRes.count || 0);
      setTowerCount(towerRes.count || 0);
      setSdrCount(sdrRes.count || 0);
      if (aliasRes.data) setAliases(aliasRes.data);
      if (personRes.data) setPersons(personRes.data);
    });
  }, [selectedCase]);

  const generatePDF = (courtFormat = false) => {
    if (!caseData) return;
    setGenerating(true);
    try {
      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();

      if (courtFormat) {
        // Court Format Header
        doc.setFontSize(10);
        doc.text('BEFORE THE HON\'BLE COURT', pw / 2, 15, { align: 'center' });
        doc.setFontSize(16);
        doc.text('CERTIFIED FORENSIC INVESTIGATION REPORT', pw / 2, 24, { align: 'center' });
        doc.setFontSize(9);
        doc.text('(Prepared under Section 65B of Indian Evidence Act, 1872)', pw / 2, 30, { align: 'center' });
        doc.text(`Certificate No: CERT-${caseData.id.slice(0, 8).toUpperCase()}`, pw / 2, 35, { align: 'center' });
        doc.text(`Date of Report: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, pw / 2, 40, { align: 'center' });
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(14, 43, pw - 14, 43);

        // Section 65B Certificate
        let y = 50;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('CERTIFICATE UNDER SECTION 65B', 14, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        y += 8;
        const certText = [
          'I hereby certify that:',
          '(a) The electronic records contained herein were produced by a computer during the period over which the computer was used regularly to store or process information for the purposes of any activities regularly carried on.',
          '(b) During the said period, information of the kind contained in the electronic record was regularly fed into the computer in the ordinary course of the said activities.',
          '(c) Throughout the material part of the said period, the computer was operating properly.',
          '(d) The information contained in the electronic record reproduces or is derived from such information fed into the computer in the ordinary course of the said activities.',
        ];
        certText.forEach(line => {
          const lines = doc.splitTextToSize(line, pw - 28);
          doc.text(lines, 14, y);
          y += lines.length * 4 + 2;
        });
        y += 5;
      } else {
        // Standard format
        doc.setFontSize(18);
        doc.text('FORENSIC INVESTIGATION REPORT', pw / 2, 20, { align: 'center' });
        doc.setFontSize(10);
        doc.text('CONFIDENTIAL — LAW ENFORCEMENT USE ONLY', pw / 2, 27, { align: 'center' });
        doc.setFontSize(8);
        doc.text(`Generated: ${new Date().toLocaleString()}`, pw / 2, 32, { align: 'center' });
        doc.setDrawColor(0);
        doc.line(14, 35, pw - 14, 35);
      }

      // Table of Contents for court format
      if (courtFormat) {
        doc.addPage();
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('INDEX / TABLE OF CONTENTS', 14, 20);
        doc.setFont('helvetica', 'normal');
        const tocItems = [
          ['1', 'Case Information', '3'],
          ['2', 'Forensic Data Summary', '3'],
          ['3', 'Person Profiles & Aliases', '4'],
          ['4', 'Evidence Chain of Custody (SHA256 Verified)', '4'],
          ['5', 'Investigation Insights & Analysis', '5'],
          ['6', 'Investigation Query Log', '5'],
          ['7', 'Section 65B Compliance Declaration', '6'],
        ];
        autoTable(doc, {
          startY: 28,
          head: [['Sr. No.', 'Description', 'Page']],
          body: tocItems,
          theme: 'grid',
          styles: { fontSize: 10 },
        });
      }

      // Case Details
      const startY = courtFormat ? 20 : 45;
      if (courtFormat) doc.addPage();
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('1. Case Information', 14, courtFormat ? 20 : 45);
      doc.setFont('helvetica', 'normal');
      autoTable(doc, {
        startY: (courtFormat ? 20 : 45) + 5,
        body: [
          ['Case Title', caseData.title],
          ['FIR Number', caseData.fir_number || 'N/A'],
          ['Sections', caseData.sections || 'N/A'],
          ['Status', caseData.status],
          ['Case Date', caseData.case_date || 'N/A'],
          ['Complainant', caseData.complainant || 'N/A'],
          ['Accused', caseData.accused || 'N/A'],
          ['Description', caseData.description || 'N/A'],
          ['Created', new Date(caseData.created_at).toLocaleString()],
          ['Last Updated', new Date(caseData.updated_at).toLocaleString()],
        ],
        theme: 'grid', styles: { fontSize: 9 },
      });

      // Data Summary
      let y = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('2. Forensic Data Summary', 14, y);
      doc.setFont('helvetica', 'normal');
      autoTable(doc, {
        startY: y + 5,
        head: [['Data Type', 'Records Count']],
        body: [
          ['CDR Records (Call Detail Records)', String(cdrCount)],
          ['IPDR Records (IP Detail Records)', String(ipdrCount)],
          ['Tower Dump Records', String(towerCount)],
          ['SDR Records (Subscriber Detail)', String(sdrCount)],
        ],
        theme: 'grid', styles: { fontSize: 9 },
      });

      // Person Profiles
      if (persons.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10;
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('3. Person Profiles', 14, y);
        doc.setFont('helvetica', 'normal');
        autoTable(doc, {
          startY: y + 5,
          head: [['Name', 'Phone', 'Role', 'Notes']],
          body: persons.map(p => [p.name, p.phone || '', p.role_in_case || '', (p.notes || '').substring(0, 60)]),
          theme: 'grid', styles: { fontSize: 8 },
        });
      }

      // Aliases
      if (aliases.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10;
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Phone Number Aliases', 14, y);
        doc.setFont('helvetica', 'normal');
        autoTable(doc, {
          startY: y + 5,
          head: [['Phone Number', 'Alias Name', 'Confidence']],
          body: aliases.map(a => [a.phone_number, a.alias_name, a.confidence ? `${(a.confidence * 100).toFixed(0)}%` : '']),
          theme: 'grid', styles: { fontSize: 8 },
        });
      }

      // Evidence Chain of Custody
      y = (doc as any).lastAutoTable.finalY + 10;
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('4. Evidence Chain of Custody', 14, y);
      doc.setFont('helvetica', 'normal');
      if (evidenceLogs.length > 0) {
        autoTable(doc, {
          startY: y + 5,
          head: [['Sr.', 'File Name', 'SHA256 Hash', 'Type', 'Size (KB)', 'Upload Date']],
          body: evidenceLogs.map((e, i) => [
            String(i + 1),
            e.file_name,
            e.file_hash,
            e.upload_type,
            e.file_size ? (e.file_size / 1024).toFixed(0) : '',
            new Date(e.created_at).toLocaleString(),
          ]),
          theme: 'grid', styles: { fontSize: 7 },
          columnStyles: { 2: { cellWidth: 50, fontSize: 6 } },
        });

        if (courtFormat) {
          y = (doc as any).lastAutoTable.finalY + 5;
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.text('Note: SHA256 hash values above can be independently verified to confirm file integrity and authenticity.', 14, y);
          doc.setFont('helvetica', 'normal');
        }
      } else {
        doc.setFontSize(9);
        doc.text('No evidence files uploaded.', 14, y + 8);
      }

      // Insights
      if (insights.length > 0) {
        y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : y + 15;
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('5. Investigation Insights', 14, y);
        doc.setFont('helvetica', 'normal');
        autoTable(doc, {
          startY: y + 5,
          head: [['Type', 'Finding', 'Description']],
          body: insights.map(i => [i.insight_type, i.title, i.description || '']),
          theme: 'grid', styles: { fontSize: 8 },
        });
      }

      // Chat Log
      if (chatLogs.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10;
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('6. Investigation Query Log', 14, y);
        doc.setFont('helvetica', 'normal');
        autoTable(doc, {
          startY: y + 5,
          head: [['Timestamp', 'Role', 'Message']],
          body: chatLogs.slice(0, 50).map(c => [
            new Date(c.created_at).toLocaleString(),
            c.role,
            c.message.substring(0, 120) + (c.message.length > 120 ? '...' : ''),
          ]),
          theme: 'grid', styles: { fontSize: 7 },
        });
      }

      // Court format: Compliance declaration page
      if (courtFormat) {
        doc.addPage();
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('7. COMPLIANCE DECLARATION', 14, 20);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const declarations = [
          `Report ID: ${caseData.id}`,
          `FIR Number: ${caseData.fir_number || 'N/A'}`,
          `Total Evidence Files: ${evidenceLogs.length}`,
          `Total Forensic Records: ${cdrCount + ipdrCount + towerCount + sdrCount}`,
          '',
          'This report has been prepared in compliance with:',
          '• Section 65A & 65B of the Indian Evidence Act, 1872',
          '• Information Technology Act, 2000',
          '• Guidelines issued by the Supreme Court of India in Anvar P.V. vs. P.K. Basheer (2014)',
          '',
          'All electronic records contained herein are accompanied by a certificate under Section 65B(4) of the Indian Evidence Act.',
          'Hash values (SHA256) have been computed for all evidence files to ensure integrity and prevent tampering.',
          '',
          '',
          '____________________________                    ____________________________',
          'Investigating Officer                                        Supervising Officer',
          '',
          '____________________________                    ____________________________',
          'Name & Designation                                        Name & Designation',
          '',
          `Date: ${new Date().toLocaleDateString('en-IN')}                                             Place: ________________`,
        ];
        let dy = 30;
        declarations.forEach(line => {
          doc.text(line, 14, dy);
          dy += 5;
        });
      }

      // Footer with page numbers
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        const footer = courtFormat
          ? `Page ${i} of ${pageCount} | Certificate: CERT-${caseData.id.slice(0, 8).toUpperCase()} | ${new Date().toLocaleDateString('en-IN')} | Digital Investigation Platform — Meit Swami | COURT DOCUMENT`
          : `Page ${i} of ${pageCount} | Report ID: ${caseData.id.slice(0, 8)} | Generated: ${new Date().toLocaleString()} | Digital Investigation Platform — Meit Swami | CONFIDENTIAL`;
        doc.text(footer, pw / 2, ph - 10, { align: 'center' });
      }

      const prefix = courtFormat ? 'Court_Report' : 'Forensic_Report';
      doc.save(`${prefix}_${caseData.fir_number || caseData.title}_${Date.now()}.pdf`);
      toast({ title: courtFormat ? 'Court-ready PDF generated with Section 65B certificate' : 'Forensic PDF report generated' });
    } catch (err: any) {
      toast({ title: 'PDF generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const exportExcel = async () => {
    if (!selectedCase) return;
    const [cdr, ipdr, tower, sdr] = await Promise.all([
      supabase.from('cdr_records').select('*').eq('case_id', selectedCase),
      supabase.from('ipdr_records').select('*').eq('case_id', selectedCase),
      supabase.from('tower_dump_records').select('*').eq('case_id', selectedCase),
      supabase.from('sdr_records').select('*').eq('case_id', selectedCase),
    ]);

    const wb = XLSX.utils.book_new();
    if (cdr.data?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cdr.data.map(({ raw_data, ...r }) => r)), 'CDR Records');
    if (ipdr.data?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ipdr.data.map(({ raw_data, ...r }) => r)), 'IPDR Records');
    if (tower.data?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tower.data.map(({ raw_data, ...r }) => r)), 'Tower Dumps');
    if (sdr.data?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sdr.data.map(({ raw_data, ...r }) => r)), 'SDR Records');

    if (wb.SheetNames.length === 0) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }

    XLSX.writeFile(wb, `Case_Data_Export_${Date.now()}.xlsx`);
    toast({ title: 'Excel export complete', description: `${wb.SheetNames.length} sheets exported` });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Reports & Exports</h1>
      <p className="text-muted-foreground">Generate forensic reports and export case data.</p>

      <div className="flex gap-4 items-end">
        <div className="flex-1 space-y-2">
          <span className="text-sm font-medium">Select Case</span>
          <Select value={selectedCase} onValueChange={setSelectedCase}>
            <SelectTrigger><SelectValue placeholder="Choose a case..." /></SelectTrigger>
            <SelectContent>{cases.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={() => generatePDF(false)} disabled={!selectedCase || generating}>
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          PDF Report
        </Button>
        <Button onClick={() => generatePDF(true)} disabled={!selectedCase || generating} variant="secondary">
          <Scale className="mr-2 h-4 w-4" /> Court Format
        </Button>
        <Button variant="outline" onClick={exportExcel} disabled={!selectedCase}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Export
        </Button>
      </div>

      {caseData && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Evidence Files</p>
              <p className="text-2xl font-bold">{evidenceLogs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Insights</p>
              <p className="text-2xl font-bold">{insights.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Chat Queries</p>
              <p className="text-2xl font-bold">{chatLogs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Records</p>
              <p className="text-2xl font-bold">{cdrCount + ipdrCount + towerCount + sdrCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {evidenceLogs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Evidence Chain</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>SHA256</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidenceLogs.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium text-sm">{e.file_name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.file_hash.substring(0, 24)}...</TableCell>
                    <TableCell><Badge variant="outline">{e.upload_type}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.file_size ? (e.file_size / 1024).toFixed(0) + ' KB' : '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
