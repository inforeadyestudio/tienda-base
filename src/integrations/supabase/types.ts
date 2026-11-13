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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          country: string | null
          created_at: string
          department: string | null
          email: string | null
          id: string
          is_default: boolean
          label: string | null
          line1: string
          line2: string | null
          phone: string | null
          postal_code: string | null
          purpose: string
          recipient: string
          user_id: string
        }
        Insert: {
          city: string
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          line1: string
          line2?: string | null
          phone?: string | null
          postal_code?: string | null
          purpose?: string
          recipient: string
          user_id: string
        }
        Update: {
          city?: string
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          line1?: string
          line2?: string | null
          phone?: string | null
          postal_code?: string | null
          purpose?: string
          recipient?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_events: {
        Row: {
          created_at: string
          id: string
          name: string
          order_id: string | null
          payload: Json
          revenue_cop: number | null
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_id?: string | null
          payload?: Json
          revenue_cop?: number | null
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_id?: string | null
          payload?: Json
          revenue_cop?: number | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          tokens: number | null
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          tokens?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_preferences: {
        Row: {
          prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_sessions: {
        Row: {
          actor_type: string
          channel: string
          ended_at: string | null
          estimated_cost_usd: number
          id: string
          model: string | null
          route: string | null
          started_at: string
          user_id: string | null
        }
        Insert: {
          actor_type?: string
          channel?: string
          ended_at?: string | null
          estimated_cost_usd?: number
          id?: string
          model?: string | null
          route?: string | null
          started_at?: string
          user_id?: string | null
        }
        Update: {
          actor_type?: string
          channel?: string
          ended_at?: string | null
          estimated_cost_usd?: number
          id?: string
          model?: string | null
          route?: string | null
          started_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      agent_tool_calls: {
        Row: {
          args: Json
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          ok: boolean
          session_id: string
          tool: string
        }
        Insert: {
          args?: Json
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          ok?: boolean
          session_id: string
          tool: string
        }
        Update: {
          args?: Json
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          ok?: boolean
          session_id?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tool_calls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          device: string | null
          id: string
          name: string
          path: string | null
          payload: Json
          referrer: string | null
          referrer_host: string | null
          session_id: string
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          id?: string
          name: string
          path?: string | null
          payload?: Json
          referrer?: string | null
          referrer_host?: string | null
          session_id: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          id?: string
          name?: string
          path?: string | null
          payload?: Json
          referrer?: string | null
          referrer_host?: string | null
          session_id?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      b2b_box_items: {
        Row: {
          b2b_source: string | null
          box_id: string
          created_at: string
          customs_invoice_value: number | null
          id: string
          location_id: string | null
          order_item_id: string
          qty: number
          variant_id: string | null
        }
        Insert: {
          b2b_source?: string | null
          box_id: string
          created_at?: string
          customs_invoice_value?: number | null
          id?: string
          location_id?: string | null
          order_item_id: string
          qty: number
          variant_id?: string | null
        }
        Update: {
          b2b_source?: string | null
          box_id?: string
          created_at?: string
          customs_invoice_value?: number | null
          id?: string
          location_id?: string | null
          order_item_id?: string
          qty?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_box_items_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "b2b_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_box_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_boxes: {
        Row: {
          billing_value_mode: string
          box_number: number
          carrier: string | null
          created_at: string
          created_by: string | null
          discount_pct: number
          dispatched_at: string | null
          height_cm: number | null
          id: string
          label_url: string | null
          length_cm: number | null
          location_id: string | null
          note: string | null
          order_id: string
          package_type: string
          shipment_id: string | null
          skydropx_shipment_id: string | null
          status: string
          tracking: string | null
          updated_at: string
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          billing_value_mode?: string
          box_number: number
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          discount_pct?: number
          dispatched_at?: string | null
          height_cm?: number | null
          id?: string
          label_url?: string | null
          length_cm?: number | null
          location_id?: string | null
          note?: string | null
          order_id: string
          package_type?: string
          shipment_id?: string | null
          skydropx_shipment_id?: string | null
          status?: string
          tracking?: string | null
          updated_at?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          billing_value_mode?: string
          box_number?: number
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          discount_pct?: number
          dispatched_at?: string | null
          height_cm?: number | null
          id?: string
          label_url?: string | null
          length_cm?: number | null
          location_id?: string | null
          note?: string | null
          order_id?: string
          package_type?: string
          shipment_id?: string | null
          skydropx_shipment_id?: string | null
          status?: string
          tracking?: string | null
          updated_at?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_boxes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_boxes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_boxes_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "b2b_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_client_stores: {
        Row: {
          active: boolean
          city: string | null
          country: string
          created_at: string
          customer_id: string
          department: string | null
          id: string
          line1: string | null
          name: string
          phone: string | null
          recipient: string | null
        }
        Insert: {
          active?: boolean
          city?: string | null
          country?: string
          created_at?: string
          customer_id: string
          department?: string | null
          id?: string
          line1?: string | null
          name: string
          phone?: string | null
          recipient?: string | null
        }
        Update: {
          active?: boolean
          city?: string | null
          country?: string
          created_at?: string
          customer_id?: string
          department?: string | null
          id?: string
          line1?: string | null
          name?: string
          phone?: string | null
          recipient?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_client_stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_matrix_marks: {
        Row: {
          client_key: string
          mark: string
          row_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_key: string
          mark: string
          row_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_key?: string
          mark?: string
          row_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      b2b_order_approvals: {
        Row: {
          accepted_at: string
          created_at: string
          id: string
          notes: string | null
          order_id: string
          signature_data: string
          signer_name: string
          terms_text: string | null
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          signature_data: string
          signer_name: string
          terms_text?: string | null
          terms_version?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          signature_data?: string
          signer_name?: string
          terms_text?: string | null
          terms_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_order_approvals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_order_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: string
          actor_name: string | null
          created_at: string
          diff: Json
          id: string
          order_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind?: string
          actor_name?: string | null
          created_at?: string
          diff?: Json
          id?: string
          order_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: string
          actor_name?: string | null
          created_at?: string
          diff?: Json
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_return_items: {
        Row: {
          condition: string
          created_at: string
          id: string
          qty: number
          reason: string | null
          return_id: string
          variant_id: string
        }
        Insert: {
          condition?: string
          created_at?: string
          id?: string
          qty: number
          reason?: string | null
          return_id: string
          variant_id: string
        }
        Update: {
          condition?: string
          created_at?: string
          id?: string
          qty?: number
          reason?: string | null
          return_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "b2b_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_returns: {
        Row: {
          created_at: string
          created_by: string | null
          credit_note_status: string | null
          customer_id: string
          id: string
          mode: string
          note: string | null
          order_id: string | null
          reason: string
          received_at: string | null
          received_by: string | null
          shipment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_note_status?: string | null
          customer_id: string
          id?: string
          mode?: string
          note?: string | null
          order_id?: string | null
          reason?: string
          received_at?: string | null
          received_by?: string | null
          shipment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_note_status?: string | null
          customer_id?: string
          id?: string
          mode?: string
          note?: string | null
          order_id?: string | null
          reason?: string
          received_at?: string | null
          received_by?: string | null
          shipment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_returns_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "b2b_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_shipments: {
        Row: {
          carrier: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          dispatched_at: string
          dispatched_by: string | null
          id: string
          in_transit_at: string | null
          mode: string
          note: string | null
          order_id: string
          packing_list: Json
          signature_url: string | null
          status: string
          tracking: string | null
          transfer_id: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          dispatched_at?: string
          dispatched_by?: string | null
          id?: string
          in_transit_at?: string | null
          mode?: string
          note?: string | null
          order_id: string
          packing_list?: Json
          signature_url?: string | null
          status?: string
          tracking?: string | null
          transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          dispatched_at?: string
          dispatched_by?: string | null
          id?: string
          in_transit_at?: string | null
          mode?: string
          note?: string | null
          order_id?: string
          packing_list?: Json
          signature_url?: string | null
          status?: string
          tracking?: string | null
          transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_shipments_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_leads: {
        Row: {
          created_at: string
          email: string
          id: string
          items: Json
          name: string | null
          order_id: string | null
          reminder_sent_at: string | null
          session_key: string
          subtotal_cop: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          items?: Json
          name?: string | null
          order_id?: string | null
          reminder_sent_at?: string | null
          session_key: string
          subtotal_cop?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          items?: Json
          name?: string | null
          order_id?: string | null
          reminder_sent_at?: string | null
          session_key?: string
          subtotal_cop?: number
          updated_at?: string
        }
        Relationships: []
      }
      closet_items: {
        Row: {
          ai_meta: Json
          category: string | null
          color: string | null
          color_hex: string | null
          created_at: string
          fit: string | null
          garment_type: string | null
          id: string
          image_url: string
          material: string | null
          name: string
          original_url: string | null
          product_id: string | null
          source: string
          updated_at: string
          user_id: string
          variant_id: string | null
        }
        Insert: {
          ai_meta?: Json
          category?: string | null
          color?: string | null
          color_hex?: string | null
          created_at?: string
          fit?: string | null
          garment_type?: string | null
          id?: string
          image_url: string
          material?: string | null
          name: string
          original_url?: string | null
          product_id?: string | null
          source?: string
          updated_at?: string
          user_id: string
          variant_id?: string | null
        }
        Update: {
          ai_meta?: Json
          category?: string | null
          color?: string | null
          color_hex?: string | null
          created_at?: string
          fit?: string | null
          garment_type?: string | null
          id?: string
          image_url?: string
          material?: string | null
          name?: string
          original_url?: string | null
          product_id?: string | null
          source?: string
          updated_at?: string
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closet_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closet_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      closet_looks: {
        Row: {
          created_at: string
          id: string
          items: Json
          name: string
          preview_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          name?: string
          preview_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          name?: string
          preview_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      collection_blocks: {
        Row: {
          collection_id: string
          created_at: string
          data: Json
          id: string
          kind: Database["public"]["Enums"]["collection_block_kind"]
          position: number
          scope: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          data?: Json
          id?: string
          kind: Database["public"]["Enums"]["collection_block_kind"]
          position?: number
          scope?: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: Database["public"]["Enums"]["collection_block_kind"]
          position?: number
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_blocks_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_experiences: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          preview_token: string
          published_at: string | null
          published_snapshot: Json | null
          status: string
          theme: Json
          updated_at: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          preview_token?: string
          published_at?: string | null
          published_snapshot?: Json | null
          status?: string
          theme?: Json
          updated_at?: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          preview_token?: string
          published_at?: string | null
          published_snapshot?: Json | null
          status?: string
          theme?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_experiences_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: true
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_products: {
        Row: {
          collection_id: string
          position: number
          product_id: string
        }
        Insert: {
          collection_id: string
          position?: number
          product_id: string
        }
        Update: {
          collection_id?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_scenes: {
        Row: {
          created_at: string
          experience_id: string
          id: string
          layers: Json
          position: number
          props: Json
          source: string
          type: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          experience_id: string
          id?: string
          layers?: Json
          position?: number
          props?: Json
          source?: string
          type: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          experience_id?: string
          id?: string
          layers?: Json
          position?: number
          props?: Json
          source?: string
          type?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "collection_scenes_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "collection_experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          b2b_discount_pct: number | null
          board_shape: string
          channels: string[]
          cover_url: string | null
          created_at: string
          id: string
          is_page: boolean
          position: number
          scope: string
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          subtitle: string | null
          subtitle_en: string | null
          title: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          b2b_discount_pct?: number | null
          board_shape?: string
          channels?: string[]
          cover_url?: string | null
          created_at?: string
          id?: string
          is_page?: boolean
          position?: number
          scope?: string
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          subtitle?: string | null
          subtitle_en?: string | null
          title: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          b2b_discount_pct?: number | null
          board_shape?: string
          channels?: string[]
          cover_url?: string | null
          created_at?: string
          id?: string
          is_page?: boolean
          position?: number
          scope?: string
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          subtitle?: string | null
          subtitle_en?: string | null
          title?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coming_soon_signups: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      community_media: {
        Row: {
          approved: boolean
          author_name: string | null
          caption: string | null
          city: string | null
          created_at: string
          id: string
          kind: string
          media_url: string
          position: number
          poster_url: string | null
          product_id: string | null
        }
        Insert: {
          approved?: boolean
          author_name?: string | null
          caption?: string | null
          city?: string | null
          created_at?: string
          id?: string
          kind?: string
          media_url: string
          position?: number
          poster_url?: string | null
          product_id?: string | null
        }
        Update: {
          approved?: boolean
          author_name?: string | null
          caption?: string | null
          city?: string | null
          created_at?: string
          id?: string
          kind?: string
          media_url?: string
          position?: number
          poster_url?: string | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      count_session_lines: {
        Row: {
          counted_qty: number
          created_at: string
          id: string
          session_id: string
          system_qty: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          counted_qty?: number
          created_at?: string
          id?: string
          session_id: string
          system_qty?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          counted_qty?: number
          created_at?: string
          id?: string
          session_id?: string
          system_qty?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "count_session_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "count_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "count_session_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      count_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          collection_id: string | null
          created_at: string
          created_by: string | null
          diff_value_cop: number
          id: string
          location_id: string
          note: string | null
          status: string
          total_counted: number
          total_missing: number
          total_surplus: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          collection_id?: string | null
          created_at?: string
          created_by?: string | null
          diff_value_cop?: number
          id?: string
          location_id: string
          note?: string | null
          status?: string
          total_counted?: number
          total_missing?: number
          total_surplus?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          collection_id?: string | null
          created_at?: string
          created_by?: string | null
          diff_value_cop?: number
          id?: string
          location_id?: string
          note?: string | null
          status?: string
          total_counted?: number
          total_missing?: number
          total_surplus?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "count_sessions_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "count_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_messages: {
        Row: {
          batch_id: string | null
          body: string
          campaign_name: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          id: string
          image_url: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          body?: string
          campaign_name?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          image_url?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          batch_id?: string | null
          body?: string
          campaign_name?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          image_url?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_segments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          rules: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          rules?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          rules?: Json
          updated_at?: string
        }
        Relationships: []
      }
      email_automations: {
        Row: {
          body: string
          created_at: string
          delay_minutes: number
          description: string | null
          enabled: boolean
          id: string
          key: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          delay_minutes?: number
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          name: string
          subject?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          delay_minutes?: number
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_campaign_recipients: {
        Row: {
          bounced_at: string | null
          campaign_id: string
          click_count: number
          clicked_at: string | null
          delivered_at: string | null
          email: string
          id: string
          name: string | null
          open_count: number
          opened_at: string | null
          order_id: string | null
          order_total_cop: number | null
          purchased_at: string | null
          resend_id: string | null
          sent_at: string
          status: string
        }
        Insert: {
          bounced_at?: string | null
          campaign_id: string
          click_count?: number
          clicked_at?: string | null
          delivered_at?: string | null
          email: string
          id?: string
          name?: string | null
          open_count?: number
          opened_at?: string | null
          order_id?: string | null
          order_total_cop?: number | null
          purchased_at?: string | null
          resend_id?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          bounced_at?: string | null
          campaign_id?: string
          click_count?: number
          clicked_at?: string | null
          delivered_at?: string | null
          email?: string
          id?: string
          name?: string | null
          open_count?: number
          opened_at?: string | null
          order_id?: string | null
          order_total_cop?: number | null
          purchased_at?: string | null
          resend_id?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          blocks: Json
          body: string
          created_at: string
          cta_label: string | null
          cta_url: string | null
          failed_count: number
          id: string
          name: string
          preheader: string | null
          recipients_count: number
          segment_id: string | null
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          blocks?: Json
          body?: string
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          failed_count?: number
          id?: string
          name: string
          preheader?: string | null
          recipients_count?: number
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          blocks?: Json
          body?: string
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          failed_count?: number
          id?: string
          name?: string
          preheader?: string | null
          recipients_count?: number
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "customer_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notification_settings: {
        Row: {
          content: Json
          enabled: boolean
          event: string
          recipients: string[]
          updated_at: string
        }
        Insert: {
          content?: Json
          enabled?: boolean
          event: string
          recipients?: string[]
          updated_at?: string
        }
        Update: {
          content?: Json
          enabled?: boolean
          event?: string
          recipients?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          dedupe_key: string
          error: string | null
          event: string
          id: string
          recipients: string[]
          status: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          error?: string | null
          event: string
          id?: string
          recipients?: string[]
          status?: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          error?: string | null
          event?: string
          id?: string
          recipients?: string[]
          status?: string
        }
        Relationships: []
      }
      email_unsubscribes: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      fit_profiles: {
        Row: {
          bust_cm: number | null
          created_at: string
          fit_preference: string | null
          height_cm: number | null
          hip_cm: number | null
          updated_at: string
          user_id: string
          usual_brand: string | null
          usual_size: string | null
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          bust_cm?: number | null
          created_at?: string
          fit_preference?: string | null
          height_cm?: number | null
          hip_cm?: number | null
          updated_at?: string
          user_id: string
          usual_brand?: string | null
          usual_size?: string | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          bust_cm?: number | null
          created_at?: string
          fit_preference?: string | null
          height_cm?: number | null
          hip_cm?: number | null
          updated_at?: string
          user_id?: string
          usual_brand?: string | null
          usual_size?: string | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      gift_list_items: {
        Row: {
          created_at: string
          id: string
          list_id: string
          note: string | null
          position: number
          product_id: string | null
          purchased_qty: number
          qty_wanted: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          note?: string | null
          position?: number
          product_id?: string | null
          purchased_qty?: number
          qty_wanted?: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          note?: string | null
          position?: number
          product_id?: string | null
          purchased_qty?: number
          qty_wanted?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "gift_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_list_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_list_shipping: {
        Row: {
          created_at: string
          list_id: string
          ship_to: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          list_id: string
          ship_to?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          list_id?: string
          ship_to?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_list_shipping_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: true
            referencedRelation: "gift_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_lists: {
        Row: {
          cover_url: string | null
          created_at: string
          event_date: string | null
          id: string
          is_public: boolean
          message: string | null
          occasion: string | null
          owner_name: string | null
          slug: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          is_public?: boolean
          message?: string | null
          occasion?: string | null
          owner_name?: string | null
          slug: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          is_public?: boolean
          message?: string | null
          occasion?: string | null
          owner_name?: string | null
          slug?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gift_purchases: {
        Row: {
          buyer_id: string | null
          buyer_name: string | null
          created_at: string
          gift_message: string | null
          id: string
          item_id: string | null
          list_id: string
          order_id: string | null
          qty: number
          ship_target: string
        }
        Insert: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          gift_message?: string | null
          id?: string
          item_id?: string | null
          list_id: string
          order_id?: string | null
          qty?: number
          ship_target?: string
        }
        Update: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          gift_message?: string | null
          id?: string
          item_id?: string | null
          list_id?: string
          order_id?: string | null
          qty?: number
          ship_target?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "gift_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_purchases_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "gift_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_purchases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      inventory_levels: {
        Row: {
          location_id: string
          on_hand: number
          reserved: number
          returned_qty: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          location_id: string
          on_hand?: number
          reserved?: number
          returned_qty?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          location_id?: string
          on_hand?: number
          reserved?: number
          returned_qty?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["inventory_movement_kind"]
          location_id: string
          note: string | null
          qty: number
          ref_id: string | null
          ref_type: string | null
          variant_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["inventory_movement_kind"]
          location_id: string
          note?: string | null
          qty: number
          ref_id?: string | null
          ref_type?: string | null
          variant_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["inventory_movement_kind"]
          location_id?: string
          note?: string | null
          qty?: number
          ref_id?: string | null
          ref_type?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billing_value_mode: string | null
          box_id: string | null
          commercial_total_amount: number | null
          created_at: string
          created_by: string | null
          cufe: string | null
          currency: string
          environment: string
          error: string | null
          external_id: string | null
          id: string
          issued_at: string | null
          number: string | null
          order_id: string
          payload: Json
          pdf_url: string | null
          provider: string
          response: Json
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          billing_value_mode?: string | null
          box_id?: string | null
          commercial_total_amount?: number | null
          created_at?: string
          created_by?: string | null
          cufe?: string | null
          currency: string
          environment?: string
          error?: string | null
          external_id?: string | null
          id?: string
          issued_at?: string | null
          number?: string | null
          order_id: string
          payload?: Json
          pdf_url?: string | null
          provider: string
          response?: Json
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          billing_value_mode?: string | null
          box_id?: string | null
          commercial_total_amount?: number | null
          created_at?: string
          created_by?: string | null
          cufe?: string | null
          currency?: string
          environment?: string
          error?: string | null
          external_id?: string | null
          id?: string
          issued_at?: string | null
          number?: string | null
          order_id?: string
          payload?: Json
          pdf_url?: string | null
          provider?: string
          response?: Json
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "b2b_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          allow_international: boolean
          allow_preventa: boolean
          b2b_auto_packing: boolean
          b2b_preliminary_max_days: number
          channels: string[]
          city: string | null
          code: string
          consignment_customer_id: string | null
          created_at: string
          ecom_restock_min: number
          id: string
          kind: Database["public"]["Enums"]["location_kind"]
          lend_to_web: boolean
          manager_user_id: string | null
          name: string
          priority: number
          rcount_center: string | null
          sole_transfer_origin: boolean
          web_lend_priority: number
          web_safety_stock: number
          web_schedule: Json
        }
        Insert: {
          active?: boolean
          allow_international?: boolean
          allow_preventa?: boolean
          b2b_auto_packing?: boolean
          b2b_preliminary_max_days?: number
          channels?: string[]
          city?: string | null
          code: string
          consignment_customer_id?: string | null
          created_at?: string
          ecom_restock_min?: number
          id?: string
          kind: Database["public"]["Enums"]["location_kind"]
          lend_to_web?: boolean
          manager_user_id?: string | null
          name: string
          priority?: number
          rcount_center?: string | null
          sole_transfer_origin?: boolean
          web_lend_priority?: number
          web_safety_stock?: number
          web_schedule?: Json
        }
        Update: {
          active?: boolean
          allow_international?: boolean
          allow_preventa?: boolean
          b2b_auto_packing?: boolean
          b2b_preliminary_max_days?: number
          channels?: string[]
          city?: string | null
          code?: string
          consignment_customer_id?: string | null
          created_at?: string
          ecom_restock_min?: number
          id?: string
          kind?: Database["public"]["Enums"]["location_kind"]
          lend_to_web?: boolean
          manager_user_id?: string | null
          name?: string
          priority?: number
          rcount_center?: string | null
          sole_transfer_origin?: boolean
          web_lend_priority?: number
          web_safety_stock?: number
          web_schedule?: Json
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          order_id: string | null
          points: number
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          order_id?: string | null
          points?: number
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          order_id?: string | null
          points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_counters: {
        Row: {
          channel: string
          last_value: number
        }
        Insert: {
          channel: string
          last_value?: number
        }
        Update: {
          channel?: string
          last_value?: number
        }
        Relationships: []
      }
      order_fulfillments: {
        Row: {
          created_at: string
          id: string
          location_id: string
          order_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          order_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_fulfillments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          b2b_source: string | null
          created_at: string
          fulfill_location_id: string | null
          hs_code: string | null
          id: string
          list_price_cop: number | null
          order_id: string
          picked_at: string | null
          picked_by: string | null
          product_name: string
          qty: number
          shipped_qty: number
          unit_price_cad: number | null
          unit_price_cop: number
          unit_price_usd: number | null
          variant_id: string
          variant_label: string | null
        }
        Insert: {
          b2b_source?: string | null
          created_at?: string
          fulfill_location_id?: string | null
          hs_code?: string | null
          id?: string
          list_price_cop?: number | null
          order_id: string
          picked_at?: string | null
          picked_by?: string | null
          product_name: string
          qty: number
          shipped_qty?: number
          unit_price_cad?: number | null
          unit_price_cop: number
          unit_price_usd?: number | null
          variant_id: string
          variant_label?: string | null
        }
        Update: {
          b2b_source?: string | null
          created_at?: string
          fulfill_location_id?: string | null
          hs_code?: string | null
          id?: string
          list_price_cop?: number | null
          order_id?: string
          picked_at?: string | null
          picked_by?: string | null
          product_name?: string
          qty?: number
          shipped_qty?: number
          unit_price_cad?: number | null
          unit_price_cop?: number
          unit_price_usd?: number | null
          variant_id?: string
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_fulfill_location_id_fkey"
            columns: ["fulfill_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_shipments: {
        Row: {
          carrier: string | null
          created_at: string
          created_by: string | null
          id: string
          label_url: string | null
          location_id: string
          order_id: string
          shipped_at: string
          skydropx_shipment_id: string | null
          tracking: string | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label_url?: string | null
          location_id: string
          order_id: string
          shipped_at?: string
          skydropx_shipment_id?: string | null
          tracking?: string | null
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label_url?: string | null
          location_id?: string
          order_id?: string
          shipped_at?: string
          skydropx_shipment_id?: string | null
          tracking?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_shipments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          abandoned_at: string | null
          ad_campaign: string | null
          ad_source: string | null
          ad_tagged_at: string | null
          analytics_session_id: string | null
          b2b_mode: string
          b2b_payment_method: string | null
          b2b_reward: string | null
          b2b_ship_eta: string | null
          b2b_store_id: string | null
          billing_currency: string | null
          buyer_country: string | null
          checkout_snapshot: Json | null
          consignment_transfer_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          credit_due_at: string | null
          credit_paid_method: string | null
          currency: string
          customer_id: string | null
          delivered_at: string | null
          discount_cop: number
          discount_usd: number
          dispatch_location_id: string | null
          fulfill_location_id: string | null
          fx_cop_per_cad: number | null
          hold_token: string | null
          id: string
          idempotency_key: string | null
          invoice_document: string | null
          invoice_email: string | null
          invoice_name: string | null
          invoice_requested: boolean
          is_manual: boolean
          needs_stock: boolean
          notes: string | null
          number: string
          paid_at: string | null
          payment_method: string | null
          payment_proof_at: string | null
          payment_proof_url: string | null
          payment_reference: string | null
          payment_status: string
          picked_up_at: string | null
          points_redeemed: number
          pos_session_id: string | null
          promotion_code: string | null
          reserved_at: string | null
          return_credit_cop: number
          return_id: string | null
          review_request_sent_at: string | null
          ship_to: Json | null
          shipping_cad: number | null
          shipping_carrier: string | null
          shipping_cop: number
          shipping_label_url: string | null
          shipping_rule: Json
          shipping_weight_kg: number
          skydropx_shipment_id: string | null
          sold_by_location_id: string | null
          sold_by_user_id: string | null
          source: Database["public"]["Enums"]["order_source"]
          split_mode: string | null
          status: Database["public"]["Enums"]["order_status"]
          stock_confirmed_at: string | null
          stock_deducted_at: string | null
          stock_restored_at: string | null
          subtotal_cop: number
          tax_included_cop: number
          tax_rate: number
          tax_scope: string | null
          total_cad: number | null
          total_cop: number
          total_usd: number | null
          total_usd_exact: number | null
          tracking_number: string | null
          transfer_id: string | null
          updated_at: string
        }
        Insert: {
          abandoned_at?: string | null
          ad_campaign?: string | null
          ad_source?: string | null
          ad_tagged_at?: string | null
          analytics_session_id?: string | null
          b2b_mode?: string
          b2b_payment_method?: string | null
          b2b_reward?: string | null
          b2b_ship_eta?: string | null
          b2b_store_id?: string | null
          billing_currency?: string | null
          buyer_country?: string | null
          checkout_snapshot?: Json | null
          consignment_transfer_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          credit_due_at?: string | null
          credit_paid_method?: string | null
          currency?: string
          customer_id?: string | null
          delivered_at?: string | null
          discount_cop?: number
          discount_usd?: number
          dispatch_location_id?: string | null
          fulfill_location_id?: string | null
          fx_cop_per_cad?: number | null
          hold_token?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_document?: string | null
          invoice_email?: string | null
          invoice_name?: string | null
          invoice_requested?: boolean
          is_manual?: boolean
          needs_stock?: boolean
          notes?: string | null
          number?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_proof_at?: string | null
          payment_proof_url?: string | null
          payment_reference?: string | null
          payment_status?: string
          picked_up_at?: string | null
          points_redeemed?: number
          pos_session_id?: string | null
          promotion_code?: string | null
          reserved_at?: string | null
          return_credit_cop?: number
          return_id?: string | null
          review_request_sent_at?: string | null
          ship_to?: Json | null
          shipping_cad?: number | null
          shipping_carrier?: string | null
          shipping_cop?: number
          shipping_label_url?: string | null
          shipping_rule?: Json
          shipping_weight_kg?: number
          skydropx_shipment_id?: string | null
          sold_by_location_id?: string | null
          sold_by_user_id?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          split_mode?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stock_confirmed_at?: string | null
          stock_deducted_at?: string | null
          stock_restored_at?: string | null
          subtotal_cop?: number
          tax_included_cop?: number
          tax_rate?: number
          tax_scope?: string | null
          total_cad?: number | null
          total_cop?: number
          total_usd?: number | null
          total_usd_exact?: number | null
          tracking_number?: string | null
          transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          abandoned_at?: string | null
          ad_campaign?: string | null
          ad_source?: string | null
          ad_tagged_at?: string | null
          analytics_session_id?: string | null
          b2b_mode?: string
          b2b_payment_method?: string | null
          b2b_reward?: string | null
          b2b_ship_eta?: string | null
          b2b_store_id?: string | null
          billing_currency?: string | null
          buyer_country?: string | null
          checkout_snapshot?: Json | null
          consignment_transfer_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          credit_due_at?: string | null
          credit_paid_method?: string | null
          currency?: string
          customer_id?: string | null
          delivered_at?: string | null
          discount_cop?: number
          discount_usd?: number
          dispatch_location_id?: string | null
          fulfill_location_id?: string | null
          fx_cop_per_cad?: number | null
          hold_token?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_document?: string | null
          invoice_email?: string | null
          invoice_name?: string | null
          invoice_requested?: boolean
          is_manual?: boolean
          needs_stock?: boolean
          notes?: string | null
          number?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_proof_at?: string | null
          payment_proof_url?: string | null
          payment_reference?: string | null
          payment_status?: string
          picked_up_at?: string | null
          points_redeemed?: number
          pos_session_id?: string | null
          promotion_code?: string | null
          reserved_at?: string | null
          return_credit_cop?: number
          return_id?: string | null
          review_request_sent_at?: string | null
          ship_to?: Json | null
          shipping_cad?: number | null
          shipping_carrier?: string | null
          shipping_cop?: number
          shipping_label_url?: string | null
          shipping_rule?: Json
          shipping_weight_kg?: number
          skydropx_shipment_id?: string | null
          sold_by_location_id?: string | null
          sold_by_user_id?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          split_mode?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stock_confirmed_at?: string | null
          stock_deducted_at?: string | null
          stock_restored_at?: string | null
          subtotal_cop?: number
          tax_included_cop?: number
          tax_rate?: number
          tax_scope?: string | null
          total_cad?: number | null
          total_cop?: number
          total_usd?: number | null
          total_usd_exact?: number | null
          tracking_number?: string | null
          transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_b2b_store_id_fkey"
            columns: ["b2b_store_id"]
            isOneToOne: false
            referencedRelation: "b2b_client_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_consignment_transfer_id_fkey"
            columns: ["consignment_transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_dispatch_location_id_fkey"
            columns: ["dispatch_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_fulfill_location_id_fkey"
            columns: ["fulfill_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pos_session_id_fkey"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sold_by_location_id_fkey"
            columns: ["sold_by_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_verifications: {
        Row: {
          id: string
          order_id: string
          scope: string
          skipped: boolean
          verified_at: string
          verified_by: string | null
        }
        Insert: {
          id?: string
          order_id: string
          scope: string
          skipped?: boolean
          verified_at?: string
          verified_by?: string | null
        }
        Update: {
          id?: string
          order_id?: string
          scope?: string
          skipped?: boolean
          verified_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_verifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount: number
          checkout_url: string | null
          created_at: string
          currency: string
          draft: Json | null
          external_id: string | null
          id: string
          initiation_started_at: string | null
          payload: Json
          provider: string
          reference: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          checkout_url?: string | null
          created_at?: string
          currency?: string
          draft?: Json | null
          external_id?: string | null
          id?: string
          initiation_started_at?: string | null
          payload?: Json
          provider?: string
          reference: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_url?: string | null
          created_at?: string
          currency?: string
          draft?: Json | null
          external_id?: string | null
          id?: string
          initiation_started_at?: string | null
          payload?: Json
          provider?: string
          reference?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      points_code_exceptions: {
        Row: {
          active: boolean
          claimed_order_id: string | null
          code: string
          customer_id: string
          used_order_id: string | null
        }
        Insert: {
          active?: boolean
          claimed_order_id?: string | null
          code: string
          customer_id: string
          used_order_id?: string | null
        }
        Update: {
          active?: boolean
          claimed_order_id?: string | null
          code?: string
          customer_id?: string
          used_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "points_code_exceptions_claimed_order_id_fkey"
            columns: ["claimed_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_code_exceptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_code_exceptions_used_order_id_fkey"
            columns: ["used_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_credit_notes: {
        Row: {
          created_at: string
          created_by: string | null
          cude: string | null
          error: string | null
          external_id: string
          id: string
          invoice_number: string | null
          lines: Json
          notes: string | null
          numero_dian: string | null
          order_id: string
          public_url: string | null
          resolution: string
          return_id: string | null
          status: string
          total: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cude?: string | null
          error?: string | null
          external_id: string
          id?: string
          invoice_number?: string | null
          lines?: Json
          notes?: string | null
          numero_dian?: string | null
          order_id: string
          public_url?: string | null
          resolution?: string
          return_id?: string | null
          status?: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cude?: string | null
          error?: string | null
          external_id?: string
          id?: string
          invoice_number?: string | null
          lines?: Json
          notes?: string | null
          numero_dian?: string | null
          order_id?: string
          public_url?: string | null
          resolution?: string
          return_id?: string | null
          status?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_credit_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_expenses: {
        Row: {
          amount_cop: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          reason: string
          session_id: string
        }
        Insert: {
          amount_cop: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason: string
          session_id: string
        }
        Update: {
          amount_cop?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_expenses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_legacy_credit_notes: {
        Row: {
          created_at: string
          created_by: string | null
          cude: string | null
          customer: Json | null
          destination_location_id: string
          error: string | null
          external_id: string
          id: string
          inventory_applied_at: string | null
          legacy_invoice_number: string | null
          lines: Json
          location_id: string
          notes: string | null
          numero_dian: string | null
          payment_method: string | null
          public_url: string | null
          resolution: string
          sale_month: string
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cude?: string | null
          customer?: Json | null
          destination_location_id: string
          error?: string | null
          external_id: string
          id?: string
          inventory_applied_at?: string | null
          legacy_invoice_number?: string | null
          lines: Json
          location_id: string
          notes?: string | null
          numero_dian?: string | null
          payment_method?: string | null
          public_url?: string | null
          resolution: string
          sale_month: string
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cude?: string | null
          customer?: Json | null
          destination_location_id?: string
          error?: string | null
          external_id?: string
          id?: string
          inventory_applied_at?: string | null
          legacy_invoice_number?: string | null
          lines?: Json
          location_id?: string
          notes?: string | null
          numero_dian?: string | null
          payment_method?: string | null
          public_url?: string | null
          resolution?: string
          sale_month?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_legacy_credit_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_legacy_credit_notes_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_legacy_credit_notes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_offers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_url: string | null
          items: Json
          kind: string
          name: string
          note: string | null
          placements: string[]
          position: number
          price_cop: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string | null
          items?: Json
          kind: string
          name: string
          note?: string | null
          placements?: string[]
          position?: number
          price_cop?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string | null
          items?: Json
          kind?: string
          name?: string
          note?: string | null
          placements?: string[]
          position?: number
          price_cop?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_sales: {
        Row: {
          amount_cop: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["pos_method"]
          order_id: string
          session_id: string
        }
        Insert: {
          amount_cop: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["pos_method"]
          order_id: string
          session_id: string
        }
        Update: {
          amount_cop?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["pos_method"]
          order_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          closed_at: string | null
          closing_cash_cop: number | null
          closing_receipt_path: string | null
          id: string
          location_id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash_cop: number
        }
        Insert: {
          closed_at?: string | null
          closing_cash_cop?: number | null
          closing_receipt_path?: string | null
          id?: string
          location_id: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash_cop?: number
        }
        Update: {
          closed_at?: string | null
          closing_cash_cop?: number | null
          closing_receipt_path?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash_cop?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_terminal_payments: {
        Row: {
          amount_cop: number
          bold_payment_id: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          integration_id: string | null
          location_id: string | null
          raw: Json | null
          session_id: string | null
          status: string
          terminal_model: string | null
          terminal_serial: string | null
          updated_at: string
        }
        Insert: {
          amount_cop: number
          bold_payment_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          integration_id?: string | null
          location_id?: string | null
          raw?: Json | null
          session_id?: string | null
          status?: string
          terminal_model?: string | null
          terminal_serial?: string | null
          updated_at?: string
        }
        Update: {
          amount_cop?: number
          bold_payment_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          integration_id?: string | null
          location_id?: string | null
          raw?: Json | null
          session_id?: string | null
          status?: string
          terminal_model?: string | null
          terminal_serial?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      preventa_allocations: {
        Row: {
          created_at: string
          fulfilled_qty: number
          id: string
          location_id: string
          note: string | null
          order_id: string | null
          order_item_id: string | null
          qty: number
          status: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          fulfilled_qty?: number
          id?: string
          location_id: string
          note?: string | null
          order_id?: string | null
          order_item_id?: string | null
          qty: number
          status?: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          fulfilled_qty?: number
          id?: string
          location_id?: string
          note?: string | null
          order_id?: string | null
          order_item_id?: string | null
          qty?: number
          status?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preventa_allocations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preventa_allocations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preventa_allocations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preventa_allocations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      preventa_matrix_cells: {
        Row: {
          column_kind: string
          created_at: string
          id: string
          qty: number
          updated_at: string
          updated_by: string | null
          variant_id: string
        }
        Insert: {
          column_kind: string
          created_at?: string
          id?: string
          qty?: number
          updated_at?: string
          updated_by?: string | null
          variant_id: string
        }
        Update: {
          column_kind?: string
          created_at?: string
          id?: string
          qty?: number
          updated_at?: string
          updated_by?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preventa_matrix_cells_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      preventa_matrix_events: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "preventa_matrix_events_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      preventa_rules: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string | null
          id: string
          location_id: string
          max_qty: number
          starts_at: string | null
          updated_at: string
          variant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          location_id: string
          max_qty?: number
          starts_at?: string | null
          updated_at?: string
          variant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          location_id?: string
          max_qty?: number
          starts_at?: string | null
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preventa_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preventa_rules_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          position: number
          product_id: string
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          position?: number
          product_id: string
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          position?: number
          product_id?: string
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_faqs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string | null
          color: string | null
          created_at: string
          id: string
          position: number
          product_id: string
          url: string
        }
        Insert: {
          alt?: string | null
          color?: string | null
          created_at?: string
          id?: string
          position?: number
          product_id: string
          url: string
        }
        Update: {
          alt?: string | null
          color?: string | null
          created_at?: string
          id?: string
          position?: number
          product_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_journey_blocks: {
        Row: {
          affects: Json
          body: string | null
          config: Json
          created_at: string
          id: string
          kind: string
          media: Json
          position: number
          product_id: string
          required: boolean
          selectable: boolean
          slot: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          affects?: Json
          body?: string | null
          config?: Json
          created_at?: string
          id?: string
          kind?: string
          media?: Json
          position?: number
          product_id: string
          required?: boolean
          selectable?: boolean
          slot?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          affects?: Json
          body?: string | null
          config?: Json
          created_at?: string
          id?: string
          kind?: string
          media?: Json
          position?: number
          product_id?: string
          required?: boolean
          selectable?: boolean
          slot?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_journey_blocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_look_items: {
        Row: {
          combo_image_url: string | null
          created_at: string
          cutout_url: string | null
          generic_label: string | null
          generic_type: string | null
          id: string
          look_id: string
          position: number
          product_id: string | null
          slot: string
          transform: Json
        }
        Insert: {
          combo_image_url?: string | null
          created_at?: string
          cutout_url?: string | null
          generic_label?: string | null
          generic_type?: string | null
          id?: string
          look_id: string
          position?: number
          product_id?: string | null
          slot?: string
          transform?: Json
        }
        Update: {
          combo_image_url?: string | null
          created_at?: string
          cutout_url?: string | null
          generic_label?: string | null
          generic_type?: string | null
          id?: string
          look_id?: string
          position?: number
          product_id?: string | null
          slot?: string
          transform?: Json
        }
        Relationships: [
          {
            foreignKeyName: "product_look_items_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "product_looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_look_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_look_match_items: {
        Row: {
          id: string
          item_id: string
          match_id: string
        }
        Insert: {
          id?: string
          item_id: string
          match_id: string
        }
        Update: {
          id?: string
          item_id?: string
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_look_match_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "product_look_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_look_match_items_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "product_look_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      product_look_matches: {
        Row: {
          created_at: string
          id: string
          label: string | null
          look_id: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          look_id: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          look_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_look_matches_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "product_looks"
            referencedColumns: ["id"]
          },
        ]
      }
      product_looks: {
        Row: {
          active: boolean
          board: Json
          colors: string[]
          created_at: string
          discount_pct: number | null
          ends_at: string | null
          id: string
          image_url: string | null
          position: number
          product_id: string
          special_price_cop: number | null
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          board?: Json
          colors?: string[]
          created_at?: string
          discount_pct?: number | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          position?: number
          product_id: string
          special_price_cop?: number | null
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          board?: Json
          colors?: string[]
          created_at?: string
          discount_pct?: number | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          position?: number
          product_id?: string
          special_price_cop?: number | null
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_looks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_related: {
        Row: {
          created_at: string
          kind: string
          position: number
          product_id: string
          related_id: string
        }
        Insert: {
          created_at?: string
          kind?: string
          position?: number
          product_id: string
          related_id: string
        }
        Update: {
          created_at?: string
          kind?: string
          position?: number
          product_id?: string
          related_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_related_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_related_related_id_fkey"
            columns: ["related_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          approved: boolean
          author_name: string
          body: string | null
          city: string | null
          created_at: string
          fit_feedback: string | null
          id: string
          order_id: string | null
          photo_urls: string[]
          points_awarded: number
          product_id: string
          rating: number
          size_purchased: string | null
          title: string | null
          user_id: string | null
          verified: boolean
          video_url: string | null
        }
        Insert: {
          approved?: boolean
          author_name: string
          body?: string | null
          city?: string | null
          created_at?: string
          fit_feedback?: string | null
          id?: string
          order_id?: string | null
          photo_urls?: string[]
          points_awarded?: number
          product_id: string
          rating: number
          size_purchased?: string | null
          title?: string | null
          user_id?: string | null
          verified?: boolean
          video_url?: string | null
        }
        Update: {
          approved?: boolean
          author_name?: string
          body?: string | null
          city?: string | null
          created_at?: string
          fit_feedback?: string | null
          id?: string
          order_id?: string | null
          photo_urls?: string[]
          points_awarded?: number
          product_id?: string
          rating?: number
          size_purchased?: string | null
          title?: string | null
          user_id?: string | null
          verified?: boolean
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_types: {
        Row: {
          active: boolean
          board_shape: string
          cover_url: string | null
          created_at: string
          description: string | null
          height_cm: number | null
          id: string
          length_cm: number | null
          name: string
          position: number
          size_chart: Json | null
          slug: string
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          active?: boolean
          board_shape?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          name: string
          position?: number
          size_chart?: Json | null
          slug: string
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          active?: boolean
          board_shape?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          name?: string
          position?: number
          size_chart?: Json | null
          slug?: string
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          active: boolean
          barcode: string | null
          color: string | null
          color_hex: string | null
          compare_at_cop: number | null
          compare_at_usd: number | null
          cost_cop: number | null
          cost_usd: number | null
          created_at: string
          external_ref: string | null
          id: string
          price_cop: number
          price_usd: number | null
          product_id: string
          quality: string | null
          size: string | null
          sku: string
          tariff_code: string | null
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          color?: string | null
          color_hex?: string | null
          compare_at_cop?: number | null
          compare_at_usd?: number | null
          cost_cop?: number | null
          cost_usd?: number | null
          created_at?: string
          external_ref?: string | null
          id?: string
          price_cop?: number
          price_usd?: number | null
          product_id: string
          quality?: string | null
          size?: string | null
          sku: string
          tariff_code?: string | null
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          active?: boolean
          barcode?: string | null
          color?: string | null
          color_hex?: string | null
          compare_at_cop?: number | null
          compare_at_usd?: number | null
          cost_cop?: number | null
          cost_usd?: number | null
          created_at?: string
          external_ref?: string | null
          id?: string
          price_cop?: number
          price_usd?: number | null
          product_id?: string
          quality?: string | null
          size?: string | null
          sku?: string
          tariff_code?: string | null
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_videos: {
        Row: {
          created_at: string
          id: string
          position: number
          product_id: string
          size_mb: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          product_id: string
          size_mb?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          product_id?: string
          size_mb?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_videos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          available_international: boolean
          available_national: boolean
          available_pos_bogota: boolean
          available_pos_cali: boolean
          care: string | null
          composition: string | null
          created_at: string
          description: string | null
          description_en: string | null
          external_ref: string | null
          fit_spec: Json
          hero_image_url: string | null
          id: string
          lookbook_config: Json
          lookbook_enabled: boolean
          materials: string | null
          name: string
          name_en: string | null
          product_type: string | null
          reference_code: string | null
          ship_height_cm: number | null
          ship_length_cm: number | null
          ship_weight_grams: number | null
          ship_width_cm: number | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          story: string | null
          story_en: string | null
          tags: string[]
          updated_at: string
          version_group: string | null
          version_label: string | null
        }
        Insert: {
          available_international?: boolean
          available_national?: boolean
          available_pos_bogota?: boolean
          available_pos_cali?: boolean
          care?: string | null
          composition?: string | null
          created_at?: string
          description?: string | null
          description_en?: string | null
          external_ref?: string | null
          fit_spec?: Json
          hero_image_url?: string | null
          id?: string
          lookbook_config?: Json
          lookbook_enabled?: boolean
          materials?: string | null
          name: string
          name_en?: string | null
          product_type?: string | null
          reference_code?: string | null
          ship_height_cm?: number | null
          ship_length_cm?: number | null
          ship_weight_grams?: number | null
          ship_width_cm?: number | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          story?: string | null
          story_en?: string | null
          tags?: string[]
          updated_at?: string
          version_group?: string | null
          version_label?: string | null
        }
        Update: {
          available_international?: boolean
          available_national?: boolean
          available_pos_bogota?: boolean
          available_pos_cali?: boolean
          care?: string | null
          composition?: string | null
          created_at?: string
          description?: string | null
          description_en?: string | null
          external_ref?: string | null
          fit_spec?: Json
          hero_image_url?: string | null
          id?: string
          lookbook_config?: Json
          lookbook_enabled?: boolean
          materials?: string | null
          name?: string
          name_en?: string | null
          product_type?: string | null
          reference_code?: string | null
          ship_height_cm?: number | null
          ship_length_cm?: number | null
          ship_weight_grams?: number | null
          ship_width_cm?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          story?: string | null
          story_en?: string | null
          tags?: string[]
          updated_at?: string
          version_group?: string | null
          version_label?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string
          document_id: string | null
          full_name: string | null
          id: string
          is_staff: boolean
          phone: string | null
          pos_pin: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          document_id?: string | null
          full_name?: string | null
          id: string
          is_staff?: boolean
          phone?: string | null
          pos_pin?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          document_id?: string | null
          full_name?: string | null
          id?: string
          is_staff?: boolean
          phone?: string | null
          pos_pin?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          active: boolean
          amount_currency: string
          amount_usd: number | null
          channels: string[]
          code: string | null
          created_at: string
          ends_at: string | null
          id: string
          kind: string
          min_subtotal_cop: number | null
          name: string
          starts_at: string | null
          value: number
        }
        Insert: {
          active?: boolean
          amount_currency?: string
          amount_usd?: number | null
          channels?: string[]
          code?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          kind: string
          min_subtotal_cop?: number | null
          name: string
          starts_at?: string | null
          value: number
        }
        Update: {
          active?: boolean
          amount_currency?: string
          amount_usd?: number | null
          channels?: string[]
          code?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          kind?: string
          min_subtotal_cop?: number | null
          name?: string
          starts_at?: string | null
          value?: number
        }
        Relationships: []
      }
      rcount_adjustment_log: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          external_id: string
          id: string
          location_id: string | null
          message: string | null
          request: Json | null
          response: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          external_id: string
          id?: string
          location_id?: string | null
          message?: string | null
          request?: Json | null
          response?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          external_id?: string
          id?: string
          location_id?: string | null
          message?: string | null
          request?: Json | null
          response?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      rcount_send_locks: {
        Row: {
          claimed_at: string
          lock_key: string
        }
        Insert: {
          claimed_at?: string
          lock_key: string
        }
        Update: {
          claimed_at?: string
          lock_key?: string
        }
        Relationships: []
      }
      rcount_sync_log: {
        Row: {
          attempts: number
          box_id: string | null
          created_at: string
          created_by: string | null
          entity: string
          id: string
          order_id: string
          request: Json | null
          response: Json | null
          status: string
          target: string
          trigger: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          box_id?: string | null
          created_at?: string
          created_by?: string | null
          entity: string
          id?: string
          order_id: string
          request?: Json | null
          response?: Json | null
          status?: string
          target?: string
          trigger: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          box_id?: string | null
          created_at?: string
          created_by?: string | null
          entity?: string
          id?: string
          order_id?: string
          request?: Json | null
          response?: Json | null
          status?: string
          target?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rcount_sync_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ready_sync_log: {
        Row: {
          created_at: string
          id: string
          order_id: string
          request: Json | null
          response: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          request?: Json | null
          response?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          request?: Json | null
          response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ready_sync_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          committed_at: string | null
          created_at: string
          expires_at: string
          hold_token: string | null
          id: string
          location_id: string
          order_id: string | null
          order_item_id: string | null
          qty: number
          status: Database["public"]["Enums"]["reservation_status"]
          variant_id: string
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          expires_at: string
          hold_token?: string | null
          id?: string
          location_id: string
          order_id?: string | null
          order_item_id?: string | null
          qty: number
          status?: Database["public"]["Enums"]["reservation_status"]
          variant_id: string
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          expires_at?: string
          hold_token?: string | null
          id?: string
          location_id?: string
          order_id?: string | null
          order_item_id?: string | null
          qty?: number
          status?: Database["public"]["Enums"]["reservation_status"]
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          credit_id: string | null
          desired: string | null
          desired_qty: number
          desired_variant_id: string | null
          id: string
          inventory_swap_request_id: string | null
          items: Json
          kind: string
          location_id: string | null
          new_order_id: string | null
          notes: string | null
          order_id: string
          photo_paths: string[]
          reason: string
          refund_cop: number
          refund_token: string
          reservation_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          route_to: string | null
          source: Database["public"]["Enums"]["order_source"]
          status: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          credit_id?: string | null
          desired?: string | null
          desired_qty?: number
          desired_variant_id?: string | null
          id?: string
          inventory_swap_request_id?: string | null
          items?: Json
          kind: string
          location_id?: string | null
          new_order_id?: string | null
          notes?: string | null
          order_id: string
          photo_paths?: string[]
          reason: string
          refund_cop?: number
          refund_token?: string
          reservation_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route_to?: string | null
          source: Database["public"]["Enums"]["order_source"]
          status?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          credit_id?: string | null
          desired?: string | null
          desired_qty?: number
          desired_variant_id?: string | null
          id?: string
          inventory_swap_request_id?: string | null
          items?: Json
          kind?: string
          location_id?: string | null
          new_order_id?: string | null
          notes?: string | null
          order_id?: string
          photo_paths?: string[]
          reason?: string
          refund_cop?: number
          refund_token?: string
          reservation_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route_to?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_desired_variant_id_fkey"
            columns: ["desired_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      rwear_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          kind: string
          payload: Json
          result: Json
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          kind: string
          payload?: Json
          result?: Json
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          kind?: string
          payload?: Json
          result?: Json
        }
        Relationships: []
      }
      rwear_rejections: {
        Row: {
          created_at: string
          error: string
          event_id: string | null
          id: string
          kind: string
          payload: Json | null
        }
        Insert: {
          created_at?: string
          error: string
          event_id?: string | null
          id?: string
          kind: string
          payload?: Json | null
        }
        Update: {
          created_at?: string
          error?: string
          event_id?: string | null
          id?: string
          kind?: string
          payload?: Json | null
        }
        Relationships: []
      }
      shopify_customers: {
        Row: {
          accepts_email_marketing: boolean
          address1: string | null
          address2: string | null
          city: string | null
          company: string | null
          country_code: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          note: string | null
          orders_count: number
          phone: string | null
          province_code: string | null
          shopify_id: string
          tags: string | null
          total_spent: number
          updated_at: string
          user_id: string | null
          zip: string | null
        }
        Insert: {
          accepts_email_marketing?: boolean
          address1?: string | null
          address2?: string | null
          city?: string | null
          company?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          note?: string | null
          orders_count?: number
          phone?: string | null
          province_code?: string | null
          shopify_id: string
          tags?: string | null
          total_spent?: number
          updated_at?: string
          user_id?: string | null
          zip?: string | null
        }
        Update: {
          accepts_email_marketing?: boolean
          address1?: string | null
          address2?: string | null
          city?: string | null
          company?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          note?: string | null
          orders_count?: number
          phone?: string | null
          province_code?: string | null
          shopify_id?: string
          tags?: string | null
          total_spent?: number
          updated_at?: string
          user_id?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      signup_discount_subscribers: {
        Row: {
          consent_at: string
          created_at: string
          email: string
          id: string
          name: string
          promotion_id: string
        }
        Insert: {
          consent_at?: string
          created_at?: string
          email: string
          id?: string
          name: string
          promotion_id: string
        }
        Update: {
          consent_at?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          promotion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signup_discount_subscribers_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      store_appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          created_at: string
          customer_name: string
          document_id: string
          email: string | null
          id: string
          location_id: string
          notes: string | null
          status: string
          updated_at: string
          user_id: string | null
          whatsapp: string
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          created_at?: string
          customer_name: string
          document_id: string
          email?: string | null
          id?: string
          location_id: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          whatsapp: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          created_at?: string
          customer_name?: string
          document_id?: string
          email?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_credits: {
        Row: {
          amount_cop: number
          balance_cop: number
          code: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          location_id: string | null
          return_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cop: number
          balance_cop: number
          code?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          location_id?: string | null
          return_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cop?: number
          balance_cop?: number
          code?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          location_id?: string | null
          return_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_credits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credits_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      store_hours: {
        Row: {
          active: boolean
          created_at: string
          end_time: string
          id: string
          location_id: string
          slot_minutes: number
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_time?: string
          id?: string
          location_id: string
          slot_minutes?: number
          start_time?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          active?: boolean
          created_at?: string
          end_time?: string
          id?: string
          location_id?: string
          slot_minutes?: number
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_hours_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_profiles: {
        Row: {
          address: string
          city: string | null
          created_at: string
          gallery_urls: Json
          hours_note: string | null
          lat: number | null
          lng: number | null
          location_id: string
          map_query: string | null
          phone: string | null
          photo_url: string | null
          position: number
          updated_at: string
          visible: boolean
          whatsapp: string | null
        }
        Insert: {
          address?: string
          city?: string | null
          created_at?: string
          gallery_urls?: Json
          hours_note?: string | null
          lat?: number | null
          lng?: number | null
          location_id: string
          map_query?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: number
          updated_at?: string
          visible?: boolean
          whatsapp?: string | null
        }
        Update: {
          address?: string
          city?: string | null
          created_at?: string
          gallery_urls?: Json
          hours_note?: string | null
          lat?: number | null
          lng?: number | null
          location_id?: string
          map_query?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: number
          updated_at?: string
          visible?: boolean
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_requests: {
        Row: {
          id: string
          location_id: string
          note: string | null
          order_id: string
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["store_request_status"]
        }
        Insert: {
          id?: string
          location_id: string
          note?: string | null
          order_id: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["store_request_status"]
        }
        Update: {
          id?: string
          location_id?: string
          note?: string | null
          order_id?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["store_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "store_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      team_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          mentions: string[]
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          mentions?: string[]
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          mentions?: string[]
        }
        Relationships: []
      }
      transfer_items: {
        Row: {
          id: string
          qty: number
          received_qty: number | null
          sold_qty: number
          transfer_id: string
          variant_id: string
        }
        Insert: {
          id?: string
          qty: number
          received_qty?: number | null
          sold_qty?: number
          transfer_id: string
          variant_id: string
        }
        Update: {
          id?: string
          qty?: number
          received_qty?: number | null
          sold_qty?: number
          transfer_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          carrier: string | null
          created_at: string
          created_by: string | null
          discrepancy_items: Json | null
          discrepancy_resolution: string | null
          discrepancy_resolved_at: string | null
          discrepancy_resolved_by: string | null
          discrepancy_status: string | null
          from_location_id: string
          handoff: boolean
          id: string
          note: string | null
          order_id: string | null
          receipt_note: string | null
          received_at: string | null
          rejected_reason: string | null
          requested_by: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          tracking: string | null
          transfer_number: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          discrepancy_items?: Json | null
          discrepancy_resolution?: string | null
          discrepancy_resolved_at?: string | null
          discrepancy_resolved_by?: string | null
          discrepancy_status?: string | null
          from_location_id: string
          handoff?: boolean
          id?: string
          note?: string | null
          order_id?: string | null
          receipt_note?: string | null
          received_at?: string | null
          rejected_reason?: string | null
          requested_by?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          tracking?: string | null
          transfer_number?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          discrepancy_items?: Json | null
          discrepancy_resolution?: string | null
          discrepancy_resolved_at?: string | null
          discrepancy_resolved_by?: string | null
          discrepancy_status?: string | null
          from_location_id?: string
          handoff?: boolean
          id?: string
          note?: string | null
          order_id?: string | null
          receipt_note?: string | null
          received_at?: string | null
          rejected_reason?: string | null
          requested_by?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id?: string
          tracking?: string | null
          transfer_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      tryon_jobs: {
        Row: {
          created_at: string
          prediction_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          prediction_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          prediction_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tryon_photos: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          path: string
          user_id: string
          view: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          path: string
          user_id: string
          view?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          path?: string
          user_id?: string
          view?: string
        }
        Relationships: []
      }
      tryon_results: {
        Row: {
          created_at: string
          id: string
          output_url: string
          prediction_id: string | null
          product_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          output_url: string
          prediction_id?: string | null
          product_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          output_url?: string
          prediction_id?: string | null
          product_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tryon_results_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_translations: {
        Row: {
          created_at: string
          en: string
          source: string
          source_hash: string
        }
        Insert: {
          created_at?: string
          en: string
          source: string
          source_hash: string
        }
        Update: {
          created_at?: string
          en?: string
          source?: string
          source_hash?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_applications: {
        Row: {
          business_type: string
          city: string
          company: string
          country: string
          created_at: string
          email: string
          full_name: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sells_other_brands: boolean | null
          status: string
          updated_at: string
          user_id: string | null
          volume: string | null
          website: string | null
          whatsapp: string
        }
        Insert: {
          business_type: string
          city: string
          company: string
          country: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sells_other_brands?: boolean | null
          status?: string
          updated_at?: string
          user_id?: string | null
          volume?: string | null
          website?: string | null
          whatsapp: string
        }
        Update: {
          business_type?: string
          city?: string
          company?: string
          country?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sells_other_brands?: boolean | null
          status?: string
          updated_at?: string
          user_id?: string | null
          volume?: string | null
          website?: string | null
          whatsapp?: string
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          created_at: string
          user_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          variant_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandon_prepared_checkout: { Args: { _token: string }; Returns: Json }
      add_b2b_order_item:
        | {
            Args: {
              _location_id: string
              _order_id: string
              _qty?: number
              _variant_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _location_id: string
              _order_id: string
              _qty?: number
              _source?: string
              _variant_id: string
            }
            Returns: string
          }
      add_preliminary_order_item: {
        Args: { _order_id: string; _qty: number; _variant_id: string }
        Returns: undefined
      }
      adjust_inventory: {
        Args: {
          _kind: string
          _location_id: string
          _note: string
          _qty: number
          _variant_id: string
        }
        Returns: undefined
      }
      adopt_checkout_hold: {
        Args: { _minutes?: number; _order_id: string }
        Returns: undefined
      }
      advance_rcount_consecutive: {
        Args: { _center: string; _used: number }
        Returns: number
      }
      apply_legacy_credit_inventory: {
        Args: { _note_id: string }
        Returns: undefined
      }
      apply_order_points: {
        Args: { _order_id: string; _points: number }
        Returns: Json
      }
      apply_order_usd_code: {
        Args: { _code: string; _order_id: string }
        Returns: number
      }
      apply_return_credit: {
        Args: { _order_id: string; _return_id: string }
        Returns: undefined
      }
      apply_rwear_cut_curve: {
        Args: { _event_id: string; _items: Json; _reference: string }
        Returns: Json
      }
      approve_transfer: { Args: { _transfer_id: string }; Returns: undefined }
      b2b_my_consignment_transfers: { Args: never; Returns: Json }
      b2b_receive_consignment_transfer: {
        Args: { _items?: Json; _note?: string; _transfer_id: string }
        Returns: undefined
      }
      b2b_variant_discount_pct: {
        Args: { _variant_id: string }
        Returns: number
      }
      b2b_variant_price_cop: { Args: { _variant_id: string }; Returns: number }
      can_combine_points_code: {
        Args: { _code: string; _customer_id: string; _order_id?: string }
        Returns: boolean
      }
      can_skip_packing_verification: { Args: never; Returns: boolean }
      cancel_restock_order: { Args: { _order_id: string }; Returns: undefined }
      cancel_transfer: {
        Args: { _reason?: string; _transfer_id: string }
        Returns: undefined
      }
      change_order_item_location: {
        Args: { _item_id: string; _new_location_id: string }
        Returns: Json
      }
      claim_checkout_payment: { Args: { _reference: string }; Returns: boolean }
      claim_rcount_send: { Args: { _key: string }; Returns: boolean }
      client_add_preventa_item: {
        Args: { _order_id: string; _qty: number; _variant_id: string }
        Returns: undefined
      }
      client_set_preventa_item_qty: {
        Args: { _item_id: string; _order_id: string; _qty: number }
        Returns: undefined
      }
      confirm_b2b_quantities: {
        Args: { _order_id: string }
        Returns: undefined
      }
      confirm_manual_order_payment: {
        Args: { _order_id: string; _proof_url?: string }
        Returns: undefined
      }
      confirm_manual_order_stock: {
        Args: { _dispatch_location_id: string; _order_id: string }
        Returns: Json
      }
      confirm_order: {
        Args: { _idempotency_key?: string; _order_id: string }
        Returns: Json
      }
      confirm_restock_payment: {
        Args: { _method: string; _order_id: string; _proof_url: string }
        Returns: undefined
      }
      create_b2b_box: {
        Args: { _items: Json; _meta: Json; _order_id: string }
        Returns: string
      }
      create_b2b_restock_order: {
        Args: {
          _currency: string
          _items: Json
          _notes: string
          _signature: string
          _signer: string
          _terms_text: string
          _terms_version: string
          _total_usd: number
        }
        Returns: Json
      }
      create_intake: {
        Args: { _items: Json; _location_id: string; _note?: string }
        Returns: undefined
      }
      create_manual_order_stock: { Args: { _order_id: string }; Returns: Json }
      delete_b2b_box: { Args: { _box_id: string }; Returns: undefined }
      dispatch_b2b_box: {
        Args: { _box_id: string; _carrier: string; _tracking: string }
        Returns: string
      }
      dispatch_b2b_order: { Args: { _order_id: string }; Returns: undefined }
      dispatch_b2b_shipment: {
        Args: {
          _carrier: string
          _note: string
          _order_id: string
          _tracking: string
        }
        Returns: string
      }
      dispatch_consignment_order: {
        Args: { _order_id: string }
        Returns: string
      }
      dispatch_restock_order: {
        Args: { _order_id: string }
        Returns: undefined
      }
      edit_manual_order: {
        Args: {
          _discount_cop: number
          _items: Json
          _order_id: string
          _shipping_cop: number
          _total_usd: number
        }
        Returns: Json
      }
      edit_transfer_items: {
        Args: { _items: Json; _transfer_id: string }
        Returns: undefined
      }
      email_hook_post: {
        Args: { _body: Json; _path: string }
        Returns: undefined
      }
      ensure_consignment_location: {
        Args: { _customer_id: string }
        Returns: string
      }
      expire_checkout_holds: { Args: never; Returns: number }
      expire_reservations: { Args: never; Returns: number }
      extend_checkout_hold: {
        Args: { _minutes?: number; _token: string }
        Returns: boolean
      }
      finalize_gift_purchases: {
        Args: {
          _buyer_name?: string
          _entries: Json
          _gift_message?: string
          _order_id: string
          _ship_to_owner?: boolean
        }
        Returns: undefined
      }
      finalize_prepared_checkout: {
        Args: { _reference: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hold_checkout_stock: {
        Args: {
          _channel?: string
          _items: Json
          _minutes?: number
          _token: string
        }
        Returns: Json
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_b2b: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_team: { Args: { _user_id: string }; Returns: boolean }
      log_b2b_order_event: {
        Args: { _action: string; _diff: Json; _order_id: string }
        Returns: undefined
      }
      loyalty_sale_block_on: { Args: never; Returns: boolean }
      manual_order_try_finalize: {
        Args: { _order_id: string }
        Returns: boolean
      }
      mark_credit_order_paid: {
        Args: { _method: string; _order_id: string }
        Returns: undefined
      }
      mark_manual_order_pickup: {
        Args: { _order_id: string }
        Returns: undefined
      }
      mark_online_item_picked: {
        Args: { _item_id: string }
        Returns: undefined
      }
      next_pos_credit_note_id: { Args: never; Returns: string }
      order_ad_attribution: {
        Args: { _at: string; _customer: string; _session: string }
        Returns: {
          campaign: string
          source: string
        }[]
      }
      order_has_sale_items: { Args: { _order_id: string }; Returns: boolean }
      order_source_locations: { Args: { _order_id: string }; Returns: string[] }
      points_discount_usd: {
        Args: { _disc_cop: number; _rate: number }
        Returns: number
      }
      pos_instant_exchange: {
        Args: {
          _given: Json
          _location_id: string
          _method?: string
          _order_id: string
          _reason: string
          _returned: Json
          _session_id?: string
        }
        Returns: Json
      }
      pos_payment_method_stats: {
        Args: { p_from: string; p_location_id: string; p_to: string }
        Returns: {
          method: string
          revenue_cop: number
          sales: number
        }[]
      }
      pos_receive_return: {
        Args: {
          _items: Json
          _location_id: string
          _note: string
          _order_id: string
        }
        Returns: Json
      }
      pos_user_emails: {
        Args: { _ids: string[]; _q: string }
        Returns: {
          email: string
          id: string
        }[]
      }
      prepare_bold_guest_checkout: {
        Args: {
          _amount: number
          _draft: Json
          _items: Json
          _order: Json
          _reference: string
        }
        Returns: Json
      }
      prepare_checkout_retry: {
        Args: {
          _amount: number
          _currency: string
          _items: Json
          _order: Json
          _points: number
          _provider: string
          _reference: string
          _snapshot: Json
          _token: string
        }
        Returns: Json
      }
      product_sales_rank: {
        Args: { _days?: number }
        Returns: {
          product_id: string
          units: number
        }[]
      }
      receive_b2b_return: { Args: { _return_id: string }; Returns: undefined }
      receive_transfer: {
        Args: {
          _extra_items?: Json
          _note?: string
          _received_items?: Json
          _transfer_id: string
        }
        Returns: undefined
      }
      receive_transfer_core: {
        Args: { _note: string; _received_items: Json; _transfer_id: string }
        Returns: undefined
      }
      record_order_shipment: {
        Args: {
          _carrier: string
          _label_url?: string
          _location_id: string
          _order_id: string
          _skydropx_id?: string
          _tracking: string
        }
        Returns: Json
      }
      record_packing_verification: {
        Args: { _order_id: string; _scope: string; _skipped?: boolean }
        Returns: undefined
      }
      refresh_b2b_draft_prices: { Args: { _order_id: string }; Returns: number }
      reject_transfer: {
        Args: { _reason?: string; _transfer_id: string }
        Returns: undefined
      }
      release_checkout_hold: { Args: { _token: string }; Returns: undefined }
      report_consignment_location_sales: {
        Args: { _items: Json; _location_id: string; _report_date?: string }
        Returns: string
      }
      report_consignment_sales: {
        Args: { _customer_id: string; _items: Json; _period: string }
        Returns: string
      }
      report_consignment_transfer_sales: {
        Args: { _items: Json; _period?: string; _transfer_id: string }
        Returns: string
      }
      request_transfer: {
        Args: {
          _from_location_id: string
          _items: Json
          _note?: string
          _to_location_id: string
        }
        Returns: string
      }
      reserve_exchange: {
        Args: {
          _days?: number
          _qty: number
          _return_id: string
          _variant_id: string
        }
        Returns: Json
      }
      reserve_rcount_consecutive: {
        Args: { _center: string; _min: number }
        Returns: number
      }
      reserve_stock: {
        Args: { _channel?: string; _minutes?: number; _order_id: string }
        Returns: Json
      }
      reserve_stock_paid_fallback: {
        Args: { _order_id: string }
        Returns: undefined
      }
      resolve_return_refund: { Args: { _return_id: string }; Returns: Json }
      resolve_transfer_discrepancy: {
        Args: { _resolution: string; _transfer_id: string }
        Returns: undefined
      }
      return_consignment_stock: {
        Args: { _customer_id: string; _items: Json; _note: string }
        Returns: string
      }
      sales_hub_stats: {
        Args: { p_from: string; p_location_id?: string; p_to: string }
        Returns: {
          channel: string
          day: string
          orders: number
          revenue_cop: number
          units: number
        }[]
      }
      sales_hub_stats_currency: {
        Args: { p_from: string; p_location_id?: string; p_to: string }
        Returns: {
          channel: string
          currency: string
          day: string
          orders: number
          revenue_cop: number
          revenue_usd: number
          units: number
        }[]
      }
      set_b2b_item_location: {
        Args: {
          _item_id: string
          _location_id: string
          _order_id: string
          _source: string
        }
        Returns: undefined
      }
      set_b2b_item_qty: {
        Args: { _item_id: string; _order_id: string; _qty: number }
        Returns: undefined
      }
      set_b2b_preventa_destination: {
        Args: { _destination: string; _order_id: string }
        Returns: undefined
      }
      set_b2b_reference_price: {
        Args: {
          _order_id: string
          _price_cop: number
          _price_usd?: number
          _product_name: string
        }
        Returns: undefined
      }
      set_b2b_shipment_status: {
        Args: { _shipment_id: string; _signature_url: string; _status: string }
        Returns: undefined
      }
      set_order_split_mode: {
        Args: { _dispatch_location?: string; _mode: string; _order_id: string }
        Returns: Json
      }
      set_preventa_order_qty: {
        Args: {
          _customer_id: string
          _qty: number
          _store_id?: string
          _variant_id: string
        }
        Returns: string
      }
      set_restock_item_qty: {
        Args: { _item_id: string; _order_id: string; _qty: number }
        Returns: undefined
      }
      ship_transfer: {
        Args: { _carrier?: string; _tracking?: string; _transfer_id: string }
        Returns: undefined
      }
      store_booked_slots: {
        Args: { _location_id: string }
        Returns: {
          appointment_date: string
          appointment_time: string
          status: string
        }[]
      }
      submit_order_review: {
        Args: {
          _body: string
          _order_id: string
          _photo_urls: string[]
          _product_id: string
          _rating: number
          _video_url: string
        }
        Returns: Json
      }
      subscribe_signup_discount: {
        Args: { _email: string; _name: string }
        Returns: string
      }
      swap_order_item_inventory_error: {
        Args: {
          _location_id: string
          _order_item_id: string
          _reason?: string
          _variant_id: string
        }
        Returns: string
      }
      swap_order_item_inventory_error_many: {
        Args: {
          _order_item_id: string
          _reason?: string
          _replacements: Json
          _request_id: string
        }
        Returns: string
      }
      swap_order_items_inventory_error_many: {
        Args: {
          _order_item_ids: string[]
          _reason?: string
          _replacements: Json
          _request_id: string
        }
        Returns: string
      }
      swap_variants: {
        Args: {
          _from_variant: string
          _location_id: string
          _note: string
          _qty: number
          _to_variant: string
        }
        Returns: string
      }
      tienda_portal_stats: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      tienda_sales_timeseries: {
        Args: { p_from: string; p_region?: string; p_to: string }
        Returns: {
          average_order: number
          day: string
          orders: number
          revenue_cop: number
        }[]
      }
      tienda_stats_dimension: {
        Args: {
          p_dim: string
          p_from: string
          p_limit?: number
          p_region?: string
          p_to: string
        }
        Returns: {
          events: number
          label: string
          sessions: number
        }[]
      }
      tienda_stats_overview: {
        Args: { p_from: string; p_region?: string; p_to: string }
        Returns: Json
      }
      tienda_stats_timeseries: {
        Args: { p_from: string; p_region?: string; p_to: string }
        Returns: {
          carts: number
          day: string
          page_views: number
          purchases: number
          sessions: number
        }[]
      }
      update_b2b_box: {
        Args: { _box_id: string; _items: Json; _meta: Json }
        Returns: string
      }
      update_b2b_order_meta: {
        Args: {
          _eta: string
          _mode: string
          _order_id: string
          _payment: string
        }
        Returns: undefined
      }
      update_preliminary_order_items: {
        Args: { _items: Json; _order_id: string }
        Returns: undefined
      }
      web_lending: {
        Args: { l: Database["public"]["Tables"]["locations"]["Row"] }
        Returns: boolean
      }
      zl_event_region_ok: {
        Args: { _country: string; _region: string }
        Returns: boolean
      }
      zl_order_region_ok: {
        Args: { _currency: string; _region: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "admin_ecommerce"
        | "admin_inventario"
        | "staff_cali"
        | "staff_bogota"
        | "mercadeo"
        | "servicio"
        | "contabilidad"
        | "bodega"
        | "b2b"
        | "jefe_tiendas"
      collection_block_kind:
        | "cover"
        | "text"
        | "image"
        | "carousel"
        | "lookbook"
        | "products"
        | "video"
      inventory_movement_kind:
        | "sale"
        | "reservation"
        | "release"
        | "adjustment"
        | "transfer_out"
        | "transfer_in"
        | "count"
        | "return"
        | "exchange"
      location_kind: "ecom" | "store" | "warehouse" | "wholesale" | "event"
      order_source: "ecom" | "pos" | "assisted"
      order_status:
        | "draft"
        | "reserved"
        | "paid"
        | "preparing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
      pos_method:
        | "efectivo"
        | "datafono"
        | "transferencia"
        | "wompi"
        | "tarjeta"
        | "link_pago"
        | "credito_15"
        | "link_wompi"
        | "link_bold"
      product_status: "draft" | "published" | "archived"
      reservation_status: "active" | "consumed" | "released" | "expired"
      store_request_status: "pending" | "confirmed" | "rejected" | "expired"
      transfer_status:
        | "requested"
        | "draft"
        | "approved"
        | "in_transit"
        | "received"
        | "cancelled"
        | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "superadmin",
        "admin_ecommerce",
        "admin_inventario",
        "staff_cali",
        "staff_bogota",
        "mercadeo",
        "servicio",
        "contabilidad",
        "bodega",
        "b2b",
        "jefe_tiendas",
      ],
      collection_block_kind: [
        "cover",
        "text",
        "image",
        "carousel",
        "lookbook",
        "products",
        "video",
      ],
      inventory_movement_kind: [
        "sale",
        "reservation",
        "release",
        "adjustment",
        "transfer_out",
        "transfer_in",
        "count",
        "return",
        "exchange",
      ],
      location_kind: ["ecom", "store", "warehouse", "wholesale", "event"],
      order_source: ["ecom", "pos", "assisted"],
      order_status: [
        "draft",
        "reserved",
        "paid",
        "preparing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      pos_method: [
        "efectivo",
        "datafono",
        "transferencia",
        "wompi",
        "tarjeta",
        "link_pago",
        "credito_15",
        "link_wompi",
        "link_bold",
      ],
      product_status: ["draft", "published", "archived"],
      reservation_status: ["active", "consumed", "released", "expired"],
      store_request_status: ["pending", "confirmed", "rejected", "expired"],
      transfer_status: [
        "requested",
        "draft",
        "approved",
        "in_transit",
        "received",
        "cancelled",
        "rejected",
      ],
    },
  },
} as const
