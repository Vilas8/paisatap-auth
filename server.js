require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy configuration for Render reverse-proxies
app.set('trust proxy', 1);

const { createClient } = require('@supabase/supabase-js');

// Supabase Connection Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  console.log('Supabase config found. Initializing Supabase client...');
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn(
    'WARNING: Supabase environment variables (SUPABASE_URL, SUPABASE_KEY) are not configured.\n' +
    'Database operations will fail.'
  );
}

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
    
    const transportConfig = {
      auth: {
        user: user,
        pass: pass
      },
      connectionTimeout: 10000, // 10 seconds connection timeout
      greetingTimeout: 8000,   // 8 seconds greeting timeout
      socketTimeout: 15000     // 15 seconds socket timeout
    };

    if (host.toLowerCase().includes('gmail.com')) {
      console.log('Gmail service detected. Configuring optimized Gmail transporter settings...');
      transportConfig.service = 'gmail';
    } else {
      transportConfig.host = host;
      transportConfig.port = parseInt(port, 10);
      transportConfig.secure = parseInt(port, 10) === 465; // true for port 465, false for 587 or 25
      transportConfig.pool = true; // Enable connection pooling
      transportConfig.maxConnections = 5;
      transportConfig.maxMessages = 100;
      transportConfig.tls = {
        rejectUnauthorized: false // Bypasses self-signed certificate and trust chain errors
      };
    }

    transporter = nodemailer.createTransport(transportConfig);
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
    let fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@paisatap.com';
    const adminEmail = process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL;

    // Save application details to Supabase
    if (!supabase) {
      throw new Error('Database connection is not configured.');
    }

    const appId = 'app_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const { error: insertError } = await supabase
      .from('applications')
      .insert({
        id: appId,
        name: name.trim(),
        email: email.trim(),
        telegram: telegramClean,
        age: ageNumber,
        consent: consent,
        status: 'pending',
        rejection_reason: null,
        submitted_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Supabase DB insert error:', insertError.message);
      throw new Error('Database persistence failed: ' + insertError.message);
    }
    
    // Safety check for Resend: public email domains (like Gmail) cannot be verified.
    // We override to onboarding@resend.dev for testing so it succeeds.
    if (process.env.RESEND_API_KEY) {
      const publicDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com', 'mail.ru'];
      const domain = fromEmail.split('@')[1]?.toLowerCase();
      if (!domain || publicDomains.includes(domain) || fromEmail === 'noreply@paisatap.com') {
        console.log(`Resend detected with public/unverified sender '${fromEmail}'. Overriding to 'onboarding@resend.dev' for sandbox delivery.`);
        fromEmail = 'onboarding@resend.dev';
      }
    }

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

    // 2. Send email to applicant
    let confirmationSent = false;
    let errorDetails = '';

    // Generate Admin Notification content
    const adminSubject = `[New Beta Application] ${name.trim()}`;
    const adminText = `A new beta tester application has been received for PaisaTap.

Applicant Details:
-----------------------------
Name: ${name.trim()}
Email: ${email.trim()}
Telegram: ${telegramClean}
Age: ${ageNumber}
-----------------------------
Time of submission: ${new Date().toISOString()}
`;
    const adminHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #080c10; color: #f0f6fc; padding: 30px; border-radius: 8px; max-width: 600px; margin: auto; border: 1px solid rgba(255, 255, 255, 0.08);">
        <div style="text-align: center; border-bottom: 1px solid #21262d; padding-bottom: 20px; margin-bottom: 20px;">
          <h1 style="color: #8957e5; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">New Application Received</h1>
          <p style="color: #8b949e; margin: 5px 0 0 0; font-size: 14px;">PaisaTap Beta Tester Recruitment</p>
        </div>
        <div style="font-size: 15px; color: #c9d1d9;">
          <p style="margin-bottom: 15px;">A new candidate has applied for the beta program:</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: #0d1117; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.05);">
            <tr>
              <td style="padding: 12px 15px; font-weight: bold; border-bottom: 1px solid #21262d; color: #8b949e; width: 35%;">Full Name:</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #21262d; color: #ffffff;">${name.trim()}</td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; font-weight: bold; border-bottom: 1px solid #21262d; color: #8b949e;">Email Address:</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #21262d; color: #ffffff;"><a href="mailto:${email.trim()}" style="color: #58a6ff; text-decoration: none;">${email.trim()}</a></td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; font-weight: bold; border-bottom: 1px solid #21262d; color: #8b949e;">Telegram ID:</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #21262d; color: #ffffff;">
                <a href="https://t.me/${telegramClean.replace('@', '')}" style="color: #58a6ff; text-decoration: none;" target="_blank">${telegramClean}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; font-weight: bold; color: #8b949e;">Age:</td>
              <td style="padding: 12px 15px; color: #ffffff;">${ageNumber}</td>
            </tr>
          </table>
          <p style="font-size: 13px; color: #8b949e; font-style: italic;">Submitted on: ${new Date().toLocaleString()}</p>
        </div>
      </div>
    `;

    // A. Resend Web API
    if (process.env.RESEND_API_KEY) {
      console.log('RESEND_API_KEY detected. Sending email via Resend HTTP API...');
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: `PaisaTap <${fromEmail}>`,
            to: email.trim(),
            subject: emailSubject,
            html: emailHtml
          })
        });
        const resData = await response.json();
        if (response.ok) {
          confirmationSent = true;
          console.log(`Confirmation sent to applicant via Resend API. ID: ${resData.id}`);
        } else {
          errorDetails = `Resend API Error: ${resData.message || response.statusText}`;
        }

        // Send admin notification
        if (confirmationSent && adminEmail && adminEmail.toLowerCase() !== email.trim().toLowerCase()) {
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
            },
            body: JSON.stringify({
              from: `PaisaTap System <${fromEmail}>`,
              to: adminEmail,
              subject: adminSubject,
              html: adminHtml
            })
          }).then(res => res.json()).then(data => {
            console.log('Admin notification sent via Resend:', data.id);
          }).catch(err => console.error('Admin notification failed via Resend:', err.message));
        }
      } catch (err) {
        errorDetails = `Resend HTTP Fetch Error: ${err.message}`;
      }
    }
    // B. SendGrid Web API
    else if (process.env.SENDGRID_API_KEY) {
      console.log('SENDGRID_API_KEY detected. Sending email via SendGrid HTTP API...');
      try {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: email.trim() }] }],
            from: { email: fromEmail, name: 'PaisaTap' },
            subject: emailSubject,
            content: [{ type: 'text/html', value: emailHtml }]
          })
        });
        if (response.ok) {
          confirmationSent = true;
          console.log('Confirmation sent to applicant via SendGrid API.');
        } else {
          const resData = await response.json().catch(() => ({}));
          errorDetails = `SendGrid API Error: ${resData.errors?.[0]?.message || response.statusText}`;
        }

        // Send admin notification
        if (confirmationSent && adminEmail && adminEmail.toLowerCase() !== email.trim().toLowerCase()) {
          fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: adminEmail }] }],
              from: { email: fromEmail, name: 'PaisaTap System' },
              subject: adminSubject,
              content: [{ type: 'text/html', value: adminHtml }]
            })
          }).then(() => console.log('Admin notification sent via SendGrid.'))
            .catch(err => console.error('Admin notification failed via SendGrid:', err.message));
        }
      } catch (err) {
        errorDetails = `SendGrid HTTP Fetch Error: ${err.message}`;
      }
    }
    // C. Brevo Web API
    else if (process.env.BREVO_API_KEY) {
      console.log('BREVO_API_KEY detected. Sending email via Brevo HTTP API...');
      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.BREVO_API_KEY
          },
          body: JSON.stringify({
            sender: { name: 'PaisaTap', email: fromEmail },
            to: [{ email: email.trim() }],
            subject: emailSubject,
            htmlContent: emailHtml
          })
        });
        const resData = await response.json();
        if (response.ok) {
          confirmationSent = true;
          console.log(`Confirmation sent to applicant via Brevo API. ID: ${resData.messageId}`);
        } else {
          errorDetails = `Brevo API Error: ${resData.message || response.statusText}`;
        }

        // Send admin notification
        if (confirmationSent && adminEmail && adminEmail.toLowerCase() !== email.trim().toLowerCase()) {
          fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
              sender: { name: 'PaisaTap System', email: fromEmail },
              to: [{ email: adminEmail }],
              subject: adminSubject,
              htmlContent: adminHtml
            })
          }).then(res => res.json()).then(data => {
            console.log('Admin notification sent via Brevo:', data.messageId);
          }).catch(err => console.error('Admin notification failed via Brevo:', err.message));
        }
      } catch (err) {
        errorDetails = `Brevo HTTP Fetch Error: ${err.message}`;
      }
    }
    // D. SMTP Fallback
    else {
      console.log('No HTTP API keys found. Dispatching via Nodemailer SMTP...');
      const mailOptions = {
        from: `"PaisaTap" <${fromEmail}>`,
        to: email.trim(),
        subject: emailSubject,
        text: emailText,
        html: emailHtml
      };

      const info = await transporter.sendMail(mailOptions);
      confirmationSent = true;
      console.log(`Application confirmation sent to ${email} via SMTP. Message ID: ${info.messageId}`);
      if (transporter.isTestAccount) {
        console.log(`Ethereal Email Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }

      // Send admin notification
      if (adminEmail && adminEmail.toLowerCase() !== email.trim().toLowerCase()) {
        const adminMailOptions = {
          from: `"PaisaTap System" <${fromEmail}>`,
          to: adminEmail,
          subject: adminSubject,
          text: adminText,
          html: adminHtml
        };
        transporter.sendMail(adminMailOptions)
          .then(info => console.log('Admin notification sent via SMTP:', info.messageId))
          .catch(err => console.error('Admin notification failed via SMTP:', err.message));
      }
    }

    if (confirmationSent) {
      return res.status(200).json({
        success: true,
        message: 'Application submitted successfully! Please check your email for confirmation.'
      });
    } else {
      throw new Error(errorDetails || 'Failed to dispatch email via configured channels.');
    }

  } catch (error) {
    console.error('SMTP Email dispatch error:', error);
    // Return a descriptive error message to help debug SMTP configuration issues
    return res.status(500).json({
      success: false,
      message: `Form submitted, but we failed to send the confirmation email. Error details: ${error.message}`
    });
  }
});

// Admin Authentication middleware
function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const password = authHeader ? authHeader.replace('Bearer ', '') : req.headers['x-admin-password'];
  
  const expectedPassword = process.env.ADMIN_PASSWORD || 'PaisaTapAdmin2026';
  
  if (password === expectedPassword) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized access. Invalid password.' });
  }
}

// POST API Endpoint for Admin Verification
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  const expectedPassword = process.env.ADMIN_PASSWORD || 'PaisaTapAdmin2026';
  if (password === expectedPassword) {
    return res.status(200).json({ success: true, message: 'Authenticated successfully.' });
  } else {
    return res.status(401).json({ success: false, message: 'Invalid password.' });
  }
});

// GET API Endpoint to fetch applications
app.get('/api/admin/applications', adminAuth, async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ success: false, message: 'Database connection is not configured.' });
  }

  try {
    const { data, error } = await supabase
      .from('applications')
      .select('*');

    if (error) {
      console.error('Error fetching applications from Supabase:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to retrieve applications.' });
    }

    // Sort: pending first, then by submitted_at descending
    data.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.submitted_at) - new Date(a.submitted_at);
    });

    const mappedApps = data.map(app => ({
      id: app.id,
      name: app.name,
      email: app.email,
      telegram: app.telegram,
      age: app.age,
      consent: app.consent,
      status: app.status,
      rejectionReason: app.rejection_reason,
      submittedAt: app.submitted_at,
      processedAt: app.processed_at
    }));

    res.status(200).json({ success: true, applications: mappedApps });
  } catch (err) {
    console.error('Error in GET /api/admin/applications:', err.message);
    res.status(500).json({ success: false, message: 'Server error retrieving applications.' });
  }
});

// POST API Endpoint to update status and send outcome email
app.post('/api/admin/applications/:id/status', adminAuth, async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;

  if (!supabase) {
    return res.status(500).json({ success: false, message: 'Database connection is not configured.' });
  }

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value.' });
  }

  if (status === 'rejected' && !rejectionReason) {
    return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
  }

  try {
    // 1. Fetch current application state
    const { data: applicant, error: fetchError } = await supabase
      .from('applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !applicant) {
      console.error('Error fetching application by ID:', fetchError?.message);
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    const currentRejectionReason = status === 'rejected' ? rejectionReason : null;
    const processedAt = new Date().toISOString();

    // Check if status is already up to date
    if (applicant.status === status && applicant.rejection_reason === currentRejectionReason) {
      return res.status(200).json({ success: true, message: 'Status already up to date.' });
    }

    // 2. Update status in Supabase
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        status,
        rejection_reason: currentRejectionReason,
        processed_at: processedAt
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating application status in Supabase:', updateError.message);
      return res.status(500).json({ success: false, message: 'Failed to update application status.' });
    }

    // Create applicant object with camelCase properties to send to sendDecisionEmail
    const updatedApplicant = {
      id: applicant.id,
      name: applicant.name,
      email: applicant.email,
      telegram: applicant.telegram,
      age: applicant.age,
      consent: applicant.consent,
      status,
      rejectionReason: currentRejectionReason,
      processedAt
    };

    // Send status change email (async)
    sendDecisionEmail(updatedApplicant, status, rejectionReason);

    res.status(200).json({ success: true, message: `Application ${status} successfully.` });
  } catch (err) {
    console.error('Error in POST /api/admin/applications/:id/status:', err.message);
    res.status(500).json({ success: false, message: 'Server error updating status.' });
  }
});

// Helper function to send email notification to applicant
async function sendDecisionEmail(applicant, status, reason) {
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@paisatap.com';
  let emailSubject = '';
  let emailText = '';
  let emailHtml = '';

  if (status === 'approved') {
    emailSubject = 'PaisaTap - Congratulations! Your Beta Application is Approved';
    emailText = `Hi ${applicant.name},

Congratulations! We have reviewed your details and approved your application to join the PaisaTap Beta Program!

Here are the next steps to access the tap-to-earn bot:
1. Join our official announcement channel.
2. Open Telegram and search for @PaisaTapBetaBot.
3. Start the bot using your registered Telegram handle: ${applicant.telegram}.

If you have any questions, feel free to contact us at contact@paisatap.com.

Best regards,
The PaisaTap Team`;

    emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0d1117; color: #e6edf3; padding: 30px; border-radius: 8px; max-width: 600px; margin: auto; border: 1px solid #2ea043;">
        <div style="text-align: center; border-bottom: 1px solid #21262d; padding-bottom: 20px; margin-bottom: 20px;">
          <h1 style="color: #2ea043; margin: 0; font-size: 26px; font-weight: bold;">Application Approved! 🎉</h1>
          <p style="color: #8b949e; margin: 5px 0 0 0; font-style: italic;">Welcome to the PaisaTap Beta Cohort</p>
        </div>
        <div style="font-size: 16px; line-height: 1.6; color: #c9d1d9;">
          <p>Hi <strong>${applicant.name}</strong>,</p>
          <p>We have processed your beta tester application and are thrilled to welcome you to the <strong>PaisaTap Beta Program</strong>!</p>
          
          <div style="background-color: #161b22; border-left: 4px solid #2ea043; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <h3 style="color: #ffffff; margin-top: 0; margin-bottom: 8px;">Next Steps for Early Access:</h3>
            <ol style="margin: 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;">Search for <strong>@PaisaTapBetaBot</strong> on Telegram.</li>
              <li style="margin-bottom: 8px;">Launch the bot and start the session.</li>
              <li style="margin-bottom: 8px;">Log in using your registered Telegram ID: <strong>${applicant.telegram}</strong>.</li>
            </ol>
          </div>
          
          <p>As a beta tester, you will have exclusive early access to tap-to-earn rewards and performance incentives based on your milestones.</p>
        </div>
        <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #21262d; font-size: 12px; color: #8b949e; text-align: center;">
          <p>This is an automated selection email. Please do not reply directly to this message.</p>
          <p>&copy; ${new Date().getFullYear()} PaisaTap. All rights reserved.</p>
        </div>
      </div>
    `;
  } else if (status === 'rejected') {
    emailSubject = 'PaisaTap - Application Status Update';
    
    if (reason === 'not_eligible') {
      emailText = `Hi ${applicant.name},

Thank you for your application to join the PaisaTap Beta Program.

We appreciate your interest in our tap-to-earn bot; however, we regret to inform you that we are unable to accept your application at this time as you do not meet our current eligibility requirements.

We will keep your details on file should our eligibility criteria change in future phases.

Best regards,
The PaisaTap Team`;

      emailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0d1117; color: #e6edf3; padding: 30px; border-radius: 8px; max-width: 600px; margin: auto; border: 1px solid #f85149;">
          <div style="text-align: center; border-bottom: 1px solid #21262d; padding-bottom: 20px; margin-bottom: 20px;">
            <h1 style="color: #f85149; margin: 0; font-size: 24px; font-weight: bold;">Application Status Update</h1>
            <p style="color: #8b949e; margin: 5px 0 0 0; font-style: italic;">PaisaTap Beta Program</p>
          </div>
          <div style="font-size: 16px; line-height: 1.6; color: #c9d1d9;">
            <p>Hi <strong>${applicant.name}</strong>,</p>
            <p>Thank you for applying to the PaisaTap Beta Tester Program. We appreciate your interest.</p>
            <p>After reviewing your details, we regret to inform you that your application was not selected for this cohort because you do not meet our current eligibility requirements.</p>
            <p>We will keep your contact details secure and may reach out to you should new opportunities arise in future testing phases.</p>
          </div>
          <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #21262d; font-size: 12px; color: #8b949e; text-align: center;">
            <p>&copy; ${new Date().getFullYear()} PaisaTap. All rights reserved.</p>
          </div>
        </div>
      `;
    } else if (reason === 'invalid_telegram') {
      emailSubject = 'PaisaTap - Action Required: Invalid Telegram Username';
      emailText = `Hi ${applicant.name},

Thank you for your application to join the PaisaTap Beta Program.

We attempted to review your details, but the Telegram ID/username you provided (${applicant.telegram}) appears to be invalid or does not exist. As we require a valid Telegram username to coordinate testing and send access links, we are unable to approve your application.

If you made a typo, please feel free to visit our landing page and submit a new application with the correct Telegram username:
https://paisatap-authentication-server.onrender.com

Best regards,
The PaisaTap Team`;

      emailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0d1117; color: #e6edf3; padding: 30px; border-radius: 8px; max-width: 600px; margin: auto; border: 1px solid #f85149;">
          <div style="text-align: center; border-bottom: 1px solid #21262d; padding-bottom: 20px; margin-bottom: 20px;">
            <h1 style="color: #f85149; margin: 0; font-size: 24px; font-weight: bold;">Action Required: Invalid Telegram ID</h1>
            <p style="color: #8b949e; margin: 5px 0 0 0; font-style: italic;">PaisaTap Beta Program</p>
          </div>
          <div style="font-size: 16px; line-height: 1.6; color: #c9d1d9;">
            <p>Hi <strong>${applicant.name}</strong>,</p>
            <p>Thank you for applying to the PaisaTap Beta Tester Program. We appreciate your interest.</p>
            <p>During our review, we found that the Telegram ID/username you entered (<strong>${applicant.telegram}</strong>) is invalid or unreachable. We require a valid handle to contact you and grant early access benefits.</p>
            <div style="background-color: #161b22; border-left: 4px solid #f85149; padding: 12px; border-radius: 4px; margin: 15px 0;">
              <p style="margin: 0; color: #f85149; font-weight: 500;">Please re-apply:</p>
              <p style="margin: 5px 0 0 0; font-size: 14px;">Please re-submit your details using your correct Telegram ID at our application portal: <a href="https://paisatap-authentication-server.onrender.com" style="color: #58a6ff; text-decoration: none;">https://paisatap-authentication-server.onrender.com</a></p>
            </div>
          </div>
          <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #21262d; font-size: 12px; color: #8b949e; text-align: center;">
            <p>&copy; ${new Date().getFullYear()} PaisaTap. All rights reserved.</p>
          </div>
        </div>
      `;
    }
  }

  // Handle overrides for Resend (just in case they switch back)
  let finalFromEmail = fromEmail;
  if (process.env.RESEND_API_KEY) {
    const publicDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com', 'mail.ru'];
    const domain = fromEmail.split('@')[1]?.toLowerCase();
    if (!domain || publicDomains.includes(domain) || fromEmail === 'noreply@paisatap.com') {
      finalFromEmail = 'onboarding@resend.dev';
    }
  }

  // Trigger dispatch
  try {
    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: `PaisaTap <${finalFromEmail}>`,
          to: applicant.email,
          subject: emailSubject,
          html: emailHtml
        })
      });
    } else if (process.env.SENDGRID_API_KEY) {
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: applicant.email }] }],
          from: { email: finalFromEmail, name: 'PaisaTap' },
          subject: emailSubject,
          content: [{ type: 'text/html', value: emailHtml }]
        })
      });
    } else if (process.env.BREVO_API_KEY) {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.BREVO_API_KEY
        },
        body: JSON.stringify({
          sender: { name: 'PaisaTap', email: finalFromEmail },
          to: [{ email: applicant.email }],
          subject: emailSubject,
          htmlContent: emailHtml
        })
      });
    } else {
      const mailOptions = {
        from: `"PaisaTap" <${finalFromEmail}>`,
        to: applicant.email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml
      };
      await transporter.sendMail(mailOptions);
    }
    console.log(`Status notification email (${status}) successfully sent to ${applicant.email}`);
  } catch (err) {
    console.error(`Failed to send status notification email to ${applicant.email}:`, err.message);
  }
}

// For Render deployment: Catch-all route to serve the SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`PaisaTap application server running on port ${PORT}`);
});
