# Database Schema Documentation

This document outlines the database structure for the Dienstplan App (Supabase/PostgreSQL).

## Overview

The database uses a relational model centered around `profiles` (Auth Users) and their associated `shifts`, `time_entries`, and `absences`.
Row Level Security (RLS) is strictly enforced to ensure data privacy.

## Tables

### 1. `profiles`
Extends the default Supabase `auth.users` table with application-specific user data.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key, references `auth.users.id`. |
| `email` | Text | User's email address. |
| `role` | Text | Role: `'admin'` or `'employee'`. Controls RLS access. |
| `first_name` | Text | First name. |
| `last_name` | Text | Last name. |
| `weekly_hours` | Numeric | Contractual weekly hours (e.g., 38.5). |
| `created_at` | Timestamptz | Creation timestamp. |

### 2. `shifts` (Dienstplan)
Represents planned shifts in the roster.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key. |
| `user_id` | UUID | FK to `profiles.id`. Employee assigned to this shift. |
| `date` | Date | The date of the shift. |
| `start_time` | Time | Scheduled start time. |
| `end_time` | Time | Scheduled end time. |
| `type` | Text | Shift type (e.g., 'Tagdienst', 'Nachtdienst'). |
| `location` | Text | Location or department. |

### 3. `time_entries` (Zeiterfassung)
Records actul worked hours.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key. |
| `user_id` | UUID | FK to `profiles.id`. |
| `date` | Date | Date of the entry. |
| `start_time` | Timestamptz | Actual clock-in time. |
| `end_time` | Timestamptz | Actual clock-out time. |
| `break_duration`| Integer | Break time in minutes. |
| `approved` | Boolean | Whether the entry is locked/approved by admin. |

### 4. `absences` (Abwesenheiten)
Tracks vacation, sickness, and other leaves.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key. |
| `user_id` | UUID | FK to `profiles.id`. |
| `start_date` | Date | Start of absence. |
| `end_date` | Date | End of absence. |
| `type` | Text | 'Urlaub', 'Krank', 'Fortbildung', etc. |
| `status` | Text | 'requested', 'approved', 'rejected'. |
| `note` | Text | Optional comment/reason. |
| `data_hash` | Text | SHA-256 hash of the request data (FES integrity). |

### 5. `signatures`
Stores cryptographic reference signatures for absences (FES).

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key. |
| `request_id` | UUID | FK to `absences.id`. |
| `signer_id` | UUID | FK to `profiles.id`. |
| `hash` | Text | The SHA-256 hash signed by the user. |
| `payload_snapshot` | JSONB | Copy of the data at time of signing. |
| `signed_at` | Timestamptz | Exact timestamp of signature. |

### 6. `monthly_reports`
Stores finalized monthly summaries for legal compliance.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key. |
| `user_id` | UUID | FK to `profiles.id`. |
| `month` | Date | The month (e.g., '2023-10-01'). |
| `total_hours` | Numeric | Frozen total hours for that month. |
| `data_hash` | Text | SHA-256 hash of the time entries for integrity verification. |
| `signed_at` | Timestamptz | When the report was generated/signed. |

### 7. `admin_actions` (Audit Log)
Logs sensitive administrative actions.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key. |
| `admin_id` | UUID | FK to `profiles.id` (Who performed the action). |
| `action` | Text | Action type (e.g., 'update_time_entry', 'approve_absence'). |
| `target_user_id`| UUID | FK to `profiles.id` (Who was affected). |
| `details` | JSONB | Details of changes (old value/new value). |
| `created_at` | Timestamptz | Timestamp of action. |

## Relationships (ERD Description)

- **One-to-Many**: `profiles` -> `shifts`
- **One-to-Many**: `profiles` -> `time_entries`
- **One-to-Many**: `profiles` -> `absences`
- **One-to-Many**: `profiles` -> `monthly_reports`
- **One-to-Many**: `profiles` (as admin) -> `admin_actions`

## Security (RLS)

All tables have RLS enabled.
- **Users** can only see/edit their own data (except for published Rosters which are readable by all employees).
- **Admins** have full access to all tables.
