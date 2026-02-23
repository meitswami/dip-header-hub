import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OLLAMA_URL = Deno.env.get("OLLAMA_URL") || "http://host.docker.internal:11434";
const OLLAMA_MODEL = Deno.env.get("OLLAMA_MODEL") || "phi3:mini";

// ── Helper: compute deep CDR analytics directly from records ──
async function buildLiveAnalytics(supabase: any, caseId: string): Promise<string> {
  const sections: string[] = [];

  // Fetch all CDR records (up to 5000 for context)
  const { data: cdr } = await supabase
    .from("cdr_records")
    .select("calling_number, called_number, call_date, call_type, duration, imei, imsi, cell_id, tower_lat, tower_lng, tower_location, roaming, operator")
    .eq("case_id", caseId)
    .order("call_date", { ascending: true })
    .limit(5000);

  const cdrList = cdr || [];

  // Fetch IPDR records
  const { data: ipdr } = await supabase
    .from("ipdr_records")
    .select("msisdn, session_start, session_end, source_ip, destination_ip, data_volume, imei, imsi, cell_id, tower_lat, tower_lng, tower_location, protocol")
    .eq("case_id", caseId)
    .limit(3000);

  const ipdrList = ipdr || [];

  // Fetch Tower Dump records
  const { data: towerDump } = await supabase
    .from("tower_dump_records")
    .select("mobile_number, event_time, call_type, duration, imei, imsi, cell_id, tower_lat, tower_lng, tower_location")
    .eq("case_id", caseId)
    .limit(3000);

  const tdList = towerDump || [];

  // Fetch SDR
  const { data: sdr } = await supabase
    .from("sdr_records")
    .select("subscriber_name, mobile_number, operator, circle, activation_date, id_type, id_number, address")
    .eq("case_id", caseId)
    .limit(1000);

  const sdrList = sdr || [];

  // Fetch evidence files summary
  const { data: evidence } = await supabase
    .from("evidence_logs")
    .select("file_name, upload_type, record_count, file_hash, created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });

  const evidenceList = evidence || [];

  sections.push(`DATA VOLUME: ${cdrList.length} CDR records | ${ipdrList.length} IPDR records | ${tdList.length} Tower Dump records | ${sdrList.length} SDR records | ${evidenceList.length} evidence files`);

  if (cdrList.length === 0 && ipdrList.length === 0 && tdList.length === 0) return sections.join("\n");

  // ── 1. Top Contacts (callers + called) ──
  const contactCount: Record<string, { calls: number; totalDur: number; incoming: number; outgoing: number }> = {};
  for (const r of cdrList) {
    for (const num of [r.calling_number, r.called_number]) {
      if (!num) continue;
      if (!contactCount[num]) contactCount[num] = { calls: 0, totalDur: 0, incoming: 0, outgoing: 0 };
      contactCount[num].calls++;
      contactCount[num].totalDur += (r.duration || 0);
      if (num === r.called_number) contactCount[num].incoming++;
      if (num === r.calling_number) contactCount[num].outgoing++;
    }
  }
  const topContacts = Object.entries(contactCount)
    .sort((a, b) => b[1].calls - a[1].calls)
    .slice(0, 20);
  if (topContacts.length) {
    sections.push(`\nTOP 20 CONTACTS (number | total_calls | incoming | outgoing | total_duration_sec):`);
    for (const [num, s] of topContacts) {
      sections.push(`  ${num} | ${s.calls} calls | ${s.incoming} in | ${s.outgoing} out | ${s.totalDur}s`);
    }
  }

  // ── 2. Max Duration Calls ──
  const sorted = [...cdrList].filter(r => r.duration).sort((a, b) => (b.duration || 0) - (a.duration || 0));
  const topDur = sorted.slice(0, 10);
  if (topDur.length) {
    sections.push(`\nTOP 10 LONGEST CALLS:`);
    for (const r of topDur) {
      sections.push(`  ${r.calling_number} → ${r.called_number} | ${r.duration}s | ${r.call_date || "?"} | tower: ${r.tower_location || r.cell_id || "?"}`);
    }
  }

  // ── 3. Day vs Night Calling Pattern ──
  let dayCalls = 0, nightCalls = 0, dayDur = 0, nightDur = 0;
  const nightNumbers: Record<string, number> = {};
  const dayNumbers: Record<string, number> = {};
  for (const r of cdrList) {
    if (!r.call_date) continue;
    const h = new Date(r.call_date).getHours();
    const num = r.called_number || r.calling_number || "?";
    if (h >= 6 && h < 22) {
      dayCalls++; dayDur += (r.duration || 0);
      dayNumbers[num] = (dayNumbers[num] || 0) + 1;
    } else {
      nightCalls++; nightDur += (r.duration || 0);
      nightNumbers[num] = (nightNumbers[num] || 0) + 1;
    }
  }
  sections.push(`\nDAY vs NIGHT CALLING (6AM-10PM = Day, 10PM-6AM = Night):`);
  sections.push(`  Day: ${dayCalls} calls, ${dayDur}s total duration`);
  sections.push(`  Night: ${nightCalls} calls, ${nightDur}s total duration`);

  const topNight = Object.entries(nightNumbers).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topNight.length) {
    sections.push(`  Top Night Numbers: ${topNight.map(([n, c]) => `${n}(${c})`).join(", ")}`);
  }
  const topDay = Object.entries(dayNumbers).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topDay.length) {
    sections.push(`  Top Day Numbers: ${topDay.map(([n, c]) => `${n}(${c})`).join(", ")}`);
  }

  // ── 4. Day Stay / Night Stay (tower location analysis) ──
  const dayTowers: Record<string, number> = {};
  const nightTowers: Record<string, number> = {};
  for (const r of cdrList) {
    if (!r.call_date || (!r.tower_location && !r.cell_id)) continue;
    const loc = r.tower_location || r.cell_id || "?";
    const h = new Date(r.call_date).getHours();
    if (h >= 6 && h < 22) dayTowers[loc] = (dayTowers[loc] || 0) + 1;
    else nightTowers[loc] = (nightTowers[loc] || 0) + 1;
  }
  const topDayStay = Object.entries(dayTowers).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topNightStay = Object.entries(nightTowers).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topDayStay.length || topNightStay.length) {
    sections.push(`\nDAY STAY (most frequent tower locations during day):`);
    for (const [loc, c] of topDayStay) sections.push(`  ${loc}: ${c} hits`);
    sections.push(`NIGHT STAY (most frequent tower locations at night):`);
    for (const [loc, c] of topNightStay) sections.push(`  ${loc}: ${c} hits`);
  }

  // ── 5. IMEI Analysis ──
  const numberImeis: Record<string, Set<string>> = {};
  const imeiNumbers: Record<string, Set<string>> = {};
  for (const r of [...cdrList, ...ipdrList, ...tdList]) {
    const num = (r as any).calling_number || (r as any).called_number || (r as any).msisdn || (r as any).mobile_number;
    const imei = (r as any).imei;
    if (num && imei) {
      if (!numberImeis[num]) numberImeis[num] = new Set();
      numberImeis[num].add(imei);
      if (!imeiNumbers[imei]) imeiNumbers[imei] = new Set();
      imeiNumbers[imei].add(num);
    }
  }
  const imeiSwaps = Object.entries(numberImeis).filter(([_, s]) => s.size > 1);
  if (imeiSwaps.length) {
    sections.push(`\nIMEI CHANGES (numbers using multiple devices):`);
    for (const [num, imeis] of imeiSwaps.slice(0, 15)) {
      sections.push(`  ${num}: ${Array.from(imeis).join(", ")} (${imeis.size} devices)`);
    }
  }
  const sharedImeis = Object.entries(imeiNumbers).filter(([_, s]) => s.size > 1);
  if (sharedImeis.length) {
    sections.push(`\nSHARED IMEI (same device used by multiple numbers — possible associates):`);
    for (const [imei, nums] of sharedImeis.slice(0, 10)) {
      sections.push(`  IMEI ${imei}: ${Array.from(nums).join(", ")}`);
    }
  }

  // ── 6. Hourly Distribution ──
  const hourly = new Array(24).fill(0);
  for (const r of cdrList) {
    if (r.call_date) hourly[new Date(r.call_date).getHours()]++;
  }
  sections.push(`\nHOURLY CALL DISTRIBUTION: ${hourly.map((c, h) => `${h}h:${c}`).join(" | ")}`);

  // ── 7. Unused Period Detection ──
  if (cdrList.length >= 2) {
    const dates = cdrList.filter((r: any) => r.call_date).map((r: any) => new Date(r.call_date).getTime()).sort((a: number, b: number) => a - b);
    let maxGap = 0, gapStart = 0, gapEnd = 0;
    for (let i = 1; i < dates.length; i++) {
      const gap = dates[i] - dates[i - 1];
      if (gap > maxGap) { maxGap = gap; gapStart = dates[i - 1]; gapEnd = dates[i]; }
    }
    if (maxGap > 3600000) { // > 1 hour
      const gapHrs = Math.round(maxGap / 3600000);
      sections.push(`\nLONGEST UNUSED PERIOD: ${gapHrs} hours (${new Date(gapStart).toISOString()} → ${new Date(gapEnd).toISOString()})`);
    }
  }

  // ── 8. Tower Cluster Summary ──
  const allTowers: Record<string, { count: number; lat?: number; lng?: number }> = {};
  for (const r of [...cdrList, ...tdList]) {
    const loc = (r as any).tower_location || (r as any).cell_id;
    if (!loc) continue;
    if (!allTowers[loc]) allTowers[loc] = { count: 0, lat: (r as any).tower_lat, lng: (r as any).tower_lng };
    allTowers[loc].count++;
  }
  const topTowers = Object.entries(allTowers).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  if (topTowers.length) {
    sections.push(`\nTOP 10 TOWER LOCATIONS:`);
    for (const [loc, d] of topTowers) {
      const coords = d.lat && d.lng ? ` (${d.lat},${d.lng})` : "";
      sections.push(`  ${loc}${coords}: ${d.count} events`);
    }
  }

  // ── 9. Operator Breakdown ──
  const operators: Record<string, number> = {};
  for (const r of cdrList) { if (r.operator) operators[r.operator] = (operators[r.operator] || 0) + 1; }
  if (Object.keys(operators).length) {
    sections.push(`\nOPERATOR BREAKDOWN: ${Object.entries(operators).map(([o, c]) => `${o}: ${c}`).join(" | ")}`);
  }

  // ── 10. Roaming Calls ──
  const roamingCalls = cdrList.filter((r: any) => r.roaming && r.roaming.toLowerCase() !== "no" && r.roaming !== "");
  if (roamingCalls.length) {
    sections.push(`\nROAMING CALLS: ${roamingCalls.length} calls while roaming`);
  }

  // ── 11. Call Type Breakdown ──
  const callTypes: Record<string, number> = {};
  for (const r of cdrList) { if (r.call_type) callTypes[r.call_type] = (callTypes[r.call_type] || 0) + 1; }
  if (Object.keys(callTypes).length) {
    sections.push(`\nCALL TYPE BREAKDOWN: ${Object.entries(callTypes).map(([t, c]) => `${t}: ${c}`).join(" | ")}`);
  }

  // ── 12. SDR Summary (Subscriber Details) ──
  if (sdrList.length) {
    sections.push(`\nSUBSCRIBER DETAILS (SDR):`);
    for (const s of sdrList.slice(0, 20)) {
      sections.push(`  ${s.mobile_number || "?"} | ${s.subscriber_name || "?"} | ${s.operator || "?"} | ${s.circle || "?"} | ID: ${s.id_type || "?"} ${s.id_number || "?"} | Activated: ${s.activation_date || "?"}`);
    }
  }

  // ── 13. IPDR Summary ──
  if (ipdrList.length) {
    const totalVol = ipdrList.reduce((s: number, r: any) => s + (r.data_volume || 0), 0);
    const protocols: Record<string, number> = {};
    for (const r of ipdrList) { if (r.protocol) protocols[r.protocol] = (protocols[r.protocol] || 0) + 1; }
    sections.push(`\nIPDR SUMMARY: ${ipdrList.length} sessions | Total data: ${(totalVol / 1048576).toFixed(1)} MB`);
    if (Object.keys(protocols).length) {
      sections.push(`  Protocols: ${Object.entries(protocols).map(([p, c]) => `${p}: ${c}`).join(" | ")}`);
    }
    const topIps: Record<string, number> = {};
    for (const r of ipdrList) { if (r.destination_ip) topIps[r.destination_ip] = (topIps[r.destination_ip] || 0) + 1; }
    const sortedIps = Object.entries(topIps).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sortedIps.length) {
      sections.push(`  Top Destination IPs: ${sortedIps.map(([ip, c]) => `${ip}(${c})`).join(", ")}`);
    }
  }

  // ── 14. Evidence File Inventory ──
  if (evidenceList.length) {
    sections.push(`\nEVIDENCE FILES:`);
    for (const e of evidenceList.slice(0, 20)) {
      sections.push(`  ${e.file_name} | type: ${e.upload_type} | ${e.record_count || 0} records | hash: ${e.file_hash || "N/A"}`);
    }
  }

  // ── 15. Cross-number communication matrix (top pairs) ──
  const pairs: Record<string, number> = {};
  for (const r of cdrList) {
    if (r.calling_number && r.called_number) {
      const key = [r.calling_number, r.called_number].sort().join("↔");
      pairs[key] = (pairs[key] || 0) + 1;
    }
  }
  const topPairs = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (topPairs.length) {
    sections.push(`\nTOP 15 COMMUNICATION PAIRS:`);
    for (const [pair, count] of topPairs) {
      sections.push(`  ${pair}: ${count} calls`);
    }
  }

  // ── 16. Date range ──
  const allDates = cdrList.filter((r: any) => r.call_date).map((r: any) => r.call_date);
  if (allDates.length) {
    allDates.sort();
    sections.push(`\nDATE RANGE: ${allDates[0]} → ${allDates[allDates.length - 1]}`);
  }

  return sections.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, caseId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Build comprehensive case context ──
    let caseContext = "";
    if (caseId) {
      // Case metadata
      const { data: caseInfo } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .maybeSingle();

      if (caseInfo) {
        caseContext += `CASE: ${caseInfo.title} | FIR: ${caseInfo.fir_number || "N/A"} | Sections: ${caseInfo.sections || "N/A"} | Status: ${caseInfo.status}\n`;
        if (caseInfo.complainant) caseContext += `Complainant: ${caseInfo.complainant}\n`;
        if (caseInfo.accused) caseContext += `Accused: ${caseInfo.accused}\n`;
        if (caseInfo.description) caseContext += `Description: ${caseInfo.description}\n`;
      }

      // Aliases
      const { data: aliases } = await supabase.from("aliases").select("phone_number, alias_name, confidence").eq("case_id", caseId);
      if (aliases?.length) {
        caseContext += `\nALIASES: ${aliases.map((a: any) => `${a.phone_number}=${a.alias_name}(${a.confidence || "?"})`).join(", ")}\n`;
      }

      // Person profiles
      const { data: persons } = await supabase.from("person_profiles").select("name, role, phone_numbers, notes").eq("case_id", caseId);
      if (persons?.length) {
        caseContext += `\nPERSON PROFILES:\n`;
        for (const p of persons) {
          caseContext += `  ${p.name} (${p.role || "unknown"}) | phones: ${(p.phone_numbers || []).join(",")} | ${p.notes || ""}\n`;
        }
      }

      // Investigation insights
      const { data: insights } = await supabase.from("investigation_insights").select("insight_type, title, description, severity").eq("case_id", caseId);
      if (insights?.length) {
        caseContext += `\nINVESTIGATION INSIGHTS:\n`;
        for (const i of insights) {
          caseContext += `  [${i.severity || "info"}] ${i.insight_type}: ${i.title} — ${i.description}\n`;
        }
      }

      // Live analytics from records
      const liveAnalytics = await buildLiveAnalytics(supabase, caseId);
      if (liveAnalytics) caseContext += `\n=== LIVE CDR/IPDR/TOWER ANALYTICS ===\n${liveAnalytics}\n`;

      // Geofences
      const { data: geofences } = await supabase.from("geofences").select("name, lat, lng, radius_meters").eq("case_id", caseId);
      if (geofences?.length) {
        caseContext += `\nGEOFENCES: ${geofences.map((g: any) => `${g.name}(${g.lat},${g.lng},${g.radius_meters}m)`).join("; ")}\n`;
      }

      // Geofence alerts
      const { data: gfAlerts } = await supabase.from("geofence_alerts").select("phone_number, event_time, distance_meters, record_type").eq("case_id", caseId).limit(50);
      if (gfAlerts?.length) {
        caseContext += `\nGEOFENCE ALERTS (${gfAlerts.length}):\n`;
        for (const a of gfAlerts.slice(0, 20)) {
          caseContext += `  ${a.phone_number} at ${a.event_time} | ${a.distance_meters}m from zone | type: ${a.record_type}\n`;
        }
      }
    }

    // ── Knowledge base search ──
    let kbContext = "";
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    if (lastUserMsg) {
      const searchTerms = lastUserMsg.split(/\s+/).filter((w: string) => w.length > 2).slice(0, 10);
      if (searchTerms.length > 0) {
        const { data: chunks } = await supabase
          .from("knowledge_base_chunks")
          .select("chunk_text")
          .or(searchTerms.map((t: string) => `chunk_text.ilike.%${t}%`).join(","))
          .limit(15);
        if (chunks?.length) {
          kbContext = "KNOWLEDGE BASE REFERENCES:\n" + chunks.map((c: any) => c.chunk_text).join("\n---\n");
        }
      }
    }

    const systemPrompt = `You are a senior Digital Investigation AI Analyst for Indian law enforcement. You have direct access to comprehensive case data including CDR, IPDR, Tower Dumps, SDR, person profiles, aliases, geofencing data, and investigation insights.

${caseContext ? `\n=== COMPLETE CASE DATA ===\n${caseContext}\n` : ""}
${kbContext ? `\n=== LEGAL & PROCEDURAL KNOWLEDGE ===\n${kbContext}\n` : ""}

Your capabilities:
- Deep CDR analysis: top contacts, call patterns, day/night calling, duration analysis, unused periods
- Location intelligence: day stay, night stay, tower movement, rapid location changes, geofence breaches
- Device tracking: IMEI changes, shared IMEI detection (associates), device swap timelines
- Network analysis: communication pairs, contact clustering, common numbers across multiple CDRs
- IPDR analysis: data sessions, protocol breakdown, destination IP patterns, data volume
- Subscriber correlation: cross-reference SDR (subscriber details) with CDR call patterns
- Legal: cite IPC, CrPC, IT Act, Indian Evidence Act, Bharatiya Nyaya Sanhita sections precisely
- Multi-CDR cross-analysis: when data from 10-20+ CDRs exists, find shared numbers, overlapping towers, coordinated patterns

ANALYSIS METHODOLOGY:
1. When asked about a number, first check aliases/person profiles to identify who it is
2. Cross-reference across CDR + IPDR + Tower Dump + SDR for complete picture
3. Look for time-correlated events (calls at same time from same tower = co-location)
4. Identify communication chains (A calls B, B calls C within minutes)
5. Flag numbers appearing across multiple files as "common numbers"

Rules:
1. NEVER fabricate data. Use ONLY the data provided above
2. If data is insufficient, say "INSUFFICIENT_DATA: [what's missing]"
3. Always show your methodology and cite exact numbers from the data
4. Support English, Hindi, and Hinglish queries
5. When referencing legal sections, cite exact section + act
6. Be precise with numbers, dates, and durations
7. Proactively flag suspicious patterns (unusual timing, rapid tower changes, IMEI swaps)
8. When analyzing multiple CDRs, always identify cross-file patterns
9. Format outputs in tables/lists for clarity

Current case ID: ${caseId}`;

    const response = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Ollama error:", response.status, t);
      if (response.status === 404) {
        return new Response(JSON.stringify({
          error: `Model "${OLLAMA_MODEL}" not found. Run: ollama pull ${OLLAMA_MODEL}`,
        }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        error: `Ollama error (${response.status}). Is Ollama running at ${OLLAMA_URL}?`,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const isConnectionError = msg.includes("Connection refused") || msg.includes("ECONNREFUSED") || msg.includes("NetworkError");
    return new Response(JSON.stringify({
      error: isConnectionError
        ? `Cannot connect to Ollama at ${OLLAMA_URL}. Make sure Ollama is running: ollama serve`
        : msg,
    }), {
      status: isConnectionError ? 503 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
