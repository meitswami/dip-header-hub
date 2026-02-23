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
      activity_logs: {
        Row: {
          action: string
          case_id: string
          created_at: string
          details: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          case_id: string
          created_at?: string
          details?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          case_id?: string
          created_at?: string
          details?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      aliases: {
        Row: {
          alias_name: string
          case_id: string
          confidence: string | null
          created_at: string
          created_by: string | null
          id: string
          phone_number: string
          photo_url: string | null
        }
        Insert: {
          alias_name: string
          case_id: string
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          phone_number: string
          photo_url?: string | null
        }
        Update: {
          alias_name?: string
          case_id?: string
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          phone_number?: string
          photo_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aliases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_assignments: {
        Row: {
          case_id: string
          case_role: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          case_id: string
          case_role?: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          case_id?: string
          case_role?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_assignments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_documents: {
        Row: {
          case_id: string
          created_at: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_notes: {
        Row: {
          case_id: string
          content: string
          created_at: string
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          case_id: string
          content: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_tasks: {
        Row: {
          assigned_to: string | null
          case_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_training_logs: {
        Row: {
          case_id: string
          created_at: string
          id: string
          status: string
          trained_by: string | null
          training_data: Json | null
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          status?: string
          trained_by?: string | null
          training_data?: Json | null
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          status?: string
          trained_by?: string | null
          training_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "case_training_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          accused: string | null
          case_date: string | null
          complainant: string | null
          created_at: string
          created_by: string | null
          description: string | null
          fir_number: string | null
          id: string
          sections: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          accused?: string | null
          case_date?: string | null
          complainant?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fir_number?: string | null
          id?: string
          sections?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          accused?: string | null
          case_date?: string | null
          complainant?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fir_number?: string | null
          id?: string
          sections?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cdr_records: {
        Row: {
          call_date: string | null
          call_type: string | null
          called_number: string | null
          calling_number: string | null
          case_id: string
          cell_id: string | null
          created_at: string
          duration: number | null
          file_id: string | null
          id: string
          imei: string | null
          imsi: string | null
          operator: string | null
          raw_data: Json | null
          roaming: string | null
          tower_lat: number | null
          tower_lng: number | null
          tower_location: string | null
        }
        Insert: {
          call_date?: string | null
          call_type?: string | null
          called_number?: string | null
          calling_number?: string | null
          case_id: string
          cell_id?: string | null
          created_at?: string
          duration?: number | null
          file_id?: string | null
          id?: string
          imei?: string | null
          imsi?: string | null
          operator?: string | null
          raw_data?: Json | null
          roaming?: string | null
          tower_lat?: number | null
          tower_lng?: number | null
          tower_location?: string | null
        }
        Update: {
          call_date?: string | null
          call_type?: string | null
          called_number?: string | null
          calling_number?: string | null
          case_id?: string
          cell_id?: string | null
          created_at?: string
          duration?: number | null
          file_id?: string | null
          id?: string
          imei?: string | null
          imsi?: string | null
          operator?: string | null
          raw_data?: Json | null
          roaming?: string | null
          tower_lat?: number | null
          tower_lng?: number | null
          tower_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cdr_records_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_logs: {
        Row: {
          case_id: string
          content: string
          created_at: string
          id: string
          result_snapshot: Json | null
          role: string
          sql_query: string | null
          user_id: string | null
        }
        Insert: {
          case_id: string
          content: string
          created_at?: string
          id?: string
          result_snapshot?: Json | null
          role?: string
          sql_query?: string | null
          user_id?: string | null
        }
        Update: {
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          result_snapshot?: Json | null
          role?: string
          sql_query?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      data_access_grants: {
        Row: {
          case_id: string
          created_at: string
          evidence_log_id: string
          granted_by: string | null
          granted_to: string
          id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          evidence_log_id: string
          granted_by?: string | null
          granted_to: string
          id?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          evidence_log_id?: string
          granted_by?: string | null
          granted_to?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_access_grants_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_access_grants_evidence_log_id_fkey"
            columns: ["evidence_log_id"]
            isOneToOne: false
            referencedRelation: "evidence_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      data_procurements: {
        Row: {
          case_id: string
          created_at: string
          data_type: string
          evidence_log_id: string | null
          id: string
          notes: string | null
          operator_name: string | null
          period_from: string | null
          period_to: string | null
          phone_number: string | null
          procured_by: string | null
          request_ref_no: string | null
          status: string
        }
        Insert: {
          case_id: string
          created_at?: string
          data_type: string
          evidence_log_id?: string | null
          id?: string
          notes?: string | null
          operator_name?: string | null
          period_from?: string | null
          period_to?: string | null
          phone_number?: string | null
          procured_by?: string | null
          request_ref_no?: string | null
          status?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          data_type?: string
          evidence_log_id?: string | null
          id?: string
          notes?: string | null
          operator_name?: string | null
          period_from?: string | null
          period_to?: string | null
          phone_number?: string | null
          procured_by?: string | null
          request_ref_no?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_procurements_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_procurements_evidence_log_id_fkey"
            columns: ["evidence_log_id"]
            isOneToOne: false
            referencedRelation: "evidence_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_logs: {
        Row: {
          case_id: string
          created_at: string
          file_hash: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          id: string
          record_count: number | null
          upload_type: string
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          file_hash?: string | null
          file_name: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          record_count?: number | null
          upload_type: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          file_hash?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          record_count?: number | null
          upload_type?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_alerts: {
        Row: {
          case_id: string
          created_at: string
          distance_meters: number | null
          event_time: string | null
          geofence_id: string
          id: string
          phone_number: string | null
          record_id: string
          record_type: string
        }
        Insert: {
          case_id: string
          created_at?: string
          distance_meters?: number | null
          event_time?: string | null
          geofence_id: string
          id?: string
          phone_number?: string | null
          record_id: string
          record_type: string
        }
        Update: {
          case_id?: string
          created_at?: string
          distance_meters?: number | null
          event_time?: string | null
          geofence_id?: string
          id?: string
          phone_number?: string | null
          record_id?: string
          record_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofence_alerts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_alerts_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "geofences"
            referencedColumns: ["id"]
          },
        ]
      }
      geofences: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          id: string
          lat: number
          lng: number
          name: string
          radius_meters: number
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          radius_meters?: number
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          radius_meters?: number
        }
        Relationships: [
          {
            foreignKeyName: "geofences_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      investigation_insights: {
        Row: {
          case_id: string
          created_at: string
          data: Json | null
          description: string | null
          id: string
          insight_type: string
          severity: string | null
          title: string
        }
        Insert: {
          case_id: string
          created_at?: string
          data?: Json | null
          description?: string | null
          id?: string
          insight_type: string
          severity?: string | null
          title: string
        }
        Update: {
          case_id?: string
          created_at?: string
          data?: Json | null
          description?: string | null
          id?: string
          insight_type?: string
          severity?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "investigation_insights_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      ipdr_records: {
        Row: {
          case_id: string
          cell_id: string | null
          created_at: string
          data_volume: number | null
          destination_ip: string | null
          destination_port: number | null
          file_id: string | null
          id: string
          imei: string | null
          imsi: string | null
          msisdn: string | null
          protocol: string | null
          raw_data: Json | null
          session_end: string | null
          session_start: string | null
          source_ip: string | null
          source_port: number | null
          tower_lat: number | null
          tower_lng: number | null
          tower_location: string | null
        }
        Insert: {
          case_id: string
          cell_id?: string | null
          created_at?: string
          data_volume?: number | null
          destination_ip?: string | null
          destination_port?: number | null
          file_id?: string | null
          id?: string
          imei?: string | null
          imsi?: string | null
          msisdn?: string | null
          protocol?: string | null
          raw_data?: Json | null
          session_end?: string | null
          session_start?: string | null
          source_ip?: string | null
          source_port?: number | null
          tower_lat?: number | null
          tower_lng?: number | null
          tower_location?: string | null
        }
        Update: {
          case_id?: string
          cell_id?: string | null
          created_at?: string
          data_volume?: number | null
          destination_ip?: string | null
          destination_port?: number | null
          file_id?: string | null
          id?: string
          imei?: string | null
          imsi?: string | null
          msisdn?: string | null
          protocol?: string | null
          raw_data?: Json | null
          session_end?: string | null
          session_start?: string | null
          source_ip?: string | null
          source_port?: number | null
          tower_lat?: number | null
          tower_lng?: number | null
          tower_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ipdr_records_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string
          document_id: string
          id: string
        }
        Insert: {
          chunk_index?: number
          chunk_text: string
          created_at?: string
          document_id: string
          id?: string
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_documents: {
        Row: {
          content: string | null
          created_at: string
          file_path: string | null
          file_type: string | null
          id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_path?: string | null
          file_type?: string | null
          id?: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          file_path?: string | null
          file_type?: string | null
          id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          case_id: string | null
          created_at: string
          id: string
          link: string | null
          message: string | null
          notification_type: string | null
          read: boolean
          sender_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          notification_type?: string | null
          read?: boolean
          sender_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          notification_type?: string | null
          read?: boolean
          sender_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      person_profiles: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          phone_numbers: string[] | null
          photo_url: string | null
          role: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          phone_numbers?: string[] | null
          photo_url?: string | null
          role?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone_numbers?: string[] | null
          photo_url?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_profiles_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          badge_number: string | null
          created_at: string
          department: string | null
          designation: string | null
          full_name: string
          id: string
          phone: string | null
          rank: string | null
          updated_at: string
        }
        Insert: {
          badge_number?: string | null
          created_at?: string
          department?: string | null
          designation?: string | null
          full_name?: string
          id: string
          phone?: string | null
          rank?: string | null
          updated_at?: string
        }
        Update: {
          badge_number?: string | null
          created_at?: string
          department?: string | null
          designation?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          rank?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sdr_records: {
        Row: {
          activation_date: string | null
          address: string | null
          case_id: string
          circle: string | null
          created_at: string
          file_id: string | null
          id: string
          id_number: string | null
          id_type: string | null
          mobile_number: string | null
          operator: string | null
          raw_data: Json | null
          subscriber_name: string | null
        }
        Insert: {
          activation_date?: string | null
          address?: string | null
          case_id: string
          circle?: string | null
          created_at?: string
          file_id?: string | null
          id?: string
          id_number?: string | null
          id_type?: string | null
          mobile_number?: string | null
          operator?: string | null
          raw_data?: Json | null
          subscriber_name?: string | null
        }
        Update: {
          activation_date?: string | null
          address?: string | null
          case_id?: string
          circle?: string | null
          created_at?: string
          file_id?: string | null
          id?: string
          id_number?: string | null
          id_type?: string | null
          mobile_number?: string | null
          operator?: string | null
          raw_data?: Json | null
          subscriber_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sdr_records_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_messages: {
        Row: {
          attachment_data: Json | null
          case_id: string | null
          content: string
          created_at: string
          id: string
          message_type: string
          read_at: string | null
          recipient_id: string | null
          sender_id: string
        }
        Insert: {
          attachment_data?: Json | null
          case_id?: string | null
          content: string
          created_at?: string
          id?: string
          message_type?: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id: string
        }
        Update: {
          attachment_data?: Json | null
          case_id?: string | null
          content?: string
          created_at?: string
          id?: string
          message_type?: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      tower_dump_records: {
        Row: {
          call_type: string | null
          case_id: string
          cell_id: string | null
          created_at: string
          duration: number | null
          event_time: string | null
          file_id: string | null
          id: string
          imei: string | null
          imsi: string | null
          mobile_number: string | null
          raw_data: Json | null
          tower_lat: number | null
          tower_lng: number | null
          tower_location: string | null
        }
        Insert: {
          call_type?: string | null
          case_id: string
          cell_id?: string | null
          created_at?: string
          duration?: number | null
          event_time?: string | null
          file_id?: string | null
          id?: string
          imei?: string | null
          imsi?: string | null
          mobile_number?: string | null
          raw_data?: Json | null
          tower_lat?: number | null
          tower_lng?: number | null
          tower_location?: string | null
        }
        Update: {
          call_type?: string | null
          case_id?: string
          cell_id?: string | null
          created_at?: string
          duration?: number | null
          event_time?: string | null
          file_id?: string | null
          id?: string
          imei?: string | null
          imsi?: string | null
          mobile_number?: string | null
          raw_data?: Json | null
          tower_lat?: number | null
          tower_lng?: number | null
          tower_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tower_dump_records_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_case_role: {
        Args: { _case_id: string; _user_id: string }
        Returns: string
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_case_member: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "investigator" | "viewer"
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
    Enums: {
      app_role: ["admin", "investigator", "viewer"],
    },
  },
} as const
