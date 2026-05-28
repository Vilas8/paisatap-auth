require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Security configuration using Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com"
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'"
        ],
        imgSrc: [
          "'self'",
          "data:"
        ],
        connectSrc: ["'self'"]
      }
    }
  })
);

app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiter: Max 15 application submissions per hour per IP
const applicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15, 
  message: {
    success: false,
    message: 'Too many applications from this IP address. Please try again after an hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Configure Nodemailer SMTP Transporter
let transporter;

async function setupMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    console.log('SMTP settings found. Instantiating mail transporter...');
    transporter = nodemailer.createTransport({
      host: host,
      port: parseInt(port, 10),
      secure: parseInt(port, 10) === 465, // true for port 465, false for 587 or 25
      pool: true, // Enable connection pooling
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: user,
        pass: pass
      },
      tls: {
        rejectUnauthorized: false // Bypasses self-signed certificate and trust chain errors
      },
      connectionTimeout: 8000, // 8 seconds connection timeout
      greetingTimeout: 5000,   // 5 seconds greeting timeout
      socketTimeout: 10000     // 10 seconds socket timeout
    });
  } else {
    console.warn(
      'WARNING: SMTP environment variables are not fully configured.\n' +
      'Falling back to Nodemailer Ethereal test account.'
    );
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log(`Successfully generated Ethereal test account:\n  User: ${testAccount.user}\n  Host: ${testAccount.smtp.host}`);
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        },
        tls: {
          rejectUnauthorized: false // Bypass for test account connection safety
        },
        connectionTimeout: 8000, // 8 seconds
        greetingTimeout: 5000,   // 5 seconds
        socketTimeout: 10000     // 10 seconds
      });
      transporter.isTestAccount = true;
    } catch (err) {
      console.error('Failed to create Ethereal test account, using mock logger fallback:', err.message);
      transporter = {
        sendMail: async (options) => {
          console.log('--- MOCK SMTP EMAIL DISPATCH ---');
          console.log(`From: ${options.from}`);
          console.log(`To: ${options.to}`);
          console.log(`Subject: ${options.subject}`);
          console.log(`Body:\n${options.text}`);
          console.log('-------------------------------');
          return { messageId: 'mock-id-' + Date.now() };
        }
      };
    }
  }
}

// Call mail configurations
setupMailTransporter();

// POST API Endpoint for Form Submissions
app.post('/api/apply', applicationLimiter, async (req, res) => {
  const { name, email, telegram, age, consent } = req.body;

  // 1. Server-side Validation
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.length > 80) {
    return res.status(400).json({ success: false, message: 'Please enter a valid full name (2-80 characters).' });
  }

  // Basic email pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }

  // Telegram username validation: starts with an optional @, length 5-32, characters a-z, A-Z, 0-9, _
  // Handle may also be represented as standard format
  const telegramClean = telegram ? telegram.trim() : '';
  const telegramRegex = /^@?[a-zA-Z0-9_]{5,32}$/;
  if (!telegramClean || !telegramRegex.test(telegramClean)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid Telegram ID / Username (5-32 characters, alphanumerics and underscores).' });
  }

  // Age: numeric, must be at least 18 (reasonable limit for terms/rewards eligibility)
  const ageNumber = parseInt(age, 10);
  if (isNaN(ageNumber) || ageNumber < 18 || ageNumber > 110) {
    return res.status(400).json({ success: false, message: 'You must be at least 18 years old to apply.' });
  }

  // Consent checkbox validation
  if (consent !== true) {
    return res.status(400).json({ success: false, message: 'You must accept the Privacy Policy and Terms of Service to apply.' });
  }

  try {
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@paisatap.com';
    const emailSubject = 'PaisaTap - Beta Tester Application Received';
    const emailText = `Thank you for your application. We have received your details and will review them soon. If selected, we will contact you with the next steps.

Submitted Application Details:
Name: ${name.trim()}
Telegram username: ${telegramClean}
Age: ${ageNumber}

This email was sent automatically in response to your beta application.`;

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0d1117; color: #e6edf3; padding: 30px; border-radius: 8px; max-width: 600px; margin: auto;">
        <div style="text-align: center; border-bottom: 1px solid #21262d; padding-bottom: 20px; margin-bottom: 20px;">
          <h1 style="color: #2ea043; margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 1px;">PaisaTap</h1>
          <p style="color: #8b949e; margin: 5px 0 0 0; font-style: italic;">Exclusive Beta Access Program</p>
        </div>
        <div style="font-size: 16px; line-height: 1.6; color: #c9d1d9;">
          <p style="font-size: 18px; color: #ffffff; font-weight: 500;">Hi ${name.trim()},</p>
          <p>Thank you for applying for the PaisaTap Beta Program! We have received your application details for testing our tap-to-earn bot.</p>
          <p style="background-color: #161b22; border-left: 4px solid #2ea043; padding: 15px; border-radius: 4px; color: #e6edf3; font-style: italic;">
            “Thank you for your application. We have received your details and will review them soon. If selected, we will contact you with the next steps.”
          </p>
          <p>Our team is currently selecting a small group of beta testers. If selected, you may get early access benefits and potential rewards based on performance and participation.</p>
        </div>
        <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #21262d; font-size: 12px; color: #8b949e; text-align: center;">
          <p>This is an automated confirmation email. Please do not reply directly to this message.</p>
          <p>&copy; ${new Date().getFullYear()} PaisaTap. All rights reserved.</p>
        </div>
      </div>
    `;

    // 2. Send email
    const mailOptions = {
      from: `"PaisaTap" <${fromEmail}>`,
      to: email.trim(),
      subject: emailSubject,
      text: emailText,
      html: emailHtml
    };

    const info = await transporter.sendMail(mailOptions);
    
    // Log details of sent mail (including test account preview URL if Ethereal is used)
    console.log(`Application confirmation sent to ${email}. Message ID: ${info.messageId}`);
    if (transporter.isTestAccount) {
      console.log(`Ethereal Email Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }

    // 3. Return success response
    return res.status(200).json({
      success: true,
      message: 'Application submitted successfully! Please check your email for confirmation.'
    });

  } catch (error) {
    console.error('SMTP Email dispatch error:', error);
    // Even if SMTP fails, return 200/500? Wait, if the SMTP config is invalid or fails, let's inform the client.
    // However, to keep it resilient, let's return a detailed message.
    return res.status(500).json({
      success: false,
      message: 'Form submitted, but we failed to send the confirmation email. Please verify your email is correct and try again.'
    });
  }
});

// For Render deployment: Catch-all route to serve the SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`PaisaTap application server running on port ${PORT}`);
});
