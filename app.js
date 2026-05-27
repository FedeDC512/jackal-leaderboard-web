// DOM Elements
let loadingEl, errorEl, errorMessageEl, leaderboardEl, leaderboardListEl, lastUpdateTimeEl, lastUpdateLabelEl;
let connectionStatusEl, statusTextEl, leaderboardTitleEl, countdownContainerEl;
let versionButtons, archivesBtnEl, archivesDropdownEl;
let bgMusicEl, musicBtnEl, desktopCountdownSlotEl, mobileCountdownParentEl, mobileCountdownNextEl, sideTextEl;

// Countdown elements
let countdownEl, countdownExpiredEl;
let countdownDaysEl, countdownHoursEl, countdownMinutesEl, countdownSecondsEl;

// Countdown target at 23:59 Italian time (CET = UTC+1)
const COUNTDOWN_TARGET = new Date('2026-05-31T21:59:59Z');

// App state
let leaderboardData = {};
let leaderboardV1Data = null;
let leaderboardV2Data = null;
let leaderboardV3Data = null;
let leaderboardV4Data = null;
let currentVersion = 'contest'; // 'current', 'contest', 'v1', 'v2', 'v3', 'v4'
let isInitialDataLoaded = false;
let isConnected = false;

// Version config — edit labels and dates here
const VERSIONS = {
    current: { label: 'Current',       title: 'Current' },
    contest: { label: 'Bari', title: 'LevanteFor 2026', dates: { start: '2026-05-30', end: '2026-05-31' } },
    v4:      { label: 'Trapani', title: 'Trapani Comix & Games 2026', dates: { start: '2026-05-22', end: '2026-05-24' } },
    v3:      { label: 'Second Wave',   title: 'Second Wave',      dates: { start: '2026-01-18', end: '2026-05-21' } },
    v2:      { label: 'Ostello Bello', title: 'Ostello Bello 2026',    dates: { start: '2026-02-18', end: '2026-02-18' } },
    v1:      { label: 'First Wave',       title: 'First Wave: Release',   dates: { start: '2025-12-16', end: '2026-01-17' } }
};

// Loading timeout (10 seconds)
const LOADING_TIMEOUT = 10000;
let loadingTimeoutId = null;

// Reconnecting timeout (20 seconds before showing Disconnected)
const RECONNECTING_TIMEOUT = 20000;
let reconnectingTimeoutId = null;

// Firebase references for cleanup
let leaderboardRef = null;
let connectedRef = null;

async function init() {
    // Initialize DOM references
    loadingEl = document.getElementById('loading');
    errorEl = document.getElementById('error');
    errorMessageEl = document.getElementById('error-message');
    leaderboardEl = document.getElementById('leaderboard');
    leaderboardListEl = document.getElementById('leaderboard-list');
    lastUpdateTimeEl = document.getElementById('last-update-time');
    lastUpdateLabelEl = document.getElementById('last-update-label');
    connectionStatusEl = document.getElementById('connection-status');
    statusTextEl = document.getElementById('status-text');
    leaderboardTitleEl = document.getElementById('leaderboard-title');
    versionButtons = document.querySelectorAll('.version-btn');

    // Populate all button/dropdown labels from VERSIONS config
    document.querySelectorAll('[data-version]').forEach(el => {
        const v = VERSIONS[el.dataset.version];
        if (v) el.textContent = v.label;
    });
    archivesBtnEl = document.getElementById('archives-btn');
    archivesDropdownEl = document.getElementById('archives-dropdown');

    // Initialize countdown elements
    countdownContainerEl = document.querySelector('.countdown-container');
    countdownEl = document.getElementById('countdown');
    countdownExpiredEl = document.getElementById('countdown-expired');
    countdownDaysEl = document.getElementById('countdown-days');
    countdownHoursEl = document.getElementById('countdown-hours');
    countdownMinutesEl = document.getElementById('countdown-minutes');
    countdownSecondsEl = document.getElementById('countdown-seconds');

    // Initialize side panel elements
    bgMusicEl = document.getElementById('bg-music');
    musicBtnEl = document.getElementById('music-btn');
    desktopCountdownSlotEl = document.getElementById('countdown-desktop-slot');
    sideTextEl = document.querySelector('.side-text');
    mobileCountdownParentEl = countdownContainerEl.parentElement;
    mobileCountdownNextEl = countdownContainerEl.nextSibling;

    // Start countdown timer
    initCountdown();

    // Initialize side panels (countdown relocation + background music)
    initSidePanels();

    // Trigger default version on load
    switchVersion(currentVersion);
    
    // Setup version button listeners
    versionButtons.forEach(btn => {
        if (btn.id === 'archives-btn') return;
        btn.addEventListener('click', () => switchVersion(btn.dataset.version));
    });

    archivesBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        archivesDropdownEl.classList.toggle('hidden');
    });

    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => switchVersion(item.dataset.version));
    });

    document.addEventListener('click', () => {
        archivesDropdownEl.classList.add('hidden');
    });
    
    // Load static JSON data for v1, v2 and v3
    await loadStaticLeaderboards();
    
    // Set loading timeout
    loadingTimeoutId = setTimeout(onLoadingTimeout, LOADING_TIMEOUT);
    
    // Connect to Firebase (no authentication required)
    try {
        console.log('Connecting to Firebase...');
        
        // Monitor connection state
        connectedRef = database.ref('.info/connected');
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) {
                // Connected: cancel any pending timeout
                if (reconnectingTimeoutId) {
                    clearTimeout(reconnectingTimeoutId);
                    reconnectingTimeoutId = null;
                }
                setConnectionStatus('connected');
            } else {
                if (isInitialDataLoaded) {
                    // Show Reconnecting first
                    setConnectionStatus('reconnecting');
                    
                    // After timeout, show Disconnected
                    if (reconnectingTimeoutId) {
                        clearTimeout(reconnectingTimeoutId);
                    }
                    reconnectingTimeoutId = setTimeout(() => {
                        if (!isConnected) {
                            setConnectionStatus('disconnected');
                        }
                    }, RECONNECTING_TIMEOUT);
                }
            }
        });
        
        // Connect to database
        leaderboardRef = database.ref('Leaderboard');
        
        // Listen for real-time changes
        leaderboardRef.on('value', onDataReceived, onDataError);
    } catch (error) {
        console.error('Login error:', error);
        showError('Connection error.\nPlease try again later.');
    }
}

async function loadStaticLeaderboards() {
    try {
        const [v1Response, v2Response, v3Response, v4Response] = await Promise.all([
            fetch('leaderboard-v1-export.json'),
            fetch('leaderboard-v2-export.json'),
            fetch('leaderboard-v3-export.json'),
            fetch('leaderboard-v4-export.json')
        ]);
        leaderboardV1Data = (await v1Response.json()).Leaderboard || {};
        leaderboardV2Data = (await v2Response.json()).Leaderboard || {};
        leaderboardV3Data = (await v3Response.json()).Leaderboard || {};
        leaderboardV4Data = (await v4Response.json()).Leaderboard || {};
    } catch (error) {
        console.error('Error loading static leaderboards:', error);
    }
}

function switchVersion(version) {
    currentVersion = version;
    const isArchive = ['v1', 'v2', 'v3', 'v4'].includes(version);

    // Update button states
    versionButtons.forEach(btn => {
        if (btn.id === 'archives-btn') {
            btn.classList.toggle('active', isArchive);
        } else {
            btn.classList.toggle('active', btn.dataset.version === version);
        }
    });

    // Update leaderboard title label
    if (version === 'current') {
        leaderboardTitleEl.classList.add('hidden');
    } else {
        leaderboardTitleEl.textContent = VERSIONS[version]?.title || '';
        leaderboardTitleEl.classList.remove('hidden');
    }

    // Close dropdown
    archivesDropdownEl.classList.add('hidden');

    // Show countdown and promo text only for Trapani Comix
    const isContest = version === 'contest';
    countdownContainerEl.classList.toggle('hidden', !isContest);
    if (sideTextEl) sideTextEl.classList.toggle('hidden', !isContest);

    // Update connection status visibility
    if (version === 'current' || version === 'contest') {
        connectionStatusEl.style.display = 'flex';
    } else {
        connectionStatusEl.style.display = 'none';
    }

    // Re-render leaderboard with appropriate data
    updateLeaderboard();
    showLeaderboard();
    updateLastUpdateTime();
}

function onLoadingTimeout() {
    if (!isInitialDataLoaded) {
        showError('Connection timeout!\nPlease check your internet connection.');
    }
}

function onDataReceived(snapshot) {
    // Cancel timeout if exists
    if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
    }
    
    isInitialDataLoaded = true;
    
    const data = snapshot.val();
    
    if (data) {
        leaderboardData = data;
        updateLeaderboard();
        showLeaderboard();
    } else {
        // Empty database
        leaderboardData = {};
        updateLeaderboard();
        showLeaderboard();
    }
    
    // Update timestamp
    updateLastUpdateTime();
}

function onDataError(error) {
    console.error('Database error:', error);
    setConnectionStatus('disconnected');
    showError('Database connection error.\nPlease try again later.');
}

function setConnectionStatus(status) {
    if (!connectionStatusEl || !statusTextEl) return;
    
    connectionStatusEl.className = 'connection-status ' + status;
    
    switch (status) {
        case 'connected':
            statusTextEl.textContent = 'Live';
            isConnected = true;
            break;
        case 'disconnected':
            statusTextEl.textContent = 'Disconnected';
            isConnected = false;
            break;
        case 'reconnecting':
            statusTextEl.textContent = 'Reconnecting...';
            isConnected = false;
            break;
    }
}

function showError(message) {
    setConnectionStatus('disconnected');
    loadingEl.classList.add('hidden');
    leaderboardEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    errorMessageEl.textContent = message;
}

function showLeaderboard() {
    loadingEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    leaderboardEl.classList.remove('hidden');
}

function updateLeaderboard() {
    // Select data based on current version
    let dataToDisplay;
    switch (currentVersion) {
        case 'v1':
            dataToDisplay = leaderboardV1Data || {};
            break;
        case 'v2':
            dataToDisplay = leaderboardV2Data || {};
            break;
        case 'v3':
            dataToDisplay = leaderboardV3Data || {};
            break;
        case 'v4':
            dataToDisplay = leaderboardV4Data || {};
            break;
        case 'contest': {
            const { start, end } = VERSIONS.contest.dates;
            const endExclusive = end.slice(0, 8) + String(parseInt(end.slice(8)) + 1).padStart(2, '0');
            const filtered = {};
            for (const key in leaderboardData) {
                const item = leaderboardData[key];
                if (item && item.datetime && item.datetime >= start && item.datetime < endExclusive) {
                    filtered[key] = item;
                }
            }
            dataToDisplay = filtered;
            break;
        }
        default:
            dataToDisplay = leaderboardData;
    }

    // Convert data to array
    const entries = [];

    for (const key in dataToDisplay) {
        const item = dataToDisplay[key];

        // Check if it's an object with score
        if (item && typeof item === 'object' && 'score' in item) {
            entries.push({
                name: key,
                score: parseInt(item.score) || 0,
                time: item.time != null ? parseFloat(item.time).toFixed(2) : null // Add time in seconds
            });
        }
    }

    // Sort by score descending, then by time descending if scores are equal
    entries.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        // If scores equal, sort by time descending (larger first)
        const ta = parseFloat(a.time) || 0;
        const tb = parseFloat(b.time) || 0;
        return tb - ta;
    });

    // Generate HTML
    leaderboardListEl.innerHTML = '';

    if (entries.length === 0) {
        leaderboardListEl.innerHTML = '<li class="leaderboard-entry"><span class="player-name" style="text-align: center; width: 100%;">No scores registered</span></li>';
        return;
    }

    entries.forEach((entry, index) => {
        const rank = index + 1;
        const displayName = entry.name;
        const isTop10 = rank <= 10;

        const li = document.createElement('li');
        li.className = `leaderboard-entry${isTop10 ? ` top-10 rank-${rank}` : ''}`;
        li.innerHTML = `
            <span class="rank">${getRankDisplay(rank)}</span>
            <span class="player-name">${escapeHtml(displayName)}</span>
            <span class="score">${entry.score.toLocaleString()}${entry.time && currentVersion !== 'v1' ? `<span class='time'> ${entry.time}s</span>` : ''}</span>
        `;

        leaderboardListEl.appendChild(li);
    });
}

function getRankDisplay(rank) {
    switch (rank) {
        case 1: return '🥇';
        case 2: return '🥈';
        case 3: return '🥉';
        default: return `#${rank}`;
    }
}

function truncateName(name, maxLength) {
    if (name.length <= maxLength) {
        return name;
    }
    return name.substring(0, maxLength - 3) + '...';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateLastUpdateTime() {
    if (currentVersion === 'current' || currentVersion === 'contest') {
        if (lastUpdateLabelEl) lastUpdateLabelEl.textContent = 'Last update';
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        lastUpdateTimeEl.textContent = timeString;
    } else {
        // Show date range for archived leaderboards
        if (lastUpdateLabelEl) lastUpdateLabelEl.textContent = 'Active';
        const dates = VERSIONS[currentVersion]?.dates;
        if (dates) {
            const startDate = new Date(dates.start);
            const endDate = new Date(dates.end);
            const formatDate = (date) => date.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
            lastUpdateTimeEl.textContent = `${formatDate(startDate)} - ${formatDate(endDate)}`;
        } else {
            lastUpdateTimeEl.textContent = '--';
        }
    }
}

function cleanup() {
    console.log('Cleaning up Firebase connections...');
    
    // Clear any pending timeouts
    if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
    }
    if (reconnectingTimeoutId) {
        clearTimeout(reconnectingTimeoutId);
        reconnectingTimeoutId = null;
    }
    
    // Disconnect Firebase listeners
    if (leaderboardRef) {
        leaderboardRef.off();
        leaderboardRef = null;
    }
    if (connectedRef) {
        connectedRef.off();
        connectedRef = null;
    }
    
    // Sign out from Firebase Auth
    if (firebase.auth().currentUser) {
        firebase.auth().signOut();
    }
}

// Countdown Timer
function initCountdown() {
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    const now = new Date();
    const diff = COUNTDOWN_TARGET - now;
    
    if (diff <= 0) {
        if (countdownEl) countdownEl.classList.add('hidden');
        if (countdownExpiredEl) countdownExpiredEl.classList.remove('hidden');
        return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    // Hide days container if days is 0
    const daysContainer = document.getElementById('countdown-days-container');
    if (daysContainer) {
        daysContainer.style.display = days === 0 ? 'none' : 'flex';
    }
    
    if (countdownDaysEl) countdownDaysEl.textContent = String(days).padStart(2, '0');
    if (countdownHoursEl) countdownHoursEl.textContent = String(hours).padStart(2, '0');
    if (countdownMinutesEl) countdownMinutesEl.textContent = String(minutes).padStart(2, '0');
    if (countdownSecondsEl) countdownSecondsEl.textContent = String(seconds).padStart(2, '0');
}

// Side panels
function initSidePanels() {
    relocateCountdown();
    window.addEventListener('resize', relocateCountdown);
    initBgMusic();
}

function relocateCountdown() {
    if (!desktopCountdownSlotEl) return;
    if (window.innerWidth >= 1120) {
        desktopCountdownSlotEl.appendChild(countdownContainerEl);
    } else {
        mobileCountdownParentEl.insertBefore(countdownContainerEl, mobileCountdownNextEl);
    }
}

const ICON_SOUND = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2 14.959V9.04C2 8.466 2.448 8 3 8h3.586a.98.98 0 0 0 .707-.305l3-3.388c.63-.656 1.707-.191 1.707.736v13.914c0 .934-1.09 1.395-1.716.726l-2.99-3.369A.98.98 0 0 0 6.578 16H3c-.552 0-1-.466-1-1.041M16 8.5c1.333 1.778 1.333 5.222 0 7M19 5c3.988 3.808 4.012 10.217 0 14"/></svg>`;
const ICON_MUTED = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"><path d="m22 15l-6-6m6 0l-6 6"/><path stroke-linejoin="round" d="M2 14.959V9.04C2 8.466 2.448 8 3 8h3.586a.98.98 0 0 0 .707-.305l3-3.388c.63-.656 1.707-.191 1.707.736v13.914c0 .934-1.09 1.395-1.716.726l-2.99-3.369A.98.98 0 0 0 6.578 16H3c-.552 0-1-.466-1-1.041"/></g></svg>`;

function initBgMusic() {
    if (!bgMusicEl || !musicBtnEl) return;
    // Start muted by default — user must click to enable
    bgMusicEl.pause();
    musicBtnEl.innerHTML = ICON_MUTED;
    musicBtnEl.addEventListener('click', toggleMusic);
}

function toggleMusic() {
    if (!bgMusicEl) return;
    if (bgMusicEl.paused) {
        bgMusicEl.play();
        musicBtnEl.innerHTML = ICON_SOUND;
    } else {
        bgMusicEl.pause();
        musicBtnEl.innerHTML = ICON_MUTED;
    }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Cleanup when page is closed or reloaded
window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);
