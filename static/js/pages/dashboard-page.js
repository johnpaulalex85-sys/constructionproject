// ============ DASHBOARD PAGE ============
let trendChart = null;
let siteChart = null;

async function loadDashboard() {
  try {
    const [stats, trend, comparison] = await Promise.all([
      apiGet('/dashboard/stats'),
      apiGet('/dashboard/usage-trend'),
      apiGet('/dashboard/site-comparison')
    ]);

    // Stats cards
    const grid = document.getElementById('stat-grid');
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon blue">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>
        <div class="stat-body">
          <div class="stat-label">Total Sites</div>
          <div class="stat-value">${stats.total_sites}</div>
          <div class="stat-sub">${stats.active_sites} active</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
        <div class="stat-body">
          <div class="stat-label">Total Materials</div>
          <div class="stat-value">${stats.total_materials}</div>
          <div class="stat-sub">Tracked items</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${stats.low_stock_alerts > 0 ? 'red' : 'green'}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div class="stat-body">
          <div class="stat-label">Low Stock Alerts</div>
          <div class="stat-value">${stats.low_stock_alerts}</div>
          <div class="stat-sub ${stats.low_stock_alerts > 0 ? 'danger' : ''}">${stats.low_stock_alerts > 0 ? 'Needs attention' : 'All stocked up'}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${stats.pending_requests > 0 ? 'orange' : 'blue'}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="stat-body">
          <div class="stat-label">Pending Requests</div>
          <div class="stat-value">${stats.pending_requests}</div>
          <div class="stat-sub ${stats.pending_requests > 0 ? 'warn' : ''}">${stats.pending_requests > 0 ? 'Awaiting approval' : 'All reviewed'}</div>
        </div>
      </div>
    `;

    // Notif dot
    if (stats.low_stock_alerts > 0 || stats.pending_requests > 0) {
      document.getElementById('notif-dot').style.display = 'block';
    }

    // Pending badge in sidebar
    if (stats.pending_requests > 0) {
      const badge = document.getElementById('pending-badge');
      badge.textContent = stats.pending_requests;
      badge.style.display = 'inline-flex';
    }

    // Trend chart
    const trendLabels = trend.map(t => t.date);
    const trendData = trend.map(t => t.total_used);

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('trend-chart').getContext('2d'), {
      type: 'line',
      data: {
        labels: trendLabels.length ? trendLabels : ['No data'],
        datasets: [{
          label: 'Total Usage',
          data: trendData.length ? trendData : [0],
          borderColor: '#1a56db',
          backgroundColor: 'rgba(26,86,219,0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#1a56db',
          pointRadius: 3,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 } } }
        }
      }
    });

    // Site comparison chart
    const siteLabels = comparison.map(s => s.site);
    const siteData = comparison.map(s => s.total_used);
    const colors = ['#1a56db','#f97316','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

    if (siteChart) siteChart.destroy();
    siteChart = new Chart(document.getElementById('site-chart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: siteLabels.length ? siteLabels : ['No data'],
        datasets: [{
          label: 'Total Usage',
          data: siteData.length ? siteData : [0],
          backgroundColor: colors.slice(0, siteLabels.length),
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 } } }
        }
      }
    });

    // Recent activity
    const tbody = document.getElementById('recent-activity-body');
    if (stats.recent_activity.length === 0) {
      tbody.innerHTML = emptyRow(4, 'No activity yet');
    } else {
      tbody.innerHTML = stats.recent_activity.map(a => `
        <tr>
          <td><strong>${a.site}</strong></td>
          <td>${a.material}</td>
          <td>${a.used_quantity} ${a.unit}</td>
          <td>${fmtDate(a.date)}</td>
        </tr>
      `).join('');
    }

    // Recent Daily Logs
    const dailyTbody = document.getElementById('recent-daily-body');
    if (!stats.recent_daily_logs || stats.recent_daily_logs.length === 0) {
      dailyTbody.innerHTML = emptyRow(3, 'No logs yet');
    } else {
      dailyTbody.innerHTML = stats.recent_daily_logs.map(l => `
        <tr>
          <td><strong>${l.site}</strong></td>
          <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.description || '—'}</td>
          <td>${fmtDate(l.date)}</td>
        </tr>
      `).join('');
    }

  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}
