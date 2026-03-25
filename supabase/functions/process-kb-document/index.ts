import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OLLAMA_URL = Deno.env.get("OLLAMA_URL") || "http://host.docker.internal:11434";
const OLLAMA_MODEL = Deno.env.get("OLLAMA_MODEL") || "phi3:mini";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { documentId, filePath } = await req.json();
    if (!documentId || !filePath) throw new Error("Missing documentId or filePath");

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("knowledge-base")
      .download(filePath);
    if (downloadError) throw downloadError;

    // Extract text from file
    let text = "";
    const fileName = filePath.split("/").pop()?.toLowerCase() || "";

    if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      text = await fileData.text();
    } else if (fileName.endsWith(".pdf")) {
      // For PDFs in offline mode, use Ollama for text extraction if available
      // Otherwise mark as needing manual review
      try {
        const pdfText = await fileData.text();
        // If it's a text-based PDF, we might get some content
        if (pdfText && pdfText.trim().length > 50 && !pdfText.includes("%PDF")) {
          text = pdfText;
        } else {
          // Use Ollama to summarize what we can extract
          const resp = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: OLLAMA_MODEL,
              messages: [{
                role: "user",
                content: `The following is raw content extracted from a PDF file named "${fileName}". Clean it up and extract all readable text. If it's mostly binary/unreadable, say "UNREADABLE_PDF".\n\n${pdfText.slice(0, 5000)}`,
              }],
            }),
          });
          if (resp.ok) {
            const result = await resp.json();
            const extracted = result.choices?.[0]?.message?.content || "";
            if (!extracted.includes("UNREADABLE_PDF")) {
              text = extracted;
            } else {
              text = "[PDF document - upload as .txt for automatic processing, or convert to text manually]";
            }
          } else {
            text = "[PDF document - manual text extraction required for offline mode]";
          }
        }
      } catch {
        text = "[PDF document - manual text extraction required for offline mode]";
      }
    } else {
      // Try reading as text
      text = await fileData.text();
    }

    if (!text || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "No text extracted" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chunk the text (~1000 chars per chunk with overlap)
    const CHUNK_SIZE = 1000;
    const OVERLAP = 150;
    const chunks: { chunk_text: string; chunk_index: number }[] = [];
    let start = 0;
    let idx = 0;

    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      let chunkText = text.slice(start, end);

      // Try to break at sentence boundary
      if (end < text.length) {
        const lastPeriod = chunkText.lastIndexOf(".");
        const lastNewline = chunkText.lastIndexOf("\n");
        const breakPoint = Math.max(lastPeriod, lastNewline);
        if (breakPoint > CHUNK_SIZE * 0.5) {
          chunkText = chunkText.slice(0, breakPoint + 1);
        }
      }

      chunks.push({ chunk_text: chunkText.trim(), chunk_index: idx });
      start += chunkText.length - OVERLAP;
      if (start <= 0 && idx > 0) break;
      idx++;
    }

    // Insert chunks in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map(c => ({
        document_id: documentId,
        chunk_index: c.chunk_index,
        chunk_text: c.chunk_text,
      }));
      const { error: chunkError } = await supabase
        .from("knowledge_base_chunks")
        .insert(batch);
      if (chunkError) {
        console.error("Chunk insert error:", chunkError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      chunks: chunks.length,
      textLength: text.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Processing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
