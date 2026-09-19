const UI = {
    getReviewHTML() {
        const placeholder = targetIsGame ? 'Share your thoughts about this game...' : 'Share your thoughts about this user...';
        const titlePrefix = targetIsGame ? 'Reviews for game' : 'Reviews for';
        const reportSubject = targetIsGame ? `Game ${targetId}` : `Profile ${targetId}`;

        return `
        <div id="hermivore-reviews-container" class="hermivore-reviews">
            <h2 class="hr-title">${titlePrefix} <span id="hr-target-name">${escapeHtml(targetUsername)}</span></h2>
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
            <div id="hr-self-notice" class="hr-system-notice" style="display:none;">You cannot review your own ${targetIsGame ? 'game' : 'profile'}.</div>
            <div id="hr-blocked-strip" class="hr-system-notice" style="display:none;"></div>
            <div id="hr-blocked-notice" class="hr-system-notice" style="display:none;">You have been blocked from writing or editing reviews here.</div>
            <div id="hr-write-review" class="hr-write-review" style="display:none;">
                <textarea id="hr-review-input" placeholder="${placeholder}" maxlength="8000"></textarea>
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
                <a href="mailto:support@hermivore.cat?subject=Review Report (${reportSubject})" class="hrv-btn-link hr-report-link">Report abuse</a>
            </div>
        </div>`;
    },

    injectCSS() {
        if (document.getElementById('hermivore-styles')) return;
        const style = document.createElement('style');
        style.id = 'hermivore-styles';
        style.textContent = `
            .hermivore-reviews{--hrv-bg:#ffffff; --hrv-surface:#f7f7f8; --hrv-border:#e0e2e6;--hrv-text:#191a1e; --hrv-text-2:#62666e;--hrv-blue:#335fff; --hrv-blue-hover:#2b50e0;--hrv-green:#2f8f5b; --hrv-red:#d64545;font-family:"Builder Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;background:var(--hrv-bg); color:var(--hrv-text);border:1px solid var(--hrv-border); border-radius:12px;padding:24px; margin:32px auto; max-width:960px;font-size:14px; line-height:1.45; box-sizing:border-box;}
            .hermivore-reviews.hrv-dark{--hrv-bg:#202127; --hrv-surface:#272930; --hrv-border:#383a41;--hrv-text:#f7f7f8; --hrv-text-2:#a0a3ab;--hrv-blue:#5b7cff; --hrv-blue-hover:#7590ff;--hrv-green:#56ac72; --hrv-red:#e5484d;}
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
            .hr-blocked-chip{display:inline-flex;align-items:center;gap:6px;background:var(--hrv-bg);border:1px solid var(--hrv-border);border-radius:999px;padding:2px 10px;margin:6px 6px 0 0;font-size:12px;}
            .hr-toast-container{position:fixed;top:20px;right:20px;z-index:999999;display:flex;flex-direction:column;gap:10px;pointer-events:none;font-family:inherit;}
            .hr-toast{background:#333;color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:14px;opacity:0;transform:translateX(100%);transition:all .3s ease;pointer-events:auto;}
            .hr-toast.show{opacity:1;transform:translateX(0);}
            .hr-toast.error{background:var(--hrv-red);}
            .hr-toast.success{background:var(--hrv-green);}
            .hr-toast.info{background:var(--hrv-blue);}
            .hr-mention { color: var(--hrv-blue); font-weight: 600; text-decoration: none; }
            .hr-mention:hover { text-decoration: underline; }
            .hr-replies-container { margin-top: 12px; padding-left: 16px; border-left: 2px solid var(--hrv-border); }
            .hr-reply { background: var(--hrv-bg); border: 1px solid var(--hrv-border); border-radius: 8px; padding: 12px; margin-bottom: 8px; }
            .hr-reply .hr-avatar { width: 28px; height: 28px; }
            .hr-reply .hr-author { font-size: 13px; }
            .hr-reply .hr-review-body { font-size: 13px; margin-bottom: 8px; }
            .hr-reply-actions button { font-size: 12px; margin-left: 8px; }
            .hr-view-replies-btn { background: none; border: none; color: var(--hrv-blue); font-weight: 600; cursor: pointer; padding: 4px 0; font-size: 13px; margin-top: 4px; }
            .hr-reply-context{font-size:12px;color:var(--hrv-text-2);margin-bottom:4px;}
            .hr-reply-to{margin-right:4px;}
            .hr-reply-input-container{margin-top:10px;display:flex;gap:8px;align-items:flex-start;}
            .hr-reply-input-container > div{flex:1;min-width:0;}
            .hr-reply-input-container textarea{width:100%;min-height:56px;font-size:13px;padding:8px;border-radius:6px;border:1px solid var(--hrv-border);background:var(--hrv-bg);color:var(--hrv-text);font-family:inherit;resize:vertical;}
            .hr-replies-container{margin-top:12px;}
            .hr-reply-children{margin-left:14px;padding-left:12px;border-left:2px solid var(--hrv-border);}
            .hr-reply-children.hr-depth-max{margin-left:0;padding-left:0;border-left:none;}
            `;
        document.head.appendChild(style);
    },

    applyTheme() {
        const el = document.getElementById('hermivore-reviews-container');
        if (el) el.classList.toggle('hrv-dark', isPageDark());
    },

    showAuthUI(type, message) {
        const panel = document.getElementById('hr-auth-panel');
        panel.style.display = 'block';
        panel.innerHTML = `<h3>Authentication</h3><p style="color:${type === 'error' ? 'var(--hrv-red)' : 'var(--hrv-text-2)'};margin:0;">${message}</p>`;
    },

    hideAuthUI() { document.getElementById('hr-auth-panel').style.display = 'none'; },

    showFriendOracleUI(botName, botId) {
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
    },

    updateSummary() {
        const reviewCount = allReviews.length;
        const uid = currentUser ? Number(currentUser.id) : null;
        const up = profileRating.up.length;
        const down = profileRating.down.length;
        const totalVotes = up + down;

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

        document.getElementById('hr-profile-up-count').textContent = up;
        document.getElementById('hr-profile-down-count').textContent = down;
        document.getElementById('hr-profile-up').classList.toggle('active', uid !== null && profileRating.up.includes(uid));
        document.getElementById('hr-profile-down').classList.toggle('active', uid !== null && profileRating.down.includes(uid));
    },

    
    async renderReview(review) {
        const isAuthor = currentUser && String(review.from.id) === String(currentUser.id);
        const isProfileOwner = !targetIsGame && currentUser && String(currentUser.id) === String(targetId);
        const canEdit = isAuthor && !viewerBlocked;
        const canDelete = isAuthor || isProfileOwner;

        const up = review.score?.up || 0;
        const down = review.score?.down || 0;
        const rTotal = up + down;
        const reviewRatingText = rTotal === 0 ? 'No ratings yet' : `${Math.round((up / rTotal) * 100)}% positive (${rTotal} vote${rTotal !== 1 ? 's' : ''})`;
        const userVote = review.rating?.up?.includes(currentUser?.id) ? 'up' : review.rating?.down?.includes(currentUser?.id) ? 'down' : null;
        const avatar = avatarCache[review.from.id] || FALLBACK_AVATAR;
        const isSelected = bulkDeleteSelection.has(review.from.id);

        const isBlocked = blockedUsers.includes(Number(review.from.id));
        const blockBtn = (isProfileOwner && String(review.from.id) !== String(targetId))
            ? `<button class="hrv-btn-link hr-block-btn" data-author="${review.from.id}" data-blocked="${isBlocked}">${isBlocked ? 'Unblock' : 'Block'}</button>` : '';

        // Process mentions for the main review body
        const contentHtml = await renderContentWithMentions(review.content);

        // ===== CHANGED BLOCK START =====
        // Handle Replies (Reddit-style nesting)
        let repliesHtml = '';
        const allReplies = review.replies || [];
        let hiddenCount = 0;

        if (allReplies.length > 0) {
            // Group replies by the reply they answer; null = top level
            const byParent = new Map();
            for (const rep of allReplies) {
                const key = rep.parent_id ? String(rep.parent_id) : null;
                if (!byParent.has(key)) byParent.set(key, []);
                byParent.get(key).push(rep);
            }

            // Parent reply was deleted? Promote its orphans to top level
            const ids = new Set(allReplies.map(r => String(r.id)));
            const orphans = [];
            for (const [key, arr] of byParent) {
                if (key !== null && !ids.has(key)) orphans.push(...arr);
            }
            if (orphans.length) {
                for (const [key] of byParent) {
                    if (key !== null && !ids.has(key)) byParent.delete(key);
                }
                byParent.set(null, (byParent.get(null) || []).concat(orphans));
            }

            // Oldest first within each level of the thread
            for (const arr of byParent.values()) arr.sort((a, b) => a.time - b.time);

            // Collapse only TOP-LEVEL replies; children stay attached to their parent
            let topLevel = byParent.get(null) || [];
            if (topLevel.length > 3 && !expandedReplies.has(review.id)) {
                hiddenCount = topLevel.length - 3;
                topLevel = topLevel.slice(0, 3);
            }

            const rendered = await Promise.all(
                topLevel.map(rep => this.renderReplyThread(review.id, rep, byParent, 0))
            );
            repliesHtml = `<div class="hr-replies-container">${rendered.join('')}</div>`;
        }
        // ===== CHANGED BLOCK END =====

        const viewMoreBtn = hiddenCount > 0
            ? `<button class="hr-view-replies-btn hr-expand-replies" data-review-id="${review.id}">View ${hiddenCount} more repl${hiddenCount === 1 ? 'y' : 'ies'}</button>`
            : '';

        const ctx = (replyContext && replyContext.reviewId === review.id) ? replyContext : null;
        const replyInputHtml = activeReplyInputs.has(review.id) && currentUser && !viewerBlocked
            ? `<div class="hr-reply-input-container">
                <div style="flex:1;">
                ${ctx ? `<div class="hr-reply-context">Replying to <strong>@${escapeHtml(ctx.name)}</strong> &nbsp;<button class="hrv-btn-link hr-cancel-reply-context" data-review-id="${review.id}">cancel</button></div>` : ''}
                <textarea class="hr-reply-input" placeholder="${ctx ? `Reply to @${escapeHtml(ctx.name)}...` : 'Write a reply...'}" maxlength="2000"></textarea>
                </div>
                <button class="hrv-btn-primary hr-submit-reply" data-review-id="${review.id}">Reply</button>
            </div>`
            : '';

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
                        ${blockBtn}
                    </div>
                </div>
                <div class="hr-review-body">${contentHtml}</div>
                <textarea class="hr-edit-textarea" style="display:none;">${escapeHtml(review.content)}</textarea>
                ${!bulkDeleteMode ? `
                <div class="hr-review-footer">
                    <button class="hr-vote-btn hr-upvote ${userVote === 'up' ? 'active' : ''}" data-vote="up">👍 <span>${up}</span></button>
                    <button class="hr-vote-btn hr-downvote ${userVote === 'down' ? 'active' : ''}" data-vote="down">👎 <span>${down}</span></button>
                    <span class="hr-review-rating">${reviewRatingText}</span>
                    ${currentUser && !viewerBlocked ? `<button class="hrv-btn-link hr-toggle-reply-btn" data-review-id="${review.id}" style="margin-left:auto;">Reply</button>` : ''}
                </div>` : ''}
                
                ${replyInputHtml}
                ${repliesHtml}
                ${viewMoreBtn}
            </div>`;
    },
    async renderReply(reviewId, reply) {
        const isAuthor = currentUser && String(reply.from.id) === String(currentUser.id);
        const isProfileOwner = !targetIsGame && currentUser && String(currentUser.id) === String(targetId);
        const canEdit = isAuthor && !viewerBlocked;
        const canDelete = isAuthor || isProfileOwner;
        const canReply = currentUser && !viewerBlocked && !bulkDeleteMode;

        const up = reply.score?.up || 0;
        const down = reply.score?.down || 0;
        const userVote = reply.rating?.up?.includes(currentUser?.id) ? 'up' : reply.rating?.down?.includes(currentUser?.id) ? 'down' : null;
        const avatar = avatarCache[reply.from.id] || FALLBACK_AVATAR;

        const contentHtml = await renderContentWithMentions(reply.content);

        // NEW: "Replying to @name" prefix (TikTok style)
        const showPrefix = !reply.parent_id && reply.reply_to;
        const replyToHtml = showPrefix
            ? `<a href="https://www.roblox.com/users/${reply.reply_to.id}/profile" target="_blank" class="hr-mention hr-reply-to">@${escapeHtml(reply.reply_to.name || 'User')}</a> `
            : '';

        return `
            <div class="hr-reply" data-reply-id="${reply.id}" data-review-id="${reviewId}">
                <div class="hr-review-header">
                    <div class="hr-avatar"><img src="${avatar}" onerror="this.src='${FALLBACK_AVATAR}'"/></div>
                    <div class="hr-review-meta">
                        <a href="https://www.roblox.com/users/${reply.from.id}/profile" target="_blank" class="hr-author">${escapeHtml(reply.from.name)}</a>
                        <span class="hr-date">${new Date(reply.time * 1000).toLocaleDateString()}</span>
                        ${reply.edited ? `<span class="hr-edited">(edited)</span>` : ''}
                    </div>
                    <div class="hr-review-actions hr-reply-actions">
                        ${canEdit ? `<button class="hrv-btn-link hr-edit-reply-btn">Edit</button>` : ''}
                        ${canDelete ? `<button class="hrv-btn-link hr-delete-reply-btn" style="color:var(--hrv-red);">Delete</button>` : ''}
                    </div>
                </div>
                <div class="hr-review-body">${replyToHtml}${contentHtml}</div>
                <textarea class="hr-edit-textarea" style="display:none;">${escapeHtml(reply.content)}</textarea>
                <div class="hr-review-footer">
                    <button class="hr-vote-btn hr-upvote ${userVote === 'up' ? 'active' : ''}" data-vote="up" data-reply-id="${reply.id}">👍 <span>${up}</span></button>
                    <button class="hr-vote-btn hr-downvote ${userVote === 'down' ? 'active' : ''}" data-vote="down" data-reply-id="${reply.id}">👎 <span>${down}</span></button>
                    ${canReply ? `<button class="hrv-btn-link hr-open-reply-box" data-review-id="${reviewId}" data-reply-id="${reply.id}" data-name="${escapeHtml(reply.from.name)}" style="margin-left:auto;">Reply</button>` : ''}
                </div>
            </div>`;
    },

    async renderReplyThread(reviewId, reply, byParent, depth) {
        const html = await this.renderReply(reviewId, reply, depth);
        const kids = byParent.get(String(reply.id)) || [];
        if (!kids.length) return html;
        const renderedKids = await Promise.all(
            kids.map(k => this.renderReplyThread(reviewId, k, byParent, depth + 1))
        );
        // Cap visual indentation at depth 4 so deep chains stay readable
        const capClass = (depth + 1) >= 4 ? ' hr-depth-max' : '';
        return html + `<div class="hr-reply-children${capClass}">${renderedKids.join('')}</div>`;
    },

    renderPagination(totalItems, page, perPage) {
        const totalPages = Math.ceil(totalItems / perPage);
        if (totalPages <= 1) return '';
        let html = '';
        if (page > 1) html += `<button class="btn-page" data-page="${page - 1}">‹</button>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="btn-page ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        if (page < totalPages) html += `<button class="btn-page" data-page="${page + 1}">›</button>`;
        return html;
    },

    async renderPage(page = 1) {
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

        const avatarIds = [];
        for (const r of pageReviews) {
            avatarIds.push(r.from.id);
            for (const rep of (r.replies || [])) avatarIds.push(rep.from.id);
        }
        await ensureAvatars(avatarIds);

        // Await all async review renders
        const htmlArray = await Promise.all(pageReviews.map(r => this.renderReview(r)));
        listEl.innerHTML = htmlArray.join('');
        paginationEl.innerHTML = this.renderPagination(allReviews.length, currentPage, REVIEWS_PER_PAGE);

        if (bulkDeleteMode) {
            document.getElementById('hr-bulk-count').textContent = `${bulkDeleteSelection.size} user(s) selected`;
        }
    },

    renderAuthState() {
        const loginPrompt = document.getElementById('hr-login-prompt');
        const writeReview = document.getElementById('hr-write-review');
        const logoutBtn = document.getElementById('hr-logout-btn');
        const selfNotice = document.getElementById('hr-self-notice');
        const bulkBtn = document.getElementById('hr-bulk-delete-btn');
        const blockedNotice = document.getElementById('hr-blocked-notice');

        if (currentUser) {
            loginPrompt.style.display = 'none';
            logoutBtn.style.display = 'inline-block';
            
            if (!targetIsGame && String(currentUser.id) === String(targetId)) {
                writeReview.style.display = 'none';
                selfNotice.style.display = 'block';
                blockedNotice.style.display = 'none';
                bulkBtn.style.display = allReviews.length > 0 ? 'inline-block' : 'none';
            } else if (viewerBlocked) {
                writeReview.style.display = 'none';
                selfNotice.style.display = 'none';
                blockedNotice.style.display = 'block';
                bulkBtn.style.display = 'none';
            } else {
                writeReview.style.display = 'block';
                selfNotice.style.display = 'none';
                blockedNotice.style.display = 'none';
                bulkBtn.style.display = 'none';
            }
        } else {
            loginPrompt.style.display = 'block';
            writeReview.style.display = 'none';
            selfNotice.style.display = 'none';
            blockedNotice.style.display = 'none';
            logoutBtn.style.display = 'none';
            bulkBtn.style.display = 'none';
        }
    },

    toggleBulkMode(on) {
        bulkDeleteMode = on;
        bulkDeleteSelection.clear();
        document.getElementById('hr-bulk-bar').style.display = on ? 'flex' : 'none';
        document.getElementById('hr-bulk-count').textContent = '0 user(s) selected';
        this.renderPage(currentPage);
    },

    renderBlockedStrip() {
        const strip = document.getElementById('hr-blocked-strip');
        const isOwner = currentUser && String(currentUser.id) === String(targetId);
        if (!isOwner || blockedUsers.length === 0) { strip.style.display = 'none'; strip.innerHTML = ''; return; }

        strip.style.display = 'block';
        strip.innerHTML = `<strong>Blocked users (${blockedUsers.length}):</strong> <span class="hr-blocked-names">loading…</span>`;
        Promise.all(blockedUsers.map(id => fetchUsername(id))).then(names => {
            const el = strip.querySelector('.hr-blocked-names');
            if (!el) return;
            el.innerHTML = blockedUsers.map((id, i) =>
                `<span class="hr-blocked-chip">${escapeHtml(names[i])} <button class="hrv-btn-link hr-unblock-btn" data-author="${id}">Unblock</button></span>`
            ).join('');
        });
    },

    showToast(message, type = 'info') {
        let container = document.getElementById('hr-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'hr-toast-container';
            container.className = 'hr-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `hr-toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        toast.offsetHeight; // Trigger reflow
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
};