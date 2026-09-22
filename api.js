async function apiCall(url, options = {}) {
    if (currentUser && currentUser.session_token) {
        options.headers = { ...options.headers, 'Authorization': `Bearer ${currentUser.session_token}` };
    }
    const res = await remoteFetch(url, options);
    const data = await res.json();
    if (data.error && (data.reason === "Validation Required" || data.reason === "Invalid JWT")) {
        logout();
        UI.showAuthUI('error', 'Session expired. Please log in again.');
        throw new Error('Session expired');
    }
    if (data.error) throw new Error(data.reason || 'Unknown API error');
    return data;
}

async function login() {
    const authWindow = window.open('about:blank', 'Roblox OAuth', 'width=800,height=700,left=200,top=200');
    
    UI.showAuthUI('loading', 'Initiating login...');
    try {
        const challengeRes = await remoteFetch(`${API_BASE}/api/roblox/oauth/challenge`, { method: 'POST' });
        if (!challengeRes.ok) throw new Error('OAuth challenge failed');
        const challenge = await challengeRes.json();

        if (!authWindow) {
            UI.showAuthUI('error', 'Popup blocked! Please allow popups for this site to log in.');
            return;
        }

        authWindow.location.href = challenge.auth_url;

        UI.showAuthUI('pending', 'Waiting for Roblox authorization... (check the new tab)');
        let sessionToken = null;
        
        while (!sessionToken) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await (await remoteFetch(`${API_BASE}/api/roblox/oauth/status/${challenge.session_id}`)).json();
            if (status.status === 'ok') {
                sessionToken = status.session_token;
                currentUser = { id: status.user_id, name: status.username, session_token: sessionToken };
                await saveState();
                break;
            } else if (status.status === 'expired') throw new Error('OAuth session expired');
        }
        
        if (authWindow && !authWindow.closed) authWindow.close();
        UI.hideAuthUI();
        UI.renderAuthState();
        await loadReviews();
    } catch (err) {
        if (authWindow && !authWindow.closed) authWindow.close();
        console.warn('OAuth failed, falling back to Friend Oracle', err);
        await fallbackFriendOracle();
    }
}

async function fallbackFriendOracle() {
    try {
        const challengeRes = await remoteFetch(`${API_BASE}/api/roblox/verify/challenge`, { method: 'POST' });
        if (!challengeRes.ok) throw new Error('Verify challenge failed');
        const challenge = await challengeRes.json();
        if (challenge.error) throw new Error(challenge.reason);
        UI.showFriendOracleUI(challenge.bot_name, challenge.bot_id);
        let sessionToken = null;
        while (!sessionToken) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await (await remoteFetch(`${API_BASE}/api/roblox/verify/status/${challenge.session_id}`)).json();
            if (status.status === 'ok') {
                sessionToken = status.session_token;
                currentUser = { id: status.user_id, name: status.username, session_token: sessionToken };
                await saveState();
                break;
            } else if (status.status === 'expired') throw new Error('Verification expired');
        }
        UI.hideAuthUI();
        UI.renderAuthState();
        await loadReviews();
    } catch (err) {
        UI.showAuthUI('error', `Login failed: ${err.message}`);
    }
}

async function loadReviews() {
    try {
        const gameQuery = targetIsGame ? '?game=true' : '';
        const data = await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}${gameQuery}`);
        allReviews = data.reviews || [];
        profileRating = data.profile_rating || { up: [], down: [] };
        blockedUsers = data.blocked || [];
        viewerBlocked = !!data.viewer_blocked;
        UI.updateSummary();
        UI.renderAuthState();
        await UI.renderPage(1);
        UI.renderBlockedStrip();
    } catch (e) { console.error(e); }
}

// --- Optimistic Actions ---

async function submitReview() {
    const input = document.getElementById('hr-review-input');
    let content = input.value.trim();
    if (!content) return UI.showToast('Review cannot be empty.', 'error');
    if (content.length > 8000) return UI.showToast('Review is too long.', 'error');

    // Process mentions before sending
    content = await processMentionsOutgoing(content);

    const tempId = `temp-${Date.now()}`;
    const tempReview = {
        id: tempId, from: { id: currentUser.id, name: currentUser.name },
        content: content, time: Math.floor(Date.now() / 1000), edited: false,
        score: { up: 0, down: 0 }, rating: { up: [], down: [] }, replies: []
    };

    allReviews.unshift(tempReview);
    input.value = '';
    document.getElementById('hr-char-count').textContent = '0';
    await UI.renderPage(1);

    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}${targetIsGame ? '?game=true' : ''}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content })
        });
        await loadReviews();
    } catch (e) {
        allReviews = allReviews.filter(r => r.id !== tempId);
        await UI.renderPage(currentPage);
        UI.showToast(`Failed to submit review: ${e.message}`, 'error');
    }
}

async function editReview(reviewId, newContent) {
    if (!newContent.trim()) return UI.showToast('Review cannot be empty.', 'error');
    const review = allReviews.find(r => r.id === reviewId);
    if (!review) return;

    newContent = await processMentionsOutgoing(newContent.trim());
    const prevContent = review.content;
    const prevEdited = review.edited;

    review.content = newContent;
    review.edited = true;
    await UI.renderPage(currentPage);

    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/${reviewId}${targetIsGame ? '?game=true' : ''}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newContent })
        });
    } catch (e) {
        review.content = prevContent;
        review.edited = prevEdited;
        await UI.renderPage(currentPage);
        UI.showToast(`Failed to edit review: ${e.message}`, 'error');
    }
}

async function deleteReview(reviewId) {
    if (!confirm('Are you sure you want to delete this review?')) return;
    
    const reviewIndex = allReviews.findIndex(r => r.id === reviewId);
    if (reviewIndex === -1) return;
    const deletedReview = allReviews[reviewIndex];

    allReviews.splice(reviewIndex, 1);
    await UI.renderPage(currentPage);
    UI.updateSummary();

    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/${reviewId}${targetIsGame ? '?game=true' : ''}`, { method: 'DELETE' });
    } catch (e) {
        allReviews.splice(reviewIndex, 0, deletedReview);
        await UI.renderPage(currentPage);
        UI.updateSummary();
        UI.showToast(`Failed to delete review: ${e.message}`, 'error');
    }
}

async function bulkDelete() {
    if (bulkDeleteSelection.size === 0) return UI.showToast('No users selected.', 'error');
    if (!confirm(`Delete all reviews from ${bulkDeleteSelection.size} selected user(s)? This can only be done once per day.`)) return;
    
    const selectedIds = [...bulkDeleteSelection];
    const deletedReviews = allReviews.filter(r => selectedIds.includes(Number(r.from.id)));
    
    allReviews = allReviews.filter(r => !selectedIds.includes(Number(r.from.id)));
    bulkDeleteMode = false;
    bulkDeleteSelection.clear();
    UI.toggleBulkMode(false);
    await UI.renderPage(currentPage);
    UI.updateSummary();

    try {
        const body = { user_ids: selectedIds };
        if (targetIsGame) body.game = true;
        const gameQuery = targetIsGame ? '?game=true' : '';
        
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/bulk-delete${gameQuery}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        allReviews = allReviews.concat(deletedReviews);
        bulkDeleteMode = true;
        document.getElementById('hr-bulk-bar').style.display = 'flex';
        bulkDeleteSelection = new Set(selectedIds);
        document.getElementById('hr-bulk-count').textContent = `${bulkDeleteSelection.size} user(s) selected`;
        await UI.renderPage(currentPage);
        UI.updateSummary();
        UI.showToast(`Bulk delete failed: ${e.message}`, 'error');
    }
}

async function rateReview(reviewId, vote) {
    if (!currentUser) { login(); return; }
    const uid = Number(currentUser.id);
    const review = allReviews.find(r => r.id === reviewId);
    if (!review) return;

    const prevScore = { ...review.score };
    const prevRating = review.rating ? JSON.parse(JSON.stringify(review.rating)) : { up: [], down: [] };

    if (!review.score) review.score = { up: 0, down: 0 };
    if (!review.rating) review.rating = { up: [], down: [] };

    if (vote === 'up') {
        const alreadyUp = review.rating.up.includes(uid);
        if (alreadyUp) {
            review.rating.up = review.rating.up.filter(id => id !== uid);
            review.score.up--;
        } else {
            review.rating.up.push(uid);
            review.score.up++;
            if (review.rating.down.includes(uid)) {
                review.rating.down = review.rating.down.filter(id => id !== uid);
                review.score.down--;
            }
        }
    } else {
        const alreadyDown = review.rating.down.includes(uid);
        if (alreadyDown) {
            review.rating.down = review.rating.down.filter(id => id !== uid);
            review.score.down--;
        } else {
            review.rating.down.push(uid);
            review.score.down++;
            if (review.rating.up.includes(uid)) {
                review.rating.up = review.rating.up.filter(id => id !== uid);
                review.score.up--;
            }
        }
    }
    
    await UI.renderPage(currentPage);

    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/${reviewId}/rate${targetIsGame ? '?game=true' : ''}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vote })
        });
    } catch (e) {
        review.score = prevScore;
        review.rating = prevRating;
        await UI.renderPage(currentPage);
        UI.showToast(`Failed to rate review: ${e.message}`, 'error');
    }
}

async function submitReply(reviewId, content, replyTo = null) {
    if (!content.trim()) return UI.showToast('Reply cannot be empty.', 'error');
    content = await processMentionsOutgoing(content.trim());

    const review = allReviews.find(r => r.id === reviewId);
    if (!review) return;
    if (!review.replies) review.replies = [];

    // Build the reply_to object locally so the UI shows the prefix instantly
    let replyToObject = null;
    if (replyTo) {
        const parent = review.replies.find(r => r.id === replyTo);
        if (parent) replyToObject = { id: parent.from.id, name: parent.from.name };
    }

    const tempId = `temp-reply-${Date.now()}`;
        const tempReply = {
        id: tempId, from: { id: currentUser.id, name: currentUser.name },
        content: content, time: Math.floor(Date.now() / 1000), edited: false,
        score: { up: 0, down: 0 }, rating: { up: [], down: [] },
        reply_to: replyToObject,
        parent_id: replyTo || null,
    };

    review.replies.push(tempReply);
    expandedReplies.add(reviewId);
    await UI.renderPage(currentPage);

    try {
        const body = { content };
        if (replyTo) body.reply_to = replyTo;
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/${reviewId}/reply${targetIsGame ? '?game=true' : ''}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        replyContext = null;
        await loadReviews();
    } catch (e) {
        review.replies = review.replies.filter(r => r.id !== tempId);
        await UI.renderPage(currentPage);
        UI.showToast(`Failed to post reply: ${e.message}`, 'error');
    }
}

async function rateReply(reviewId, replyId, vote) {
    if (!currentUser) { login(); return; }
    const uid = Number(currentUser.id);
    const review = allReviews.find(r => r.id === reviewId);
    const reply = review?.replies?.find(r => r.id === replyId);
    if (!reply) return;

    const prevScore = { ...reply.score };
    const prevRating = reply.rating ? JSON.parse(JSON.stringify(reply.rating)) : { up: [], down: [] };

    if (!reply.score) reply.score = { up: 0, down: 0 };
    if (!reply.rating) reply.rating = { up: [], down: [] };

    if (vote === 'up') {
        const alreadyUp = reply.rating.up.includes(uid);
        if (alreadyUp) { reply.rating.up = reply.rating.up.filter(id => id !== uid); reply.score.up--; }
        else {
            reply.rating.up.push(uid); reply.score.up++;
            if (reply.rating.down.includes(uid)) { reply.rating.down = reply.rating.down.filter(id => id !== uid); reply.score.down--; }
        }
    } else {
        const alreadyDown = reply.rating.down.includes(uid);
        if (alreadyDown) { reply.rating.down = reply.rating.down.filter(id => id !== uid); reply.score.down--; }
        else {
            reply.rating.down.push(uid); reply.score.down++;
            if (reply.rating.up.includes(uid)) { reply.rating.up = reply.rating.up.filter(id => id !== uid); reply.score.up--; }
        }
    }
    
    await UI.renderPage(currentPage);

    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/${reviewId}/reply/${replyId}/rate${targetIsGame ? '?game=true' : ''}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vote })
        });
    } catch (e) {
        reply.score = prevScore; reply.rating = prevRating;
        await UI.renderPage(currentPage);
        UI.showToast(`Failed to rate reply: ${e.message}`, 'error');
    }
}

async function editReply(reviewId, replyId, newContent) {
    if (!newContent.trim()) return UI.showToast('Reply cannot be empty.', 'error');
    
    const review = allReviews.find(r => r.id === reviewId);
    if (!review) return;
    
    const reply = review.replies?.find(r => r.id === replyId);
    if (!reply) return;

    newContent = await processMentionsOutgoing(newContent.trim());

    const prevContent = reply.content;
    const prevEdited = reply.edited;

    reply.content = newContent;
    reply.edited = true;
    await UI.renderPage(currentPage);

    try {
        const gameQuery = targetIsGame ? '?game=true' : '';
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/${reviewId}/reply/${replyId}${gameQuery}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newContent })
        });
        // Success! The UI is already updated.
    } catch (e) {
        // 2. Revert on failure
        reply.content = prevContent;
        reply.edited = prevEdited;
        await UI.renderPage(currentPage);
        UI.showToast(`Failed to edit reply: ${e.message}`, 'error');
    }
}

async function deleteReply(reviewId, replyId) {
    if (!confirm('Are you sure you want to delete this reply?')) return;
    
    const review = allReviews.find(r => r.id === reviewId);
    if (!review || !review.replies) return;

    const replyIndex = review.replies.findIndex(r => r.id === replyId);
    if (replyIndex === -1) return;

    const deletedReply = review.replies[replyIndex];

    review.replies.splice(replyIndex, 1);
    await UI.renderPage(currentPage);

    try {
        const gameQuery = targetIsGame ? '?game=true' : '';
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/${reviewId}/reply/${replyId}${gameQuery}`, {
            method: 'DELETE'
        });
        // Success!
    } catch (e) {
        // 2. Revert on failure (Splice it back into the exact same spot)
        review.replies.splice(replyIndex, 0, deletedReply);
        await UI.renderPage(currentPage);
        UI.showToast(`Failed to delete reply: ${e.message}`, 'error');
    }
}

async function rateProfile(vote) {
    if (!currentUser) { login(); return; }
    const uid = Number(currentUser.id);
    const prevUp = [...profileRating.up];
    const prevDown = [...profileRating.down];

    if (vote === 'up') {
        const alreadyUp = profileRating.up.includes(uid);
        if (alreadyUp) {
            profileRating.up = profileRating.up.filter(id => id !== uid);
        } else {
            profileRating.up.push(uid);
            if (profileRating.down.includes(uid)) {
                profileRating.down = profileRating.down.filter(id => id !== uid);
            }
        }
    } else {
        const alreadyDown = profileRating.down.includes(uid);
        if (alreadyDown) {
            profileRating.down = profileRating.down.filter(id => id !== uid);
        } else {
            profileRating.down.push(uid);
            if (profileRating.up.includes(uid)) {
                profileRating.up = profileRating.up.filter(id => id !== uid);
            }
        }
    }

    UI.updateSummary();

    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/rate${targetIsGame ? '?game=true' : ''}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vote })
        });
    } catch (e) {
        profileRating.up = prevUp;
        profileRating.down = prevDown;
        UI.updateSummary();
        UI.showToast(`Failed to rate profile: ${e.message}`, 'error');
    }
}

async function setBlock(userId, blocked) {
    const prevBlocked = [...blockedUsers];
    const numUserId = Number(userId);

    if (blocked) {
        if (!blockedUsers.includes(numUserId)) blockedUsers.push(numUserId);
    } else {
        blockedUsers = blockedUsers.filter(id => id !== numUserId);
    }
    
    await UI.renderPage(currentPage);
    UI.renderBlockedStrip();

    try {
        await apiCall(`${API_BASE}/api/roblox/reviews/${targetId}/block${targetIsGame ? '?game=true' : ''}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, blocked })
        });
    } catch (e) {
        blockedUsers = prevBlocked;
        await UI.renderPage(currentPage);
        UI.renderBlockedStrip();
        UI.showToast(`Block action failed: ${e.message}`, 'error');
    }
}
