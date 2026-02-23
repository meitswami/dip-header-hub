# DIP — Digital Investigation Platform

A comprehensive forensic investigation platform built for law enforcement officers to analyze telecom records (CDR, IPDR, SDR, Tower Dumps), manage cases, collaborate with teams, and generate court-ready reports.

## 🚀 Features

### Core Investigation
- **Case Management** — Create, track, and manage investigation cases with FIR details, sections, complainant/accused info
- **Data Upload & Parsing** — Multi-file batch upload with automatic column detection (no manual mapping), phone number extraction from filenames, and inline aliasing
- **File-Based Record Browser** — Browse uploaded CDR/IPDR/SDR/Tower Dump files per case, view full Excel-like data tables, search within files, download originals, export filtered views, and delete files with cascading record cleanup
- **AI Chat Analyst** — Natural language queries against case data powered by AI, with SQL generation and result visualization
- **Knowledge Base** — Upload legal documents and reference materials for AI-assisted legal research

### Advanced Forensic Analysis
- **CDR Visualization** — Interactive charts for call frequency timelines, top contacts, hourly patterns, and tower location scatter plots
- **Common Number Analysis** — Auto-detect shared contacts between suspects, identify burner phone patterns, and highlight communication clusters
- **Timeline Reconstruction** — Visual chronological timeline from CDR/IPDR/Tower data showing suspect movements, call events, and rapid location changes
- **Interactive Tower Map** — Leaflet-based map with tower locations, suspect movement trails, heatmap overlay for call density hotspots, and time slider for chronological playback
- **Geofencing Alerts** — Define geographic zones (via map click or coordinates) and automatically flag when a suspect's phone appears within the zone
- **Case Comparison** — Cross-case CDR pattern analysis to identify linked crimes via shared phone numbers and IMEI devices
- **Auto Insights** — Automated detection of frequent contacts, late-night patterns, IMEI changes, tower movement anomalies, and contact clustering
- **AI Case Training** — Train the AI on full case context (FIR, records, documents, insights) for highly accurate case-specific assistance

### Collaboration & Audit
- **Case Tasks** — Create, assign, and track investigation tasks within each case
- **Activity Feed** — Real-time audit log of all case actions (data uploads, task changes, analysis runs)
- **Notifications** — In-app notification bell with real-time alerts for case updates, new uploads, and colleague activity
- **Role-Based Access** — Admin, Investigator, and Viewer roles with granular RLS policies on all data

### Reporting & Export
- **Forensic PDF Report** — Comprehensive investigation report with case details, data summary, evidence chain, insights, and query log
- **Court-Ready Format** — Section 65B certified report with Table of Contents, compliance declaration, SHA256 hash verification, and signature blocks
- **Excel Export** — Multi-sheet Excel export of all forensic records (CDR, IPDR, Tower Dumps, SDR)

### Admin Tools
- **User Management** — Admin panel for managing user roles and permissions
- **Data Cleanup** — Bulk deletion tool with checkbox selection for test/dummy data, protected by password re-authentication

### Platform
- **Dark Mode** — Full dark/light theme toggle optimized for long investigation sessions
- **Bilingual Support** — English and Hindi language toggle
- **Mobile Responsive** — Optimized for tablets and mobile devices for field use
- **Person Profiles & Aliases** — Track suspects, witnesses, and phone number aliases with confidence scores

## 🛠️ Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **UI:** Tailwind CSS + shadcn/ui + Radix UI primitives
- **Charts:** Recharts
- **Maps:** Leaflet + React-Leaflet + Leaflet.heat (OpenStreetMap)
- **Backend:** Lovable Cloud (Supabase) — Database, Auth, Edge Functions, Storage
- **PDF:** jsPDF + jspdf-autotable
- **Excel:** SheetJS (xlsx)
- **AI:** Lovable AI (Gemini / GPT models via edge functions)

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── AliasManager.tsx          # Phone number alias management
│   ├── AppLayout.tsx             # Main layout with sidebar + header
│   ├── AppSidebar.tsx            # Navigation sidebar
│   ├── CaseCollaboration.tsx     # Tasks + activity feed
│   ├── CaseTrainingPanel.tsx     # AI training on case data
│   ├── CDRVisualization.tsx      # Charts for CDR analysis
│   ├── CommonNumberAnalysis.tsx  # Shared contact detection
│   ├── NotificationBell.tsx      # Real-time notifications
│   ├── TimelineReconstruction.tsx # Event timeline view
│   ├── TowerMap.tsx              # Leaflet map with geofencing, heatmap, time slider
│   └── ui/                       # shadcn/ui components
├── hooks/               # Custom React hooks
│   ├── useAuth.tsx       # Authentication context
│   ├── useLang.tsx       # Language/i18n
│   ├── useSpeech.tsx     # Speech recognition
│   └── useTheme.tsx      # Dark/light theme
├── lib/                 # Utilities
│   ├── autoAnalysis.ts   # Automated CDR analysis engine
│   ├── caseTraining.ts   # AI training data aggregation
│   ├── dataParser.ts     # Excel/CSV parsing
│   └── utils.ts          # General utilities
├── pages/               # Route pages
│   ├── AIChat.tsx        # AI analyst chat
│   ├── AdminUsers.tsx    # User management (admin)
│   ├── CaseComparison.tsx # Cross-case CDR comparison
│   ├── CaseDetail.tsx    # Single case view with all tabs
│   ├── CaseDocuments.tsx # Document management
│   ├── Cases.tsx         # Case listing
│   ├── Dashboard.tsx     # Overview dashboard
│   ├── DataCleanup.tsx   # Bulk data deletion tool
│   ├── DataUpload.tsx    # File upload + parsing
│   ├── KnowledgeBase.tsx # Legal reference library
│   ├── Login.tsx         # Authentication
│   ├── NewCase.tsx       # Case creation form
│   ├── ProfileSettings.tsx # User profile
│   └── Reports.tsx       # PDF/Excel reports
└── integrations/        # Backend integration
    └── supabase/         # Auto-generated client + types
```

## 🔒 Security

- Row-Level Security (RLS) on all tables
- Role-based access control (Admin / Investigator / Viewer)
- Case-member checks for all data access
- SHA256 file hash verification for evidence integrity
- Section 65B compliance for court admissibility
- Password re-authentication for destructive operations

## 🚀 Getting Started

```sh
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development server
npm run dev
```

The backend (database, auth, storage, edge functions) runs on Lovable Cloud and requires no additional setup.

## 📄 License

Proprietary — Law Enforcement Use Only
