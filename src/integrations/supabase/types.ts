export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_spend_reports: {
        Row: {
          ad_set_name: string | null
          campaign_name: string | null
          clicks: number | null
          client_id: string
          created_at: string | null
          id: string
          impressions: number | null
          platform: string | null
          reported_at: string
          spend: number | null
        }
        Insert: {
          ad_set_name?: string | null
          campaign_name?: string | null
          clicks?: number | null
          client_id: string
          created_at?: string | null
          id?: string
          impressions?: number | null
          platform?: string | null
          reported_at: string
          spend?: number | null
        }
        Update: {
          ad_set_name?: string | null
          campaign_name?: string | null
          clicks?: number | null
          client_id?: string
          created_at?: string | null
          id?: string
          impressions?: number | null
          platform?: string | null
          reported_at?: string
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_spend_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_meetings: {
        Row: {
          action_items: Json | null
          client_id: string | null
          created_at: string
          duration_minutes: number | null
          highlights: Json | null
          id: string
          meetgeek_url: string | null
          meeting_date: string | null
          meeting_id: string
          participants: Json | null
          recording_url: string | null
          summary: string | null
          title: string
          transcript: string | null
        }
        Insert: {
          action_items?: Json | null
          client_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          highlights?: Json | null
          id?: string
          meetgeek_url?: string | null
          meeting_date?: string | null
          meeting_id: string
          participants?: Json | null
          recording_url?: string | null
          summary?: string | null
          title: string
          transcript?: string | null
        }
        Update: {
          action_items?: Json | null
          client_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          highlights?: Json | null
          id?: string
          meetgeek_url?: string | null
          meeting_date?: string | null
          meeting_id?: string
          participants?: Json | null
          recording_url?: string | null
          summary?: string | null
          title?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_members: {
        Row: {
          created_at: string
          email: string
          id: string
          last_login_at: string | null
          name: string
          pod_id: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          last_login_at?: string | null
          name: string
          pod_id?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_login_at?: string | null
          name?: string
          pod_id?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_members_pod_id_fkey"
            columns: ["pod_id"]
            isOneToOne: false
            referencedRelation: "agency_pods"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_pods: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_settings: {
        Row: {
          ai_prompt_agency: string | null
          ai_prompt_client: string | null
          api_usage_limit: number | null
          created_at: string
          gemini_api_key: string | null
          id: string
          meetgeek_api_key: string | null
          meetgeek_webhook_secret: string | null
          openai_api_key: string | null
          password_hash: string | null
          selected_gemini_model: string | null
          selected_grok_model: string | null
          selected_openai_model: string | null
          updated_at: string
          xai_api_key: string | null
        }
        Insert: {
          ai_prompt_agency?: string | null
          ai_prompt_client?: string | null
          api_usage_limit?: number | null
          created_at?: string
          gemini_api_key?: string | null
          id?: string
          meetgeek_api_key?: string | null
          meetgeek_webhook_secret?: string | null
          openai_api_key?: string | null
          password_hash?: string | null
          selected_gemini_model?: string | null
          selected_grok_model?: string | null
          selected_openai_model?: string | null
          updated_at?: string
          xai_api_key?: string | null
        }
        Update: {
          ai_prompt_agency?: string | null
          ai_prompt_client?: string | null
          api_usage_limit?: number | null
          created_at?: string
          gemini_api_key?: string | null
          id?: string
          meetgeek_api_key?: string | null
          meetgeek_webhook_secret?: string | null
          openai_api_key?: string | null
          password_hash?: string | null
          selected_gemini_model?: string | null
          selected_grok_model?: string | null
          selected_openai_model?: string | null
          updated_at?: string
          xai_api_key?: string | null
        }
        Relationships: []
      }
      ai_hub_conversations: {
        Row: {
          created_at: string
          gpt_id: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gpt_id?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gpt_id?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_hub_conversations_gpt_id_fkey"
            columns: ["gpt_id"]
            isOneToOne: false
            referencedRelation: "custom_gpts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_hub_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_hub_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_hub_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_configs: {
        Row: {
          client_id: string
          created_at: string
          enabled: boolean | null
          id: string
          metric: string
          operator: string
          slack_webhook_url: string | null
          threshold: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          enabled?: boolean | null
          id?: string
          metric: string
          operator: string
          slack_webhook_url?: string | null
          threshold: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          enabled?: boolean | null
          id?: string
          metric?: string
          operator?: string
          slack_webhook_url?: string | null
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          appointment_status: string | null
          booked_at: string | null
          call_connected: boolean | null
          call_duration_seconds: number | null
          client_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          direction: string | null
          external_id: string
          ghl_appointment_id: string | null
          ghl_calendar_id: string | null
          ghl_synced_at: string | null
          id: string
          is_reconnect: boolean | null
          lead_id: string | null
          outcome: string | null
          quality_score: number | null
          recording_url: string | null
          scheduled_at: string | null
          showed: boolean | null
          showed_at: string | null
          summary: string | null
          transcript: string | null
          updated_at: string
        }
        Insert: {
          appointment_status?: string | null
          booked_at?: string | null
          call_connected?: boolean | null
          call_duration_seconds?: number | null
          client_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          direction?: string | null
          external_id: string
          ghl_appointment_id?: string | null
          ghl_calendar_id?: string | null
          ghl_synced_at?: string | null
          id?: string
          is_reconnect?: boolean | null
          lead_id?: string | null
          outcome?: string | null
          quality_score?: number | null
          recording_url?: string | null
          scheduled_at?: string | null
          showed?: boolean | null
          showed_at?: string | null
          summary?: string | null
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          appointment_status?: string | null
          booked_at?: string | null
          call_connected?: boolean | null
          call_duration_seconds?: number | null
          client_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          direction?: string | null
          external_id?: string
          ghl_appointment_id?: string | null
          ghl_calendar_id?: string | null
          ghl_synced_at?: string | null
          id?: string
          is_reconnect?: boolean | null
          lead_id?: string | null
          outcome?: string | null
          quality_score?: number | null
          recording_url?: string | null
          scheduled_at?: string | null
          showed?: boolean | null
          showed_at?: string | null
          summary?: string | null
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          client_id: string | null
          conversation_type: string
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          conversation_type?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          conversation_type?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_custom_tabs: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_custom_tabs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_funnel_steps: {
        Row: {
          campaign_id: string | null
          client_id: string
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
          step_type: string
          updated_at: string | null
          url: string
        }
        Insert: {
          campaign_id?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
          step_type?: string
          updated_at?: string | null
          url: string
        }
        Update: {
          campaign_id?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          step_type?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_funnel_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "funnel_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_funnel_steps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_live_ads: {
        Row: {
          ad_library_id: string | null
          ad_library_url: string | null
          ai_analysis: Json | null
          campaign_id: string | null
          client_id: string
          created_at: string | null
          cta_type: string | null
          description: string | null
          headline: string | null
          id: string
          impressions_bucket: string | null
          last_analyzed_at: string | null
          media_type: string | null
          media_urls: Json | null
          page_id: string | null
          page_name: string | null
          platforms: Json | null
          primary_text: string | null
          raw_markdown: string | null
          scraped_at: string | null
          started_running_on: string | null
          status: string | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          ad_library_id?: string | null
          ad_library_url?: string | null
          ai_analysis?: Json | null
          campaign_id?: string | null
          client_id: string
          created_at?: string | null
          cta_type?: string | null
          description?: string | null
          headline?: string | null
          id?: string
          impressions_bucket?: string | null
          last_analyzed_at?: string | null
          media_type?: string | null
          media_urls?: Json | null
          page_id?: string | null
          page_name?: string | null
          platforms?: Json | null
          primary_text?: string | null
          raw_markdown?: string | null
          scraped_at?: string | null
          started_running_on?: string | null
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          ad_library_id?: string | null
          ad_library_url?: string | null
          ai_analysis?: Json | null
          campaign_id?: string | null
          client_id?: string
          created_at?: string | null
          cta_type?: string | null
          description?: string | null
          headline?: string | null
          id?: string
          impressions_bucket?: string | null
          last_analyzed_at?: string | null
          media_type?: string | null
          media_urls?: Json | null
          page_id?: string | null
          page_name?: string | null
          platforms?: Json | null
          primary_text?: string | null
          raw_markdown?: string | null
          scraped_at?: string | null
          started_running_on?: string | null
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_live_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "funnel_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_live_ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_offers: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          file_name: string | null
          file_size_bytes: number | null
          file_type: string | null
          file_url: string | null
          id: string
          offer_type: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          offer_type?: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          offer_type?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_offers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_pipelines: {
        Row: {
          client_id: string
          created_at: string
          ghl_pipeline_id: string
          id: string
          last_synced_at: string | null
          name: string
          sort_order: number
        }
        Insert: {
          client_id: string
          created_at?: string
          ghl_pipeline_id: string
          id?: string
          last_synced_at?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          ghl_pipeline_id?: string
          id?: string
          last_synced_at?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_pipelines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_pod_assignments: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_lead: boolean | null
          pod_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_lead?: boolean | null
          pod_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_lead?: boolean | null
          pod_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_pod_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_pod_assignments_pod_id_fkey"
            columns: ["pod_id"]
            isOneToOne: false
            referencedRelation: "agency_pods"
            referencedColumns: ["id"]
          },
        ]
      }
      client_settings: {
        Row: {
          ad_spend_fee_percent: number | null
          ad_spend_fee_threshold: number | null
          ads_library_page_id: string | null
          ads_library_url: string | null
          client_id: string
          committed_stage_ids: string[] | null
          cost_of_capital_threshold_red: number | null
          cost_of_capital_threshold_yellow: number | null
          cost_per_call_threshold_red: number | null
          cost_per_call_threshold_yellow: number | null
          cost_per_investor_threshold_red: number | null
          cost_per_investor_threshold_yellow: number | null
          cost_per_show_threshold_red: number | null
          cost_per_show_threshold_yellow: number | null
          cpl_threshold_red: number | null
          cpl_threshold_yellow: number | null
          created_at: string
          daily_ad_spend_target: number | null
          default_lead_pipeline_value: number | null
          email_auto_approve_threshold: number | null
          email_default_offering: string | null
          email_parsing_enabled: boolean | null
          email_trusted_domains: string[] | null
          funded_investor_label: string | null
          funded_pipeline_id: string | null
          funded_stage_ids: string[] | null
          funded_tag_pattern: string | null
          ghl_last_calls_sync: string | null
          ghl_last_contacts_sync: string | null
          ghl_sync_calls_enabled: boolean | null
          ghl_sync_contacts_enabled: boolean | null
          ghl_sync_conversations_enabled: boolean | null
          hubspot_booked_meeting_types: string[] | null
          hubspot_committed_stage_ids: string[] | null
          hubspot_funded_pipeline_id: string | null
          hubspot_funded_stage_ids: string[] | null
          hubspot_last_contacts_sync: string | null
          hubspot_last_deals_sync: string | null
          hubspot_reconnect_meeting_types: string[] | null
          hubspot_sync_enabled: boolean | null
          id: string
          meetgeek_api_key: string | null
          meetgeek_enabled: boolean | null
          meetgeek_last_sync: string | null
          meetgeek_region: string | null
          meetgeek_webhook_secret: string | null
          meta_ads_last_sync: string | null
          meta_ads_last_sync_date: string | null
          meta_ads_sync_enabled: boolean | null
          meta_ads_sync_streak: number
          metric_labels: Json | null
          monthly_ad_spend_target: number | null
          mrr: number | null
          pixel_notification_email: string | null
          pixel_verification_enabled: boolean | null
          pixel_verification_frequency: string | null
          public_link_password: string | null
          reconnect_calendar_ids: string[] | null
          retargetiq_auto_enrich: boolean | null
          retargetiq_website_slug: string | null
          stripe_customer_id: string | null
          stripe_email: string | null
          total_raise_amount: number | null
          tracked_calendar_ids: string[] | null
          updated_at: string
          webhook_mappings: Json | null
        }
        Insert: {
          ad_spend_fee_percent?: number | null
          ad_spend_fee_threshold?: number | null
          ads_library_page_id?: string | null
          ads_library_url?: string | null
          client_id: string
          committed_stage_ids?: string[] | null
          cost_of_capital_threshold_red?: number | null
          cost_of_capital_threshold_yellow?: number | null
          cost_per_call_threshold_red?: number | null
          cost_per_call_threshold_yellow?: number | null
          cost_per_investor_threshold_red?: number | null
          cost_per_investor_threshold_yellow?: number | null
          cost_per_show_threshold_red?: number | null
          cost_per_show_threshold_yellow?: number | null
          cpl_threshold_red?: number | null
          cpl_threshold_yellow?: number | null
          created_at?: string
          daily_ad_spend_target?: number | null
          default_lead_pipeline_value?: number | null
          email_auto_approve_threshold?: number | null
          email_default_offering?: string | null
          email_parsing_enabled?: boolean | null
          email_trusted_domains?: string[] | null
          funded_investor_label?: string | null
          funded_pipeline_id?: string | null
          funded_stage_ids?: string[] | null
          funded_tag_pattern?: string | null
          ghl_last_calls_sync?: string | null
          ghl_last_contacts_sync?: string | null
          ghl_sync_calls_enabled?: boolean | null
          ghl_sync_contacts_enabled?: boolean | null
          ghl_sync_conversations_enabled?: boolean | null
          hubspot_booked_meeting_types?: string[] | null
          hubspot_committed_stage_ids?: string[] | null
          hubspot_funded_pipeline_id?: string | null
          hubspot_funded_stage_ids?: string[] | null
          hubspot_last_contacts_sync?: string | null
          hubspot_last_deals_sync?: string | null
          hubspot_reconnect_meeting_types?: string[] | null
          hubspot_sync_enabled?: boolean | null
          id?: string
          meetgeek_api_key?: string | null
          meetgeek_enabled?: boolean | null
          meetgeek_last_sync?: string | null
          meetgeek_region?: string | null
          meetgeek_webhook_secret?: string | null
          meta_ads_last_sync?: string | null
          meta_ads_last_sync_date?: string | null
          meta_ads_sync_enabled?: boolean | null
          meta_ads_sync_streak?: number
          metric_labels?: Json | null
          monthly_ad_spend_target?: number | null
          mrr?: number | null
          pixel_notification_email?: string | null
          pixel_verification_enabled?: boolean | null
          pixel_verification_frequency?: string | null
          public_link_password?: string | null
          reconnect_calendar_ids?: string[] | null
          retargetiq_auto_enrich?: boolean | null
          retargetiq_website_slug?: string | null
          stripe_customer_id?: string | null
          stripe_email?: string | null
          total_raise_amount?: number | null
          tracked_calendar_ids?: string[] | null
          updated_at?: string
          webhook_mappings?: Json | null
        }
        Update: {
          ad_spend_fee_percent?: number | null
          ad_spend_fee_threshold?: number | null
          ads_library_page_id?: string | null
          ads_library_url?: string | null
          client_id?: string
          committed_stage_ids?: string[] | null
          cost_of_capital_threshold_red?: number | null
          cost_of_capital_threshold_yellow?: number | null
          cost_per_call_threshold_red?: number | null
          cost_per_call_threshold_yellow?: number | null
          cost_per_investor_threshold_red?: number | null
          cost_per_investor_threshold_yellow?: number | null
          cost_per_show_threshold_red?: number | null
          cost_per_show_threshold_yellow?: number | null
          cpl_threshold_red?: number | null
          cpl_threshold_yellow?: number | null
          created_at?: string
          daily_ad_spend_target?: number | null
          default_lead_pipeline_value?: number | null
          email_auto_approve_threshold?: number | null
          email_default_offering?: string | null
          email_parsing_enabled?: boolean | null
          email_trusted_domains?: string[] | null
          funded_investor_label?: string | null
          funded_pipeline_id?: string | null
          funded_stage_ids?: string[] | null
          funded_tag_pattern?: string | null
          ghl_last_calls_sync?: string | null
          ghl_last_contacts_sync?: string | null
          ghl_sync_calls_enabled?: boolean | null
          ghl_sync_contacts_enabled?: boolean | null
          ghl_sync_conversations_enabled?: boolean | null
          hubspot_booked_meeting_types?: string[] | null
          hubspot_committed_stage_ids?: string[] | null
          hubspot_funded_pipeline_id?: string | null
          hubspot_funded_stage_ids?: string[] | null
          hubspot_last_contacts_sync?: string | null
          hubspot_last_deals_sync?: string | null
          hubspot_reconnect_meeting_types?: string[] | null
          hubspot_sync_enabled?: boolean | null
          id?: string
          meetgeek_api_key?: string | null
          meetgeek_enabled?: boolean | null
          meetgeek_last_sync?: string | null
          meetgeek_region?: string | null
          meetgeek_webhook_secret?: string | null
          meta_ads_last_sync?: string | null
          meta_ads_last_sync_date?: string | null
          meta_ads_sync_enabled?: boolean | null
          meta_ads_sync_streak?: number
          metric_labels?: Json | null
          monthly_ad_spend_target?: number | null
          mrr?: number | null
          pixel_notification_email?: string | null
          pixel_verification_enabled?: boolean | null
          pixel_verification_frequency?: string | null
          public_link_password?: string | null
          reconnect_calendar_ids?: string[] | null
          retargetiq_auto_enrich?: boolean | null
          retargetiq_website_slug?: string | null
          stripe_customer_id?: string | null
          stripe_email?: string | null
          total_raise_amount?: number | null
          tracked_calendar_ids?: string[] | null
          updated_at?: string
          webhook_mappings?: Json | null
        }
        Relationships: []
      }
      client_voice_notes: {
        Row: {
          action_items: Json | null
          audio_url: string | null
          client_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          is_public_recording: boolean | null
          recorded_by: string | null
          summary: string | null
          title: string
          transcript: string | null
        }
        Insert: {
          action_items?: Json | null
          audio_url?: string | null
          client_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_public_recording?: boolean | null
          recorded_by?: string | null
          summary?: string | null
          title: string
          transcript?: string | null
        }
        Update: {
          action_items?: Json | null
          audio_url?: string | null
          client_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_public_recording?: boolean | null
          recorded_by?: string | null
          summary?: string | null
          title?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_voice_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          brand_colors: Json | null
          brand_fonts: Json | null
          business_manager_url: string | null
          created_at: string
          description: string | null
          ghl_api_key: string | null
          ghl_location_id: string | null
          ghl_sync_error: string | null
          ghl_sync_status: string | null
          hubspot_access_token: string | null
          hubspot_portal_id: string | null
          hubspot_sync_error: string | null
          hubspot_sync_status: string | null
          id: string
          industry: string | null
          last_ghl_sync_at: string | null
          last_hubspot_sync_at: string | null
          last_timeline_sync_at: string | null
          logo_url: string | null
          meta_access_token: string | null
          meta_ad_account_id: string | null
          name: string
          public_token: string | null
          slug: string | null
          sort_order: number | null
          status: string
          updated_at: string
          webhook_secret: string | null
          website_url: string | null
        }
        Insert: {
          brand_colors?: Json | null
          brand_fonts?: Json | null
          business_manager_url?: string | null
          created_at?: string
          description?: string | null
          ghl_api_key?: string | null
          ghl_location_id?: string | null
          ghl_sync_error?: string | null
          ghl_sync_status?: string | null
          hubspot_access_token?: string | null
          hubspot_portal_id?: string | null
          hubspot_sync_error?: string | null
          hubspot_sync_status?: string | null
          id?: string
          industry?: string | null
          last_ghl_sync_at?: string | null
          last_hubspot_sync_at?: string | null
          last_timeline_sync_at?: string | null
          logo_url?: string | null
          meta_access_token?: string | null
          meta_ad_account_id?: string | null
          name: string
          public_token?: string | null
          slug?: string | null
          sort_order?: number | null
          status?: string
          updated_at?: string
          webhook_secret?: string | null
          website_url?: string | null
        }
        Update: {
          brand_colors?: Json | null
          brand_fonts?: Json | null
          business_manager_url?: string | null
          created_at?: string
          description?: string | null
          ghl_api_key?: string | null
          ghl_location_id?: string | null
          ghl_sync_error?: string | null
          ghl_sync_status?: string | null
          hubspot_access_token?: string | null
          hubspot_portal_id?: string | null
          hubspot_sync_error?: string | null
          hubspot_sync_status?: string | null
          id?: string
          industry?: string | null
          last_ghl_sync_at?: string | null
          last_hubspot_sync_at?: string | null
          last_timeline_sync_at?: string | null
          logo_url?: string | null
          meta_access_token?: string | null
          meta_ad_account_id?: string | null
          name?: string
          public_token?: string | null
          slug?: string | null
          sort_order?: number | null
          status?: string
          updated_at?: string
          webhook_secret?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      contact_timeline_events: {
        Row: {
          body: string | null
          client_id: string
          created_at: string
          event_at: string
          event_subtype: string | null
          event_type: string
          ghl_contact_id: string
          id: string
          lead_id: string | null
          metadata: Json | null
          title: string | null
        }
        Insert: {
          body?: string | null
          client_id: string
          created_at?: string
          event_at: string
          event_subtype?: string | null
          event_type: string
          ghl_contact_id: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          title?: string | null
        }
        Update: {
          body?: string | null
          client_id?: string
          created_at?: string
          event_at?: string
          event_subtype?: string | null
          event_type?: string
          ghl_contact_id?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_timeline_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_timeline_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      creatives: {
        Row: {
          aspect_ratio: string | null
          body_copy: string | null
          client_id: string
          comments: Json | null
          created_at: string
          cta_text: string | null
          file_url: string | null
          headline: string | null
          id: string
          platform: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          aspect_ratio?: string | null
          body_copy?: string | null
          client_id: string
          comments?: Json | null
          created_at?: string
          cta_text?: string | null
          file_url?: string | null
          headline?: string | null
          id?: string
          platform?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          aspect_ratio?: string | null
          body_copy?: string | null
          client_id?: string
          comments?: Json | null
          created_at?: string
          cta_text?: string | null
          file_url?: string | null
          headline?: string | null
          id?: string
          platform?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creatives_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      csv_import_logs: {
        Row: {
          client_id: string
          created_at: string
          failed_count: number
          file_name: string | null
          id: string
          import_type: string
          records_count: number
          success_count: number
        }
        Insert: {
          client_id: string
          created_at?: string
          failed_count?: number
          file_name?: string | null
          id?: string
          import_type: string
          records_count?: number
          success_count?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          failed_count?: number
          file_name?: string | null
          id?: string
          import_type?: string
          records_count?: number
          success_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "csv_import_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_gpts: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          system_prompt: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          system_prompt: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_metrics: {
        Row: {
          ad_spend: number | null
          calls: number | null
          calls_scheduled: number | null
          calls_showed: number | null
          clicks: number | null
          client_id: string
          commitment_dollars: number | null
          commitments: number | null
          commitments_on_day: number | null
          created_at: string
          ctr: number | null
          date: string
          funded_dollars: number | null
          funded_investors: number | null
          funded_on_day: number | null
          id: string
          impressions: number | null
          leads: number | null
          leads_created: number | null
          reconnect_calls: number | null
          reconnect_showed: number | null
          showed_calls: number | null
          spam_leads: number | null
          unattributed_leads: number | null
          updated_at: string
        }
        Insert: {
          ad_spend?: number | null
          calls?: number | null
          calls_scheduled?: number | null
          calls_showed?: number | null
          clicks?: number | null
          client_id: string
          commitment_dollars?: number | null
          commitments?: number | null
          commitments_on_day?: number | null
          created_at?: string
          ctr?: number | null
          date: string
          funded_dollars?: number | null
          funded_investors?: number | null
          funded_on_day?: number | null
          id?: string
          impressions?: number | null
          leads?: number | null
          leads_created?: number | null
          reconnect_calls?: number | null
          reconnect_showed?: number | null
          showed_calls?: number | null
          spam_leads?: number | null
          unattributed_leads?: number | null
          updated_at?: string
        }
        Update: {
          ad_spend?: number | null
          calls?: number | null
          calls_scheduled?: number | null
          calls_showed?: number | null
          clicks?: number | null
          client_id?: string
          commitment_dollars?: number | null
          commitments?: number | null
          commitments_on_day?: number | null
          created_at?: string
          ctr?: number | null
          date?: string
          funded_dollars?: number | null
          funded_investors?: number | null
          funded_on_day?: number | null
          id?: string
          impressions?: number | null
          leads?: number | null
          leads_created?: number | null
          reconnect_calls?: number | null
          reconnect_showed?: number | null
          showed_calls?: number | null
          spam_leads?: number | null
          unattributed_leads?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_preferences: {
        Row: {
          chart_config: Json | null
          client_id: string | null
          created_at: string
          custom_metrics: Json | null
          hidden_metrics: string[] | null
          id: string
          preference_type: string
          updated_at: string
        }
        Insert: {
          chart_config?: Json | null
          client_id?: string | null
          created_at?: string
          custom_metrics?: Json | null
          hidden_metrics?: string[] | null
          id?: string
          preference_type?: string
          updated_at?: string
        }
        Update: {
          chart_config?: Json | null
          client_id?: string | null
          created_at?: string
          custom_metrics?: Json | null
          hidden_metrics?: string[] | null
          id?: string
          preference_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      data_discrepancies: {
        Row: {
          api_count: number
          client_id: string
          date_range_end: string
          date_range_start: string
          db_count: number
          detected_at: string
          difference: number
          discrepancy_type: string
          id: string
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          status: string
          sync_log_id: string | null
          webhook_count: number
        }
        Insert: {
          api_count?: number
          client_id: string
          date_range_end: string
          date_range_start: string
          db_count?: number
          detected_at?: string
          difference?: number
          discrepancy_type: string
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          sync_log_id?: string | null
          webhook_count?: number
        }
        Update: {
          api_count?: number
          client_id?: string
          date_range_end?: string
          date_range_start?: string
          db_count?: number
          detected_at?: string
          difference?: number
          discrepancy_type?: string
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          sync_log_id?: string | null
          webhook_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "data_discrepancies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_discrepancies_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_activities: {
        Row: {
          activity_type: string
          created_at: string
          created_by: string | null
          deal_id: string
          description: string | null
          id: string
        }
        Insert: {
          activity_type?: string
          created_at?: string
          created_by?: string | null
          deal_id: string
          description?: string | null
          id?: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string
          description?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          assigned_to: string | null
          client_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          deal_name: string
          deal_value: number
          expected_close_date: string | null
          id: string
          last_activity_at: string | null
          notes: string | null
          probability: number
          source: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deal_name: string
          deal_value?: number
          expected_close_date?: string | null
          id?: string
          last_activity_at?: string | null
          notes?: string | null
          probability?: number
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deal_name?: string
          deal_value?: number
          expected_close_date?: string | null
          id?: string
          last_activity_at?: string | null
          notes?: string | null
          probability?: number
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_parsed_investors: {
        Row: {
          client_id: string
          created_at: string
          email_body: string | null
          email_from: string | null
          email_received_at: string | null
          email_subject: string | null
          funded_investor_id: string | null
          id: string
          parsed_accredited: boolean | null
          parsed_amount: number | null
          parsed_class: string | null
          parsed_email: string | null
          parsed_name: string | null
          parsed_offering: string | null
          parsed_phone: string | null
          raw_parsed_data: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email_body?: string | null
          email_from?: string | null
          email_received_at?: string | null
          email_subject?: string | null
          funded_investor_id?: string | null
          id?: string
          parsed_accredited?: boolean | null
          parsed_amount?: number | null
          parsed_class?: string | null
          parsed_email?: string | null
          parsed_name?: string | null
          parsed_offering?: string | null
          parsed_phone?: string | null
          raw_parsed_data?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email_body?: string | null
          email_from?: string | null
          email_received_at?: string | null
          email_subject?: string | null
          funded_investor_id?: string | null
          id?: string
          parsed_accredited?: boolean | null
          parsed_amount?: number | null
          parsed_class?: string | null
          parsed_email?: string | null
          parsed_name?: string | null
          parsed_offering?: string | null
          parsed_phone?: string | null
          raw_parsed_data?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_parsed_investors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_parsed_investors_funded_investor_id_fkey"
            columns: ["funded_investor_id"]
            isOneToOne: false
            referencedRelation: "funded_investors"
            referencedColumns: ["id"]
          },
        ]
      }
      funded_investors: {
        Row: {
          approval_status: string | null
          calls_to_fund: number | null
          client_id: string
          commitment_amount: number | null
          created_at: string
          external_id: string
          first_contact_at: string | null
          funded_amount: number
          funded_at: string
          id: string
          lead_id: string | null
          name: string | null
          source: string | null
          time_to_fund_days: number | null
        }
        Insert: {
          approval_status?: string | null
          calls_to_fund?: number | null
          client_id: string
          commitment_amount?: number | null
          created_at?: string
          external_id: string
          first_contact_at?: string | null
          funded_amount?: number
          funded_at?: string
          id?: string
          lead_id?: string | null
          name?: string | null
          source?: string | null
          time_to_fund_days?: number | null
        }
        Update: {
          approval_status?: string | null
          calls_to_fund?: number | null
          client_id?: string
          commitment_amount?: number | null
          created_at?: string
          external_id?: string
          first_contact_at?: string | null
          funded_amount?: number
          funded_at?: string
          id?: string
          lead_id?: string | null
          name?: string | null
          source?: string | null
          time_to_fund_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funded_investors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funded_investors_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_campaigns: {
        Row: {
          client_id: string
          color: string | null
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_snapshots: {
        Row: {
          client_id: string
          conversion_rate: number | null
          count: number
          created_at: string
          id: string
          snapshot_date: string
          stage_id: string
        }
        Insert: {
          client_id: string
          conversion_rate?: number | null
          count?: number
          created_at?: string
          id?: string
          snapshot_date: string
          stage_id: string
        }
        Update: {
          client_id?: string
          conversion_rate?: number | null
          count?: number
          created_at?: string
          id?: string
          snapshot_date?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_snapshots_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stages: {
        Row: {
          client_id: string
          conversion_count: number
          created_at: string
          id: string
          stage_name: string
          stage_order: number
          stage_url: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          conversion_count?: number
          created_at?: string
          id?: string
          stage_name: string
          stage_order?: number
          stage_url?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          conversion_count?: number
          created_at?: string
          id?: string
          stage_name?: string
          stage_order?: number
          stage_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_step_metadata: {
        Row: {
          created_at: string
          description: string | null
          favicon: string | null
          fetched_at: string
          id: string
          image: string | null
          site_name: string | null
          step_id: string
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          favicon?: string | null
          fetched_at?: string
          id?: string
          image?: string | null
          site_name?: string | null
          step_id: string
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          favicon?: string | null
          fetched_at?: string
          id?: string
          image?: string | null
          site_name?: string | null
          step_id?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_step_metadata_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: true
            referencedRelation: "client_funnel_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_step_variants: {
        Row: {
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
          step_id: string
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          step_id: string
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          step_id?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_step_variants_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "client_funnel_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      gpt_files: {
        Row: {
          character_count: number | null
          content: string | null
          created_at: string
          estimated_tokens: number | null
          file_type: string
          file_url: string | null
          gpt_id: string
          id: string
          name: string
          website_url: string | null
        }
        Insert: {
          character_count?: number | null
          content?: string | null
          created_at?: string
          estimated_tokens?: number | null
          file_type?: string
          file_url?: string | null
          gpt_id: string
          id?: string
          name: string
          website_url?: string | null
        }
        Update: {
          character_count?: number | null
          content?: string | null
          created_at?: string
          estimated_tokens?: number | null
          file_type?: string
          file_url?: string | null
          gpt_id?: string
          id?: string
          name?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gpt_files_gpt_id_fkey"
            columns: ["gpt_id"]
            isOneToOne: false
            referencedRelation: "custom_gpts"
            referencedColumns: ["id"]
          },
        ]
      }
      gpt_knowledge_base: {
        Row: {
          created_at: string
          document_id: string
          gpt_id: string
          id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          gpt_id: string
          id?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          gpt_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gpt_knowledge_base_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gpt_knowledge_base_gpt_id_fkey"
            columns: ["gpt_id"]
            isOneToOne: false
            referencedRelation: "custom_gpts"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_status: {
        Row: {
          client_id: string | null
          created_at: string
          error_count: number
          id: string
          integration_name: string
          is_connected: boolean
          last_error_message: string | null
          last_sync_at: string | null
          last_sync_status: string | null
          records_synced: number
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          error_count?: number
          id?: string
          integration_name: string
          is_connected?: boolean
          last_error_message?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          records_synced?: number
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          error_count?: number
          id?: string
          integration_name?: string
          is_connected?: boolean
          last_error_message?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          records_synced?: number
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_status_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_documents: {
        Row: {
          character_count: number | null
          content: string | null
          created_at: string
          document_type: string
          estimated_tokens: number | null
          extracted_text: string | null
          file_url: string | null
          id: string
          metadata: Json | null
          name: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          character_count?: number | null
          content?: string | null
          created_at?: string
          document_type?: string
          estimated_tokens?: number | null
          extracted_text?: string | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          name: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          character_count?: number | null
          content?: string | null
          created_at?: string
          document_type?: string
          estimated_tokens?: number | null
          extracted_text?: string | null
          file_url?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      lead_enrichment: {
        Row: {
          address: string | null
          age: number | null
          birth_date: string | null
          city: string | null
          client_id: string
          companies: Json | null
          company_name: string | null
          company_title: string | null
          created_at: string
          credit_range: string | null
          discretionary_income: string | null
          dwelling_type: string | null
          education: string | null
          enriched_at: string
          enriched_emails: Json | null
          enriched_phones: Json | null
          enrichment_match_count: number | null
          enrichment_methods_used: string[] | null
          ethnicity: string | null
          external_id: string
          financial_power: number | null
          first_name: string | null
          gender: string | null
          generation: string | null
          has_children: boolean | null
          home_ownership: string | null
          home_value: number | null
          household_adults: number | null
          household_income: string | null
          household_persons: number | null
          id: string
          is_investor: boolean | null
          is_primary_identity: boolean | null
          is_veteran: boolean | null
          language: string | null
          last_name: string | null
          lead_id: string | null
          length_of_residence: number | null
          linkedin_url: string | null
          marital_status: string | null
          median_home_value: number | null
          mortgage_amount: number | null
          net_worth: string | null
          net_worth_midpoint: number | null
          occupation: string | null
          occupation_category: string | null
          occupation_type: string | null
          owns_investments: boolean | null
          owns_stocks_bonds: boolean | null
          raw_data: Json
          retargetiq_id: number | null
          source: string
          spouse_data: Json | null
          state: string | null
          urbanicity: string | null
          vehicles: Json | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          age?: number | null
          birth_date?: string | null
          city?: string | null
          client_id: string
          companies?: Json | null
          company_name?: string | null
          company_title?: string | null
          created_at?: string
          credit_range?: string | null
          discretionary_income?: string | null
          dwelling_type?: string | null
          education?: string | null
          enriched_at?: string
          enriched_emails?: Json | null
          enriched_phones?: Json | null
          enrichment_match_count?: number | null
          enrichment_methods_used?: string[] | null
          ethnicity?: string | null
          external_id: string
          financial_power?: number | null
          first_name?: string | null
          gender?: string | null
          generation?: string | null
          has_children?: boolean | null
          home_ownership?: string | null
          home_value?: number | null
          household_adults?: number | null
          household_income?: string | null
          household_persons?: number | null
          id?: string
          is_investor?: boolean | null
          is_primary_identity?: boolean | null
          is_veteran?: boolean | null
          language?: string | null
          last_name?: string | null
          lead_id?: string | null
          length_of_residence?: number | null
          linkedin_url?: string | null
          marital_status?: string | null
          median_home_value?: number | null
          mortgage_amount?: number | null
          net_worth?: string | null
          net_worth_midpoint?: number | null
          occupation?: string | null
          occupation_category?: string | null
          occupation_type?: string | null
          owns_investments?: boolean | null
          owns_stocks_bonds?: boolean | null
          raw_data?: Json
          retargetiq_id?: number | null
          source?: string
          spouse_data?: Json | null
          state?: string | null
          urbanicity?: string | null
          vehicles?: Json | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          age?: number | null
          birth_date?: string | null
          city?: string | null
          client_id?: string
          companies?: Json | null
          company_name?: string | null
          company_title?: string | null
          created_at?: string
          credit_range?: string | null
          discretionary_income?: string | null
          dwelling_type?: string | null
          education?: string | null
          enriched_at?: string
          enriched_emails?: Json | null
          enriched_phones?: Json | null
          enrichment_match_count?: number | null
          enrichment_methods_used?: string[] | null
          ethnicity?: string | null
          external_id?: string
          financial_power?: number | null
          first_name?: string | null
          gender?: string | null
          generation?: string | null
          has_children?: boolean | null
          home_ownership?: string | null
          home_value?: number | null
          household_adults?: number | null
          household_income?: string | null
          household_persons?: number | null
          id?: string
          is_investor?: boolean | null
          is_primary_identity?: boolean | null
          is_veteran?: boolean | null
          language?: string | null
          last_name?: string | null
          lead_id?: string | null
          length_of_residence?: number | null
          linkedin_url?: string | null
          marital_status?: string | null
          median_home_value?: number | null
          mortgage_amount?: number | null
          net_worth?: string | null
          net_worth_midpoint?: number | null
          occupation?: string | null
          occupation_category?: string | null
          occupation_type?: string | null
          owns_investments?: boolean | null
          owns_stocks_bonds?: boolean | null
          raw_data?: Json
          retargetiq_id?: number | null
          source?: string
          spouse_data?: Json | null
          state?: string | null
          urbanicity?: string | null
          vehicles?: Json | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_enrichment_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_enrichment_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_id: string | null
          ad_set_name: string | null
          assigned_user: string | null
          campaign_name: string | null
          client_id: string
          created_at: string
          custom_fields: Json | null
          email: string | null
          external_id: string
          ghl_notes: Json | null
          ghl_synced_at: string | null
          id: string
          is_spam: boolean | null
          name: string | null
          opportunity_stage: string | null
          opportunity_stage_id: string | null
          opportunity_status: string | null
          opportunity_value: number | null
          phone: string | null
          pipeline_value: number | null
          questions: Json | null
          source: string
          status: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_id?: string | null
          ad_set_name?: string | null
          assigned_user?: string | null
          campaign_name?: string | null
          client_id: string
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          external_id: string
          ghl_notes?: Json | null
          ghl_synced_at?: string | null
          id?: string
          is_spam?: boolean | null
          name?: string | null
          opportunity_stage?: string | null
          opportunity_stage_id?: string | null
          opportunity_status?: string | null
          opportunity_value?: number | null
          phone?: string | null
          pipeline_value?: number | null
          questions?: Json | null
          source?: string
          status?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_id?: string | null
          ad_set_name?: string | null
          assigned_user?: string | null
          campaign_name?: string | null
          client_id?: string
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          external_id?: string
          ghl_notes?: Json | null
          ghl_synced_at?: string | null
          id?: string
          is_spam?: boolean | null
          name?: string | null
          opportunity_stage?: string | null
          opportunity_stage_id?: string | null
          opportunity_status?: string | null
          opportunity_value?: number | null
          phone?: string | null
          pipeline_value?: number | null
          questions?: Json | null
          source?: string
          status?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      member_activity_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          member_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          member_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_activity_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "agency_members"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_sets: {
        Row: {
          attributed_calls: number | null
          attributed_funded: number | null
          attributed_funded_dollars: number | null
          attributed_leads: number | null
          attributed_showed: number | null
          attributed_spam_leads: number | null
          bid_strategy: string | null
          billing_event: string | null
          budget_remaining: number | null
          campaign_id: string | null
          clicks: number | null
          client_id: string
          cost_per_call: number | null
          cost_per_funded: number | null
          cost_per_lead: number | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          daily_budget: number | null
          effective_status: string | null
          end_time: string | null
          frequency: number | null
          id: string
          impressions: number | null
          lifetime_budget: number | null
          meta_adset_id: string
          meta_campaign_id: string | null
          name: string
          optimization_goal: string | null
          reach: number | null
          spend: number | null
          start_time: string | null
          status: string | null
          synced_at: string | null
          targeting: Json | null
          updated_at: string | null
        }
        Insert: {
          attributed_calls?: number | null
          attributed_funded?: number | null
          attributed_funded_dollars?: number | null
          attributed_leads?: number | null
          attributed_showed?: number | null
          attributed_spam_leads?: number | null
          bid_strategy?: string | null
          billing_event?: string | null
          budget_remaining?: number | null
          campaign_id?: string | null
          clicks?: number | null
          client_id: string
          cost_per_call?: number | null
          cost_per_funded?: number | null
          cost_per_lead?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          daily_budget?: number | null
          effective_status?: string | null
          end_time?: string | null
          frequency?: number | null
          id?: string
          impressions?: number | null
          lifetime_budget?: number | null
          meta_adset_id: string
          meta_campaign_id?: string | null
          name: string
          optimization_goal?: string | null
          reach?: number | null
          spend?: number | null
          start_time?: string | null
          status?: string | null
          synced_at?: string | null
          targeting?: Json | null
          updated_at?: string | null
        }
        Update: {
          attributed_calls?: number | null
          attributed_funded?: number | null
          attributed_funded_dollars?: number | null
          attributed_leads?: number | null
          attributed_showed?: number | null
          attributed_spam_leads?: number | null
          bid_strategy?: string | null
          billing_event?: string | null
          budget_remaining?: number | null
          campaign_id?: string | null
          clicks?: number | null
          client_id?: string
          cost_per_call?: number | null
          cost_per_funded?: number | null
          cost_per_lead?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          daily_budget?: number | null
          effective_status?: string | null
          end_time?: string | null
          frequency?: number | null
          id?: string
          impressions?: number | null
          lifetime_budget?: number | null
          meta_adset_id?: string
          meta_campaign_id?: string | null
          name?: string
          optimization_goal?: string | null
          reach?: number | null
          spend?: number | null
          start_time?: string | null
          status?: string | null
          synced_at?: string | null
          targeting?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_sets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_sets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads: {
        Row: {
          ad_set_id: string | null
          attributed_calls: number | null
          attributed_funded: number | null
          attributed_funded_dollars: number | null
          attributed_leads: number | null
          attributed_showed: number | null
          attributed_spam_leads: number | null
          body: string | null
          call_to_action_type: string | null
          clicks: number | null
          client_id: string
          conversions: number | null
          cost_per_call: number | null
          cost_per_conversion: number | null
          cost_per_funded: number | null
          cost_per_lead: number | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          creative_id: string | null
          ctr: number | null
          effective_status: string | null
          headline: string | null
          id: string
          image_url: string | null
          impressions: number | null
          link_url: string | null
          media_type: string | null
          meta_ad_id: string
          meta_adset_id: string | null
          meta_campaign_id: string | null
          name: string
          preview_url: string | null
          reach: number | null
          spend: number | null
          status: string | null
          synced_at: string | null
          thumbnail_url: string | null
          updated_at: string | null
          video_thumbnail_url: string | null
        }
        Insert: {
          ad_set_id?: string | null
          attributed_calls?: number | null
          attributed_funded?: number | null
          attributed_funded_dollars?: number | null
          attributed_leads?: number | null
          attributed_showed?: number | null
          attributed_spam_leads?: number | null
          body?: string | null
          call_to_action_type?: string | null
          clicks?: number | null
          client_id: string
          conversions?: number | null
          cost_per_call?: number | null
          cost_per_conversion?: number | null
          cost_per_funded?: number | null
          cost_per_lead?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          creative_id?: string | null
          ctr?: number | null
          effective_status?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          link_url?: string | null
          media_type?: string | null
          meta_ad_id: string
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          name: string
          preview_url?: string | null
          reach?: number | null
          spend?: number | null
          status?: string | null
          synced_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          video_thumbnail_url?: string | null
        }
        Update: {
          ad_set_id?: string | null
          attributed_calls?: number | null
          attributed_funded?: number | null
          attributed_funded_dollars?: number | null
          attributed_leads?: number | null
          attributed_showed?: number | null
          attributed_spam_leads?: number | null
          body?: string | null
          call_to_action_type?: string | null
          clicks?: number | null
          client_id?: string
          conversions?: number | null
          cost_per_call?: number | null
          cost_per_conversion?: number | null
          cost_per_funded?: number | null
          cost_per_lead?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          creative_id?: string | null
          ctr?: number | null
          effective_status?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          link_url?: string | null
          media_type?: string | null
          meta_ad_id?: string
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          name?: string
          preview_url?: string | null
          reach?: number | null
          spend?: number | null
          status?: string | null
          synced_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          video_thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_ad_set_id_fkey"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          attributed_calls: number | null
          attributed_funded: number | null
          attributed_funded_dollars: number | null
          attributed_leads: number | null
          attributed_showed: number | null
          attributed_spam_leads: number | null
          budget_remaining: number | null
          buying_type: string | null
          clicks: number | null
          client_id: string
          cost_per_call: number | null
          cost_per_funded: number | null
          cost_per_lead: number | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          created_time: string | null
          ctr: number | null
          daily_budget: number | null
          id: string
          impressions: number | null
          lifetime_budget: number | null
          meta_campaign_id: string
          name: string
          objective: string | null
          spend: number | null
          start_time: string | null
          status: string | null
          stop_time: string | null
          synced_at: string | null
          updated_at: string | null
          updated_time: string | null
        }
        Insert: {
          attributed_calls?: number | null
          attributed_funded?: number | null
          attributed_funded_dollars?: number | null
          attributed_leads?: number | null
          attributed_showed?: number | null
          attributed_spam_leads?: number | null
          budget_remaining?: number | null
          buying_type?: string | null
          clicks?: number | null
          client_id: string
          cost_per_call?: number | null
          cost_per_funded?: number | null
          cost_per_lead?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          created_time?: string | null
          ctr?: number | null
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          lifetime_budget?: number | null
          meta_campaign_id: string
          name: string
          objective?: string | null
          spend?: number | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          synced_at?: string | null
          updated_at?: string | null
          updated_time?: string | null
        }
        Update: {
          attributed_calls?: number | null
          attributed_funded?: number | null
          attributed_funded_dollars?: number | null
          attributed_leads?: number | null
          attributed_showed?: number | null
          attributed_spam_leads?: number | null
          budget_remaining?: number | null
          buying_type?: string | null
          clicks?: number | null
          client_id?: string
          cost_per_call?: number | null
          cost_per_funded?: number | null
          cost_per_lead?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          created_time?: string | null
          ctr?: number | null
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          lifetime_budget?: number | null
          meta_campaign_id?: string
          name?: string
          objective?: string | null
          spend?: number | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          synced_at?: string | null
          updated_at?: string | null
          updated_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_meeting_tasks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          meeting_id: string | null
          priority: string
          status: string
          task_id: string | null
          title: string
          voice_note_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          meeting_id?: string | null
          priority?: string
          status?: string
          task_id?: string | null
          title: string
          voice_note_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          meeting_id?: string | null
          priority?: string
          status?: string
          task_id?: string | null
          title?: string
          voice_note_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_meeting_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_meeting_tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "agency_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_meeting_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_meeting_tasks_voice_note_id_fkey"
            columns: ["voice_note_id"]
            isOneToOne: false
            referencedRelation: "client_voice_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_opportunities: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          ghl_contact_id: string | null
          ghl_opportunity_id: string
          id: string
          last_stage_change_at: string | null
          monetary_value: number | null
          pipeline_id: string
          source: string | null
          stage_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          ghl_contact_id?: string | null
          ghl_opportunity_id: string
          id?: string
          last_stage_change_at?: string | null
          monetary_value?: number | null
          pipeline_id: string
          source?: string | null
          stage_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string
          id?: string
          last_stage_change_at?: string | null
          monetary_value?: number | null
          pipeline_id?: string
          source?: string | null
          stage_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_opportunities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string
          ghl_stage_id: string
          id: string
          name: string
          pipeline_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          ghl_stage_id: string
          id?: string
          name: string
          pipeline_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          ghl_stage_id?: string
          id?: string
          name?: string
          pipeline_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pixel_expected_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          is_custom: boolean
          platform: string
          step_id: string
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          is_custom?: boolean
          platform: string
          step_id: string
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          is_custom?: boolean
          platform?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pixel_expected_events_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "client_funnel_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      pixel_verifications: {
        Row: {
          client_id: string
          created_at: string
          events_detected: string[] | null
          id: string
          missing_expected: string[] | null
          results: Json
          scanned_at: string
          status: string
          step_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          events_detected?: string[] | null
          id?: string
          missing_expected?: string[] | null
          results?: Json
          scanned_at?: string
          status?: string
          step_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          events_detected?: string[] | null
          id?: string
          missing_expected?: string[] | null
          results?: Json
          scanned_at?: string
          status?: string
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pixel_verifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pixel_verifications_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "client_funnel_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_items: {
        Row: {
          client_id: string
          created_at: string
          dashboard_value: number | null
          delta: number | null
          delta_percent: number | null
          id: string
          is_mismatch: boolean
          metric_name: string
          notes: string | null
          run_id: string
          source_name: string
          source_value: number | null
          threshold_percent: number
        }
        Insert: {
          client_id: string
          created_at?: string
          dashboard_value?: number | null
          delta?: number | null
          delta_percent?: number | null
          id?: string
          is_mismatch?: boolean
          metric_name: string
          notes?: string | null
          run_id: string
          source_name: string
          source_value?: number | null
          threshold_percent?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          dashboard_value?: number | null
          delta?: number | null
          delta_percent?: number | null
          id?: string
          is_mismatch?: boolean
          metric_name?: string
          notes?: string | null
          run_id?: string
          source_name?: string
          source_value?: number | null
          threshold_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_runs: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          mismatches_found: number
          run_date: string
          started_at: string | null
          status: string
          total_checks: number
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          mismatches_found?: number
          run_date?: string
          started_at?: string | null
          status?: string
          total_checks?: number
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          mismatches_found?: number
          run_date?: string
          started_at?: string | null
          status?: string
          total_checks?: number
        }
        Relationships: []
      }
      spam_blacklist: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          reason: string | null
          type: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          reason?: string | null
          type?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          reason?: string | null
          type?: string
          value?: string
        }
        Relationships: []
      }
      sync_accuracy_log: {
        Row: {
          actual_count: number
          auto_fixed: boolean
          check_date: string
          client_id: string
          created_at: string
          discrepancy: number
          expected_count: number
          id: string
          metric_type: string
        }
        Insert: {
          actual_count?: number
          auto_fixed?: boolean
          check_date: string
          client_id: string
          created_at?: string
          discrepancy?: number
          expected_count?: number
          id?: string
          metric_type: string
        }
        Update: {
          actual_count?: number
          auto_fixed?: boolean
          check_date?: string
          client_id?: string
          created_at?: string
          discrepancy?: number
          expected_count?: number
          id?: string
          metric_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_accuracy_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_errors: {
        Row: {
          attempt_number: number
          client_id: string | null
          created_at: string
          endpoint: string | null
          error_message: string | null
          id: string
          integration_name: string
          status_code: number | null
        }
        Insert: {
          attempt_number?: number
          client_id?: string | null
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          integration_name: string
          status_code?: number | null
        }
        Update: {
          attempt_number?: number
          client_id?: string | null
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          integration_name?: string
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_errors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          client_id: string
          completed_at: string | null
          error_message: string | null
          id: string
          records_synced: number | null
          started_at: string
          status: string
          sync_type: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          records_synced?: number | null
          started_at?: string
          status?: string
          sync_type: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          records_synced?: number | null
          started_at?: string
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_outbound_events: {
        Row: {
          channel: string
          client_id: string
          contact_identifier: string
          created_at: string
          direction: string
          event_at: string
          external_id: string
          ghl_contact_id: string | null
          id: string
          payload: Json
          retry_count: number
          sync_error: string | null
          synced_at: string | null
          synced_to_ghl: boolean
        }
        Insert: {
          channel: string
          client_id: string
          contact_identifier: string
          created_at?: string
          direction: string
          event_at?: string
          external_id: string
          ghl_contact_id?: string | null
          id?: string
          payload?: Json
          retry_count?: number
          sync_error?: string | null
          synced_at?: string | null
          synced_to_ghl?: boolean
        }
        Update: {
          channel?: string
          client_id?: string
          contact_identifier?: string
          created_at?: string
          direction?: string
          event_at?: string
          external_id?: string
          ghl_contact_id?: string | null
          id?: string
          payload?: Json
          retry_count?: number
          sync_error?: string | null
          synced_at?: string | null
          synced_to_ghl?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sync_outbound_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_queue: {
        Row: {
          batch_number: number | null
          client_id: string
          completed_at: string | null
          created_at: string | null
          date_range_end: string | null
          date_range_start: string | null
          error_message: string | null
          id: string
          priority: number | null
          records_processed: number | null
          started_at: string | null
          status: string | null
          sync_type: string
          total_batches: number | null
        }
        Insert: {
          batch_number?: number | null
          client_id: string
          completed_at?: string | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          id?: string
          priority?: number | null
          records_processed?: number | null
          started_at?: string | null
          status?: string | null
          sync_type: string
          total_batches?: number | null
        }
        Update: {
          batch_number?: number | null
          client_id?: string
          completed_at?: string | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          id?: string
          priority?: number | null
          records_processed?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string
          total_batches?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_warnings: {
        Row: {
          client_id: string
          created_at: string
          id: string
          message: string
          metadata: Json | null
          warning_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          warning_type: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          warning_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_warnings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          created_at: string
          id: string
          member_id: string | null
          pod_id: string | null
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id?: string | null
          pod_id?: string | null
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string | null
          pod_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "agency_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_pod_id_fkey"
            columns: ["pod_id"]
            isOneToOne: false
            referencedRelation: "agency_pods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          audio_url: string | null
          author_name: string
          comment_type: string | null
          content: string
          created_at: string
          duration_seconds: number | null
          id: string
          task_id: string
          transcript: string | null
        }
        Insert: {
          audio_url?: string | null
          author_name: string
          comment_type?: string | null
          content: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          task_id: string
          transcript?: string | null
        }
        Update: {
          audio_url?: string | null
          author_name?: string
          comment_type?: string | null
          content?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          task_id?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_files: {
        Row: {
          created_at: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          task_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          member_id: string
          message: string
          task_id: string | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          member_id: string
          message: string
          task_id?: string | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          member_id?: string
          message?: string
          task_id?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "agency_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_client_name: string | null
          assigned_to: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          meeting_id: string | null
          parent_task_id: string | null
          priority: string
          recurrence_interval: number | null
          recurrence_next_at: string | null
          recurrence_parent_id: string | null
          recurrence_type: string | null
          show_subtasks_to_client: boolean | null
          stage: string
          status: string
          title: string
          updated_at: string
          visible_to_client: boolean
        }
        Insert: {
          assigned_client_name?: string | null
          assigned_to?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          parent_task_id?: string | null
          priority?: string
          recurrence_interval?: number | null
          recurrence_next_at?: string | null
          recurrence_parent_id?: string | null
          recurrence_type?: string | null
          show_subtasks_to_client?: boolean | null
          stage?: string
          status?: string
          title: string
          updated_at?: string
          visible_to_client?: boolean
        }
        Update: {
          assigned_client_name?: string | null
          assigned_to?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          parent_task_id?: string | null
          priority?: string
          recurrence_interval?: number | null
          recurrence_next_at?: string | null
          recurrence_parent_id?: string | null
          recurrence_type?: string | null
          show_subtasks_to_client?: boolean | null
          stage?: string
          status?: string
          title?: string
          updated_at?: string
          visible_to_client?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "agency_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "agency_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          client_id: string
          error_message: string | null
          id: string
          payload: Json | null
          processed_at: string
          status: string
          webhook_type: string
        }
        Insert: {
          client_id: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string
          status?: string
          webhook_type: string
        }
        Update: {
          client_id?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string
          status?: string
          webhook_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_client_slug: { Args: { client_name: string }; Returns: string }
      get_client_source_metrics: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          avg_calls_to_fund: number
          avg_time_to_fund: number
          client_id: string
          commitment_dollars: number
          funded_count: number
          funded_dollars: number
          reconnect_calls: number
          reconnect_showed: number
          showed_calls: number
          spam_leads: number
          total_calls: number
          total_leads: number
        }[]
      }
      get_sync_queue_stats: {
        Args: never
        Returns: {
          completed_count: number
          failed_count: number
          pending_count: number
          processing_count: number
          total_records_processed: number
        }[]
      }
      queue_client_sync: {
        Args: { p_client_id: string; p_days_back?: number }
        Returns: number
      }
      queue_full_sync_all_clients: {
        Args: { p_days_back?: number }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
