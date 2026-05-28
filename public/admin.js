document.addEventListener('DOMContentLoaded', () => {
  const loginOverlay = document.getElementById('loginOverlay');
  const dashboardWrapper = document.getElementById('dashboardWrapper');
  const loginForm = document.getElementById('loginForm');
  const loginPasswordInput = document.getElementById('adminPassword');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const applicationsTableBody = document.getElementById('applicationsTableBody');

  // Stats elements
  const statTotal = document.getElementById('statTotal');
  const statPending = document.getElementById('statPending');
  const statApproved = document.getElementById('statApproved');
  const statRejected = document.getElementById('statRejected');

  // Rejection modal elements
  const rejectionModal = document.getElementById('rejectionModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelRejectBtn = document.getElementById('cancelRejectBtn');
  const confirmRejectBtn = document.getElementById('confirmRejectBtn');
  const rejectTargetName = document.getElementById('rejectTargetName');
  const rejectReasonInputs = document.getElementsByName('rejectReason');

  // Toast elements
  const toastNotification = document.getElementById('toastNotification');
  const toastIcon = document.getElementById('toastIcon');
  const toastText = document.getElementById('toastText');

  let activePassword = localStorage.getItem('paisatap_admin_password') || '';
  let targetApplicantId = null;

  // Initial Auth Check
  if (activePassword) {
    verifyAndInit(activePassword);
  }

  // Handle Login Submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const enteredPassword = loginPasswordInput.value.trim();
    if (!enteredPassword) return;

    setLoadingState(loginForm.querySelector('button'), true);
    loginError.textContent = '';

    const verified = await verifyPassword(enteredPassword);
    setLoadingState(loginForm.querySelector('button'), false);

    if (verified) {
      activePassword = enteredPassword;
      localStorage.setItem('paisatap_admin_password', activePassword);
      loginOverlay.style.display = 'none';
      dashboardWrapper.style.display = 'block';
      loadApplications();
    } else {
      loginError.textContent = 'Invalid administrator password.';
      loginPasswordInput.classList.add('invalid');
      loginPasswordInput.focus();
    }
  });

  // Handle Logout
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('paisatap_admin_password');
    activePassword = '';
    dashboardWrapper.style.display = 'none';
    loginOverlay.style.display = 'flex';
    loginPasswordInput.value = '';
    applicationsTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="loading-placeholder">
          <i class="fa-solid fa-circle-notch fa-spin"></i> Fetching applications...
        </td>
      </tr>
    `;
  });

  // Handle Refresh button click
  refreshBtn.addEventListener('click', () => {
    loadApplications();
  });

  // Verify stored password and bootstrap dashboard
  async function verifyAndInit(pwd) {
    const verified = await verifyPassword(pwd);
    if (verified) {
      loginOverlay.style.display = 'none';
      dashboardWrapper.style.display = 'block';
      loadApplications();
    } else {
      // Clear invalid credentials
      localStorage.removeItem('paisatap_admin_password');
      activePassword = '';
      showToast('Session expired. Please log in again.', 'error');
    }
  }

  // API Call to verify password
  async function verifyPassword(pwd) {
    try {
      const response = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: pwd })
      });
      return response.ok;
    } catch (err) {
      console.error('Connection failed during authentication:', err);
      return false;
    }
  }

  // Load and Render Applications from Server
  async function loadApplications() {
    applicationsTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="loading-placeholder">
          <i class="fa-solid fa-circle-notch fa-spin"></i> Loading fresh submissions...
        </td>
      </tr>
    `;

    try {
      const response = await fetch('/api/admin/applications', {
        method: 'GET',
        headers: {
          'x-admin-password': activePassword
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          logoutBtn.click();
          return;
        }
        throw new Error('Failed to retrieve applications.');
      }

      const data = await response.json();
      renderApplications(data.applications);
    } catch (err) {
      console.error(err);
      applicationsTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="error-placeholder">
            <i class="fa-solid fa-triangle-exclamation"></i> Error loading applications. Check server logs or connection.
          </td>
        </tr>
      `;
      showToast('Error loading applications list.', 'error');
    }
  }

  // Render Table Rows and Update Metric stats
  function renderApplications(apps) {
    if (!apps || apps.length === 0) {
      applicationsTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-placeholder">
            No applications found in local files.
          </td>
        </tr>
      `;
      updateStats(0, 0, 0, 0);
      return;
    }

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    let tableHtml = '';

    apps.forEach(app => {
      // Calculate Stats
      if (app.status === 'approved') approvedCount++;
      else if (app.status === 'rejected') rejectedCount++;
      else pendingCount++;

      // Date Formatting
      const submitDate = new Date(app.submittedAt);
      const formattedDate = submitDate.toLocaleDateString() + ' ' + submitDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Clickable Telegram Handle formatting
      const cleanTelegram = app.telegram.replace('@', '');
      const telegramLink = `<a href="https://t.me/${cleanTelegram}" class="tg-table-link" target="_blank">
        <i class="fa-brands fa-telegram"></i> ${app.telegram}
      </a>`;

      // Status Badge Formatting
      let statusBadge = '';
      if (app.status === 'approved') {
        statusBadge = `<span class="status-badge badge-approved">Approved</span>`;
      } else if (app.status === 'rejected') {
        const titleText = app.rejectionReason === 'not_eligible' ? 'Reason: Not Eligible' : 'Reason: Invalid Telegram handle';
        statusBadge = `<span class="status-badge badge-rejected" title="${titleText}">${app.rejectionReason === 'not_eligible' ? 'Rejected' : 'Rejected (Telegram)'}</span>`;
      } else {
        statusBadge = `<span class="status-badge badge-pending">Pending</span>`;
      }

      // Actions Column
      let actionButtons = '';
      if (app.status === 'pending') {
        actionButtons = `
          <div class="actions-wrapper">
            <button class="btn-table btn-approve" data-id="${app.id}" data-name="${app.name}" title="Approve applicant">
              <i class="fa-solid fa-check"></i> Approve
            </button>
            <button class="btn-table btn-reject" data-id="${app.id}" data-name="${app.name}" title="Reject applicant">
              <i class="fa-solid fa-xmark"></i> Reject
            </button>
          </div>
        `;
      } else {
        actionButtons = `<span class="action-locked"><i class="fa-solid fa-lock"></i> Processed</span>`;
      }

      tableHtml += `
        <tr class="app-row status-${app.status}">
          <td class="date-col">${formattedDate}</td>
          <td class="name-col"><strong>${app.name}</strong></td>
          <td class="email-col"><a href="mailto:${app.email}" class="table-email-link">${app.email}</a></td>
          <td class="tg-col">${telegramLink}</td>
          <td class="age-col text-center">${app.age}</td>
          <td class="status-col text-center">${statusBadge}</td>
          <td class="actions-col text-center">${actionButtons}</td>
        </tr>
      `;
    });

    applicationsTableBody.innerHTML = tableHtml;
    updateStats(apps.length, pendingCount, approvedCount, rejectedCount);

    // Attach Event Listeners to Buttons dynamically
    document.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', () => {
        handleApprove(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
      });
    });

    document.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        openRejectionModal(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
      });
    });
  }

  // Update numbers in metrics widgets
  function updateStats(total, pending, approved, rejected) {
    statTotal.textContent = total;
    statPending.textContent = pending;
    statApproved.textContent = approved;
    statRejected.textContent = rejected;
  }

  // Process Approval Transition
  async function handleApprove(id, name) {
    if (!confirm(`Are you sure you want to approve ${name} for beta access?`)) return;

    showToast(`Approving ${name}...`, 'info');

    try {
      const response = await fetch(`/api/admin/applications/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': activePassword
        },
        body: JSON.stringify({ status: 'approved' })
      });

      if (response.ok) {
        showToast(`${name} approved. Welcome email dispatched.`, 'success');
        loadApplications();
      } else {
        const data = await response.json();
        showToast(data.message || 'Approval failed.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error during status transition.', 'error');
    }
  }

  // Open Rejection Dialog Modal
  function openRejectionModal(id, name) {
    targetApplicantId = id;
    rejectTargetName.textContent = name;
    rejectionModal.style.display = 'flex';
  }

  // Close Rejection Dialog Modal
  function closeRejectionModal() {
    rejectionModal.style.display = 'none';
    targetApplicantId = null;
  }

  closeModalBtn.addEventListener('click', closeRejectionModal);
  cancelRejectBtn.addEventListener('click', closeRejectionModal);

  // Process Rejection Transition
  confirmRejectBtn.addEventListener('click', async () => {
    if (!targetApplicantId) return;

    // Retrieve checked reason radio option
    let selectedReason = 'not_eligible';
    for (let i = 0; i < rejectReasonInputs.length; i++) {
      if (rejectReasonInputs[i].checked) {
        selectedReason = rejectReasonInputs[i].value;
        break;
      }
    }

    const name = rejectTargetName.textContent;
    const appId = targetApplicantId;
    closeRejectionModal();
    showToast(`Rejecting ${name}...`, 'info');

    try {
      const response = await fetch(`/api/admin/applications/${appId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': activePassword
        },
        body: JSON.stringify({
          status: 'rejected',
          rejectionReason: selectedReason
        })
      });

      if (response.ok) {
        showToast(`${name} rejected. Decision email dispatched.`, 'success');
        loadApplications();
      } else {
        const data = await response.json();
        showToast(data.message || 'Rejection failed.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error during rejection transition.', 'error');
    }
  });

  // --- UI Utilities ---
  
  // Set button loading states
  function setLoadingState(btn, isLoading) {
    if (isLoading) {
      btn.classList.add('loading');
      btn.setAttribute('disabled', 'true');
    } else {
      btn.classList.remove('loading');
      btn.removeAttribute('disabled');
    }
  }

  // Show dynamic toast notifications
  function showToast(message, type = 'success') {
    toastText.textContent = message;
    
    // Reset classes
    toastIcon.className = 'fa-solid';
    toastNotification.className = 'toast-notification show';

    if (type === 'success') {
      toastNotification.classList.add('toast-success');
      toastIcon.classList.add('fa-circle-check');
    } else if (type === 'error') {
      toastNotification.classList.add('toast-error');
      toastIcon.classList.add('fa-circle-xmark');
    } else {
      toastNotification.classList.add('toast-info');
      toastIcon.classList.add('fa-circle-info');
    }

    // Hide after 3.5 seconds
    setTimeout(() => {
      toastNotification.classList.remove('show');
    }, 3500);
  }
});
