# Plan: 3D Queue System

## Goal

Add an admin-managed 3D print queue where attendees spend GP to request prints, admins manage Bambu P2S and Snapmaker U1 printers, and the system handles files, slicing, queueing, printer assignment, status tracking, and completion/failure.

## Source Findings

Local `/Users/spacemandev/Projects/oniondao-git/fdm-monster` currently contains only `docker-compose.yml` for `fdmmonster/fdm-monster:2`. It does not include source code locally.

Upstream/current docs indicate FDM Monster v2 provides:

- Printer farm management for OctoPrint, Moonraker, PrusaLink, and Bambu Lab.
- API v2 and Swagger/OpenAPI at `/swagger`.
- Print queue system.
- Slicer integration API.
- SQLite-backed runtime.
- Bambu LAN-style connection using printer IP/host, serial number, and LAN access code.
- File metadata parsing for GCode, 3MF, BGCode, thumbnails, and Bambu plate metadata.

Subagent source inspection of upstream FDM Monster found these implementation details:

- Bambu FTPS uses port `990`, user `bblp`, and LAN access code as password.
- Bambu MQTT uses `mqtts://<host>:8883`, user `bblp`, LAN access code as password, and topics keyed by printer serial.
- Generic credential fields include printer URL, printer type, API key, username, and password.
- FDM Monster has a queue model with statuses like pending, queued, starting, printing, paused, completed, failed, cancelled, and unknown.
- FDM Monster does not appear to run OrcaSlicer, Bambu Studio, PrusaSlicer, or CuraEngine. Its "slicer" support is an upload-compatible API plus file analysis, not server-side slicing.
- FDM Monster is AGPL-3.0-or-later, so copying code directly into this repository needs license review.

References:

- https://github.com/fdm-monster/fdm-monster
- https://docs.fdm-monster.net/blog/fdm-monster-release-2-0-0
- https://docs.fdm-monster.net/docs/software_usage/creating_printers

Implication: treat FDM Monster as either:

1. a sidecar service controlled through its API, or
2. a source/reference to vendor later when its source is available locally.

Do not assume the local checkout contains reusable code yet.

## Critical Deployment Constraint

Railway-hosted `city.oniondao.dev` cannot directly reach printers on a local Wi-Fi/LAN unless the printers are publicly exposed or connected through a tunnel. Do not expose printer control ports publicly.

Recommended architecture:

```text
city-dashboard on Railway
  - stores requests, queue, files, auth, GP burns
  - exposes bridge API/WebSocket

print-bridge on printer LAN
  - outbound connection to city
  - owns printer credentials
  - talks to Bambu/FDM Monster/Moonraker locally
  - runs slicer jobs if local compute is preferred

printers
  - Bambu P2S
  - Snapmaker U1
```

The bridge should connect outbound to Railway over WSS or poll over HTTPS. This avoids inbound firewall and printer exposure.

## Adapter Strategy

Build a printer adapter interface:

```ts
interface PrinterAdapter {
  kind: "fdm-monster" | "bambu-lan" | "moonraker" | "snapmaker-u1";
  testConnection(printer: PrinterConfig): Promise<PrinterHealth>;
  getStatus(printerId: string): Promise<PrinterStatus>;
  uploadFile(printerId: string, file: PrintFile): Promise<UploadResult>;
  startPrint(
    printerId: string,
    uploadedFileId: string,
  ): Promise<PrintStartResult>;
  pause(printerId: string): Promise<void>;
  resume(printerId: string): Promise<void>;
  cancel(printerId: string): Promise<void>;
}
```

Recommended first adapters:

- `fdm-monster`: talk to FDM Monster API v2 when a running FDM Monster service is available.
- `moonraker`: for Snapmaker U1 if its firmware exposes Moonraker/Fluidd as expected.
- `bambu-lan`: direct Bambu integration only if FDM Monster does not cover the needed P2S features.

Credential notes:

- Bambu local control usually needs LAN access code, printer IP, and serial/device identity. Verify P2S firmware support before implementation.
- Snapmaker U1 should be verified for Moonraker endpoint, auth requirements, and upload/start semantics.
- If Snapmaker U1 requires Moonraker bearer/API-key auth, implement it explicitly; upstream FDM Monster may not attach bearer/API-key auth in all Moonraker client paths.
- Store credentials only in the bridge or encrypted server-side. Never send to browser.

## Data Model

```sql
CREATE TYPE print_request_status AS ENUM (
  'draft',
  'uploaded',
  'quoted',
  'awaiting_gp_confirmation',
  'paid',
  'approved',
  'slicing',
  'queued',
  'printing',
  'completed',
  'failed',
  'cancelled',
  'refunded'
);

CREATE TABLE printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bambu-p2s', 'snapmaker-u1', 'generic')),
  adapter TEXT NOT NULL,
  bridge_id UUID,
  enabled BOOLEAN NOT NULL DEFAULT true,
  admin_notes TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE printer_credentials (
  printer_id UUID PRIMARY KEY REFERENCES printers(id) ON DELETE CASCADE,
  encrypted_payload BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE print_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_user_id UUID NOT NULL REFERENCES city_users(id),
  status print_request_status NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  description TEXT,
  requested_material TEXT,
  requested_color TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  quote_gp INTEGER,
  gp_ledger_entry_id UUID REFERENCES point_ledger_entries(id),
  assigned_printer_id UUID REFERENCES printers(id),
  admin_notes TEXT,
  user_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE print_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  print_request_id UUID NOT NULL REFERENCES print_requests(id),
  kind TEXT NOT NULL CHECK (kind IN ('source', 'sliced', 'thumbnail', 'analysis')),
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE slice_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  print_request_id UUID NOT NULL REFERENCES print_requests(id),
  status TEXT NOT NULL,
  slicer TEXT NOT NULL,
  profile_key TEXT,
  output_file_id UUID REFERENCES print_files(id),
  estimate JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE print_queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  print_request_id UUID NOT NULL REFERENCES print_requests(id),
  printer_id UUID REFERENCES printers(id),
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  queue_position INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE print_job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  print_request_id UUID REFERENCES print_requests(id),
  printer_id UUID REFERENCES printers(id),
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Use object storage for uploaded model files and generated sliced files. Railway object storage or S3-compatible storage is preferred over DB blobs.

## Request Workflow

1. User uploads STL/3MF and creates request.
2. Server stores source file and creates `print_requests.uploaded`.
3. System or admin runs analysis and quote.
4. Request becomes `quoted`.
5. User confirms GP spend.
6. GP is debited into ledger with source `print_request:<id>`.
7. Admin approves and assigns printer/material/profile.
8. Slice job runs.
9. Sliced file is queued.
10. Bridge uploads to printer or FDM Monster.
11. Printer starts job.
12. Bridge streams telemetry/events.
13. Request completes, fails, or is cancelled.

Refund policy should be explicit:

- Before slicing: full refund.
- After slicing but before printing: admin-controlled refund.
- Failed print: admin chooses full/partial/no refund with memo.
- Completed print: no automatic refund.

## Slicing

Recommended MVP:

- Use OrcaSlicer/Bambu Studio CLI profiles if available in the bridge environment.
- Maintain server-side profile records:
  - printer kind
  - nozzle
  - layer height
  - filament/material
  - quality profile
  - supports policy
- Store slicer command, version, profile hash, estimate, and output artifact.

Do not run arbitrary slicer commands supplied by users. All slicing should use approved profiles.

Because FDM Monster does not provide actual slicing, slicing must be one of:

- bridge-local CLI slicing with approved Orca/Bambu/Prusa profiles,
- admin/manual slicing followed by upload,
- a separate slicer microservice,
- or no slicing in MVP, accepting only pre-sliced GCode/3MF.

## Admin UI

Printer admin:

- Add/edit printer.
- Select adapter.
- Test connection.
- Show online/offline, current job, temperatures, filament/material, camera link if available.
- Disable printer for maintenance.

Queue admin:

- Kanban/table by status.
- Assign/reassign printer.
- Change priority.
- Approve/reject requests.
- Start/pause/resume/cancel where adapter supports it.
- Refund GP with required memo.

Bridge admin:

- Registered bridge instances.
- Last heartbeat.
- Printer LAN reachability.
- Slicer versions.
- Adapter errors.

## API Endpoints

User:

- `GET /api/prints`
- `POST /api/prints`
- `POST /api/prints/:id/files`
- `POST /api/prints/:id/confirm-gp`
- `GET /api/prints/:id`

Admin:

- `GET /api/admin/printers`
- `POST /api/admin/printers`
- `PATCH /api/admin/printers/:id`
- `POST /api/admin/printers/:id/test`
- `GET /api/admin/print-queue`
- `POST /api/admin/prints/:id/quote`
- `POST /api/admin/prints/:id/approve`
- `POST /api/admin/prints/:id/reject`
- `POST /api/admin/prints/:id/refund`

Bridge:

- `POST /api/bridge/register`
- `POST /api/bridge/heartbeat`
- `GET /api/bridge/jobs`
- `POST /api/bridge/jobs/:id/events`
- `POST /api/bridge/jobs/:id/artifacts`
- or one persistent `GET /api/bridge/socket` WSS endpoint.

## Acceptance Criteria

- Admin can add Bambu P2S and Snapmaker U1 printer records with adapter-specific credentials.
- Bridge can test printer connectivity without exposing credentials to city browsers.
- User can upload a print request and see quote/status.
- GP is debited only after explicit confirmation.
- Admin can approve, queue, and track jobs.
- Job events are stored and visible to users/admins.
- Failed/cancelled jobs have auditable refund decisions.

## Questions

- Is FDM Monster intended to be a required sidecar, or only reference material?
  reference material
- Where will printers physically live relative to the Railway service?
  externally accessible
- Are Bambu P2S printers in LAN mode, cloud mode, or developer mode?
  cloud mode
- Does Snapmaker U1 expose Moonraker on the target firmware/network?
  yes
- Which slicer and profiles should be canonical?
  give me choices
- How is GP price calculated: material, time, queue priority, manual quote, or fixed menu?
  material + time + queue priority, allow queue editting by admin
