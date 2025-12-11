# Technical Documentation

## 🏗️ Architecture Overview

The **Dienstplan App** follows a **Frontend-Heavy** (SPA) architecture, leveraging Supabase as a Backend-as-a-Service (BaaS).

*   **Client**: React 19 (Vite) handles all UI, routing, and business logic calculations.
*   **Server/Database**: Supabase provides the PostgreSQL database, Authentication, and Realtime subscriptions.
*   **Security**: Row Level Security (RLS) policies in PostgreSQL enforce data access rules.

## 🗄️ Database Schema

### Key Tables

| Table | Description | Key Columns |
| :--- | :--- | :--- |
| `profiles` | User extension table. | `id` (FK auth.users), `role` (admin/employee), `weekly_hours` |
| `shifts` | Defined work slots. | `id`, `start_time`, `end_time`, `required_role` |
| `time_entries` | Actual hours worked. | `id`, `user_id`, `actual_start`, `actual_end`, `calculated_hours` |
| `absences` | Leave records. | `id`, `user_id`, `start_date`, `end_date`, `type` (vacation/sickness) |
| `monthly_reports` | Locked monthly summaries. | `id`, `user_id`, `month`, `total_hours`, `data_hash`, `hash_version` |
| `admin_actions` | Audit log for admin ops. | `id`, `admin_id`, `action`, `target_user_id`, `changes` |

## 📐 Key Algorithms

### 1. Work Time Calculation (`src/utils/timeCalculations.js`)
Calculates the effective work hours for a shift, considering:
*   **Night Shifts (ND)**: Special handling for "Standby Shifts".
    *   **Readiness Window**: 00:30 - 06:00 is considered "passive" time (credited at 50%).
    *   **Interruptions**: Active work during readiness (e.g., waking up for an emergency) is:
        *   Inflated (minimum count, often round up).
        *   Merged (overlapping interruptions combined).
        *   Credited at 100%, replacing the 50% passive credit for that duration.

### 2. Balance Calculation (`src/utils/balanceHelpers.js`)
Determines the employee's "Overtime/Undertime" account.
*   **Target (Soll)**: `WorkDays in Month * DailyHours` (where DailyHours = WeeklyHours / 5).
*   **Actual (Ist)**: Sum of `time_entries` + `vacation days` (valued at DailyHours).
*   **Carryover**: recursively calculates the difference from the start of employment up to the previous month.

### 3. Report Verification (`src/utils/security.js`)
Ensures data integrity for submitted monthly reports.
*   **Hashing**: SHA-256
*   **Input**: JSON string of sorted time entries (start, end, duration, breaks).
*   **Versioning**: Currently 'v1'. If the calculation logic changes, a 'v2' can be introduced without invalidating old signed reports.
*   **Verification**: Re-calculating the hash from the DB entries must match the `data_hash` stored in `monthly_reports`.

## 🔒 Security Model

### Authentication
*   Managed by Supabase Auth (Email/Password).
*   Session tokens stored in LocalStorage/Cookies by Supabase client.

### Row Level Security (RLS)
*   **Employees**:
    *   `SELECT`: Can read their own data and published rosters.
    *   `INSERT/UPDATE`: Can manage their own requests (intents), but NOT finalized shifts or time entries (often requires approval flow).
*   **Admins**:
    *   `ALL`: Have full access to manage all tables based on `profiles.role = 'admin'`.

## 🔄 Admin Audit
All critical actions (Approve Report, Edit Time, etc.) are logged to `admin_actions`. This table is append-only for typical usage flows to ensure accountability.
