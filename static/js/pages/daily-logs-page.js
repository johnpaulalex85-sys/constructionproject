// ============ DAILY LOGS PAGE ============
let allDailyLogs = [];

async function loadDailyLogs() {
  const tbody = document.getElementById('daily-logs-body');
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Loading...</td></tr>`;
  try {
    allDailyLogs = await apiGet('/admin/daily-logs');
    renderDailyLogs(allDailyLogs);
  } catch (err) {
    showToast('Failed to load daily logs: ' + err.message, 'error');
    tbody.innerHTML = emptyRow(5, 'Error loading daily logs');
  }
}

function renderDailyLogs(logs) {
  const tbody = document.getElementById('daily-logs-body');
  if (!logs.length) { tbody.innerHTML = emptyRow(5); return; }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td>
        <div style="font-weight:600;">${fmtDate(l.date)}</div>
      </td>
      <td>${l.site_name}</td>
      <td>${l.workers_count || '0'}</td>
      <td style="max-width: 300px; white-space: normal;">
        <div style="font-size: 0.9em; color: #4b5563;">${l.work_description || '—'}</div>
      </td>
      <td style="max-width: 200px; white-space: normal;">
        <span class="badge ${l.issues ? 'badge-warning' : 'badge-success'}">
          ${l.issues || 'No issues'}
        </span>
      </td>
    </tr>
  `).join('');
}

// Search/Filter
document.getElementById('daily-logs-search').addEventListener('input', function () {
  const q = this.value.toLowerCase();
  renderDailyLogs(allDailyLogs.filter(l => 
    l.site_name.toLowerCase().includes(q) || 
    (l.work_description || '').toLowerCase().includes(q) ||
    (l.issues || '').toLowerCase().includes(q)
  ));
});
