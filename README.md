# Dienstplan App

**Collaborative Shift Planning & Time Tracking System**

A modern, mobile-first web application designed to streamline shift planning, time tracking, and absence management for social organizations. Built with performance and usability in mind.

## 🚀 Key Features

*   **📅 Smart Shift Planning**
    *   **Roster Feed**: Interactive, scrolling feed of upcoming shifts.
    *   **Month View**: High-level overview of staffing allocation.
    *   **Shift Requests**: Employees can express interest in open shifts.

*   **⏱️ Precision Time Tracking**
    *   **Digital Time Clock**: Simple start/stop for shifts.
    *   **Correction Management**: Request changes to past entries with admin approval.
    *   **Automatic Breaks**: Smart calculation of legally required breaks.

*   **🏖️ Absence Management**
    *   **Vacation Planner**: Request and track vacation days.
    *   **Sick Leave**: Document sick days and relevant notes.
    *   **Holiday Handling**: Automatic handling of public holidays and weekend logic.

*   **🛡️ Admin Dashboard**
    *   **Approvals**: Centralized hub for approving timesheets and absence requests.
    *   **Audit Logging**: Immutable tracking of all administrative actions.
    *   **Reports**: Generate PDF monthly reports with cryptographic verification hashes.

## 🛠️ Tech Stack

*   **Frontend**: React 19, Vite 6
*   **Styling**: Tailwind CSS 4, Lucide React (Icons)
*   **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
*   **State Management**: React Context & Hooks
*   **Utils**: date-fns (Dates), jspdf (Reporting)

## 📦 Getting Started

### Prerequisites
*   Node.js 18+ installed
*   A Supabase project setup

### Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd dienstplan-app
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file in the root directory (or rename `.env.example`):
    ```env
    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Run Locally**
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` in your browser.

## 📂 Project Structure

*   `/src/components` - React UI components (Views, Modals, Cards)
*   `/src/utils` - Helper functions (Time calc, Security, Rules)
*   `/src/hooks` - Custom React hooks
*   `/migrations` - SQL scripts for database schema and RLS policies

## 📄 License

Private / Proprietary.
