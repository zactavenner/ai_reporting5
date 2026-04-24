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
  "task_notifications",
  "creatives", "client_settings", "client_pipelines", "client_custom_tabs",
  "client_funnel_steps", "client_live_ads", "client_pod_assignments",
  "client_voice_notes", "client_offers", "pipeline_stages", "pipeline_opportunities",
  "funnel_campaigns", "funnel_step_variants", "ad_spend_reports",
  "alert_configs", "chat_conversations", "chat_messages",
  "ai_hub_conversations", "ai_hub_messages", "custom_gpts", "gpt_files",
  "gpt_knowledge_base", "knowledge_base_documents", "csv_import_logs",
  "contact_timeline_events", "data_discrepancies", "sync_logs", "sync_queue",
  "sync_outbound_events", "pixel_verifications", "pixel_expected_events",
  "email_parsed_investors", "pending_meeting_tasks", "member_activity_log",
  "dashboard_preferences", "spam_blacklist", "webhook_logs",
  "meta_campaigns", "meta_ad_sets", "meta_ads",
];

const ALLOWED_BUCKETS = ["creatives", "task-files", "gpt-files", "live-ads", "client-offers"];

// Predefined safe relation patterns for select_related
const RELATION_MAP: Record<string, Record<string, string>> = {
  tasks: {
    subtasks: "subtasks:tasks!parent_task_id(id,title,status,priority,due_date,stage,parent_task_id,created_at,updated_at,completed_at,assigned_to,assigned_client_name,recurrence_type,recurrence_interval,recurrence_next_at)",
    assignees: "assignees:task_assignees(id,member_id,pod_id,member:agency_members(id,name,email,role),pod:agency_pods(id,name,color))",
    comments: "comments:task_comments(id,author_name,content,comment_type,audio_url,duration_seconds,transcript,created_at)",
    files: "files:task_files(id,file_name,file_url,file_type,uploaded_by,created_at)",
    history: "history:task_history(id,action,old_value,new_value,changed_by,created_at)",
    notifications: "notifications:task_notifications(id,member_id,message,is_read,triggered_by,created_at)",
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
  meta_campaigns: {
    ad_sets: "ad_sets:meta_ad_sets(id,meta_ad_set_id,name,status,spend,impressions,clicks,ctr,cpc,cpm,attributed_leads,attributed_calls,attributed_showed,attributed_funded,attributed_funded_dollars,cost_per_lead,cost_per_call,cost_per_funded)",
    client: "client:clients(id,name,slug)",
  },
  meta_ad_sets: {
    ads: "ads:meta_ads(id,meta_ad_id,name,status,spend,impressions,clicks,ctr,cpc,cpm,attributed_leads,attributed_calls,attributed_showed,attributed_funded,attributed_funded_dollars,cost_per_lead,cost_per_call,cost_per_funded,preview_url,thumbnail_url)",
    campaign: "campaign:meta_campaigns(id,meta_campaign_id,name,status,objective)",
    client: "client:clients(id,name,slug)",
  },
  meta_ads: {
    ad_set: "ad_set:meta_ad_sets(id,meta_ad_set_id,name,status)",
    client: "client:clients(id,name,slug)",
  },
  client_offers: {
    client: "client:clients(id,name,slug,description,brand_colors,brand_fonts,logo_url,website_url)",
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
      return jsonResp({ 
        tables: ALLOWED_TABLES, 
        buckets: ALLOWED_BUCKETS, 
        relations: RELATION_MAP,
        composite_actions: {
          create_task: {
            description: "Create a task with optional assignees, subtasks, and comments in one call",
            fields: {
              task: "Required. Task object: {title, description?, client_id?, priority?, stage?, due_date?, status?, recurrence_type?, recurrence_interval?, created_by?}",
              assignees: "Optional. Array of {member_id?, pod_id?} - at least one of member_id or pod_id required per entry",
              subtasks: "Optional. Array of {title, description?, priority?, due_date?, status?, stage?, assigned_client_name?}",
              comments: "Optional. Array of {author_name, content, comment_type?}",
            },
          },
          get_ads_overview: {
            description: "Get full Meta ads hierarchy (campaigns → ad sets → ads) for a client with spend & attribution metrics",
            fields: {
              client_id: "Required. The client UUID",
              status: "Optional. Filter by status (e.g. 'ACTIVE')",
              date_start: "Optional. Filter synced_at >= date",
              date_end: "Optional. Filter synced_at <= date",
            },
          },
        },
      });
    }

    // ========================
    // COMPOSITE: create_task
    // ========================
    if (action === "create_task") {
      const { task, assignees, subtasks, comments } = body;
      if (!task || !task.title) {
        return jsonResp({ error: "Missing 'task' object with at least 'title'" }, 400);
      }

      // 1. Create the parent task
      const { data: createdTask, error: taskError } = await supabase
        .from("tasks")
        .insert({
          title: task.title,
          description: task.description || null,
          client_id: task.client_id || null,
          priority: task.priority || "medium",
          stage: task.stage || "backlog",
          status: task.status || "todo",
          due_date: task.due_date || null,
          recurrence_type: task.recurrence_type || null,
          recurrence_interval: task.recurrence_interval || 1,
          recurrence_next_at: task.recurrence_next_at || null,
          created_by: task.created_by || "api",
          assigned_client_name: task.assigned_client_name || null,
        })
        .select()
        .single();

      if (taskError) return jsonResp({ error: `Task creation failed: ${taskError.message}` }, 400);

      const taskId = createdTask.id;
      const results: Record<string, unknown> = { task: createdTask };

      // 2. Add assignees
      if (assignees && Array.isArray(assignees) && assignees.length > 0) {
        const assigneeRows = assignees.map((a: { member_id?: string; pod_id?: string }) => ({
          task_id: taskId,
          member_id: a.member_id || null,
          pod_id: a.pod_id || null,
        }));
        const { data: createdAssignees, error: assErr } = await supabase
          .from("task_assignees")
          .insert(assigneeRows)
          .select("id,member_id,pod_id,member:agency_members(id,name,email,role),pod:agency_pods(id,name,color)");
        if (assErr) {
          results.assignees_error = assErr.message;
        } else {
          results.assignees = createdAssignees;
        }
      }

      // 3. Add subtasks
      if (subtasks && Array.isArray(subtasks) && subtasks.length > 0) {
        const subtaskRows = subtasks.map((s: Record<string, unknown>) => ({
          parent_task_id: taskId,
          client_id: task.client_id || null,
          title: s.title,
          description: s.description || null,
          priority: s.priority || "medium",
          stage: s.stage || "backlog",
          status: s.status || "todo",
          due_date: s.due_date || null,
          assigned_client_name: s.assigned_client_name || null,
          created_by: task.created_by || "api",
        }));
        const { data: createdSubtasks, error: subErr } = await supabase
          .from("tasks")
          .insert(subtaskRows)
          .select();
        if (subErr) {
          results.subtasks_error = subErr.message;
        } else {
          results.subtasks = createdSubtasks;
        }
      }

      // 4. Add comments
      if (comments && Array.isArray(comments) && comments.length > 0) {
        const commentRows = comments.map((c: Record<string, unknown>) => ({
          task_id: taskId,
          author_name: c.author_name || "API",
          content: c.content,
          comment_type: c.comment_type || "text",
        }));
        const { data: createdComments, error: comErr } = await supabase
          .from("task_comments")
          .insert(commentRows)
          .select();
        if (comErr) {
          results.comments_error = comErr.message;
        } else {
          results.comments = createdComments;
        }
      }

      // 5. Log history
      await supabase.from("task_history").insert({
        task_id: taskId,
        action: "created",
        new_value: task.title,
        changed_by: task.created_by || "api",
      });

      return jsonResp(results);
    }

    // ========================
    // COMPOSITE: get_ads_overview
    // ========================
    if (action === "get_ads_overview") {
      const { client_id, status, date_start, date_end } = body;
      if (!client_id) {
        return jsonResp({ error: "Missing 'client_id'" }, 400);
      }

      // Fetch campaigns with nested ad sets and ads
      let campaignQuery = supabase
        .from("meta_campaigns")
        .select(`
          *,
          ad_sets:meta_ad_sets(
            *,
            ads:meta_ads(*)
          )
        `)
        .eq("client_id", client_id)
        .order("spend", { ascending: false });

      if (status) campaignQuery = campaignQuery.eq("status", status);
      if (date_start) campaignQuery = campaignQuery.gte("synced_at", date_start);
      if (date_end) campaignQuery = campaignQuery.lte("synced_at", date_end);

      const { data: campaigns, error } = await campaignQuery;
      if (error) return jsonResp({ error: error.message }, 400);

      // Calculate totals
      let totalSpend = 0, totalImpressions = 0, totalClicks = 0;
      let totalLeads = 0, totalCalls = 0, totalFunded = 0, totalFundedDollars = 0;
      for (const c of (campaigns || [])) {
        totalSpend += Number(c.spend) || 0;
        totalImpressions += Number(c.impressions) || 0;
        totalClicks += Number(c.clicks) || 0;
        totalLeads += Number(c.attributed_leads) || 0;
        totalCalls += Number(c.attributed_calls) || 0;
        totalFunded += Number(c.attributed_funded) || 0;
        totalFundedDollars += Number(c.attributed_funded_dollars) || 0;
      }

      return jsonResp({
        client_id,
        totals: {
          campaigns: (campaigns || []).length,
          spend: totalSpend,
          impressions: totalImpressions,
          clicks: totalClicks,
          ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00",
          attributed_leads: totalLeads,
          attributed_calls: totalCalls,
          attributed_funded: totalFunded,
          attributed_funded_dollars: totalFundedDollars,
          cost_per_lead: totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : null,
          cost_per_call: totalCalls > 0 ? (totalSpend / totalCalls).toFixed(2) : null,
          cost_per_funded: totalFunded > 0 ? (totalSpend / totalFunded).toFixed(2) : null,
        },
        campaigns,
      });
    }

    // ========================
    // Storage actions
    // ========================

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

    // ========================
    // Generic CRUD actions
    // ========================

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
          } else if (Array.isArray(v)) {
            // Support shorthand array filters: { field: ["a", "b"] } => IN
            query = query.in(k, v);
          } else if (typeof v === "object" && v !== null) {
            // Supports both styles:
            // 1) { field: { op: "in", value: [...] } }
            // 2) { field: { "$in": [...] } } (OpenClaw/Mongo-style)
            const filterObj = v as Record<string, unknown>;
            const prefixedOpEntry = Object.entries(filterObj).find(([opKey]) => opKey.startsWith("$"));

            const normalizedOp = typeof filterObj.op === "string"
              ? filterObj.op
              : (prefixedOpEntry ? prefixedOpEntry[0].slice(1) : undefined);

            const normalizedValue = filterObj.value !== undefined
              ? filterObj.value
              : (prefixedOpEntry ? prefixedOpEntry[1] : undefined);

            if (normalizedOp && normalizedValue !== undefined) {
              switch (normalizedOp) {
                case "gt": query = query.gt(k, normalizedValue); break;
                case "gte": query = query.gte(k, normalizedValue); break;
                case "lt": query = query.lt(k, normalizedValue); break;
                case "lte": query = query.lte(k, normalizedValue); break;
                case "neq": query = query.neq(k, normalizedValue); break;
                case "like": query = query.like(k, normalizedValue as string); break;
                case "ilike": query = query.ilike(k, normalizedValue as string); break;
                case "in": query = query.in(k, Array.isArray(normalizedValue) ? normalizedValue : [normalizedValue]); break;
                case "is": query = query.is(k, normalizedValue as null | boolean); break;
                default: query = query.eq(k, normalizedValue);
              }
            } else {
              // Fallback for plain object equality (e.g. exact jsonb match)
              query = query.eq(k, v);
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

    return jsonResp({ error: "Invalid action. Use: list_tables, select, count, insert, upsert, update, delete, create_task, get_ads_overview, list_storage, get_file_url, delete_file, upload_file_base64" }, 400);

  } catch (err: unknown) {
    return jsonResp({ error: err instanceof Error ? err.message : String(err) }, 500);
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
  } catch (err: unknown) {
    return jsonResp({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
