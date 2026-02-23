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
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          case_id: string
          created_at?: string
          details?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          case_id?: string
          created_at?: string
          details?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
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
          confidence: number | null
          created_at: string
          created_by: string | null
          id: string
          phone_number: string
          photo_url: string | null
        }
        Insert: {
          alias_name: string
          case_id: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          phone_number: string
          photo_url?: string | null
        }
        Update: {
          alias_name?: string
          case_id?: string
          confidence?: number | null
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
          assigned_at: string
          case_id: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          case_id: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          case_id?: string
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
          category: string
          created_at: string
          description: string | null
          document_type: string | null
          file_hash: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          ocr_status: string | null
          ocr_text: string | null
          title: string
          uploaded_by: string
        }
        Insert: {
          case_id: string
          category?: string
          created_at?: string
          description?: string | null
          document_type?: string | null
          file_hash?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          ocr_status?: string | null
          ocr_text?: string | null
          title: string
          uploaded_by: string
        }
        Update: {
          case_id?: string
          category?: string
          created_at?: string
          description?: string | null
          document_type?: string | null
          file_hash?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          ocr_status?: string | null
          ocr_text?: string | null
          title?: string
          uploaded_by?: string
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
          created_by: string
          id: string
          note_type: string
          updated_at: string
        }
        Insert: {
          case_id: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          note_type?: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          note_type?: string
          updated_at?: string
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
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_id: string
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
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
          case_profile: Json
          created_at: string
          data_counts: Json | null
          data_snapshot_hash: string
          id: string
          summary: string | null
          trained_by: string
        }
        Insert: {
          case_id: string
          case_profile?: Json
          created_at?: string
          data_counts?: Json | null
          data_snapshot_hash: string
          id?: string
          summary?: string | null
          trained_by: string
        }
        Update: {
          case_id?: string
          case_profile?: Json
          created_at?: string
          data_counts?: Json | null
          data_snapshot_hash?: string
          id?: string
          summary?: string | null
          trained_by?: string
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
          created_by: string
          description: string | null
          fir_number: string | null
          id: string
          sections: string | null
          status: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at: string
        }
        Insert: {
          accused?: string | null
          case_date?: string | null
          complainant?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          fir_number?: string | null
          id?: string
          sections?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at?: string
        }
        Update: {
          accused?: string | null
          case_date?: string | null
          complainant?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          fir_number?: string | null
          id?: string
          sections?: string | null
          status?: Database["public"]["Enums"]["case_status"]
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
          id: string
          imei: string | null
          imsi: string | null
          lat: number | null
          lng: number | null
          location: string | null
          operator: string | null
          raw_data: Json | null
          source_file: string | null
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
          id?: string
          imei?: string | null
          imsi?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          operator?: string | null
          raw_data?: Json | null
          source_file?: string | null
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
          id?: string
          imei?: string | null
          imsi?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          operator?: string | null
          raw_data?: Json | null
          source_file?: string | null
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
          created_at: string
          id: string
          message: string
          result_snapshot: Json | null
          role: string
          sql_query: string | null
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          message: string
          result_snapshot?: Json | null
          role?: string
          sql_query?: string | null
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          message?: string
          result_snapshot?: Json | null
          role?: string
          sql_query?: string | null
          user_id?: string
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
      evidence_logs: {
        Row: {
          case_id: string
          created_at: string
          file_hash: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          upload_type: string
          uploaded_by: string
        }
        Insert: {
          case_id: string
          created_at?: string
          file_hash: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          upload_type: string
          uploaded_by: string
        }
        Update: {
          case_id?: string
          created_at?: string
          file_hash?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          upload_type?: string
          uploaded_by?: string
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
          event_time: string | null
          geofence_id: string
          id: string
          lat: number
          lng: number
          phone_number: string | null
          record_id: string
          record_type: string
        }
        Insert: {
          case_id: string
          created_at?: string
          event_time?: string | null
          geofence_id: string
          id?: string
          lat: number
          lng: number
          phone_number?: string | null
          record_id: string
          record_type: string
        }
        Update: {
          case_id?: string
          created_at?: string
          event_time?: string | null
          geofence_id?: string
          id?: string
          lat?: number
          lng?: number
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
          active: boolean
          case_id: string
          center_lat: number | null
          center_lng: number | null
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          polygon_coords: Json | null
          radius_meters: number | null
          zone_type: string
        }
        Insert: {
          active?: boolean
          case_id: string
          center_lat?: number | null
          center_lng?: number | null
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          polygon_coords?: Json | null
          radius_meters?: number | null
          zone_type?: string
        }
        Update: {
          active?: boolean
          case_id?: string
          center_lat?: number | null
          center_lng?: number | null
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          polygon_coords?: Json | null
          radius_meters?: number | null
          zone_type?: string
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
          title: string
        }
        Insert: {
          case_id: string
          created_at?: string
          data?: Json | null
          description?: string | null
          id?: string
          insight_type: string
          title: string
        }
        Update: {
          case_id?: string
          created_at?: string
          data?: Json | null
          description?: string | null
          id?: string
          insight_type?: string
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
          bytes_transferred: number | null
          case_id: string
          cell_id: string | null
          created_at: string
          destination_ip: string | null
          destination_port: number | null
          duration: number | null
          id: string
          imei: string | null
          ip_address: string | null
          location: string | null
          msisdn: string | null
          protocol: string | null
          raw_data: Json | null
          source_file: string | null
          source_port: number | null
          timestamp: string | null
        }
        Insert: {
          bytes_transferred?: number | null
          case_id: string
          cell_id?: string | null
          created_at?: string
          destination_ip?: string | null
          destination_port?: number | null
          duration?: number | null
          id?: string
          imei?: string | null
          ip_address?: string | null
          location?: string | null
          msisdn?: string | null
          protocol?: string | null
          raw_data?: Json | null
          source_file?: string | null
          source_port?: number | null
          timestamp?: string | null
        }
        Update: {
          bytes_transferred?: number | null
          case_id?: string
          cell_id?: string | null
          created_at?: string
          destination_ip?: string | null
          destination_port?: number | null
          duration?: number | null
          id?: string
          imei?: string | null
          ip_address?: string | null
          location?: string | null
          msisdn?: string | null
          protocol?: string | null
          raw_data?: Json | null
          source_file?: string | null
          source_port?: number | null
          timestamp?: string | null
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
          content: string
          created_at: string
          document_id: string
          id: string
          page_number: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          id?: string
          page_number?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          page_number?: number | null
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
          category: string
          chunk_count: number | null
          created_at: string
          error_message: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          page_count: number | null
          processing_completed_at: string | null
          processing_started_at: string | null
          status: string
          title: string
          uploaded_by: string
        }
        Insert: {
          category?: string
          chunk_count?: number | null
          created_at?: string
          error_message?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          page_count?: number | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          status?: string
          title: string
          uploaded_by: string
        }
        Update: {
          category?: string
          chunk_count?: number | null
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          page_count?: number | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          status?: string
          title?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          case_id: string | null
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
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
          address: string | null
          alias_name: string | null
          alleged_role: string | null
          case_id: string
          city: string | null
          country: string | null
          created_at: string
          id: string
          mobile_numbers: string[] | null
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          photo_urls: string[] | null
          role_in_case: string | null
          state: string | null
        }
        Insert: {
          address?: string | null
          alias_name?: string | null
          alleged_role?: string | null
          case_id: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          mobile_numbers?: string[] | null
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          photo_urls?: string[] | null
          role_in_case?: string | null
          state?: string | null
        }
        Update: {
          address?: string | null
          alias_name?: string | null
          alleged_role?: string | null
          case_id?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          mobile_numbers?: string[] | null
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          photo_urls?: string[] | null
          role_in_case?: string | null
          state?: string | null
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
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          badge_number?: string | null
          created_at?: string
          department?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          badge_number?: string | null
          created_at?: string
          department?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sdr_records: {
        Row: {
          activation_date: string | null
          address: string | null
          case_id: string
          created_at: string
          id: string
          id_proof_number: string | null
          id_proof_type: string | null
          operator: string | null
          phone_number: string | null
          plan_type: string | null
          raw_data: Json | null
          source_file: string | null
          subscriber_name: string | null
        }
        Insert: {
          activation_date?: string | null
          address?: string | null
          case_id: string
          created_at?: string
          id?: string
          id_proof_number?: string | null
          id_proof_type?: string | null
          operator?: string | null
          phone_number?: string | null
          plan_type?: string | null
          raw_data?: Json | null
          source_file?: string | null
          subscriber_name?: string | null
        }
        Update: {
          activation_date?: string | null
          address?: string | null
          case_id?: string
          created_at?: string
          id?: string
          id_proof_number?: string | null
          id_proof_type?: string | null
          operator?: string | null
          phone_number?: string | null
          plan_type?: string | null
          raw_data?: Json | null
          source_file?: string | null
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
      tower_dump_records: {
        Row: {
          case_id: string
          cell_id: string | null
          created_at: string
          duration: number | null
          id: string
          imei: string | null
          imsi: string | null
          lat: number | null
          lng: number | null
          location: string | null
          msisdn: string | null
          raw_data: Json | null
          source_file: string | null
          timestamp: string | null
        }
        Insert: {
          case_id: string
          cell_id?: string | null
          created_at?: string
          duration?: number | null
          id?: string
          imei?: string | null
          imsi?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          msisdn?: string | null
          raw_data?: Json | null
          source_file?: string | null
          timestamp?: string | null
        }
        Update: {
          case_id?: string
          cell_id?: string | null
          created_at?: string
          duration?: number | null
          id?: string
          imei?: string | null
          imsi?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          msisdn?: string | null
          raw_data?: Json | null
          source_file?: string | null
          timestamp?: string | null
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
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_case_member: { Args: { _case_id: string }; Returns: boolean }
      is_case_member_or_admin: { Args: { _case_id: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "investigator" | "viewer"
      case_status: "active" | "closed" | "archived" | "pending"
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
      case_status: ["active", "closed", "archived", "pending"],
    },
  },
} as const
