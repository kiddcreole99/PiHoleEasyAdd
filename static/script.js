// State management
let blockedDomains = [];
let persistentDomains = []; // Maintains last 20 domains across refreshes
let filteredDomains = [];
let autoRefreshInterval = null;
let isLoading = false;

// DOM elements
const blockedList = document.getElementById('blocked-list');
const loadingEl = document.getElementById('loading');
const emptyStateEl = document.getElementById('empty-state');
const errorMessageEl = document.getElementById('error-message');
const searchInput = document.getElementById('search-input');
const refreshBtn = document.getElementById('refresh-btn');
const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
const themeToggle = document.getElementById('theme-toggle');
const themeIconDark = document.getElementById('theme-icon-dark');
const themeIconLight = document.getElementById('theme-icon-light');
const connectionStatus = document.getElementById('connection-status');
const entryCount = document.getElementById('entry-count');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    checkHealth();
    fetchBlockedDomains();
    setupEventListeners();
    startAutoRefresh();
});

// Setup event listeners
function setupEventListeners() {
    searchInput.addEventListener('input', handleSearch);
    refreshBtn.addEventListener('click', handleRefresh);
    autoRefreshToggle.addEventListener('change', handleAutoRefreshToggle);
    themeToggle.addEventListener('click', toggleTheme);
}

// Initialize theme from localStorage or default to dark
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

// Toggle between dark and light theme
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

// Update theme icon based on current theme
function updateThemeIcon(theme) {
    if (theme === 'dark') {
        themeIconDark.style.display = 'block';
        themeIconLight.style.display = 'none';
    } else {
        themeIconDark.style.display = 'none';
        themeIconLight.style.display = 'block';
    }
}

// Check PiHole connection health
async function checkHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (data.pihole_reachable) {
            updateConnectionStatus('connected', 'Connected to PiHole');
        } else {
            updateConnectionStatus('error', 'Cannot reach PiHole');
            showError('Cannot connect to PiHole. Please check your configuration.');
        }
    } catch (error) {
        updateConnectionStatus('error', 'Connection Error');
        showError('Failed to check PiHole connection.');
    }
}

// Update connection status indicator
function updateConnectionStatus(status, text) {
    connectionStatus.className = `status-indicator ${status}`;
    connectionStatus.querySelector('.status-text').textContent = text;
}

// Fetch blocked domains from API
async function fetchBlockedDomains() {
    if (isLoading) return;

    isLoading = true;
    showLoading(true);
    hideError();

    try {
        const response = await fetch('/api/blocked');
        const result = await response.json();

        if (result.success) {
            blockedDomains = result.data;

            // Merge new domains with persistent list
            mergePersistentDomains(blockedDomains);

            // Use persistent domains for display
            filteredDomains = [...persistentDomains];
            renderBlockedList();
            updateConnectionStatus('connected', 'Connected to PiHole');
        } else {
            showError(result.error || 'Failed to fetch blocked domains');
            updateConnectionStatus('error', 'API Error');
        }
    } catch (error) {
        showError('Failed to fetch blocked domains. Please check your connection.');
        updateConnectionStatus('error', 'Connection Error');
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

// Merge new domains with persistent list, keeping last 20
function mergePersistentDomains(newDomains) {
    // Create a map of existing domains for quick lookup
    const domainMap = new Map();

    // Add existing persistent domains to map
    persistentDomains.forEach(item => {
        domainMap.set(item.domain, item);
    });

    // Add or update with new domains
    newDomains.forEach(item => {
        const existing = domainMap.get(item.domain);
        // Keep the entry with the latest timestamp and highest count
        if (!existing || item.latest_timestamp > existing.latest_timestamp) {
            domainMap.set(item.domain, {
                ...item,
                count: existing ? Math.max(item.count, existing.count) : item.count
            });
        } else if (existing) {
            // Update count if timestamp is same but count increased
            existing.count = Math.max(item.count, existing.count);
        }
    });

    // Convert back to array, sort by timestamp, keep only 20 most recent
    persistentDomains = Array.from(domainMap.values())
        .sort((a, b) => b.latest_timestamp - a.latest_timestamp)
        .slice(0, 20);
}

// Handle search/filter
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (searchTerm === '') {
        filteredDomains = [...persistentDomains];
    } else {
        filteredDomains = persistentDomains.filter(item =>
            item.domain.toLowerCase().includes(searchTerm)
        );
    }

    renderBlockedList();
}

// Handle manual refresh
function handleRefresh() {
    fetchBlockedDomains();
}

// Handle auto-refresh toggle
function handleAutoRefreshToggle(e) {
    if (e.target.checked) {
        startAutoRefresh();
    } else {
        stopAutoRefresh();
    }
}

// Start auto-refresh
function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }

    autoRefreshInterval = setInterval(() => {
        if (!isLoading) {
            fetchBlockedDomains();
        }
    }, REFRESH_INTERVAL);
}

// Stop auto-refresh
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Render blocked domains list
function renderBlockedList() {
    entryCount.textContent = filteredDomains.length;

    if (filteredDomains.length === 0) {
        blockedList.innerHTML = '';
        emptyStateEl.style.display = 'block';
        return;
    }

    emptyStateEl.style.display = 'none';

    blockedList.innerHTML = filteredDomains.map(item => `
        <div class="blocked-item" data-domain="${escapeHtml(item.domain)}">
            <div class="domain-info">
                <div class="domain-name">${escapeHtml(item.domain)}</div>
                <div class="domain-meta">
                    <span class="meta-item">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M7 13A6 6 0 1 0 7 1a6 6 0 0 0 0 12z" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M7 3.5v3.25l2.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        ${formatTimestamp(item.latest_timestamp)}
                    </span>
                    <span class="meta-item">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M10.5 10.5L7 7M7 7L3.5 3.5M7 7l3.5-3.5M7 7l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        Blocked ${item.count}x
                    </span>
                </div>
            </div>
            <button class="btn-allow" onclick="addToWhitelist('${escapeHtml(item.domain)}')">
                Allow
            </button>
        </div>
    `).join('');
}

// Add domain to whitelist
async function addToWhitelist(domain) {
    const itemEl = document.querySelector(`[data-domain="${domain}"]`);
    if (!itemEl) return;

    // Disable button and add loading state
    const button = itemEl.querySelector('.btn-allow');
    button.disabled = true;
    button.textContent = 'Adding...';
    itemEl.classList.add('whitelisting');

    try {
        const response = await fetch('/api/whitelist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ domain }),
        });

        const result = await response.json();

        if (result.success) {
            showToast(`Successfully whitelisted: ${domain}`, 'success');

            // Remove from all lists
            blockedDomains = blockedDomains.filter(item => item.domain !== domain);
            persistentDomains = persistentDomains.filter(item => item.domain !== domain);
            filteredDomains = filteredDomains.filter(item => item.domain !== domain);

            // Animate out and remove
            itemEl.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => {
                renderBlockedList();
            }, 300);
        } else {
            showToast(`Failed to whitelist: ${result.error}`, 'error');
            button.disabled = false;
            button.textContent = 'Allow';
            itemEl.classList.remove('whitelisting');
        }
    } catch (error) {
        showToast('Failed to add to whitelist. Please try again.', 'error');
        button.disabled = false;
        button.textContent = 'Allow';
        itemEl.classList.remove('whitelisting');
    }
}

// Show loading state
function showLoading(show) {
    loadingEl.style.display = show ? 'block' : 'none';
    refreshBtn.disabled = show;
}

// Show error message
function showError(message) {
    errorMessageEl.textContent = message;
    errorMessageEl.style.display = 'block';
}

// Hide error message
function hideError() {
    errorMessageEl.style.display = 'none';
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// Format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';

    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Add fadeOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        to {
            opacity: 0;
            transform: translateX(20px);
        }
    }
    @keyframes slideOut {
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
