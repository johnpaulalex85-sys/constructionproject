// attendance-page.js
const attendancePage = {
  elements: {
    siteSelect: document.getElementById('attendance-site-select'),
    dateInput: document.getElementById('attendance-date'),
    searchInput: document.getElementById('attendance-search'),
    refreshBtn: document.getElementById('attendance-refresh-btn'),
    exportPdfBtn: document.getElementById('attendance-export-pdf-btn'),
    exportExcelBtn: document.getElementById('attendance-export-excel-btn'),
    tableBody: document.getElementById('attendance-body'),
    
    // Stats
    totalWorkers: document.getElementById('att-total-workers'),
    present: document.getElementById('att-present'),
    absent: document.getElementById('att-absent'),
    percentage: document.getElementById('att-percentage')
  },
  
  chartInstance: null,

  async init() {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    this.elements.dateInput.value = today;

    // Load Sites
    await this.loadSites();
    
    // Load Data
    await this.loadSummary();
    await this.loadRecords();

    // Event Listeners
    this.elements.refreshBtn.addEventListener('click', () => {
      this.loadSummary();
      this.loadRecords();
    });

    this.elements.siteSelect.addEventListener('change', () => {
      this.loadSummary();
      this.loadRecords();
    });

    this.elements.dateInput.addEventListener('change', () => {
      this.loadSummary();
      this.loadRecords();
    });

    this.elements.searchInput.addEventListener('input', () => {
      this.filterTable();
    });

    this.elements.exportPdfBtn.addEventListener('click', () => {
      window.print();
    });

    this.elements.exportExcelBtn.addEventListener('click', () => {
      this.exportToCSV();
    });
  },

  async loadSites() {
    try {
      const sites = await apiGet('/sites');
      if (sites) {
        sites.forEach(site => {
          const opt = document.createElement('option');
          opt.value = site._id;
          opt.textContent = site.name;
          this.elements.siteSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.error('Error loading sites:', err);
    }
  },

  async loadSummary() {
    const date = this.elements.dateInput.value;
    const siteId = this.elements.siteSelect.value;
    let url = `/attendance/summary?date=${date}`;
    if (siteId) url += `&site_id=${siteId}`;

    try {
      const summary = await apiGet(url);
      if (summary) {
        this.elements.totalWorkers.textContent = summary.total_workers;
        this.elements.present.textContent = summary.present;
        this.elements.absent.textContent = summary.absent;
        this.elements.percentage.textContent = summary.attendance_percentage + '%';
      }
    } catch (err) {
      console.error('Error loading summary:', err);
    }
  },

  async loadRecords() {
    this.elements.tableBody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading...</td></tr>';
    
    const date = this.elements.dateInput.value;
    const siteId = this.elements.siteSelect.value;
    let url = `/attendance?date=${date}`;
    if (siteId) url += `&site_id=${siteId}`;

    try {
      this.records = await apiGet(url);
      this.renderTable(this.records);
    } catch (err) {
      console.error('Error loading records:', err);
      this.elements.tableBody.innerHTML = '<tr><td colspan="7" class="error-cell">Failed to load records</td></tr>';
    }
  },

  renderTable(records) {
    if (!records || records.length === 0) {
      this.elements.tableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No attendance records found for this date.</td></tr>';
      return;
    }

    this.elements.tableBody.innerHTML = records.map(record => {
      let badgeColor = '';
      if (record.status === 'present') badgeColor = '#10b981'; // Green
      else if (record.status === 'absent') badgeColor = '#ef4444'; // Red
      else if (record.status === 'half-day') badgeColor = '#f59e0b'; // Yellow

      const badgeHTML = `<span style="background-color: ${badgeColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: capitalize;">${record.status}</span>`;

      return `
        <tr>
          <td>${record.worker_name}</td>
          <td>${record.worker_role}</td>
          <td>${record.site_name}</td>
          <td>${record.date}</td>
          <td>${badgeHTML}</td>
          <td>${record.check_in || '-'}</td>
          <td>${record.check_out || '-'}</td>
        </tr>
      `;
    }).join('');
  },

  filterTable() {
    const search = this.elements.searchInput.value.toLowerCase();
    if (!this.records) return;
    
    const filtered = this.records.filter(r => 
      r.worker_name.toLowerCase().includes(search) || 
      r.site_name.toLowerCase().includes(search)
    );
    this.renderTable(filtered);
  },

  exportToCSV() {
    if (!this.records || this.records.length === 0) {
      toast.show('No records to export', 'error');
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Worker Name,Role,Site,Date,Status,Check In,Check Out\n";

    this.records.forEach(r => {
      let row = `"${r.worker_name}","${r.worker_role}","${r.site_name}","${r.date}","${r.status}","${r.check_in || ''}","${r.check_out || ''}"`;
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_report_${this.elements.dateInput.value}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// Expose page object
window.pages = window.pages || {};
window.pages['attendance'] = attendancePage;
