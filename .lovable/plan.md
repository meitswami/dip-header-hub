
# RBAC Workflow, Procurement, Case Teams, and Messaging System

## Overview

This plan implements a comprehensive role-based access control (RBAC) system with procurement workflows, case team management, staff messaging, and real-time notifications. The system introduces **case-level roles** (CIO, Procurement, Analyst, Viewer) on top of existing system roles (admin, investigator, viewer).

---

## 1. New Database Tables and Schema Changes

### A. Modify `case_assignments` table
Add a `case_role` column to define each member's role within a specific case:
- `case_incharge` (CIO) -- can manage case, assign members, approve data
- `procurement` -- can upload data, mark it available to analysts
- `analyst` -- can view assigned data, do analysis, send remarks
- `viewer` -- read-only access to the case

### B. New table: `data_procurements`
Tracks procurement metadata when CDR/IPDR/Tower data is added:
- `id`, `case_id`, `evidence_log_id` (link to evidence_logs)
- `procured_by` (user_id of procurement staff)
- `procured_at`, `phone_number`, `data_type` (cdr/ipdr/tower_dump/sdr)
- `operator_name`, `request_ref_no`, `period_from`, `period_to`
- `status` (pending_upload / uploaded / assigned)
- `assigned_to` (array of user_ids who can access this data)
- `notes`

### C. New table: `staff_messages`
For direct messaging and case-level discussions:
- `id`, `sender_id`, `recipient_id` (nullable -- null for case-level messages)
- `case_id` (nullable -- null for DMs)
- `content`, `message_type` (text / analysis_pointer / remark)
- `attachment_data` (jsonb -- for sharing analysis pointers, saved charts)
- `read_at`, `created_at`

### D. New table: `data_access_grants`
Controls which specific evidence files each case member can see:
- `id`, `case_id`, `evidence_log_id`, `granted_to` (user_id)
- `granted_by` (user_id), `created_at`

### E. Alter `notifications` table
Add columns: `notification_type` (data_added, message_received, case_assigned, data_shared), `link` (if not already present), `sender_id`

---

## 2. Updated RLS Policies

- `data_procurements`: Procurement and CIO of that case can INSERT/UPDATE. Case members can SELECT.
- `staff_messages`: Sender or recipient can SELECT. Authenticated users can INSERT their own messages.
- `data_access_grants`: CIO and Procurement of a case can INSERT/DELETE. Granted users can SELECT.
- `case_assignments`: Updated so CIO and admin can INSERT/UPDATE/DELETE assignments for their case.
- Evidence/CDR data upload: Add check that the uploader has `procurement` or `case_incharge` case_role.

A new database function `get_case_role(_user_id uuid, _case_id uuid)` will be created to return the user's case-level role.

---

## 3. Case Creation Workflow

**Current flow:** Any investigator/admin creates a case and is auto-assigned.

**New flow:**
1. When creating a case, a **Case Incharge (CIO)** must be selected (can be the creator or someone else)
2. CIO is auto-assigned with `case_role = 'case_incharge'`
3. Creator (if different) is also added as a member
4. CIO can then add team members via a **Case Team Manager** panel, selecting each member's case role

### UI Changes to `NewCase.tsx`:
- Add a CIO selector dropdown listing all staff from `profiles`
- After case creation, redirect to case detail where CIO can add team members

---

## 4. Case Team Management Panel

New component `CaseTeamManager.tsx` on the Case Detail page:
- Shows all assigned members with their case roles and profile info
- CIO/admin can:
  - Add members from a staff list (searchable dropdown)
  - Assign case roles via dropdown (procurement / analyst / viewer)
  - Remove members (except CIO)
- Uses checkboxes for bulk data access grants
- When a member is added, a notification is sent to them

---

## 5. Procurement Data Upload Workflow

### Updated `DataUpload.tsx`:
- Only users with `case_role = 'procurement'` or `case_role = 'case_incharge'` for the selected case can upload
- Before uploading, show a **procurement metadata form** (matching the user's uploaded screenshots):
  - Phone Number, Operator Name, Request Reference No.
  - Period From / Period To
  - Data Type (CDR/IPDR/Tower Dump/SDR)
  - Notes
- **Duplicate detection** before upload:
  - Check `evidence_logs.file_hash` for exact file duplicates
  - Check `data_procurements` for same phone + date range + type combination
  - Prompt user: "Data for this number/period already exists. Append or Skip?"
- After upload, a `data_procurements` record is created linking to the evidence log
- Procurement person can then **assign data** to specific analysts using checkboxes from the case team list

### New component `DataAssignmentPanel.tsx`:
- Shown after upload or from Case Detail
- Lists all evidence files with procurement metadata
- Checkboxes to grant access to specific case members
- "Assign" button creates `data_access_grants` entries and sends notifications

---

## 6. Staff Personal Dashboard

### Updated `Dashboard.tsx`:
- For analysts: Show only cases and data **assigned to them** via `data_access_grants`
- Quick stats: Cases assigned, Unread messages, Pending analysis tasks
- "My Assigned Data" section showing evidence files they have access to, grouped by case
- Saved analysis pointers section

---

## 7. Messaging System

### New page `StaffMessages.tsx` (route: `/messages`):
- **Case Discussions tab**: Shows case-level message threads grouped by case
- **Direct Messages tab**: Private 1-to-1 conversations
- Message composer with:
  - Text input
  - Ability to attach "analysis pointers" (saved analysis notes, key findings)
  - Recipient selector for DMs
  - Case selector for case discussions
- Real-time updates via database realtime subscriptions

### Analysis Sharing:
- From any analysis view (CDR Analysis, Common Numbers, Timeline), an "Share Finding" button
- Opens a composer pre-filled with the analysis data as structured pointers
- Select recipient or post to case discussion

---

## 8. Notification System Enhancement

### Notification triggers (via database triggers):
- **New data added**: When procurement uploads data, notify CIO and assigned analysts
  - "CDR for 7568XXXX added by {Staff Name}"
- **New message**: When a message is sent, notify recipient(s)
  - "New message from {Staff Name}"
- **Case assignment**: When added to a case
  - "You were added to case {Case Title} as {Role}"
- **Data shared**: When data is assigned to an analyst
  - "CDR data for 7568XXXX shared with you by {Staff Name}"

### Implementation:
- Database trigger functions on INSERT for `data_procurements`, `staff_messages`, `case_assignments`, `data_access_grants`
- Each trigger inserts into `notifications` table with appropriate type and link

---

## 9. Sidebar Navigation Updates

Add to sidebar:
- "Messages" link with unread count badge (for all users)
- "My Data" link for analysts showing their assigned evidence

---

## 10. Implementation Sequence

Due to the size of this feature, implementation will be done in phases:

**Phase 1 - Database & Core RBAC:**
- Migration: alter `case_assignments`, create `data_procurements`, `staff_messages`, `data_access_grants`
- New DB functions: `get_case_role()`, `is_procurement_member()`, `is_case_cio()`
- RLS policies for all new tables
- Notification trigger functions

**Phase 2 - Case Team Management:**
- `CaseTeamManager.tsx` component
- Update `NewCase.tsx` with CIO selection
- Update Case Detail page to show team panel

**Phase 3 - Procurement Upload Flow:**
- Update `DataUpload.tsx` with role checks and procurement metadata form
- Duplicate detection logic
- `DataAssignmentPanel.tsx` for data access grants

**Phase 4 - Messaging & Dashboard:**
- `StaffMessages.tsx` page
- Dashboard updates for analysts
- Sidebar updates with message badge
- Analysis sharing from existing components

---

## Technical Details

### Database Migration SQL (Phase 1):
```text
-- Add case_role to case_assignments
ALTER TABLE case_assignments ADD COLUMN case_role text NOT NULL DEFAULT 'analyst';

-- Create data_procurements table
CREATE TABLE data_procurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  evidence_log_id uuid,
  procured_by uuid,
  phone_number text,
  data_type text NOT NULL,
  operator_name text,
  request_ref_no text,
  period_from date,
  period_to date,
  status text NOT NULL DEFAULT 'pending_upload',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create staff_messages table  
CREATE TABLE staff_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid,
  case_id uuid,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  attachment_data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create data_access_grants table
CREATE TABLE data_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  evidence_log_id uuid NOT NULL,
  granted_to uuid NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(evidence_log_id, granted_to)
);

-- Add notification columns
ALTER TABLE notifications 
  ADD COLUMN IF NOT EXISTS notification_type text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS sender_id uuid,
  ADD COLUMN IF NOT EXISTS link text;

-- DB function for case role
CREATE OR REPLACE FUNCTION get_case_role(_user_id uuid, _case_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT case_role FROM case_assignments 
  WHERE user_id = _user_id AND case_id = _case_id LIMIT 1
$$;

-- Enable RLS on all new tables
-- Enable realtime for staff_messages and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE staff_messages;
```

### New Files:
- `src/components/CaseTeamManager.tsx` -- Case team with role assignment
- `src/components/DataAssignmentPanel.tsx` -- Grant data access to team members
- `src/pages/StaffMessages.tsx` -- Messaging page with DMs and case discussions
- Updates to: `NewCase.tsx`, `DataUpload.tsx`, `Dashboard.tsx`, `AppSidebar.tsx`, `App.tsx`, `CaseDetail.tsx`

### Existing Patterns Used:
- RLS via `is_case_member()` and new `get_case_role()` security definer functions
- Realtime subscriptions (same pattern as `NotificationBell.tsx` and `CaseCollaboration.tsx`)
- Notification system already exists with realtime -- extending with trigger functions
- `profiles` table for staff directory (already readable by all authenticated users)
