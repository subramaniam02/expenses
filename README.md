# Expense Tracker

A full-stack expense tracking web application powered by Plaid, React, and SQLite.

## Tech Stack

- **Backend**: Node.js + Express + better-sqlite3 + Plaid Node SDK
- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts + react-plaid-link

## Features

- Connect bank accounts via Plaid Link (sandbox mode)
- Sync transactions with incremental cursor-based updates
- Filter transactions by date range with preset shortcuts
- Category breakdown with expandable transaction lists
- Merchant breakdown with search
- Top 10 largest expenses
- Refunds and credits view
- Income vs expenses charted by month or week
- Account balance overview

## Prerequisites

- Node.js 18+
- A free Plaid developer account at https://dashboard.plaid.com/signup

## Setup

### 1. Get Plaid API Keys

1. Sign up at https://dashboard.plaid.com/signup
2. In the dashboard, go to **Team Settings > Keys**
3. Copy your **client_id** and **Sandbox secret**

### 2. Configure Environment

Copy the example env file into the backend directory:

```bash
cp .env.example backend/.env
```

Edit `backend/.env` and fill in your credentials:

```
PLAID_CLIENT_ID=your_actual_client_id
PLAID_SECRET=your_actual_sandbox_secret
PLAID_ENV=sandbox
PORT=3001
```

### 3. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 4. Start the App

Open two terminals:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

## Usage

### Connecting a Bank Account (Sandbox)

1. Click **Connect Account** in the top-left panel
2. The Plaid Link modal will open — search for any institution (e.g. "Chase")
3. Use the sandbox test credentials:
   - Username: `user_good`
   - Password: `pass_good`
4. Select any accounts and click **Continue**

### Syncing Transactions

After connecting an account, click **Sync Transactions** in the top bar. This fetches up to 2 years of transactions from Plaid.

### Navigating Sections

Use the sidebar to switch between views:
- **Overview** — Summary cards + monthly income/expense chart + account balances
- **Categories** — Spending grouped by Plaid category, expandable rows
- **Merchants** — Spending grouped by merchant, searchable
- **Top Transactions** — The 10 largest single expenses
- **Refunds** — All credits and refunds received
- **By Time** — Month or week view with bar chart and table

### Date Filtering

Use the preset buttons (Current Month, Last 3 Months, etc.) or enter a custom date range in the date pickers. All views update automatically.

## Project Structure

```
expense_tracker/
├── backend/
│   ├── package.json
│   ├── server.js          # Express app entry point
│   ├── db.js              # SQLite setup and helper functions
│   └── routes/
│       ├── plaid.js       # Plaid Link token, token exchange, sync
│       └── transactions.js # Transaction query endpoints
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       └── components/
│           ├── AccountSetup.jsx
│           ├── DateFilter.jsx
│           ├── Overview.jsx
│           ├── CategoryBreakdown.jsx
│           ├── MerchantBreakdown.jsx
│           ├── TopTransactions.jsx
│           ├── Refunds.jsx
│           └── TimeBreakdown.jsx
└── .env.example
```

## Database

SQLite database is stored at `backend/expense_tracker.db`. It is created automatically on first run.

- `accounts` — Connected bank accounts with balance and access token
- `transactions` — Synced transactions with category, merchant, amount, date

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/plaid/create-link-token | Get a Plaid Link token |
| POST | /api/plaid/exchange-token | Exchange public token for access token |
| POST | /api/plaid/sync | Sync all transactions from Plaid |
| GET | /api/plaid/accounts | List all connected accounts |
| GET | /api/transactions | All transactions (filterable) |
| GET | /api/transactions/summary | Totals: income, expenses, net, count |
| GET | /api/transactions/categories | Grouped by category |
| GET | /api/transactions/merchants | Grouped by merchant |
| GET | /api/transactions/top | Top 10 by amount |
| GET | /api/transactions/refunds | Credits and refunds |
| GET | /api/transactions/by-period | Grouped by month or week |

All transaction endpoints accept `start_date` and `end_date` query params (YYYY-MM-DD).
