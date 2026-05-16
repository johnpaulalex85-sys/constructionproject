// ============ MAIN APP (SPA ROUTER) ============

// Auth guard — redirect to Flask login page if no token
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '/';
}

// Load admin info from localStorage
const user = JSON.parse(localStorage.getItem('user') || '{}');
const adminName = user.username || 'Admin';
document.getElementById('admin-name').textContent = adminName;
document.getElementById('admin-avatar').textContent = adminName.charAt(0).toUpperCase();

// Page title map
const pageTitles = {
  dashboard: 'Dashboard',
  sites: 'Sites Management',
  materials: 'Materials',
  allocations: 'Allocations',
  requests: 'Material Requests',
  reports: 'Reports & Analytics',
  'daily-reports': 'Daily Site Reports',
  attendance: 'Attendance',
  accounting: 'Accounting & Finance'
};

// State
let currentPage = null;
let allocPageInited = false;
let reportsPageInited = false;
let dailyReportsInited = false;
let attendancePageInited = false;
let accountingPageInited = false;

// Navigate to a page
function navigateTo(page) {
  if (currentPage === page) return;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.getElementById(`nav-${page}`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  document.getElementById('page-title').textContent = pageTitles[page] || 'ConstructAdmin';
  currentPage = page;

  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'sites': loadSites(); break;
    case 'materials': loadMaterials(); break;
    case 'allocations':
      if (!allocPageInited) { allocPageInited = true; initAllocationsPage(); }
      break;
    case 'requests': loadRequests(); break;
    case 'reports':
      if (!reportsPageInited) { reportsPageInited = true; initReportsPage(); }
      break;
    case 'daily-reports':
      if (!dailyReportsInited) {
        dailyReportsInited = true;
        initDailyReports();
      } else {
        loadDailyReports(); 
      }
      break;
    case 'attendance':
      if (!attendancePageInited) { attendancePageInited = true; window.pages.attendance.init(); }
      break;
    case 'accounting':
      if (!accountingPageInited) { accountingPageInited = true; window.pages.accounting.init(); }
      else { window.pages.accounting.init(); } // Refresh data on visit
      break;
  }
}

// Hash-based routing
function handleHash() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  const valid = ['dashboard', 'sites', 'materials', 'allocations', 'requests', 'reports', 'daily-reports', 'attendance', 'accounting'];
  navigateTo(valid.includes(hash) ? hash : 'dashboard');
}

window.addEventListener('hashchange', handleHash);

// Sidebar nav — close on mobile after click
document.querySelectorAll('.nav-item[data-page]').forEach(item => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.remove('open');
    }
  });
});

// Hamburger toggle
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  confirmAction('Logout', 'Are you sure you want to logout?', () => {
    localStorage.clear();
    window.location.href = '/';   // Go to Flask login route
  });
});

// Notification bell → go to requests
document.getElementById('notif-btn').addEventListener('click', () => {
  window.location.hash = '#requests';
});

// Initial load
handleHash();
