import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { question, messages } = await req.json();
    if (!question) throw new Error("Missing question");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Search knowledge base chunks using text search
    const searchTerms = question.split(/\s+/).filter((w: string) => w.length > 2).slice(0, 10);
    const searchQuery = searchTerms.join(" | ");

    // Use ilike for broader matching
    let relevantChunks: string[] = [];

    // Try trigram search first
    const { data: chunks } = await supabase
      .from("knowledge_base_chunks")
      .select("content, document_id")
      .or(searchTerms.map((t: string) => `content.ilike.%${t}%`).join(","))
      .limit(20);

    if (chunks && chunks.length > 0) {
      relevantChunks = chunks.map((c: any) => c.content);
    }

    // Also get document titles for context
    const { data: docs } = await supabase
      .from("knowledge_base_documents")
      .select("title, category")
      .eq("status", "completed");

    const docContext = docs?.map((d: any) => `- ${d.title} (${d.category})`).join("\n") || "No documents available";

    const systemPrompt = `You are a Knowledge Base AI Assistant for a Digital Investigation Platform used by law enforcement in India. You have access to a knowledge base containing legal documents, SOPs, case laws, and reference materials.

AVAILABLE DOCUMENTS IN KNOWLEDGE BASE:
${docContext}

RELEVANT CONTENT FROM KNOWLEDGE BASE:
${relevantChunks.length > 0 ? relevantChunks.join("\n\n---\n\n") : "No directly matching content found for this query."}

RULES:
1. Answer ONLY based on the knowledge base content provided above
2. If the answer is not in the knowledge base, say "This information is not available in the current knowledge base. Please upload relevant documents."
3. NEVER fabricate or hallucinate information
4. Cite the source document when possible
5. Be precise with legal section numbers, dates, and procedures
6. Support English, Hindi, and Hinglish queries
7. If quoting from the knowledge base, use exact text
8. Provide comprehensive answers with all relevant details from the knowledge base`;

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...(messages || []).slice(-6),
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI service error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (e) {
    console.error("KB query error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
