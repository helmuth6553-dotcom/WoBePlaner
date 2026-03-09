# Architecture Documentation: Dienstplan-App

Diese Datei dient als zentrale technische Dokumentation und Orientierungshilfe für die Architektur der Dienstplan-App (React, Vite, Supabase). Sie bietet einen Überblick über das State Management, die Datenbankstruktur und die Datenflüsse zwischen Frontend und Backend.

## 1. Component-Tree & State Management

Dieses Diagramm veranschaulicht die Hierarchie der wichtigsten React-Komponenten und das globale State-Management. Es zeigt, wie Daten (wie der User-Context oder Schicht-Templates) über die Context-API in die Anwendung fließen und welche zentralen Utility-Funktionen von den Komponenten genutzt werden.

```mermaid
graph TD
    %% Global State
    A["App.jsx"] --> Auth["AuthContext.jsx (Global User Context & Role)"]
    A --> ShiftTemp["ShiftTemplateContext.jsx (Global Shift Templates)"]
    A --> ToastCtx["Toast.jsx (Global UI Toasts)"]
    
    %% Main Routes/Tabs
    Auth --> Roster["RosterFeed.jsx (Main Feed & Shifts)"]
    Auth --> Time["TimeTracking.jsx (Time Entries)"]
    Auth --> Absence["AbsencePlanner.jsx (Vacation / Sick Leave)"]
    Auth --> Prof["Profile.jsx (User Profile & Stats)"]
    Auth --> Admin["AdminDashboard.jsx (Admin Area)"]
    
    %% RosterFeed Children
    Roster --> MonthV["MonthView.jsx"]
    Roster --> ShiftC["ShiftCard.jsx"]
    Roster --> DayC["DayCard.jsx"]
    Roster --> CovPanel["CoverageVotingPanel.jsx"]
    
    %% TimeTracking Children
    Time --> TimeMod["TimeEntryModal.jsx"]
    
    %% Absence Children
    Absence --> SickMod["SickReportModal.jsx"]
    
    %% Profile Children
    Prof --> ProfStats["ProfileStats.jsx"]
    Prof --> ProfVac["ProfileVacation.jsx"]
    Prof --> ProfSet["ProfileSettings.jsx"]
    Prof --> SoliPanel["SoliPunktePanel.jsx"]
    
    %% Admin Children
    Admin --> AdminTime["AdminTimeTracking.jsx"]
    Admin --> AdminEmp["AdminEmployees.jsx"]
    Admin --> AdminAppr["AbsenceApprovals.jsx"]
    Admin --> AdminOverview["AdminOverview.jsx"]
    
    %% Utility Functions
    Ut1(("timeCalculations.js")) -.-> Time
    Ut1 -.-> AdminTime
    Ut1 -.-> ProfStats
    Ut2(("balanceHelpers.js")) -.-> ProfStats
    Ut2 -.-> Roster
    Ut3(("dateHelpers.js")) -.-> MonthV
    Ut3 -.-> Absence
    Ut4(("coverageLogic")) -.-> CovPanel
    Ut4 -.-> Roster
```

## 2. Entity-Relationship-Diagramm

Das Entity-Relationship-Diagramm (ERD) modelliert die Struktur der Supabase PostgreSQL-Datenbank. Es dokumentiert alle relevanten Tabellen, deren Hauptspalten sowie die Kardinalitäten und Fremdschlüsselbeziehungen (z.B. zwischen Profilen, Schichten und Zeiten), die für die RLS-Policies und Geschäftslogik essenziell sind.

```mermaid
erDiagram
    PROFILES ||--o{ SHIFTS : "assigned_to / creates"
    PROFILES ||--o{ TIME_ENTRIES : "creates"
    PROFILES ||--o{ ABSENCES : "creates"
    PROFILES ||--o{ MONTHLY_REPORTS : "owns"
    PROFILES ||--o{ BALANCE_CORRECTIONS : "owns"
    PROFILES ||--o{ COVERAGE_VOTES : "votes"
    PROFILES ||--o{ SHIFT_INTERESTS : "interested_in"
    PROFILES ||--o{ ADMIN_ACTIONS : "triggers"
    
    SHIFTS ||--o{ TIME_ENTRIES : "contains"
    SHIFTS ||--o{ SHIFT_INTERESTS : "targets"
    SHIFTS ||--o| COVERAGE_REQUESTS : "triggers"
    
    COVERAGE_REQUESTS ||--o{ COVERAGE_VOTES : "receives"
    
    PROFILES {
        uuid id PK
        string role
        string email
        string display_name
        int weekly_hours
        int vacation_days_per_year
        date start_date
        boolean is_active
    }
    
    SHIFTS {
        uuid id PK
        uuid assigned_to FK
        date date
        time start_time
        time end_time
        string type
        timestamp urgent_since
    }

    TIME_ENTRIES {
        uuid id PK
        uuid user_id FK
        uuid shift_id FK
        timestamp start_actual
        timestamp end_actual
        int break_minutes
        string status
        numeric calculated_hours
    }

    ABSENCES {
        uuid id PK
        uuid user_id FK
        date start_date
        date end_date
        string type
        string status
        numeric planned_hours
    }

    MONTHLY_REPORTS {
        uuid id PK
        uuid user_id FK
        int year
        int month
        string status
        timestamp submitted_at
        timestamp approved_at
        timestamp rejected_at
    }
    
    COVERAGE_REQUESTS {
        uuid id PK
        uuid shift_id FK
        string status
    }
    
    COVERAGE_VOTES {
        uuid id PK
        uuid shift_id FK
        uuid user_id FK
        string availability_preference
        boolean responded
    }
    
    ADMIN_ACTIONS {
        uuid id PK
        uuid admin_id FK
        string action_type
        jsonb details
    }
```

## 3. Datenfluss & Backend-Interaktionen

Dieses Flussdiagramm demonstriert die Interaktion zwischen dem React-Frontend und der Supabase-Infrastruktur. Es visualisiert den Weg von Authentifizierung und direkten CRUD-Operationen (PostgREST) über Realtime-WebSockets bis hin zur Ausführung von serverseitiger Logik durch RPCs und Edge Functions.

```mermaid
flowchart TD
    Client["React Frontend App (Vite, Tailwind)"]
    
    subgraph SupabasePlatform["Supabase Platform"]
        Auth["Supabase Auth"]
        DB[("PostgreSQL Database with RLS")]
        Realtime["Realtime Server (WebSockets)"]
        
        subgraph SubScripts["Scripts & Functions"]
            RPC["Postgres RPCs (e.g. assign_coverage)"]
            Webhooks["Database Webhooks (Triggers)"]
            EdgeFunc["Edge Functions (Deno)"]
        end
    end
    
    %% Auth Flow
    Client -- "1. Login / AuthSession" --> Auth
    Auth -- "2. JWT Token & Context" --> Client
    
    %% CRUD Operations
    Client -- "3. PostgREST API (CRUD)" --> DB
    Client -- "4. RPC calls" --> RPC
    RPC -- "Executes Logic" --> DB
    
    %% Realtime Subscriptions
    DB -- "5. Row changes (absences, shifts, etc.)" --> Realtime
    Realtime -- "6. WebSocket Updates (Badge counts, Live Feed)" --> Client
    
    %% Edge Functions
    DB -- "7. Database Webhook (Insert/Update)" --> Webhooks
    Webhooks -- "8. Trigger specific function" --> EdgeFunc
    EdgeFunc -- "9. notify-admin-vacation, sickness, etc." --> ExtPush["Push Notification Service"]
    EdgeFunc -- "10. Queries/Updates via Service Key" --> DB
```
