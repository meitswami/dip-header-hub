import { supabase } from '@/integrations/supabase/client';

interface InsightResult {
  type: string;
  title: string;
  description: string;
  data: any;
}

export async function runAutoAnalysis(caseId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];

  // Fetch CDR data for this case
  const { data: cdrData } = await supabase
    .from('cdr_records')
    .select('*')
    .eq('case_id', caseId);

  if (!cdrData || cdrData.length === 0) return insights;

  // 1. Frequent Contacts
  const contactCount: Record<string, number> = {};
  cdrData.forEach(r => {
    if (r.called_number) contactCount[r.called_number] = (contactCount[r.called_number] || 0) + 1;
    if (r.calling_number) contactCount[r.calling_number] = (contactCount[r.calling_number] || 0) + 1;
  });
  const topContacts = Object.entries(contactCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([number, count]) => ({ number, count }));

  if (topContacts.length > 0) {
    insights.push({
      type: 'frequent_contacts',
      title: `Top ${topContacts.length} Frequent Contacts`,
      description: `Most contacted number: ${topContacts[0].number} (${topContacts[0].count} calls)`,
      data: topContacts,
    });
  }

  // 2. Late Night Patterns (11 PM - 5 AM)
  const lateNightCalls = cdrData.filter(r => {
    if (!r.call_date) return false;
    const hour = new Date(r.call_date).getHours();
    return hour >= 23 || hour < 5;
  });
  if (lateNightCalls.length > 0) {
    const lateNumbers: Record<string, number> = {};
    lateNightCalls.forEach(r => {
      const num = r.called_number || r.calling_number || 'unknown';
      lateNumbers[num] = (lateNumbers[num] || 0) + 1;
    });
    const topLate = Object.entries(lateNumbers).sort((a, b) => b[1] - a[1]).slice(0, 5);
    insights.push({
      type: 'late_night_pattern',
      title: `${lateNightCalls.length} Late Night Calls (11PM–5AM)`,
      description: `Most active late night: ${topLate[0]?.[0]} (${topLate[0]?.[1]} calls)`,
      data: { total: lateNightCalls.length, topNumbers: topLate.map(([n, c]) => ({ number: n, count: c })) },
    });
  }

  // 3. IMEI Change Tracking
  const numberImeis: Record<string, Set<string>> = {};
  cdrData.forEach(r => {
    const num = r.calling_number || r.called_number;
    if (num && r.imei) {
      if (!numberImeis[num]) numberImeis[num] = new Set();
      numberImeis[num].add(r.imei);
    }
  });
  const imeiChanges = Object.entries(numberImeis)
    .filter(([_, imeis]) => imeis.size > 1)
    .map(([number, imeis]) => ({ number, imeis: Array.from(imeis), count: imeis.size }));

  if (imeiChanges.length > 0) {
    insights.push({
      type: 'imei_change',
      title: `${imeiChanges.length} Numbers with Multiple IMEIs`,
      description: `Possible device swaps detected for ${imeiChanges.length} numbers`,
      data: imeiChanges,
    });
  }

  // 4. Tower Movement Anomalies
  const numberTowers: Record<string, { towers: Set<string>; timestamps: string[] }> = {};
  cdrData.forEach(r => {
    const num = r.calling_number || r.called_number;
    if (num && r.cell_id) {
      if (!numberTowers[num]) numberTowers[num] = { towers: new Set(), timestamps: [] };
      numberTowers[num].towers.add(r.cell_id);
      if (r.call_date) numberTowers[num].timestamps.push(r.call_date);
    }
  });
  const rapidMovers = Object.entries(numberTowers)
    .filter(([_, data]) => data.towers.size >= 5)
    .map(([number, data]) => ({ number, uniqueTowers: data.towers.size }))
    .sort((a, b) => b.uniqueTowers - a.uniqueTowers)
    .slice(0, 10);

  if (rapidMovers.length > 0) {
    insights.push({
      type: 'tower_movement',
      title: `${rapidMovers.length} Numbers with High Tower Diversity`,
      description: `${rapidMovers[0].number} appeared across ${rapidMovers[0].uniqueTowers} different towers`,
      data: rapidMovers,
    });
  }

  // 5. Contact Clustering
  const contactPairs: Record<string, Set<string>> = {};
  cdrData.forEach(r => {
    if (r.calling_number && r.called_number) {
      if (!contactPairs[r.calling_number]) contactPairs[r.calling_number] = new Set();
      contactPairs[r.calling_number].add(r.called_number);
    }
  });
  const clusters = Object.entries(contactPairs)
    .filter(([_, contacts]) => contacts.size >= 3)
    .map(([number, contacts]) => ({ number, contacts: Array.from(contacts), size: contacts.size }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);

  if (clusters.length > 0) {
    insights.push({
      type: 'contact_cluster',
      title: `${clusters.length} Contact Clusters Identified`,
      description: `Largest cluster: ${clusters[0].number} connected to ${clusters[0].size} numbers`,
      data: clusters,
    });
  }

  // Save insights to database
  if (insights.length > 0) {
    await supabase.from('investigation_insights').insert(
      insights.map(i => ({
        case_id: caseId,
        insight_type: i.type,
        title: i.title,
        description: i.description,
        data: i.data,
      }))
    );
  }

  return insights;
}
