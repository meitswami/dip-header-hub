import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TABLES = [
  "cases",
  "case_assignments",
  "cdr_records",
  "ipdr_records",
  "tower_dump_records",
  "sdr_records",
  "investigation_insights",
  "chat_logs",
  "case_tasks",
  "activity_logs",
  "evidence_logs",
  "case_documents",
  "aliases",
  "person_profiles",
  "geofences",
  "geofence_alerts",
  "case_training_logs",
  "notifications",
  "knowledge_base_documents",
  "knowledge_base_chunks",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with their JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse query params
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "json";
    const caseId = url.searchParams.get("case_id"); // optional: export single case
    const tables = url.searchParams.get("tables")?.split(",") || [...TABLES];

    const exportData: Record<string, unknown[]> = {};

    for (const table of tables) {
      if (!TABLES.includes(table as any)) continue;

      let query = adminClient.from(table).select("*");

      // Scope to case if requested (except user-scoped tables)
      if (caseId) {
        if (table === "cases") {
          query = query.eq("id", caseId);
        } else if (table === "notifications") {
          query = query.eq("case_id", caseId);
        } else if (table === "knowledge_base_documents" || table === "knowledge_base_chunks") {
          // KB is global, skip case filter
        } else if (table === "case_assignments") {
          query = query.eq("case_id", caseId);
        } else {
          query = query.eq("case_id", caseId);
        }
      }

      // Fetch all rows (paginate past 1000 limit)
      const allRows: unknown[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) {
          console.error(`Error fetching ${table}:`, error.message);
          break;
        }
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      exportData[table] = allRows;
    }

    if (format === "sql") {
      // Generate SQL INSERT statements
      let sql = `-- DIP Data Export\n-- Generated: ${new Date().toISOString()}\n-- Case: ${caseId || "ALL"}\n\n`;
      sql += "BEGIN;\n\n";

      for (const [table, rows] of Object.entries(exportData)) {
        if (rows.length === 0) continue;
        sql += `-- Table: ${table} (${rows.length} rows)\n`;

        for (const row of rows) {
          const record = row as Record<string, unknown>;
          const cols = Object.keys(record);
          const vals = cols.map((c) => {
            const v = record[c];
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "number" || typeof v === "boolean") return String(v);
            if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          sql += `INSERT INTO public.${table} (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT DO NOTHING;\n`;
        }
        sql += "\n";
      }

      sql += "COMMIT;\n";

      return new Response(sql, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/sql",
          "Content-Disposition": `attachment; filename="dip-export-${caseId || "all"}-${Date.now()}.sql"`,
        },
      });
    }

    // JSON format (default)
    const payload = {
      exported_at: new Date().toISOString(),
      case_id: caseId || "all",
      table_counts: Object.fromEntries(Object.entries(exportData).map(([k, v]) => [k, v.length])),
      data: exportData,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dip-export-${caseId || "all"}-${Date.now()}.json"`,
      },
    });
  } catch (e) {
    console.error("Export error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
