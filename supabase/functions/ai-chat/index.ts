import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, caseId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // --- Cross-reference: Get latest training profile for deep case context ---
    let caseContext = "";
    if (caseId) {
      const { data: trainingLog } = await supabase
        .from("case_training_logs")
        .select("case_profile, summary")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (trainingLog?.case_profile) {
        const p = trainingLog.case_profile as any;
        const parts: string[] = [];
        if (p.caseInfo) {
          parts.push(`CASE: ${p.caseInfo.title || ""} | FIR: ${p.caseInfo.fir_number || "N/A"} | Sections: ${p.caseInfo.sections || "N/A"} | Status: ${p.caseInfo.status}`);
          if (p.caseInfo.complainant) parts.push(`Complainant: ${p.caseInfo.complainant}`);
          if (p.caseInfo.accused) parts.push(`Accused: ${p.caseInfo.accused}`);
          if (p.caseInfo.description) parts.push(`Description: ${p.caseInfo.description}`);
        }
        if (p.topContacts?.length) parts.push(`TOP CONTACTS: ${p.topContacts.slice(0, 10).map((c: any) => `${c.number}(${c.count})`).join(", ")}`);
        if (p.imeiChanges?.length) parts.push(`IMEI SWAPS: ${p.imeiChanges.map((c: any) => `${c.number}: ${c.imeis.join(",")}`).join("; ")}`);
        if (p.lateNightSummary?.count) parts.push(`LATE NIGHT CALLS: ${p.lateNightSummary.count}`);
        if (p.towerSummary?.uniqueTowers) parts.push(`UNIQUE TOWERS: ${p.towerSummary.uniqueTowers}`);
        if (p.subscribers?.length) parts.push(`SUBSCRIBERS: ${p.subscribers.map((s: any) => `${s.subscriber_name||""} ${s.phone_number||""}`).join("; ")}`);
        if (p.aliases?.length) parts.push(`ALIASES: ${p.aliases.map((a: any) => `${a.phone_number}=${a.alias_name}`).join(", ")}`);
        if (p.persons?.length) parts.push(`PERSONS: ${p.persons.map((pp: any) => `${pp.name}(${pp.role_in_case||""})`).join(", ")}`);
        if (p.insights?.length) parts.push(`INSIGHTS: ${p.insights.map((i: any) => `[${i.insight_type}] ${i.title}`).join("; ")}`);
        if (p.documentTitles?.length) parts.push(`CASE DOCUMENTS: ${p.documentTitles.join(", ")}`);
        caseContext = parts.join("\n");
      }
    }

    // --- Cross-reference: Search knowledge base for user's latest query ---
    let kbContext = "";
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    if (lastUserMsg) {
      const searchTerms = lastUserMsg.split(/\s+/).filter((w: string) => w.length > 2).slice(0, 8);
      if (searchTerms.length > 0) {
        const { data: chunks } = await supabase
          .from("knowledge_base_chunks")
          .select("content")
          .or(searchTerms.map((t: string) => `content.ilike.%${t}%`).join(","))
          .limit(10);
        if (chunks?.length) {
          kbContext = "KNOWLEDGE BASE REFERENCES:\n" + chunks.map((c: any) => c.content).join("\n---\n");
        }
      }
    }

    const systemPrompt = `You are a Digital Investigation AI Analyst for law enforcement. You help investigators analyze case data including CDR (Call Detail Records), IPDR (IP Detail Records), Tower Dump data, and SDR (Subscriber Detail Records).

${caseContext ? `\n=== TRAINED CASE DATA ===\n${caseContext}\n` : ""}
${kbContext ? `\n=== LEGAL & PROCEDURAL KNOWLEDGE ===\n${kbContext}\n` : ""}

Your capabilities:
- Analyze call patterns, frequent contacts, late-night activity
- Track IMEI changes and device swaps
- Identify tower movement anomalies
- Cross-reference subscriber data with call records
- Answer legal questions referencing IPC, CrPC, IT Act, and Indian Evidence Act
- Cross-reference uploaded case documents and knowledge base

Rules:
1. NEVER fabricate data. If data is insufficient, respond with "INSUFFICIENT_DATA: [explanation]"
2. If no relevant data exists, respond with "NO_DATA_FOUND: [explanation]"
3. Always explain your analysis methodology
4. Support queries in English, Hindi, and Hinglish
5. When referencing legal sections, cite the exact section number and act
6. Be precise with numbers and dates
7. Flag any suspicious patterns you notice
8. When knowledge base content is available, cite it in your answers
9. Use the trained case profile data to provide accurate, data-backed answers

Current case ID: ${caseId}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
