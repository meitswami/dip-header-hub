import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_OLLAMA_URL = Deno.env.get("OLLAMA_URL") || "http://host.docker.internal:11434";
const DEFAULT_OLLAMA_MODEL = Deno.env.get("OLLAMA_VISION_MODEL") || Deno.env.get("OLLAMA_MODEL") || "llava:7b";

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { documentId, ollamaUrl, ollamaModel } = await req.json();
    const OLLAMA_URL = ollamaUrl?.replace(/\/+$/, '') || DEFAULT_OLLAMA_URL;
    const OLLAMA_MODEL = ollamaModel || DEFAULT_OLLAMA_MODEL;
    if (!documentId) {
      return new Response(
        JSON.stringify({ error: "documentId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch doc record
    const { data: doc, error: docErr } = await supabase
      .from("case_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ext = ((doc as any).file_path || "").split(".").pop()?.toLowerCase();
    const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
    const isText = ext === "txt";

    let extractedText = "";

    if (isText) {
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("case-documents")
        .download((doc as any).file_path);
      if (dlErr) throw dlErr;
      extractedText = await fileData.text();
    } else if (isImage) {
      // Use Ollama vision model for OCR
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("case-documents")
        .download((doc as any).file_path);
      if (dlErr) throw dlErr;

      const arrayBuffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      // Use Ollama's native /api/generate with images for vision
      const aiResponse = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: `Extract ALL text content from this document image accurately. The document is titled "${doc.title}". Preserve structure, formatting, and hierarchy. Pay special attention to names, dates, section numbers, and legal references. Return ONLY the extracted text, no commentary.`,
          images: [base64],
          stream: false,
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("Ollama vision error:", aiResponse.status, errText);

        if (aiResponse.status === 404) {
          extractedText = `[OCR requires a vision model. Run: ollama pull ${OLLAMA_MODEL}]`;
        } else {
          throw new Error(`Ollama error: ${aiResponse.status}`);
        }
      } else {
        const aiData = await aiResponse.json();
        extractedText = aiData.response || "";
      }
    } else {
      extractedText = "[Unsupported file type for OCR. Upload as image (JPG/PNG) or text file.]";
    }

    return new Response(
      JSON.stringify({ success: true, text: extractedText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("OCR error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const isConnectionError = msg.includes("Connection refused") || msg.includes("ECONNREFUSED");

    return new Response(
      JSON.stringify({
        error: isConnectionError
          ? `Cannot connect to Ollama at ${OLLAMA_URL}. Make sure Ollama is running.`
          : msg,
      }),
      { status: isConnectionError ? 503 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
