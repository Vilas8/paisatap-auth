document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('applicationForm');
  const submitBtn = document.getElementById('submitBtn');
  const successAlert = document.getElementById('successAlert');
  const errorAlert = document.getElementById('errorAlert');
  const successMessage = document.getElementById('successMessage');
  const errorMessage = document.getElementById('errorMessage');

  // Input elements
  const fields = {
    name: {
      input: document.getElementById('fullName'),
      error: document.getElementById('nameError'),
      validate: (val) => {
        if (!val || val.trim().length < 2) return 'Full name must be at least 2 characters.';
        if (val.length > 80) return 'Full name cannot exceed 80 characters.';
        if (!/^[a-zA-Z\s'\-]+$/.test(val)) return 'Name can only contain letters, spaces, hyphens, and apostrophes.';
        return '';
      }
    },
    email: {
      input: document.getElementById('emailAddress'),
      error: document.getElementById('emailError'),
      validate: (val) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!val) return 'Email address is required.';
        if (!emailRegex.test(val)) return 'Please enter a valid email address.';
        return '';
      }
    },
    telegram: {
      input: document.getElementById('telegramUser'),
      error: document.getElementById('telegramError'),
      validate: (val) => {
        if (!val) return 'Telegram username is required.';
        // Match: optional @, followed by 5-32 chars of letters, numbers, underscores
        const telegramRegex = /^@?[a-zA-Z0-9_]{5,32}$/;
        if (!telegramRegex.test(val)) {
          return 'Invalid Telegram handle. Must be 5-32 characters (alphanumerics and underscores).';
        }
        return '';
      }
    },
    age: {
      input: document.getElementById('ageVal'),
      error: document.getElementById('ageError'),
      validate: (val) => {
        if (!val) return 'Age is required.';
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 18) return 'You must be at least 18 years old to apply.';
        if (num > 110) return 'Please enter a valid age.';
        return '';
      }
    },
    consent: {
      input: document.getElementById('legalConsent'),
      error: document.getElementById('consentError'),
      validate: (val, checked) => {
        if (!checked) return 'You must accept the Privacy Policy and Terms of Service.';
        return '';
      }
    }
  };

  // --- Real-time Validation (on blur & input change) ---
  Object.keys(fields).forEach(key => {
    const field = fields[key];
    const inputEvent = key === 'consent' ? 'change' : 'input';

    const triggerValidation = () => {
      const value = field.input.value;
      const checked = field.input.checked;
      const errMessage = field.validate(value, checked);

      if (errMessage) {
        field.error.textContent = errMessage;
        field.input.classList.add('invalid');
      } else {
        field.error.textContent = '';
        field.input.classList.remove('invalid');
      }
      return !errMessage;
    };

    field.input.addEventListener(inputEvent, triggerValidation);
    if (inputEvent !== 'change') {
      field.input.addEventListener('blur', triggerValidation);
    }
  });

  // --- Accordion Logic ---
  const accordions = document.querySelectorAll('.accordion-item');

  accordions.forEach(item => {
    const header = item.querySelector('.accordion-header');
    const content = item.querySelector('.accordion-content');

    header.addEventListener('click', () => {
      toggleAccordion(item, content, header);
    });
  });

  function toggleAccordion(item, content, header) {
    const isActive = item.classList.contains('active');

    // Close all other accordions
    accordions.forEach(otherItem => {
      if (otherItem !== item) {
        otherItem.classList.remove('active');
        const otherContent = otherItem.querySelector('.accordion-content');
        otherContent.style.maxHeight = null;
        otherItem.querySelector('.accordion-header').setAttribute('aria-expanded', 'false');
        otherContent.setAttribute('hidden', '');
      }
    });

    if (isActive) {
      item.classList.remove('active');
      content.style.maxHeight = null;
      header.setAttribute('aria-expanded', 'false');
      content.setAttribute('hidden', '');
    } else {
      item.classList.add('active');
      content.removeAttribute('hidden');
      content.style.maxHeight = content.scrollHeight + 'px';
      header.setAttribute('aria-expanded', 'true');
    }
  }

  // Helper to open legal accordions from checkbox link clicks
  function openLegalAccordion(targetId) {
    const item = document.getElementById(targetId);
    if (!item) return;

    const content = item.querySelector('.accordion-content');
    const header = item.querySelector('.accordion-header');

    // Ensure it opens
    if (!item.classList.contains('active')) {
      toggleAccordion(item, content, header);
    }

    // Scroll to the accordion item
    setTimeout(() => {
      item.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }

  document.getElementById('triggerPrivacy').addEventListener('click', (e) => {
    e.preventDefault();
    openLegalAccordion('privacySection');
  });

  document.getElementById('triggerTerms').addEventListener('click', (e) => {
    e.preventDefault();
    openLegalAccordion('termsSection');
  });


  // --- Form Submission Logic ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset previous alerts
    successAlert.style.display = 'none';
    errorAlert.style.display = 'none';

    // Perform final overall validation
    let isFormValid = true;
    let firstInvalidInput = null;

    Object.keys(fields).forEach(key => {
      const field = fields[key];
      const errMessage = field.validate(field.input.value, field.input.checked);

      if (errMessage) {
        isFormValid = false;
        field.error.textContent = errMessage;
        field.input.classList.add('invalid');
        if (!firstInvalidInput) {
          firstInvalidInput = field.input;
        }
      } else {
        field.error.textContent = '';
        field.input.classList.remove('invalid');
      }
    });

    if (!isFormValid) {
      if (firstInvalidInput) {
        firstInvalidInput.focus();
      }
      return;
    }

    // Prepare form payload
    const payload = {
      name: fields.name.input.value.trim(),
      email: fields.email.input.value.trim(),
      telegram: fields.telegram.input.value.trim(),
      age: parseInt(fields.age.input.value, 10),
      consent: fields.consent.input.checked
    };

    // UI Feedback: Set loading status
    submitBtn.classList.add('loading');
    submitBtn.setAttribute('disabled', 'true');

    try {
      const response = await fetch('/api/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Success handler
        successMessage.textContent = data.message || 'Thank you! Your application has been successfully submitted.';
        successAlert.style.display = 'flex';
        form.reset();
        
        // Remove validation classes from elements
        Object.keys(fields).forEach(key => {
          fields[key].input.classList.remove('invalid');
        });

        // Scroll success alert into view
        successAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // Validation/Limiting/Internal errors from server
        errorMessage.textContent = data.message || 'An error occurred. Please check your data and try again.';
        errorAlert.style.display = 'flex';
        errorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (err) {
      console.error('Submission request failed:', err);
      errorMessage.textContent = 'Server is currently unreachable. Please check your connection and try again later.';
      errorAlert.style.display = 'flex';
      errorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      // Restore button status
      submitBtn.classList.remove('loading');
      submitBtn.removeAttribute('disabled');
    }
  });
});
