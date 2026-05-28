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
- **SMTP Confirmations**: Automatic dispatch of a customizable HTML confirmation email upon successful registration.
- **Deploy-Ready for Render**: Runs via simple start command and relies on environment variable bindings.
- **Failsafe Testing Mode**: Automatically boots using a mock transporter or Nodemailer Ethereal test account if SMTP credentials are not specified in the local `.env`.

---

## Project Structure

```text
paisatap/
├── public/
│   ├── index.html   # Main application structural HTML
│   ├── style.css    # Premium CSS design styles & layouts
│   └── app.js       # Client validations & async form AJAX requests
├── .env.example     # Template for configuration environment variables
├── .env             # Local configuration file (git-ignored)
├── .gitignore       # Exclusion lists for node_modules and env secrets
├── package.json     # Node dependencies & execution scripts
└── server.js        # Express server, Helmet headers, rate limiting, SMTP dispatcher
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

4. Configure your SMTP provider settings inside `.env`. If you do not specify SMTP credentials, the application will automatically spin up a temporary **Ethereal test email account** and log message links in the console.
   ```ini
   PORT=3000
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_USER=your_smtp_username
   SMTP_PASS=your_smtp_password
   SMTP_FROM_EMAIL=noreply@paisatap.com
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
   - `SMTP_HOST` (e.g. `smtp.sendgrid.net`, `smtp.mailgun.org`, etc.)
   - `SMTP_PORT` (e.g. `587` or `465`)
   - `SMTP_USER` (Your SMTP service username)
   - `SMTP_PASS` (Your SMTP service password or API key)
   - `SMTP_FROM_EMAIL` (Verified sender email address, e.g. `applications@paisatap.com`)
   - *Note: `PORT` is dynamically managed by Render; you do not need to manually configure it.*
5. **Deploy**: Click **Deploy Web Service**. Render will install dependencies, build the application, and host the static pages and submit endpoint.
