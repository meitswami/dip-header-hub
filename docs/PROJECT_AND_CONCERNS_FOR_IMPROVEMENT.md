# Digital Investigation Platform (DIP) — Project Overview & Serious Concerns

**Purpose of this document:** Share with an external advisor (e.g. ChatGPT) to get concrete suggestions to fix two major issues: CDR analysis not working, and AI replies being too long instead of precise and concise.

---

## 1. Project Overview

**Name:** Digital Investigation Platform (DIP)  
**Type:** Offline-first forensic investigation platform for law enforcement.  
**Goal:** Let investigators manage cases, upload telecom records (CDR, IPDR, SDR, Tower Dumps), and use an **AI Investigation Analyst** chat to ask questions in natural language and get answers **from the uploaded case data** (e.g. “show calls in/out for @Person (number)” or “common contacts between two numbers”).

**Important:** All data is **case data uploaded by the investigators** for that case. There is no access to external or real-time telecom data. The AI is supposed to analyze only this uploaded evidence.

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite |
| **UI** | Tailwind CSS, shadcn/ui, Radix UI |
| **Backend** | Self-hosted Supabase (PostgreSQL, Auth, Storage) via Docker; Kong API gateway |
| **AI** | **Ollama** (local LLM) — e.g. `phi3:mini`, `gemma:2b`. No cloud AI. |
| **AI integration** | App tries Supabase Edge Function first; on failure, **fallback**: frontend calls Ollama directly at `http://localhost:11434` (via Vite proxy to avoid CORS). |
| **Excel/Data** | SheetJS (xlsx) for parsing; CDR/IPDR/SDR/Tower rows inserted into Supabase tables (`cdr_records`, etc.) with column mapping. |
| **Charts/Maps** | Recharts, Leaflet/React-Leaflet for CDR visualizations and tower maps. |

So: **same codebase**, **local Ollama model** used when Edge Function is not available. The model sees a **system prompt** and **case context** (CDR records, person→number mapping, file list, common contacts, etc.) and is instructed to answer only from that data.

---

## 3. What Currently Works

- Case management, data upload, CDR/IPDR/SDR/Tower parsing and storage.
- Person profiles and aliases (person name ↔ phone numbers).
- AI Chat UI: case selector, @ mention for person, # for number, send, **Stop** button to abort streaming.
- **Case context is built and sent to the model:** files list, CDR row count, unique numbers, person→numbers, alias→number, “common contacts” and “contacted each other” when two numbers are in the query.
- System prompt explicitly says: “Reply in 1–2 SHORT sentences only”, “Use ONLY the data below”, “If no data, reply: No data for this case.”
- Request to Ollama includes `options: { num_predict: 120 }` to limit response length.
- Streaming and abort (Stop) work; fallback path works when Edge Function fails.

So **data pipeline and context injection are in place**. The two problems below are about **model behavior and response shape**, not about missing data in the prompt.

---

## 4. Serious Concern #1 — CDR Analysis Is Not Working

**Symptom:** When the user asks for CDR analysis (e.g. “@Naveen Khetawat (8890881122) show calls In/Out from its CDR”), the AI **does not perform the analysis**. Instead it:

- Refuses to do “retrospective call metadata analysis” and says it cannot execute it.
- Responds with long disclaimers about “educational purposes”, “fictional scenario”, “privacy”, “unauthorized data disclosure”, “safeguarding individual privacy rights”.
- States that the service is “illustrative” or “simulated” and “not for real-time criminal investigation”.

**Expected behavior:** The AI should use the **case context** (CDR records, person→number mapping) that we inject and answer factually, e.g. “Incoming: X calls. Outgoing: Y calls. Top numbers: …” or “No CDR data for this number in the case.”

**Root cause (our hypothesis):** The base Ollama model (e.g. phi3:mini) appears to treat “CDR / call metadata / person name + number” as sensitive personal data and defaults to **refusal + long safety/ethics disclaimers** instead of treating it as **authorized case evidence** provided by the user. So the issue is **model behavior and framing**, not missing data.

**What we need:** Practical ways to make the model **treat this as an authorized forensic use case** and **actually analyze the provided case data** (calls in/out, common numbers, etc.) instead of refusing and giving generic disclaimers. Suggestions could include: prompt design, system-instruction tweaks, model choice, or minimal fine-tuning / wrapper approaches that work with local Ollama.

---

## 5. Serious Concern #2 — Reply Response Is Too Long; Need Precise, Concise Replies

**Symptom:** The AI often replies with **long, multi-paragraph answers** full of caveats and disclaimers, instead of **short, precise answers** (1–2 sentences).

**What we already do:**

- System prompt: “Reply in 1–2 SHORT sentences only. Never paragraphs.”
- Ollama request: `options: { num_predict: 120 }`.
- Instructions: “Use ONLY the data below”; “If asked common numbers and data has the answer, reply only that.”

**Observed:** The model still ignores these and produces long replies. So either the model prioritizes its “safety” style over our instructions, or our constraints are not strong enough (prompt position, wording, or Ollama parameter usage).

**What we need:** Concrete, actionable suggestions so that **replies are consistently short and precise** (e.g. 1–3 sentences, no paragraphs of disclaimers). Suggestions could include: stronger prompt phrasing, prompt structure, different Ollama parameters (e.g. temperature, num_predict, other caps), post-processing (e.g. truncate at first sentence or N characters), or model choice that respects length limits better.

---

## 6. Request to the Advisor (e.g. ChatGPT)

We need **concrete, implementable suggestions** to:

1. **Fix CDR analysis:** So the AI actually uses the injected case data and answers CDR questions (calls in/out, common contacts, etc.) instead of refusing and giving long ethical disclaimers.
2. **Enforce short replies:** So the AI consistently gives precise, concise answers (1–2 sentences) and does not output long paragraphs.

Constraints:

- We use **local Ollama** (no cloud API). Suggestions should work with Ollama (e.g. system prompt, model choice, `options` in the API).
- We already send **rich case context** in the system prompt; the blocker is **model behavior** (refusal + length), not missing data.

Please suggest: prompt changes, system-instruction wording, Ollama parameters, model recommendations, and optionally client-side safeguards (e.g. truncation) — so we can implement and test quickly.
