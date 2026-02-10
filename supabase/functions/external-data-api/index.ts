import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_PASSWORD = "HPA1234$";

const ALLOWED_TABLES = [
  "clients", "leads", "calls", "funded_investors", "daily_metrics",
  "agency_members", "agency_pods", "agency_settings", "agency_meetings",
  "tasks", "task_comments", "task_files", "task_history", "task_assignees",
  "creatives", "client_settings", "client_pipelines", "client_custom_tabs",
  "client_funnel_steps", "client_live_ads", "client_pod_assignments",
  "client_voice_notes", "pipeline_stages", "pipeline_opportunities",
  "funnel_campaigns", "funnel_step_variants", "ad_spend_reports",
  "alert_configs", "chat_conversations", "chat_messages",
  "ai_hub_conversations", "ai_hub_messages", "custom_gpts", "gpt_files",
  "gpt_knowledge_base", "knowledge_base_documents", "csv_import_logs",
  "contact_timeline_events", "data_discrepancies", "sync_logs", "sync_queue",
  "sync_outbound_events", "pixel_verifications", "pixel_expected_events",
  "email_parsed_investors", "pending_meeting_tasks", "member_activity_log",
  "dashboard_preferences", "spam_blacklist", "webhook_logs",
];

const ALLOWED_BUCKETS = ["creatives", "task-files", "gpt-files", "live-ads"];

// Predefined safe relation patterns for select_related
const RELATION_MAP: Record<string, Record<string, string>> = {
  tasks: {
    subtasks: "subtasks:tasks!parent_task_id(id,title,status,priority,due_date,stage,parent_task_id,created_at,updated_at,completed_at,assigned_to,assigned_client_name)",
    assignees: "assignees:task_assignees(id,member_id,pod_id,member:agency_members(id,name,email,role),pod:agency_pods(id,name,color))",
    comments: "comments:task_comments(id,author_name,content,comment_type,audio_url,duration_seconds,transcript,created_at)",
    files: "files:task_files(id,file_name,file_url,file_type,uploaded_by,created_at)",
    history: "history:task_history(id,action,old_value,new_value,changed_by,created_at)",
  },
  creatives: {
    client: "client:clients(id,name,slug)",
  },
  pipeline_opportunities: {
    stage: "stage:pipeline_stages(id,name,sort_order)",
  },
  client_pipelines: {
    stages: "stages:pipeline_stages(id,name,ghl_stage_id,sort_order)",
  },
  agency_members: {
    pod: "pod:agency_pods(id,name,color,description)",
  },
  task_assignees: {
    member: "member:agency_members(id,name,email,role,pod:agency_pods(id,name,color))",
    pod: "pod:agency_pods(id,name,color)",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    // Handle multipart file uploads
    if (contentType.includes("multipart/form-data")) {
      return await handleFileUpload(req);
    }

    const body = await req.json();
    const { password, action, table, filters, limit, offset, order_by, order_dir, data, match, include, select_columns, bucket, file_path } = body;

    if (password !== VALID_PASSWORD) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // list_tables
    if (action === "list_tables") {
      return jsonResp({ tables: ALLOWED_TABLES, buckets: ALLOWED_BUCKETS, relations: RELATION_MAP });
    }

    // list_storage - list files in a bucket
    if (action === "list_storage") {
      if (!bucket || !ALLOWED_BUCKETS.includes(bucket)) {
        return jsonResp({ error: `Invalid bucket. Allowed: ${ALLOWED_BUCKETS.join(", ")}` }, 400);
      }
      const folderPath = file_path || "";
      const { data: files, error } = await supabase.storage.from(bucket).list(folderPath, {
        limit: limit || 100,
        offset: offset || 0,
        sortBy: { column: order_by || "created_at", order: order_dir || "desc" },
      });
      if (error) return jsonResp({ error: error.message }, 400);
      return jsonResp({ data: files, bucket, path: folderPath });
    }

    // get_file_url - get public URL for a file
    if (action === "get_file_url") {
      if (!bucket || !ALLOWED_BUCKETS.includes(bucket)) {
        return jsonResp({ error: `Invalid bucket. Allowed: ${ALLOWED_BUCKETS.join(", ")}` }, 400);
      }
      if (!file_path) return jsonResp({ error: "Missing 'file_path'" }, 400);
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(file_path);
      return jsonResp({ url: urlData.publicUrl, bucket, file_path });
    }

    // delete_file - delete a file from storage
    if (action === "delete_file") {
      if (!bucket || !ALLOWED_BUCKETS.includes(bucket)) {
        return jsonResp({ error: `Invalid bucket. Allowed: ${ALLOWED_BUCKETS.join(", ")}` }, 400);
      }
      if (!file_path) return jsonResp({ error: "Missing 'file_path'" }, 400);
      const { error } = await supabase.storage.from(bucket).remove([file_path]);
      if (error) return jsonResp({ error: error.message }, 400);
      return jsonResp({ success: true, bucket, file_path });
    }

    // upload_file_base64 - upload a file using base64 data
    if (action === "upload_file_base64") {
      if (!bucket || !ALLOWED_BUCKETS.includes(bucket)) {
        return jsonResp({ error: `Invalid bucket. Allowed: ${ALLOWED_BUCKETS.join(", ")}` }, 400);
      }
      if (!file_path || !data) return jsonResp({ error: "Missing 'file_path' and/or 'data' (base64)" }, 400);
      const contentTypeHeader = body.content_type || "application/octet-stream";
      
      // Decode base64
      const binaryStr = atob(data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      
      const { error } = await supabase.storage.from(bucket).upload(file_path, bytes, {
        contentType: contentTypeHeader,
        upsert: true,
      });
      if (error) return jsonResp({ error: error.message }, 400);
      
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(file_path);
      return jsonResp({ success: true, url: urlData.publicUrl, bucket, file_path });
    }

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return jsonResp({ error: `Invalid table. Allowed: ${ALLOWED_TABLES.join(", ")}` }, 400);
    }

    // Build select string with optional relations
    const buildSelectStr = () => {
      let selectStr = select_columns || "*";
      if (include && Array.isArray(include) && RELATION_MAP[table]) {
        const relationStrs = include
          .filter((rel: string) => RELATION_MAP[table][rel])
          .map((rel: string) => RELATION_MAP[table][rel]);
        if (relationStrs.length > 0) {
          selectStr += ", " + relationStrs.join(", ");
        }
      }
      return selectStr;
    };

    // SELECT (with optional relations via include)
    if (action === "select") {
      let query = supabase.from(table).select(buildSelectStr(), { count: "exact" });
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v === null) {
            query = query.is(k, null);
          } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
            // Support operators: {column: {op: "gte", value: 5}}
            const filterObj = v as { op: string; value: unknown };
            if (filterObj.op && filterObj.value !== undefined) {
              switch (filterObj.op) {
                case "gt": query = query.gt(k, filterObj.value); break;
                case "gte": query = query.gte(k, filterObj.value); break;
                case "lt": query = query.lt(k, filterObj.value); break;
                case "lte": query = query.lte(k, filterObj.value); break;
                case "neq": query = query.neq(k, filterObj.value); break;
                case "like": query = query.like(k, filterObj.value as string); break;
                case "ilike": query = query.ilike(k, filterObj.value as string); break;
                case "in": query = query.in(k, filterObj.value as unknown[]); break;
                case "is": query = query.is(k, filterObj.value as null | boolean); break;
                default: query = query.eq(k, filterObj.value);
              }
            }
          } else {
            query = query.eq(k, v);
          }
        }
      }
      if (order_by) query = query.order(order_by, { ascending: order_dir !== "desc" });
      query = query.range(offset || 0, (offset || 0) + (limit || 1000) - 1);
      const { data: rows, count, error } = await query;
      if (error) return jsonResp({ error: error.message }, 400);
      return jsonResp({ data: rows, count, table });
    }

    // COUNT
    if (action === "count") {
      let query = supabase.from(table).select("*", { count: "exact", head: true });
      if (filters) Object.entries(filters).forEach(([k, v]) => { query = query.eq(k, v as string); });
      const { count, error } = await query;
      if (error) return jsonResp({ error: error.message }, 400);
      return jsonResp({ count, table });
    }

    // INSERT
    if (action === "insert") {
      if (!data) return jsonResp({ error: "Missing 'data' field" }, 400);
      const { data: rows, error } = await supabase.from(table).insert(data).select();
      if (error) return jsonResp({ error: error.message }, 400);
      return jsonResp({ data: rows, table });
    }

    // UPSERT
    if (action === "upsert") {
      if (!data) return jsonResp({ error: "Missing 'data' field" }, 400);
      const { data: rows, error } = await supabase.from(table).upsert(data).select();
      if (error) return jsonResp({ error: error.message }, 400);
      return jsonResp({ data: rows, table });
    }

    // UPDATE
    if (action === "update") {
      if (!data || !match) return jsonResp({ error: "Missing 'data' and/or 'match' fields" }, 400);
      let query = supabase.from(table).update(data);
      Object.entries(match).forEach(([k, v]) => { query = query.eq(k, v as string); });
      const { data: rows, error } = await query.select();
      if (error) return jsonResp({ error: error.message }, 400);
      return jsonResp({ data: rows, table });
    }

    // DELETE
    if (action === "delete") {
      if (!match) return jsonResp({ error: "Missing 'match' field" }, 400);
      let query = supabase.from(table).delete();
      Object.entries(match).forEach(([k, v]) => { query = query.eq(k, v as string); });
      const { data: rows, error } = await query.select();
      if (error) return jsonResp({ error: error.message }, 400);
      return jsonResp({ data: rows, table });
    }

    return jsonResp({ error: "Invalid action. Use: list_tables, select, count, insert, upsert, update, delete, list_storage, get_file_url, delete_file, upload_file_base64" }, 400);

  } catch (err) {
    return jsonResp({ error: err.message }, 500);
  }
});

async function handleFileUpload(req: Request) {
  try {
    const formData = await req.formData();
    const password = formData.get("password") as string;
    if (password !== VALID_PASSWORD) {
      return jsonResp({ error: "Unauthorized" }, 401);
    }

    const bucket = formData.get("bucket") as string;
    const filePath = formData.get("file_path") as string;
    const file = formData.get("file") as File;

    if (!bucket || !ALLOWED_BUCKETS.includes(bucket)) {
      return jsonResp({ error: `Invalid bucket. Allowed: ${ALLOWED_BUCKETS.join(", ")}` }, 400);
    }
    if (!filePath || !file) {
      return jsonResp({ error: "Missing 'file_path' and/or 'file'" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
      contentType: file.type,
      upsert: true,
    });
    if (error) return jsonResp({ error: error.message }, 400);

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return jsonResp({ success: true, url: urlData.publicUrl, bucket, file_path: filePath });
  } catch (err) {
    return jsonResp({ error: err.message }, 500);
  }
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
