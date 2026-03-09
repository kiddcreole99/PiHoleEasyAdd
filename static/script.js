// State management
let blockedDomains = [];
let persistentDomains = [];
let filteredDomains = [];
let autoRefreshInterval = null;
let isLoading = false;
let blockingCountdownInterval = null;
let blockingDisabledUntil = null;

// DOM elements
const blockedList = document.getElementById('blocked-list');
const loadingEl = document.getElementById('loading');
const emptyStateEl = document.getElementById('empty-state');
const errorMessageEl = document.getElementById('error-message');
const searchInput = document.getElementById('search-input');
const refreshBtn = document.getElementById('refresh-btn');
const refreshSelect = document.getElementById('refresh-select');
const themeToggle = document.getElementById('theme-toggle');
const themeIconDark = document.getElementById('theme-icon-dark');
const themeIconLight = document.getElementById('theme-icon-light');
const connectionStatus = document.getElementById('connection-status');
const entryCount = document.getElementById('entry-count');
const disableDurationSelect = document.getElementById('disable-duration');
const customDurationInput = document.getElementById('custom-duration');
const disableBlockingBtn = document.getElementById('disable-blocking-btn');
const enableBlockingBtn = document.getElementById('enable-blocking-btn');
const blockingDot = document.getElementById('blocking-dot');
const blockingText = document.getElementById('blocking-text');
const blockingCountdown = document.getElementById('blocking-countdown');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    checkHealth();
    fetchBlockedDomains();
    setupEventListeners();
    startAutoRefresh();
    checkBlockingStatus();
});

// Setup event listeners
function setupEventListeners() {
    searchInput.addEventListener('input', handleSearch);
    refreshBtn.addEventListener('click', handleRefresh);
    refreshSelect.addEventListener('change', handleRefreshSelectChange);
    themeToggle.addEventListener('click', toggleTheme);
    disableDurationSelect.addEventListener('change', handleDurationChange);
    disableBlockingBtn.addEventListener('click', handleDisableBlocking);
    enableBlockingBtn.addEventListener('click', handleEnableBlocking);
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    if (theme === 'dark') {
        themeIconDark.style.display = 'block';
        themeIconLight.style.display = 'none';
    } else {
        themeIconDark.style.display = 'none';
        themeIconLight.style.display = 'block';
    }
}

// ── Connection & Health ───────────────────────────────────────────────────────

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

function updateConnectionStatus(status, text) {
    connectionStatus.className = `status-indicator ${status}`;
    connectionStatus.querySelector('.status-text').textContent = text;
}

// ── Blocked Domains ───────────────────────────────────────────────────────────

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
            mergePersistentDomains(blockedDomains);
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

function mergePersistentDomains(newDomains) {
    const domainMap = new Map();
    persistentDomains.forEach(item => { domainMap.set(item.domain, item); });
    newDomains.forEach(item => {
        const existing = domainMap.get(item.domain);
        if (!existing || item.latest_timestamp > existing.latest_timestamp) {
            domainMap.set(item.domain, {
                ...item,
                count: existing ? Math.max(item.count, existing.count) : item.count
            });
        } else if (existing) {
            existing.count = Math.max(item.count, existing.count);
        }
    });
    persistentDomains = Array.from(domainMap.values())
        .sort((a, b) => b.latest_timestamp - a.latest_timestamp)
        .slice(0, 20);
}

// ── Refresh Control ───────────────────────────────────────────────────────────

function handleRefreshSelectChange() {
    stopAutoRefresh();
    const val = parseInt(refreshSelect.value);
    if (val > 0) {
        startAutoRefresh(val * 1000);
    }
}

function handleRefresh() {
    fetchBlockedDomains();
}

function startAutoRefresh(intervalMs) {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    const ms = intervalMs !== undefined ? intervalMs : (() => {
        const val = parseInt(refreshSelect.value);
        return val > 0 ? val * 1000 : null;
    })();
    if (!ms) return;
    autoRefreshInterval = setInterval(() => {
        if (!isLoading) fetchBlockedDomains();
    }, ms);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// ── Blocking Control ──────────────────────────────────────────────────────────

async function checkBlockingStatus() {
    try {
        const response = await fetch('/api/blocking');
        const data = await response.json();
        if (data.success) {
            updateBlockingUI(data.blocking, data.timer);
        }
    } catch (e) {
        // Silently fail — blocking status is non-critical
    }
}

function updateBlockingUI(isBlocking, timer) {
    if (isBlocking) {
        blockingDot.className = 'blocking-dot active';
        blockingText.textContent = 'Blocking Active';
        blockingCountdown.style.display = 'none';
        disableBlockingBtn.style.display = 'inline-flex';
        enableBlockingBtn.style.display = 'none';
        clearBlockingCountdown();
    } else {
        blockingDot.className = 'blocking-dot disabled';
        blockingText.textContent = 'Blocking Disabled';
        disableBlockingBtn.style.display = 'none';
        enableBlockingBtn.style.display = 'inline-flex';

        // Start countdown if we have timer info
        if (timer && timer.delay) {
            const endsAt = (timer.started + timer.delay) * 1000;
            startBlockingCountdown(endsAt);
        } else if (blockingDisabledUntil) {
            startBlockingCountdown(blockingDisabledUntil);
        } else {
            blockingCountdown.style.display = 'none';
        }
    }
}

function startBlockingCountdown(endsAtMs) {
    clearBlockingCountdown();
    blockingCountdown.style.display = 'inline';
    blockingDisabledUntil = endsAtMs;

    function tick() {
        const remaining = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000));
        if (remaining <= 0) {
            blockingCountdown.style.display = 'none';
            clearBlockingCountdown();
            blockingDisabledUntil = null;
            // Re-check status — Pi-hole should have re-enabled by now
            setTimeout(checkBlockingStatus, 1000);
            return;
        }
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        blockingCountdown.textContent = m > 0
            ? `(re-enables in ${m}m ${s}s)`
            : `(re-enables in ${s}s)`;
    }

    tick();
    blockingCountdownInterval = setInterval(tick, 1000);
}

function clearBlockingCountdown() {
    if (blockingCountdownInterval) {
        clearInterval(blockingCountdownInterval);
        blockingCountdownInterval = null;
    }
}

function handleDurationChange() {
    if (disableDurationSelect.value === 'custom') {
        customDurationInput.style.display = 'inline-block';
        customDurationInput.focus();
    } else {
        customDurationInput.style.display = 'none';
    }
}

async function handleDisableBlocking() {
    let seconds;
    if (disableDurationSelect.value === 'custom') {
        seconds = parseInt(customDurationInput.value);
        if (!seconds || seconds < 1) {
            showToast('Please enter a valid number of seconds.', 'error');
            return;
        }
    } else {
        seconds = parseInt(disableDurationSelect.value);
    }

    disableBlockingBtn.disabled = true;
    disableBlockingBtn.textContent = 'Disabling...';

    try {
        const response = await fetch('/api/blocking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocking: false, timer: seconds })
        });
        const result = await response.json();

        if (result.success) {
            blockingDisabledUntil = Date.now() + (seconds * 1000);
            updateBlockingUI(false, null);
            const label = seconds < 60 ? `${seconds}s` : `${seconds / 60}m`;
            showToast(`Blocking disabled for ${label}`, 'warning');
        } else {
            showToast(`Failed to disable blocking: ${result.error}`, 'error');
        }
    } catch (e) {
        showToast('Failed to disable blocking.', 'error');
    } finally {
        disableBlockingBtn.disabled = false;
        disableBlockingBtn.textContent = 'Disable Blocking';
    }
}

async function handleEnableBlocking() {
    enableBlockingBtn.disabled = true;
    enableBlockingBtn.textContent = 'Enabling...';

    try {
        const response = await fetch('/api/blocking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocking: true })
        });
        const result = await response.json();

        if (result.success) {
            blockingDisabledUntil = null;
            updateBlockingUI(true, null);
            showToast('Blocking re-enabled.', 'success');
        } else {
            showToast(`Failed to enable blocking: ${result.error}`, 'error');
        }
    } catch (e) {
        showToast('Failed to enable blocking.', 'error');
    } finally {
        enableBlockingBtn.disabled = false;
        enableBlockingBtn.textContent = 'Re-enable Now';
    }
}

// ── Search ────────────────────────────────────────────────────────────────────

function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    filteredDomains = searchTerm === ''
        ? [...persistentDomains]
        : persistentDomains.filter(item => item.domain.toLowerCase().includes(searchTerm));
    renderBlockedList();
}

// ── Render ────────────────────────────────────────────────────────────────────

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

// ── Whitelist ─────────────────────────────────────────────────────────────────

async function addToWhitelist(domain) {
    const itemEl = document.querySelector(`[data-domain="${domain}"]`);
    if (!itemEl) return;

    const button = itemEl.querySelector('.btn-allow');
    button.disabled = true;
    button.textContent = 'Adding...';
    itemEl.classList.add('whitelisting');

    try {
        const response = await fetch('/api/whitelist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain }),
        });
        const result = await response.json();

        if (result.success) {
            showToast(`Successfully whitelisted: ${domain}`, 'success');
            blockedDomains = blockedDomains.filter(item => item.domain !== domain);
            persistentDomains = persistentDomains.filter(item => item.domain !== domain);
            filteredDomains = filteredDomains.filter(item => item.domain !== domain);
            itemEl.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => { renderBlockedList(); }, 300);
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

// ── Utilities ─────────────────────────────────────────────────────────────────

function showLoading(show) {
    loadingEl.style.display = show ? 'block' : 'none';
    refreshBtn.disabled = show;
}

function showError(message) {
    errorMessageEl.textContent = message;
    errorMessageEl.style.display = 'block';
}

function hideError() {
    errorMessageEl.style.display = 'none';
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => { document.body.removeChild(toast); }, 300);
    }, 3000);
}

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

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        to { opacity: 0; transform: translateX(20px); }
    }
    @keyframes slideOut {
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
