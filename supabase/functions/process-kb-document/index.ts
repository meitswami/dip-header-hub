import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      // For PDFs, use AI to extract and summarize content
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      // Convert PDF to base64 for AI processing
      const arrayBuffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      // Use AI to extract text from PDF
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract ALL text content from this PDF document. Return the complete text content as-is, preserving structure, sections, headings, and all details. Do not summarize - extract everything word for word. If there are tables, format them clearly. This is for building a searchable knowledge base.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:application/pdf;base64,${base64}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error("AI extraction error:", errText);
        throw new Error("Failed to extract text from PDF");
      }

      const aiResult = await aiResp.json();
      text = aiResult.choices?.[0]?.message?.content || "";
    } else {
      // Try reading as text
      text = await fileData.text();
    }

    if (!text || text.trim().length === 0) {
      await supabase.from("knowledge_base_documents").update({
        status: "error",
        error_message: "Could not extract any text from the document",
        processing_completed_at: new Date().toISOString(),
      }).eq("id", documentId);

      return new Response(JSON.stringify({ error: "No text extracted" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chunk the text (approximately 1000 chars per chunk with overlap)
    const CHUNK_SIZE = 1000;
    const OVERLAP = 150;
    const chunks: { content: string; chunk_index: number; page_number: number | null }[] = [];
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

      chunks.push({
        content: chunkText.trim(),
        chunk_index: idx,
        page_number: null,
      });

      start += chunkText.length - OVERLAP;
      if (start <= 0 && idx > 0) break; // safety
      idx++;
    }

    // Insert chunks in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map(c => ({
        document_id: documentId,
        chunk_index: c.chunk_index,
        content: c.content,
        page_number: c.page_number,
      }));
      const { error: chunkError } = await supabase
        .from("knowledge_base_chunks")
        .insert(batch);
      if (chunkError) {
        console.error("Chunk insert error:", chunkError);
      }
    }

    // Update document status
    await supabase.from("knowledge_base_documents").update({
      status: "completed",
      chunk_count: chunks.length,
      processing_completed_at: new Date().toISOString(),
    }).eq("id", documentId);

    return new Response(JSON.stringify({
      success: true,
      chunks: chunks.length,
      textLength: text.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Processing error:", e);

    // Try to update document status
    try {
      const { documentId } = await req.clone().json();
      if (documentId) {
        await supabase.from("knowledge_base_documents").update({
          status: "error",
          error_message: e instanceof Error ? e.message : "Unknown processing error",
          processing_completed_at: new Date().toISOString(),
        }).eq("id", documentId);
      }
    } catch {}

    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
