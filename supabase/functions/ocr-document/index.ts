import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { documentId } = await req.json();
    if (!documentId) {
      return new Response(
        JSON.stringify({ error: "documentId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update status to processing
    await supabase
      .from("case_documents")
      .update({ ocr_status: "processing" })
      .eq("id", documentId);

    const ext = doc.file_name.split(".").pop()?.toLowerCase();
    const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
    const isPdf = ext === "pdf";
    const isText = ext === "txt";

    let extractedText = "";

    if (isText) {
      // For text files, download and read directly
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("case-documents")
        .download(doc.file_url);
      if (dlErr) throw dlErr;
      extractedText = await fileData.text();
    } else if (isImage) {
      // For images, use Lovable AI with vision to OCR
      const { data: signedData } = await supabase.storage
        .from("case-documents")
        .createSignedUrl(doc.file_url, 600);

      if (!signedData?.signedUrl) throw new Error("Could not create signed URL");

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const aiResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are an OCR and document analysis expert. Extract ALL text content from the provided image accurately. 
The document is titled "${doc.title}" and categorized as "${doc.category}".
Preserve the structure, formatting, and hierarchy of the document.
If it's a legal document (FIR, chargesheet, court order, etc.), pay special attention to names, dates, section numbers, and legal references.
Return ONLY the extracted text content, no commentary.`,
              },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: { url: signedData.signedUrl },
                  },
                  {
                    type: "text",
                    text: `Extract all text from this document image. Document name: "${doc.title}", Category: "${doc.category}"`,
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("AI error:", aiResponse.status, errText);
        if (aiResponse.status === 429) {
          await supabase.from("case_documents").update({ ocr_status: "error" }).eq("id", documentId);
          return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI gateway error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      extractedText = aiData.choices?.[0]?.message?.content || "";
    } else if (isPdf) {
      // For PDFs we can't directly process them with vision, note it
      extractedText = "[PDF document - manual review required. Upload as image for automatic OCR.]";
    }

    // Save extracted text
    await supabase
      .from("case_documents")
      .update({ ocr_text: extractedText, ocr_status: "completed" })
      .eq("id", documentId);

    return new Response(
      JSON.stringify({ success: true, text: extractedText }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("OCR error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
