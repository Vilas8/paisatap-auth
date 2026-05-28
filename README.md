# PaisaTap - Beta Tester Landing Page

PaisaTap is a highly polished, single-page web application designed for recruiting beta testers for our upcoming tap-to-earn Telegram bot. The application is built with a Node.js/Express backend (incorporating input validation, security headers, rate limiting, and an SMTP email handler) and a beautiful, modern, dark-themed responsive frontend layout utilizing CSS variables and glassmorphism.

---

## Features

- **Premium Startup Aesthetic**: Responsive styling with dark slate/emerald palette, fluid gradients, animated interactive components, and custom Outfit & Inter typography.
- **Strict Validations**:
  - Name: Must be between 2 and 80 characters (no special symbols).
  - Email: Formatted check on both frontend and backend.
  - Telegram Username/ID: Validates typical handles (5-32 characters, alphanumeric and underscores, optional `@`).
  - Age: Acceptance of numeric values with a minimum age limit of 18.
- **Explicit Consent**: Required checkbox confirming acceptance of Privacy Policy and Terms of Service before submission.
- **Expandable Legal Sections**: Beautiful accordion panels containing Privacy Policy and Terms of Service clauses.
- **SMTP & HTTP Email API Integrations**: Direct integration with standard SMTP as well as fallbacks for Brevo, Resend, and SendGrid Web APIs to easily bypass Render port restrictions.
- **Secure Admin Dashboard**: Access-protected dashboard located at `/admin.html` with real-time statistics counters, applicant grid, Approve and Reject decision flows, and rejection reason selections.
- **Outcome Email Dispatches**: Auto-sends custom welcome emails on approval or reason-specific rejections (e.g. not eligible or invalid Telegram handles).
- **Local JSON DB Persistence**: Simple file-based applicant tracking database (`data/applications.json`).
- **Deploy-Ready for Render**: Runs via simple start command and relies on environment variable bindings.

---

## Project Structure

```text
paisatap/
├── data/
│   └── applications.json # Local database storage (automatically initialized)
├── public/
│   ├── index.html   # Main application landing page UI
│   ├── admin.html   # Admin dashboard UI
│   ├── style.css    # Premium CSS styles (Landing page + Admin Dashboard)
│   ├── app.js       # Client validation and landing page controller
│   └── admin.js     # Admin verification, charts, and application status manager
├── .env.example     # Template for configuration environment variables
├── .env             # Local configuration file (git-ignored)
├── .gitignore       # Exclusion lists for node_modules and env secrets
├── package.json     # Node dependencies & execution scripts
└── server.js        # Express server, Helmet security, rate limiting, APIs, routes
```

---

## Getting Started Locally

### Prerequisites

- [Node.js](https://nodejs.org/) (v16.0.0 or higher recommended)
- npm (v7.0.0 or higher)

### Setup & Installation

1. Navigate to the project directory:
   ```bash
   cd paisatap
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your local `.env` configuration (copied from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. Configure your SMTP provider settings or HTTP Email API keys (e.g. Brevo) along with the dashboard administrator password inside `.env`.
   ```ini
   PORT=3000
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_USER=your_smtp_username
   SMTP_PASS=your_smtp_password
   SMTP_FROM_EMAIL=noreply@paisatap.com
   
   # Or HTTP Email API Keys (highly recommended on Render to bypass port blocks)
   BREVO_API_KEY=xsmtpsib-example-key
   
   # Admin credentials
   ADMIN_PASSWORD=PaisaTapAdmin2026
   ```

5. Run in development mode (with auto-reloading):
   ```bash
   npm run dev
   ```
   Or run standard start:
   ```bash
   npm start
   ```

6. Open your browser and navigate to `http://localhost:3000`.

---

## Deploying to Render

This repository is optimized for quick, native deployment on [Render](https://render.com/).

### Deployment Steps

1. **Host on GitHub**: Commit the project files (ensure `.env` and `node_modules` are excluded via `.gitignore`) and push them to a private or public repository on GitHub.
2. **Create Web Service**:
   - Log in to your Render Dashboard and click **New > Web Service**.
   - Connect your GitHub repository.
3. **Configure Environment Details**:
   - **Name**: `paisatap` (or custom name)
   - **Region**: Select your preferred region.
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. **Define Environment Variables**:
   Under the **Environment** tab, click **Add Environment Variable** and declare the following variables:
   - `BREVO_API_KEY` or `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (Email dispatch provider)
   - `SMTP_FROM_EMAIL` (Verified sender email address registered with Brevo/SMTP, e.g., `tweet.mrai@gmail.com`)
   - `ADMIN_PASSWORD` (Password for the dashboard, e.g., `PaisaTapAdmin2026`)
   - *Note: `PORT` is dynamically managed by Render; you do not need to configure it.*
5. **Deploy**: Click **Deploy Web Service**. Render will install dependencies, compile assets, and launch the service.
6. **Data Persistence Notice**:
   > [!NOTE]
   > The local JSON database (`data/applications.json`) is ephemeral and resets on Render restarts/redeployments. For persistent storage in production, consider attaching a persistent disk volume on Render (mounting at `/data`) or migrating to a database provider.
