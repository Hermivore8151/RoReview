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

async function fetchGameName(gameId) {
    try {
        const titleEl = document.querySelector('h1') || document.querySelector('.game-title') || document.querySelector('[class*="game-name"]');
        if (titleEl && titleEl.textContent.trim()) return titleEl.textContent.trim();
        if (document.title && !document.title.startsWith('Roblox')) {
            return document.title.replace(' - Roblox', '').trim() || 'Game';
        }
    } catch (e) {}
    try {
        const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${gameId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.data && data.data.length > 0 && data.data[0].name) return data.data[0].name;
        }
    } catch (e) {}
    return 'Game';
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

async function usernamesToIds(usernames) {
    if (!usernames.length) return {};
    try {
        const res = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames, excludeBannedUsers: false })
        });
        if (res.ok) {
            const data = await res.json();
            const map = {};
            (data.data || []).forEach(u => { map[u.requestedUsername.toLowerCase()] = u.id; });
            return map;
        }
    } catch (e) {}
    return {};
}

async function processMentionsOutgoing(text) {
    // Finds @username and replaces with @<userid>
    const matches = [...text.matchAll(/@([a-zA-Z0-9_]{3,20})/g)];
    if (!matches.length) return text;
    const usernames = [...new Set(matches.map(m => m[1]))];
    const idMap = await usernamesToIds(usernames);
    let processed = text;
    for (const name of usernames) {
        if (idMap[name.toLowerCase()]) {
            const regex = new RegExp(`@${name}\\b`, 'gi');
            processed = processed.replace(regex, `@<${idMap[name.toLowerCase()]}>`);
        }
    }
    return processed;
}

function localNameMap() {
    const map = {};
    if (currentUser) map[currentUser.id] = currentUser.name;
    if (targetId && targetUsername) map[targetId] = targetUsername;
    for (const r of allReviews) {
        if (r.from && r.from.id) map[r.from.id] = r.from.name;
        for (const rep of (r.replies || [])) {
            if (rep.from && rep.from.id) map[rep.from.id] = rep.from.name;
            if (rep.reply_to && rep.reply_to.id) map[rep.reply_to.id] = rep.reply_to.name;
        }
    }
    return map;
}
async function ensureUsernames(ids) {
    const missing = [...new Set(ids)].filter(id => !(id in usernameCache));
    if (!missing.length) return;

    // Resolve local
    const local = localNameMap();
    const stillMissing = [];
    for (const id of missing) {
        if (local[id]) usernameCache[id] = local[id];
        else stillMissing.push(id);
    }
    if (!stillMissing.length) return;

    // Process in chunks of 100 to respect Roblox API payload limits
    for (let i = 0; i < stillMissing.length; i += 100) {
        const chunk = stillMissing.slice(i, i + 100).map(id => Number(id)); // Ensure they are numbers for the JSON payload
        
        try {
            const res = await fetch('https://users.roblox.com/v1/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: chunk, excludeBannedUsers: false })
            });
            
            if (res.ok) {
                const j = await res.json();
                (j.data || []).forEach(d => {
                    usernameCache[d.id] = d.name || d.displayName || 'User';
                });
            } else {
                console.warn(`Bulk username fetch failed: ${res.status}`);
            }
        } catch (e) { 
            console.warn('Bulk username fetch failed', e); 
        }
    }

    // 3) Per-id fallback for anything the bulk call missed or failed on
    // This uses your existing fetchUsername() which does GET /users/{id}
    for (const id of stillMissing) {
        if (!(id in usernameCache)) {
            usernameCache[id] = await fetchUsername(id);
        }
    }
}

async function renderContentWithMentions(text) {
    // Finds @<userid> and replaces with clickable @username link
    const matches = [...text.matchAll(/@<(\d+)>/g)];
    let escaped = escapeHtml(text);
    if (!matches.length) return escaped;
    
    const ids = [...new Set(matches.map(m => m[1]))];
    await ensureUsernames(ids);
    
    for (const id of ids) {
        const name = usernameCache[id] || 'User';
        const safeName = escapeHtml(name);
        // Because we escaped the text, < and > are now &lt; and &gt;
        const regex = new RegExp(`@&lt;${id}&gt;`, 'g');
        escaped = escaped.replace(regex, `<a href="https://www.roblox.com/users/${id}/profile" target="_blank" class="hr-mention">@${safeName}</a>`);
    }
    return escaped;
}