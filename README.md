# DIP — Digital Investigation Platform

A comprehensive offline-first forensic investigation platform built for law enforcement officers to analyze telecom records (CDR, IPDR, SDR, Tower Dumps), manage cases, collaborate with teams, and generate court-ready reports.

**Runs fully offline on 8GB RAM systems. No cloud dependency.**

## 🚀 Features

### Core Investigation
- **Case Management** — Create, track, and manage investigation cases with FIR details, sections, complainant/accused info
- **Data Upload & Parsing** — Multi-file batch upload with automatic column detection (no manual mapping), phone number extraction from filenames, and inline aliasing
- **File-Based Record Browser** — Browse uploaded CDR/IPDR/SDR/Tower Dump files per case, view full Excel-like data tables, search within files, download originals, export filtered views, and delete files with cascading record cleanup
- **AI Chat Analyst** — Natural language queries against case data powered by local Ollama LLM, with SQL generation and result visualization
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
- **System Settings** — Configure Ollama AI URL/model, test connections, and monitor system health (Database, Ollama, Storage)

### Platform
- **Fully Offline** — Runs locally (FastAPI + SQLite), no internet required
- **Dark Mode** — Full dark/light theme toggle optimized for long investigation sessions
- **Bilingual Support** — English and Hindi language toggle
- **Mobile Responsive** — Optimized for tablets and mobile devices for field use
- **Person Profiles & Aliases** — Track suspects, witnesses, and phone number aliases with confidence scores
- **Health Monitoring** — Sidebar indicator showing live connection status for Database, Ollama AI, and Storage

## 🛠️ Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **UI:** Tailwind CSS + shadcn/ui + Radix UI primitives
- **Charts:** Recharts
- **Maps:** Leaflet + React-Leaflet + Leaflet.heat (OpenStreetMap)
- **Backend:** Python FastAPI + SQLAlchemy (SQLite by default; PostgreSQL optional)
- **AI:** Ollama (local LLM — phi3:mini, gemma:2b, or llava:7b for OCR)
- **PDF:** jsPDF + jspdf-autotable
- **Excel:** SheetJS (xlsx)
- **Desktop:** Electron + electron-builder (for packaging)

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── AliasManager.tsx          # Phone number alias management
│   ├── AppLayout.tsx             # Main layout with sidebar + header
│   ├── AppSidebar.tsx            # Navigation sidebar with health indicator
│   ├── CaseCollaboration.tsx     # Tasks + activity feed
│   ├── CaseTrainingPanel.tsx     # AI training on case data
│   ├── CDRVisualization.tsx      # Charts for CDR analysis
│   ├── CommonNumberAnalysis.tsx  # Shared contact detection
│   ├── HealthIndicator.tsx       # System health status widget
│   ├── NotificationBell.tsx      # Real-time notifications
│   ├── TimelineReconstruction.tsx # Event timeline view
│   ├── TowerMap.tsx              # Leaflet map with geofencing, heatmap, time slider
│   └── ui/                       # shadcn/ui components
├── hooks/               # Custom React hooks
│   ├── useAuth.tsx       # Authentication context
│   ├── useHealthCheck.tsx # Live health monitoring (DB, Ollama, Storage)
│   ├── useLang.tsx       # Language/i18n
│   ├── useOllamaSettings.tsx # Ollama configuration management
│   ├── useSpeech.tsx     # Speech recognition
│   └── useTheme.tsx      # Dark/light theme
├── lib/                 # Utilities
│   ├── autoAnalysis.ts   # Automated CDR analysis engine
│   ├── caseTraining.ts   # AI training data aggregation
│   ├── dataParser.ts     # Excel/CSV parsing
│   └── utils.ts          # General utilities
├── pages/               # Route pages
│   ├── AIChat.tsx        # AI analyst chat (powered by Ollama)
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
│   ├── Reports.tsx       # PDF/Excel reports
│   └── Settings.tsx      # Ollama config + system health
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

## 🚀 Getting Started (Offline)

### Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| **Python 3.11+** | FastAPI backend | (recommended) Miniconda / Python.org |
| **Node.js 18+** | Frontend dev server | [nodejs.org](https://nodejs.org) |
| **Ollama (optional)** | Local AI narrative replies | [ollama.com](https://ollama.com) |

### Quick Start (Windows)

1. Install Node + Python
2. From the repo root, double-click `start.bat`

- **App**: `http://localhost:5173`
- **API**: `http://127.0.0.1:8000`
- **Database**: by default, uploads are stored in SQLite `dip.db` (created in the folder where you start the backend)

## 📦 Electron Packaging (Desktop App)

Package DIP as a standalone desktop application using `electron-builder`.

### Step 1: Build the Web App

```bash
npm run build
```

This creates a `dist/` folder with the production-ready static files.

### Step 2: Create Electron Entry Point

Create `electron/main.js`:

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'DIP — Digital Investigation Platform',
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the built Vite app
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

### Step 3: Create `electron/preload.js`

```js
// Intentionally empty for now — add IPC bridges here if needed
```

### Step 4: Update `package.json`

Add/merge these fields into your `package.json`:

```json
{
  "main": "electron/main.js",
  "build": {
    "appId": "com.dip.investigation",
    "productName": "DIP Investigation Platform",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "electron/**/*",
      "public/favicon.ico"
    ],
    "win": {
      "target": "nsis",
      "icon": "public/favicon.ico"
    },
    "mac": {
      "target": "dmg",
      "icon": "public/favicon.ico"
    },
    "linux": {
      "target": "AppImage",
      "icon": "public/favicon.ico"
    }
  }
}
```

### Step 5: Install Electron Dependencies

```bash
npm install --save-dev electron electron-builder
```

### Step 6: Build the Desktop App

```bash
# Windows
npx electron-builder --win

# macOS
npx electron-builder --mac

# Linux
npx electron-builder --linux
```

The installer will be in the `release/` folder.

### Step 7: Full Offline Bundle

For a fully self-contained offline setup, ship with:

1. **Python installer** (or Miniconda)
2. **Node.js installer**
3. **Ollama installer** + pre-downloaded model files (optional)
4. **DIP Electron installer** (from `release/`) or the repo + `start.bat`

### Electron + Backend Architecture

```
┌─────────────────────────────────────┐
│         Electron App (DIP)          │
│  ┌───────────────────────────────┐  │
│  │   React Frontend (Vite build) │  │
│  └───────────┬───────────────────┘  │
│              │ HTTP                  │
│  ┌───────────▼───────────────────┐  │
│  │  FastAPI Backend (port 8000)  │  │
│  │  └── SQLite (dip.db)          │  │
│  └───────────────────────────────┘  │
│              │ HTTP (optional)       │
│  ┌───────────▼───────────────────┐  │
│  │  Ollama (port 11434)          │  │
│  │  └── phi3:mini / gemma:2b     │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## 📄 License

Proprietary — Law Enforcement Use Only
