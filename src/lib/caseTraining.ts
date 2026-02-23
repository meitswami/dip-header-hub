import { supabase } from '@/integrations/supabase/client';

interface DataCounts {
  cdr: number;
  ipdr: number;
  tower: number;
  sdr: number;
  insights: number;
  documents: number;
  aliases: number;
  persons: number;
}

interface CaseProfile {
  caseInfo: any;
  topContacts: any[];
  imeiChanges: any[];
  lateNightSummary: any;
  towerSummary: any;
  subscribers: any[];
  aliases: any[];
  persons: any[];
  insights: any[];
  documentTitles: string[];
}

export async function computeDataHash(caseId: string): Promise<{ hash: string; counts: DataCounts }> {
  const [cdr, ipdr, tower, sdr, ins, docs, aliases, persons] = await Promise.all([
    supabase.from('cdr_records').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
    supabase.from('ipdr_records').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
    supabase.from('tower_dump_records').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
    supabase.from('sdr_records').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
    supabase.from('investigation_insights').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
    supabase.from('case_documents').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
    supabase.from('aliases').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
    supabase.from('person_profiles').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
  ]);

  const counts: DataCounts = {
    cdr: cdr.count || 0,
    ipdr: ipdr.count || 0,
    tower: tower.count || 0,
    sdr: sdr.count || 0,
    insights: ins.count || 0,
    documents: docs.count || 0,
    aliases: aliases.count || 0,
    persons: persons.count || 0,
  };

  // Simple hash from counts - changes when any data is added/removed
  const hash = Object.values(counts).join('-');
  return { hash, counts };
}

export async function getLastTrainingLog(caseId: string) {
  const { data } = await supabase
    .from('case_training_logs')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getAllTrainingLogs(caseId: string) {
  const { data } = await supabase
    .from('case_training_logs')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function buildCaseProfile(caseId: string): Promise<CaseProfile> {
  const [
    caseRes,
    cdrRes,
    sdrRes,
    insRes,
    docsRes,
    aliasRes,
    personRes,
  ] = await Promise.all([
    supabase.from('cases').select('*').eq('id', caseId).single(),
    supabase.from('cdr_records').select('*').eq('case_id', caseId).limit(500),
    supabase.from('sdr_records').select('*').eq('case_id', caseId).limit(100),
    supabase.from('investigation_insights').select('*').eq('case_id', caseId),
    supabase.from('case_documents').select('title, category, file_name').eq('case_id', caseId),
    supabase.from('aliases').select('*').eq('case_id', caseId),
    supabase.from('person_profiles').select('*').eq('case_id', caseId),
  ]);

  const cdr = cdrRes.data || [];

  // Top contacts
  const contactCount: Record<string, number> = {};
  cdr.forEach(r => {
    if (r.called_number) contactCount[r.called_number] = (contactCount[r.called_number] || 0) + 1;
    if (r.calling_number) contactCount[r.calling_number] = (contactCount[r.calling_number] || 0) + 1;
  });
  const topContacts = Object.entries(contactCount).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([number, count]) => ({ number, count }));

  // IMEI changes
  const numberImeis: Record<string, Set<string>> = {};
  cdr.forEach(r => {
    const num = r.calling_number || r.called_number;
    if (num && r.imei) {
      if (!numberImeis[num]) numberImeis[num] = new Set();
      numberImeis[num].add(r.imei);
    }
  });
  const imeiChanges = Object.entries(numberImeis)
    .filter(([_, s]) => s.size > 1)
    .map(([number, imeis]) => ({ number, imeis: Array.from(imeis) }));

  // Late night
  const lateNight = cdr.filter(r => {
    if (!r.call_date) return false;
    const h = new Date(r.call_date).getHours();
    return h >= 23 || h < 5;
  });

  // Tower summary
  const towers = new Set(cdr.map(r => r.cell_id).filter(Boolean));

  return {
    caseInfo: caseRes.data,
    topContacts,
    imeiChanges,
    lateNightSummary: { count: lateNight.length },
    towerSummary: { uniqueTowers: towers.size },
    subscribers: sdrRes.data || [],
    aliases: aliasRes.data || [],
    persons: personRes.data || [],
    insights: insRes.data || [],
    documentTitles: (docsRes.data || []).map((d: any) => d.title),
  };
}

export async function trainCase(caseId: string, userId: string): Promise<{ alreadyTrained: boolean; log: any }> {
  const { hash, counts } = await computeDataHash(caseId);
  const lastLog = await getLastTrainingLog(caseId);

  if (lastLog && (lastLog as any).training_data && (lastLog as any).training_data === hash) {
    return { alreadyTrained: true, log: lastLog };
  }

  const profile = await buildCaseProfile(caseId);

  // Build summary of what was learned
  const summaryParts: string[] = [];
  summaryParts.push(`Case: ${profile.caseInfo?.title || 'Unknown'}`);
  if (profile.caseInfo?.fir_number) summaryParts.push(`FIR: ${profile.caseInfo.fir_number}`);
  summaryParts.push(`CDR records analyzed: ${counts.cdr}`);
  summaryParts.push(`Top contacts: ${profile.topContacts.slice(0, 5).map(c => c.number).join(', ') || 'None'}`);
  if (profile.imeiChanges.length) summaryParts.push(`IMEI changes detected for ${profile.imeiChanges.length} numbers`);
  summaryParts.push(`Late night calls: ${profile.lateNightSummary.count}`);
  summaryParts.push(`Unique towers: ${profile.towerSummary.uniqueTowers}`);
  summaryParts.push(`SDR subscribers: ${counts.sdr}`);
  summaryParts.push(`Aliases mapped: ${counts.aliases}`);
  summaryParts.push(`Person profiles: ${counts.persons}`);
  summaryParts.push(`Investigation insights: ${counts.insights}`);
  summaryParts.push(`Documents: ${counts.documents}`);

  // What's new since last training
  if (lastLog) {
    const oldData = (lastLog as any).training_data || {};
    const oldCounts = (typeof oldData === 'object' ? oldData : {}) as Record<string, number>;
    const newItems: string[] = [];
    Object.entries(counts).forEach(([key, val]) => {
      const old = (oldCounts as any)[key] || 0;
      if (val > old) newItems.push(`+${val - old} ${key}`);
    });
    if (newItems.length) summaryParts.push(`New since last training: ${newItems.join(', ')}`);
  }

  const { data: log } = await supabase.from('case_training_logs').insert({
    case_id: caseId,
    trained_by: userId,
    data_snapshot_hash: hash,
    case_profile: profile as any,
    summary: summaryParts.join('\n'),
    data_counts: counts as any,
  }).select().single();

  return { alreadyTrained: false, log };
}

export function generateTrainingLogText(logs: any[]): string {
  let text = 'AI CASE TRAINING LOG REPORT\n';
  text += '=' .repeat(50) + '\n\n';

  logs.forEach((log, i) => {
    text += `Training #${logs.length - i}\n`;
    text += `Date: ${new Date(log.created_at).toLocaleString()}\n`;
    text += `Data Hash: ${log.data_snapshot_hash}\n`;
    text += '-'.repeat(40) + '\n';
    text += log.summary || 'No summary available';
    text += '\n\n';

    const counts = log.data_counts || {};
    text += 'Data Counts:\n';
    Object.entries(counts).forEach(([k, v]) => {
      text += `  ${k}: ${v}\n`;
    });
    text += '\n' + '='.repeat(50) + '\n\n';
  });

  return text;
}
