const API_BASE = 'https://hermivore.cat';
const REVIEWS_PER_PAGE = 10;
const FALLBACK_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#c8ccd0"/><circle cx="24" cy="18" r="9" fill="#9aa0a6"/><path d="M6 44c2-10 10-15 18-15s16 5 18 15z" fill="#9aa0a6"/></svg>`
);

let currentUser = null;
let targetId = null;
let targetUsername = '';
let allReviews = [];
let profileRating = { up: [], down: [] };
let currentPage = 1;
let bulkDeleteMode = false;
let bulkDeleteSelection = new Set();
const avatarCache = {};

// --- Utils ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function bgLuminance(el) {
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (a < 0.1) return null;
    return 0.299 * (+m[1]) + 0.587 * (+m[2]) + 0.114 * (+m[3]);
}

function isPageDark() {
    const l = bgLuminance(document.body) ?? bgLuminance(document.documentElement);
    return l !== null && l < 110;
}

async function fetchUsername(userId) {
    try {
        const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        if (res.ok) {
            const data = await res.json();
            return data.name || data.displayName || 'User';
        }
    } catch (e) {}
    return 'User';
}

async function ensureAvatars(ids) {
    const missing = [...new Set(ids)].filter(id => !(id in avatarCache));
    if (!missing.length) return;
    for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        try {
            const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${chunk.join(',')}&size=150x150&format=Png&isCircular=false`);
            if (res.ok) {
                const j = await res.json();
                (j.data || []).forEach(d => {
                    if (d.state === 'Completed' && d.imageUrl) avatarCache[d.targetId] = d.imageUrl;
                });
            }
        } catch (e) { console.warn("Avatar fetch failed:", e); }
    }
    missing.forEach(id => { if (!(id in avatarCache)) avatarCache[id] = FALLBACK_AVATAR; });
}

// --- API wrapper ---
async function apiCall(url, options = {}) {
    if (currentUser && currentUser.session_token) {
        options.headers = { ...options.headers, 'Authorization': `Bearer ${currentUser.session_token}` };
    }
    const res = await fetch(url, options);
    const data = await res.json();
    if (data.error && (data.reason === "Validation Required" || data.reason === "Invalid JWT")) {
        logout();
        showAuthUI('error', 'Session expired. Please log in again.');
        throw new Error('Session expired');
    }
    if (data.error) throw new Error(data.reason || 'Unknown API error');
    return data;
}

// --- State ---
async function loadState() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['session_token', 'user_id', 'username'], (result) => {
            if (result.session_token) {
                currentUser = { id: result.user_id, name: result.username, session_token: result.session_token };
            }
            resolve();
        });
    });
}

async function saveState() {
    return new Promise((resolve) => {
        chrome.storage.local.set({
            session_token: currentUser.session_token,
            user_id: currentUser.id,
            username: currentUser.name
        }, resolve);
    });
}

function logout() {
    chrome.storage.local.remove(['session_token', 'user_id', 'username'], () => {
        currentUser = null;
        renderAuthState();
        updateSummary();   // clears the active vote highlight
        renderPage();
    });
}

// --- Auth flows ---
async function login() {
    showAuthUI('loading', 'Initiating login...');
    try {
        const challengeRes = await fetch(`${API_BASE}/api/roblox/oauth/challenge`, { method: 'POST' });
        if (!challengeRes.ok) throw new Error('OAuth challenge failed');
        const challenge = await challengeRes.json();
        const authWindow = window.open(challenge.auth_url, 'Roblox OAuth', 'width=800,height=700,left=200,top=200');
        showAuthUI('pending', 'Waiting for Roblox authorization... (check the new tab)');
        let sessionToken = null;
        while (!sessionToken) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await (await fetch(`${API_BASE}/api/roblox/oauth/status/${challenge.session_id}`)).json();
            if (status.status === 'ok') {
                sessionToken = status.session_token;
                currentUser = { id: status.user_id, name: status.username, session_token: sessionToken };
                await saveState();
                break;
            } else if (status.status === 'expired') throw new Error('OAuth session expired');
        }
        if (authWindow && !authWindow.closed) authWindow.close();
        hideAuthUI();
        renderAuthState();
        await loadReviews();
    } catch (err) {
        console.warn('OAuth failed, falling back to Friend Oracle', err);
        await fallbackFriendOracle();
    }
}

async function fallbackFriendOracle() {
    try {
        const challengeRes = await fetch(`${API_BASE}/api/roblox/verify/challenge`, { method: 'POST' });
        if (!challengeRes.ok) throw new Error('Verify challenge failed');
        const challenge = await challengeRes.json();
        if (challenge.error) throw new Error(challenge.reason);
        showFriendOracleUI(challenge.bot_name, challenge.bot_id);
        let sessionToken = null;
        while (!sessionToken) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await (await fetch(`${API_BASE}/api/roblox/verify/status/${challenge.session_id}`)).json();
            if (status.status === 'ok') {
                sessionToken = status.session_token;
                currentUser = { id: status.user_id, name: status.username, session_token: sessionToken };
                await saveState();
                break;
            } else if (status.status === 'expired') throw new Error('Verification expired');
        }
        hideAuthUI();
        renderAuthState();
        await loadReviews();
    } catch (err) {
        showAuthUI('error', `Login failed: ${err.message}`);
    }
}

// --- Data ---
async function loadReviews() {
    try {
        const data = await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}`);
        allReviews = data.reviews || [];
        profileRating = data.profile_rating || { up: [], down: [] };
        updateSummary();
        renderAuthState();   // re-evaluate owner controls now that reviews are loaded
        await renderPage(1);
    } catch (e) { console.error(e); }
}

// --- Review Actions ---
async function submitReview() {
    const input = document.getElementById('hr-review-input');
    const content = input.value.trim();
    if (!content) return alert('Review cannot be empty.');
    if (content.length > 8000) return alert('Review is too long.');
    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        input.value = '';
        document.getElementById('hr-char-count').textContent = '0';
        await loadReviews();
    } catch (e) { alert(`Failed to submit review: ${e.message}`); }
}

async function editReview(reviewId, newContent) {
    if (!newContent.trim()) return alert('Review cannot be empty.');
    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/${reviewId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newContent })
        });
        await loadReviews();
    } catch (e) { alert(`Failed to edit review: ${e.message}`); }
}

async function deleteReview(reviewId) {
    if (!confirm('Are you sure you want to delete this review?')) return;
    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/${reviewId}`, { method: 'DELETE' });
        await loadReviews();
    } catch (e) { alert(`Failed to delete review: ${e.message}`); }
}

async function bulkDelete() {
    if (bulkDeleteSelection.size === 0) return alert('No users selected.');
    if (!confirm(`Delete all reviews from ${bulkDeleteSelection.size} selected user(s)? This can only be done once per day.`)) return;
    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_ids: [...bulkDeleteSelection] })
        });
        bulkDeleteMode = false;
        bulkDeleteSelection.clear();
        await loadReviews();
    } catch (e) { alert(`Bulk delete failed: ${e.message}`); }
}

async function rateReview(reviewId, vote) {
    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/${reviewId}/rate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vote })
        });
        await loadReviews();
    } catch (e) { alert(`Failed to rate review: ${e.message}`); }
}

async function rateProfile(vote) {
    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/rate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vote })
        });
        await loadReviews();
    } catch (e) { alert(`Failed to rate profile: ${e.message}`); }
}

// --- UI ---
function getReviewHTML() {
    return `
    <div id="hermivore-reviews-container" class="hermivore-reviews">
        <h2 class="hr-title">Reviews for <span id="hr-target-name">${escapeHtml(targetUsername)}</span></h2>

        <div class="hr-profile-rating">
            <span class="hr-profile-rating-label">Community Rating</span>
            <div class="hr-profile-rating-buttons">
                <button id="hr-profile-up" class="hr-profile-vote hr-profile-up" data-vote="up">👍 <span id="hr-profile-up-count">0</span></button>
                <button id="hr-profile-down" class="hr-profile-vote hr-profile-down" data-vote="down">👎 <span id="hr-profile-down-count">0</span></button>
            </div>
        </div>

        <div class="hr-summary">
            <span class="hr-score" id="hr-score-text">No reviews yet</span>
            <span class="hr-count" id="hr-review-count"></span>
        </div>

        <div id="hr-auth-panel" class="hr-auth-panel" style="display:none;"></div>
        <div id="hr-self-notice" class="hr-system-notice" style="display:none;">You cannot review your own profile.</div>

        <div id="hr-write-review" class="hr-write-review" style="display:none;">
            <textarea id="hr-review-input" placeholder="Share your thoughts about this user..." maxlength="8000"></textarea>
            <div class="hr-write-actions">
                <button id="hr-submit-review" class="hrv-btn-primary">Post Review</button>
                <span class="hr-char-count"><span id="hr-char-count">0</span>/8000</span>
            </div>
        </div>

        <div id="hr-login-prompt" class="hr-login-prompt">
            <button id="hr-login-btn" class="hrv-btn-primary">Log in to write a review</button>
        </div>

        <div id="hr-bulk-bar" class="hr-bulk-bar" style="display:none;">
            <span id="hr-bulk-count">0 selected</span>
            <button id="hr-bulk-confirm" class="hrv-btn-primary" style="background:var(--hrv-red);">Delete Selected</button>
            <button id="hr-bulk-cancel" class="hrv-btn-secondary">Cancel</button>
        </div>

        <div id="hr-reviews-list" class="hr-reviews-list"></div>
        <div id="hr-pagination" class="hr-pagination"></div>

        <div class="hr-footer">
            <div class="hr-footer-left">
                <button id="hr-bulk-delete-btn" class="hrv-btn-link" style="display:none;">Bulk Delete</button>
                <button id="hr-logout-btn" class="hrv-btn-link" style="display:none;">Log out</button>
            </div>
            <a href="mailto:support@hermivore.cat?subject=Review Report (Profile ${targetId})" class="hrv-btn-link hr-report-link">Report abuse</a>
        </div>
    </div>`;
}

function injectCSS() {
    if (document.getElementById('hermivore-styles')) return;
    const style = document.createElement('style');
    style.id = 'hermivore-styles';
    style.textContent = `
        .hermivore-reviews{
            --hrv-bg:#ffffff; --hrv-surface:#f7f7f8; --hrv-border:#e0e2e6;
            --hrv-text:#191a1e; --hrv-text-2:#62666e;
            --hrv-blue:#335fff; --hrv-blue-hover:#2b50e0;
            --hrv-green:#2f8f5b; --hrv-red:#d64545;
            font-family:"Builder Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
            background:var(--hrv-bg); color:var(--hrv-text);
            border:1px solid var(--hrv-border); border-radius:12px;
            padding:24px; margin:32px auto; max-width:960px;
            font-size:14px; line-height:1.45; box-sizing:border-box;
        }
        .hermivore-reviews.hrv-dark{
            --hrv-bg:#202127; --hrv-surface:#272930; --hrv-border:#383a41;
            --hrv-text:#f7f7f8; --hrv-text-2:#a0a3ab;
            --hrv-blue:#5b7cff; --hrv-blue-hover:#7590ff;
            --hrv-green:#56ac72; --hrv-red:#e5484d;
        }
        .hermivore-reviews *{box-sizing:border-box;}
        .hr-title{font-size:20px;font-weight:700;margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid var(--hrv-border);}
        .hr-profile-rating{background:var(--hrv-surface);border:1px solid var(--hrv-border);border-radius:8px;padding:14px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
        .hr-profile-rating-label{font-weight:700;font-size:15px;}
        .hr-profile-rating-buttons{display:flex;gap:8px;}
        .hr-profile-vote{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid var(--hrv-border);color:var(--hrv-text-2);border-radius:8px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;transition:all .15s;}
        .hr-profile-vote:hover{background:var(--hrv-bg);}
        .hr-profile-up.active{color:var(--hrv-green);border-color:var(--hrv-green);background:color-mix(in srgb,var(--hrv-green) 10%,transparent);}
        .hr-profile-down.active{color:var(--hrv-red);border-color:var(--hrv-red);background:color-mix(in srgb,var(--hrv-red) 10%,transparent);}
        .hr-summary{background:var(--hrv-surface);border:1px solid var(--hrv-border);border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:baseline;gap:8px;}
        .hr-score{font-weight:700;font-size:16px;}
        .hr-count{color:var(--hrv-text-2);font-size:13px;}
        .hr-system-notice{background:var(--hrv-surface);border:1px solid var(--hrv-border);color:var(--hrv-text-2);border-radius:8px;padding:12px 16px;margin-bottom:16px;text-align:center;}
        .hrv-btn-primary{background:var(--hrv-blue);color:#fff;border:none;border-radius:8px;padding:9px 18px;font:inherit;font-weight:600;cursor:pointer;}
        .hrv-btn-primary:hover{background:var(--hrv-blue-hover);}
        .hrv-btn-secondary{background:var(--hrv-surface);color:var(--hrv-text);border:1px solid var(--hrv-border);border-radius:8px;padding:8px 16px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;text-align:center;}
        .hrv-btn-link{background:none;border:none;padding:0;color:var(--hrv-blue);font:inherit;font-weight:600;cursor:pointer;text-decoration:none;}
        .hrv-btn-link:hover{text-decoration:underline;}
        .hr-auth-panel{background:var(--hrv-surface);border:1px solid var(--hrv-border);border-radius:8px;padding:16px;margin-bottom:16px;}
        .hr-auth-panel h3{margin:0 0 8px;font-size:16px;}
        .hr-bot-info{background:var(--hrv-bg);border:1px solid var(--hrv-border);padding:10px 12px;margin:10px 0;border-radius:8px;font-weight:600;}
        .hr-write-review{margin-bottom:20px;}
        .hr-write-review textarea{width:100%;min-height:96px;background:var(--hrv-bg);color:var(--hrv-text);border:1px solid var(--hrv-border);border-radius:8px;padding:10px 12px;font:inherit;resize:vertical;}
        .hr-write-review textarea:focus{outline:none;border-color:var(--hrv-blue);}
        .hr-write-actions{display:flex;justify-content:space-between;align-items:center;margin-top:10px;}
        .hr-char-count{color:var(--hrv-text-2);font-size:12px;}
        .hr-login-prompt{text-align:center;margin-bottom:20px;}
        .hr-bulk-bar{background:var(--hrv-surface);border:1px solid var(--hrv-border);border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;}
        .hr-bulk-bar span{font-weight:600;}
        .hr-review{background:var(--hrv-surface);border:1px solid var(--hrv-border);border-radius:8px;padding:16px;margin-bottom:12px;position:relative;transition:border-color .15s;}
        .hr-review.hr-bulk-selected{border-color:var(--hrv-red);background:color-mix(in srgb,var(--hrv-red) 5%,var(--hrv-surface));}
        .hr-review-header{display:flex;align-items:center;margin-bottom:10px;gap:12px;}
        .hr-avatar{width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--hrv-bg);flex-shrink:0;}
        .hr-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
        .hr-review-meta{flex-grow:1;min-width:0;}
        .hr-author{color:var(--hrv-text);font-weight:700;text-decoration:none;font-size:14px;}
        .hr-author:hover{color:var(--hrv-blue);}
        .hr-date,.hr-edited{color:var(--hrv-text-2);font-size:12px;margin-left:8px;}
        .hr-review-actions button{margin-left:12px;font-size:13px;}
        .hr-review-body{color:var(--hrv-text);white-space:pre-wrap;margin-bottom:12px;}
        .hr-edit-textarea{width:100%;min-height:80px;background:var(--hrv-bg);color:var(--hrv-text);border:1px solid var(--hrv-border);border-radius:8px;padding:10px 12px;font:inherit;}
        .hr-review-rating{margin-left:auto;align-self:center;color:var(--hrv-text-2);font-size:12px;}
        .hr-vote-btn{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid var(--hrv-border);color:var(--hrv-text-2);border-radius:8px;padding:6px 12px;font:inherit;font-weight:600;cursor:pointer;}
        .hr-vote-btn:hover{background:var(--hrv-bg);}
        .hr-upvote.active{color:var(--hrv-green);border-color:var(--hrv-green);}
        .hr-downvote.active{color:var(--hrv-red);border-color:var(--hrv-red);}
        .hr-pagination{display:flex;justify-content:center;gap:8px;margin-top:16px;flex-wrap:wrap;}
        .btn-page{min-width:34px;height:34px;background:var(--hrv-bg);border:1px solid var(--hrv-border);color:var(--hrv-text);border-radius:8px;cursor:pointer;font:inherit;font-weight:600;padding:0 10px;}
        .btn-page.active{background:var(--hrv-blue);border-color:var(--hrv-blue);color:#fff;}
        .btn-page:hover:not(.active){background:var(--hrv-surface);}
        .hr-footer{display:flex;justify-content:space-between;align-items:center;margin-top:16px;}
        .hr-footer-left{display:flex;gap:16px;align-items:center;}
        .hr-report-link{color:var(--hrv-text-2) !important;font-weight:400 !important;font-size:12px;}
    `;
    document.head.appendChild(style);
}

function applyTheme() {
    const el = document.getElementById('hermivore-reviews-container');
    if (el) el.classList.toggle('hrv-dark', isPageDark());
}

function showAuthUI(type, message) {
    const panel = document.getElementById('hr-auth-panel');
    panel.style.display = 'block';
    panel.innerHTML = `<h3>Authentication</h3><p style="color:${type === 'error' ? 'var(--hrv-red)' : 'var(--hrv-text-2)'};margin:0;">${message}</p>`;
}

function hideAuthUI() { document.getElementById('hr-auth-panel').style.display = 'none'; }

function showFriendOracleUI(botName, botId) {
    const panel = document.getElementById('hr-auth-panel');
    panel.style.display = 'block';
    panel.innerHTML = `
        <h3>Identity verification required</h3>
        <p style="margin:0;color:var(--hrv-text-2);">OAuth is unavailable. Send a friend request to our bot to verify:</p>
        <div class="hr-bot-info">${escapeHtml(botName)} (ID: ${botId})</div>
        <div style="display:flex;gap:10px;">
            <button id="hr-copy-bot" class="hrv-btn-secondary">Copy Bot ID</button>
            <a href="https://www.roblox.com/users/${botId}/profile" target="_blank" class="hrv-btn-secondary">Open Bot Profile</a>
        </div>
        <p style="margin:12px 0 0;color:var(--hrv-text-2);">Waiting for friend request...</p>
    `;
    document.getElementById('hr-copy-bot').onclick = () => {
        navigator.clipboard.writeText(botId.toString());
        document.getElementById('hr-copy-bot').textContent = 'Copied!';
    };
}

function updateSummary() {
    const reviewCount = allReviews.length;
    const uid = currentUser ? Number(currentUser.id) : null;
    const up = profileRating.up.length;
    const down = profileRating.down.length;
    const totalVotes = up + down;

    // Top summary: vote-based % + "(X votes | Y reviews)"
    const scoreEl = document.getElementById('hr-score-text');
    const countEl = document.getElementById('hr-review-count');

    countEl.textContent = `(${totalVotes} vote${totalVotes !== 1 ? 's' : ''} | ${reviewCount} review${reviewCount !== 1 ? 's' : ''})`;

    if (totalVotes === 0) {
        scoreEl.textContent = reviewCount === 0 ? 'No reviews yet' : 'No ratings yet';
        scoreEl.style.color = 'var(--hrv-text-2)';
    } else {
        const pct = Math.round((up / totalVotes) * 100);
        scoreEl.textContent = `${pct}% Positive`;
        scoreEl.style.color = pct >= 70 ? 'var(--hrv-green)' : (pct >= 40 ? 'var(--hrv-text)' : 'var(--hrv-red)');
    }

    // Community rating buttons: counts + highlight the caller's own vote
    document.getElementById('hr-profile-up-count').textContent = up;
    document.getElementById('hr-profile-down-count').textContent = down;
    document.getElementById('hr-profile-up').classList.toggle('active', uid !== null && profileRating.up.includes(uid));
    document.getElementById('hr-profile-down').classList.toggle('active', uid !== null && profileRating.down.includes(uid));
}

function renderReview(review) {
    const isAuthor = currentUser && String(review.from.id) === String(currentUser.id);
    const isProfileOwner = currentUser && String(currentUser.id) === String(targetId);
    const canEdit = isAuthor;
    const canDelete = isAuthor || isProfileOwner;

    const up = review.score?.up || 0;
    const down = review.score?.down || 0;
    const rTotal = up + down;
    const reviewRatingText = rTotal === 0
        ? 'No ratings yet'
        : `${Math.round((up / rTotal) * 100)}% positive (${rTotal} vote${rTotal !== 1 ? 's' : ''})`;
    const userVote = review.rating?.up?.includes(currentUser?.id) ? 'up' :
                     review.rating?.down?.includes(currentUser?.id) ? 'down' : null;
    const avatar = avatarCache[review.from.id] || FALLBACK_AVATAR;
    const isSelected = bulkDeleteSelection.has(review.from.id);

    return `
        <div class="hr-review ${isSelected ? 'hr-bulk-selected' : ''}" data-id="${review.id}" data-author-id="${review.from.id}">
            <div class="hr-review-header">
                <div class="hr-avatar"><img src="${avatar}" onerror="this.src='${FALLBACK_AVATAR}'"/></div>
                <div class="hr-review-meta">
                    <a href="https://www.roblox.com/users/${review.from.id}/profile" target="_blank" class="hr-author">${escapeHtml(review.from.name)}</a>
                    <span class="hr-date">${new Date(review.time * 1000).toLocaleDateString()}</span>
                    ${review.edited ? `<span class="hr-edited">(edited)</span>` : ''}
                </div>
                <div class="hr-review-actions">
                    ${canEdit && !bulkDeleteMode ? `<button class="hrv-btn-link hr-edit-btn">Edit</button>` : ''}
                    ${canDelete && !bulkDeleteMode ? `<button class="hrv-btn-link hr-delete-btn" style="color:var(--hrv-red);">Delete</button>` : ''}
                </div>
            </div>
            <div class="hr-review-body">${escapeHtml(review.content)}</div>
            <textarea class="hr-edit-textarea" style="display:none;">${escapeHtml(review.content)}</textarea>
            ${!bulkDeleteMode ? `
            <div class="hr-review-footer">
                <button class="hr-vote-btn hr-upvote ${userVote === 'up' ? 'active' : ''}" data-vote="up">👍 <span>${up}</span></button>
                <button class="hr-vote-btn hr-downvote ${userVote === 'down' ? 'active' : ''}" data-vote="down">👎 <span>${down}</span></button>
                <span class="hr-review-rating">${reviewRatingText}</span>
            </div>` : ''}
        </div>`;
}

function renderPagination(totalItems, page, perPage) {
    const totalPages = Math.ceil(totalItems / perPage);
    if (totalPages <= 1) return '';
    let html = '';
    if (page > 1) html += `<button class="btn-page" data-page="${page - 1}">‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="btn-page ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    if (page < totalPages) html += `<button class="btn-page" data-page="${page + 1}">›</button>`;
    return html;
}

async function renderPage(page = 1) {
    currentPage = page;
    const listEl = document.getElementById('hr-reviews-list');
    const paginationEl = document.getElementById('hr-pagination');
    if (!listEl) return;

    if (allReviews.length === 0) {
        listEl.innerHTML = `<div class="hr-system-notice">No reviews yet. Be the first to review!</div>`;
        paginationEl.innerHTML = '';
        return;
    }

    const sorted = [...allReviews].sort((a, b) => b.time - a.time);
    const start = (page - 1) * REVIEWS_PER_PAGE;
    const pageReviews = sorted.slice(start, start + REVIEWS_PER_PAGE);

    await ensureAvatars(pageReviews.map(r => r.from.id));

    listEl.innerHTML = pageReviews.map(renderReview).join('');
    paginationEl.innerHTML = renderPagination(allReviews.length, currentPage, REVIEWS_PER_PAGE);

    // Update bulk bar count
    if (bulkDeleteMode) {
        document.getElementById('hr-bulk-count').textContent = `${bulkDeleteSelection.size} user(s) selected`;
    }
}

function renderAuthState() {
    const loginPrompt = document.getElementById('hr-login-prompt');
    const writeReview = document.getElementById('hr-write-review');
    const logoutBtn = document.getElementById('hr-logout-btn');
    const selfNotice = document.getElementById('hr-self-notice');
    const bulkBtn = document.getElementById('hr-bulk-delete-btn');

    if (currentUser) {
        loginPrompt.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        if (String(currentUser.id) === String(targetId)) {
            writeReview.style.display = 'none';
            selfNotice.style.display = 'block';
            bulkBtn.style.display = allReviews.length > 0 ? 'inline-block' : 'none';
        } else {
            writeReview.style.display = 'block';
            selfNotice.style.display = 'none';
            bulkBtn.style.display = 'none';
        }
    } else {
        loginPrompt.style.display = 'block';
        writeReview.style.display = 'none';
        selfNotice.style.display = 'none';
        logoutBtn.style.display = 'none';
        bulkBtn.style.display = 'none';
    }
}

function toggleBulkMode(on) {
    bulkDeleteMode = on;
    bulkDeleteSelection.clear();
    document.getElementById('hr-bulk-bar').style.display = on ? 'flex' : 'none';
    document.getElementById('hr-bulk-count').textContent = '0 user(s) selected';
    renderPage(currentPage);
}

function attachEventListeners() {
    document.getElementById('hr-login-btn').onclick = login;
    document.getElementById('hr-logout-btn').onclick = logout;
    document.getElementById('hr-submit-review').onclick = submitReview;
    document.getElementById('hr-review-input').oninput = (e) => {
        document.getElementById('hr-char-count').textContent = e.target.value.length;
    };
    document.getElementById('hr-bulk-delete-btn').onclick = () => toggleBulkMode(true);
    document.getElementById('hr-bulk-confirm').onclick = bulkDelete;
    document.getElementById('hr-bulk-cancel').onclick = () => toggleBulkMode(false);

    // Profile vote buttons
    document.querySelectorAll('.hr-profile-vote').forEach(btn => {
        btn.onclick = async () => {
            if (!currentUser) { login(); return; }
            await rateProfile(btn.dataset.vote);
        };
    });

    document.getElementById('hermivore-reviews-container').addEventListener('click', async (e) => {
        const target = e.target;

        // Pagination
        if (target.classList.contains('btn-page')) { await renderPage(parseInt(target.dataset.page)); return; }

        // Bulk delete mode: clicking a review toggles selection by author
        if (bulkDeleteMode && target.closest('.hr-review')) {
            const reviewEl = target.closest('.hr-review');
            const authorId = parseInt(reviewEl.dataset.authorId);
            if (bulkDeleteSelection.has(authorId)) {
                bulkDeleteSelection.delete(authorId);
            } else {
                bulkDeleteSelection.add(authorId);
            }
            // Re-render to show selection state
            await renderPage(currentPage);
            return;
        }

        // Review voting
        if (target.closest('.hr-vote-btn')) {
            if (!currentUser) { login(); return; }
            const btn = target.closest('.hr-vote-btn');
            await rateReview(btn.closest('.hr-review').dataset.id, btn.dataset.vote);
            return;
        }

        // Delete single
        if (target.classList.contains('hr-delete-btn')) {
            await deleteReview(target.closest('.hr-review').dataset.id);
            return;
        }

        // Edit
        if (target.classList.contains('hr-edit-btn')) {
            const reviewEl = target.closest('.hr-review');
            const body = reviewEl.querySelector('.hr-review-body');
            const textarea = reviewEl.querySelector('.hr-edit-textarea');
            if (textarea.style.display === 'none') {
                body.style.display = 'none';
                textarea.style.display = 'block';
                target.textContent = 'Save';
            } else if (textarea.value.trim()) {
                await editReview(reviewEl.dataset.id, textarea.value.trim());
            }
        }
    });
}

// --- Init & SPA routing ---
async function init() {
    const match = window.location.pathname.match(/\/users\/(\d+)\//);
    if (!match) return;

    const newTargetId = match[1];
    if (newTargetId === targetId && document.getElementById('hermivore-reviews-container')) return;
    targetId = newTargetId;
    targetUsername = await fetchUsername(targetId);
    bulkDeleteMode = false;
    bulkDeleteSelection.clear();

    const observer = new MutationObserver((mutations, obs) => {
        const mainContent = document.querySelector('.content-main') || document.querySelector('main') || document.body;
        if (mainContent && !document.getElementById('hermivore-reviews-container')) {
            if (document.querySelector('.profile-header') || window.location.pathname.includes('/profile')) {
                obs.disconnect();
                injectCSS();
                mainContent.insertAdjacentHTML('beforeend', getReviewHTML());
                applyTheme();
                attachEventListeners();
                loadState().then(async () => {
                    renderAuthState();
                    await loadReviews();
                });
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        const old = document.getElementById('hermivore-reviews-container');
        if (old) old.remove();
        if (window.location.pathname.match(/\/users\/(\d+)\//)) init();
        else targetId = null;
    }
}).observe(document, { subtree: true, childList: true });

init();