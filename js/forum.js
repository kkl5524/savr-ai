const FORUM_PAGE_SIZE = 10;

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function postAvatar(displayName, userId, isAi) {
  if (isAi) return `<span class="forum-avatar forum-avatar--ai">AI</span>`;
  const color = avatarColor(userId);
  const ini   = initials(displayName);
  return `<span class="forum-avatar" style="background:${color}">${ini}</span>`;
}

function renderPost(post, recipeId) {
  const isOwn   = currentUser && post.user_id === currentUser.id;
  const replies = (post.replies || []).map(r => renderReply(r)).join('');
  return `
    <div class="forum-post" data-id="${post.id}">
      <div class="forum-post-header">
        ${postAvatar(post.display_name, post.user_id, post.is_ai)}
        <div class="forum-post-meta">
          <span class="forum-post-author ${post.is_ai ? 'forum-post-author--ai' : ''}">
            ${post.is_ai ? '✨ Savr AI' : escapeHtml(post.display_name)}
          </span>
          <span class="forum-post-time">${timeAgo(post.created_at)}${post.edited_at ? ' · edited' : ''}</span>
        </div>
        <div class="forum-post-actions-row">
          <button class="forum-upvote ${post.viewer_upvoted ? 'forum-upvote--voted' : ''}"
            onclick="toggleUpvote(${post.id}, this)">
            ▲ <span class="upvote-count">${post.upvotes}</span>
          </button>
          ${!post.is_ai && currentUser && !isOwn ? `
            <button class="forum-flag-btn" onclick="flagPost(${post.id}, this)" title="Flag as incorrect">⚑</button>` : ''}
          ${isOwn ? `
            <button class="forum-edit-btn"   onclick="startEditPost(${post.id})"           title="Edit">✎</button>
            <button class="forum-delete-btn" onclick="deletePost(${post.id}, ${recipeId})" title="Delete">✕</button>` : ''}
        </div>
      </div>
      <div class="forum-post-body-wrap" id="post-body-${post.id}">
        <p class="forum-post-body">${escapeHtml(post.body)}</p>
      </div>
      <div class="forum-replies" id="replies-${post.id}">${replies}</div>
      ${currentUser ? `
        <button class="forum-reply-toggle" onclick="toggleReplyForm(${post.id}, ${recipeId}, this)">Reply</button>
        <div class="forum-reply-form" id="reply-form-${post.id}" style="display:none;"></div>` : ''}
    </div>`;
}

function renderReply(r) {
  const isOwn = currentUser && r.user_id === currentUser.id;
  return `
    <div class="forum-reply ${r.is_ai ? 'forum-reply--ai' : ''}" data-id="${r.id}">
      ${postAvatar(r.display_name, r.user_id, r.is_ai)}
      <div class="forum-reply-content">
        <span class="forum-post-author ${r.is_ai ? 'forum-post-author--ai' : ''}">${r.is_ai ? '✨ Savr AI' : escapeHtml(r.display_name)}</span>
        <span class="forum-post-time">${timeAgo(r.created_at)}</span>
        <p class="forum-post-body">${escapeHtml(r.body)}</p>
      </div>
      ${isOwn ? `<button class="forum-delete-btn forum-delete-btn--reply" onclick="deleteReply(${r.id})" title="Delete">✕</button>` : ''}
    </div>`;
}

async function loadForumPosts(recipeId, offset = 0, append = false) {
  const list    = document.getElementById('forum-posts-list');
  const loadBtn = document.getElementById('forum-load-more');
  if (!list) return;
  if (!append) list.innerHTML = '<div class="forum-loading">Loading tips…</div>';
  try {
    const res = await fetch(`/api/forum?recipe_id=${recipeId}&offset=${offset}`);
    const data = await res.json();
    const posts = data.posts || [];
    if (!append) list.innerHTML = '';
    if (!posts.length && !append) {
      list.innerHTML = '<div class="forum-empty">No tips yet — be the first to share one!</div>';
      if (loadBtn) loadBtn.style.display = 'none';
      return;
    }
    posts.forEach(p => list.insertAdjacentHTML('beforeend', renderPost(p, recipeId)));
    if (loadBtn) {
      loadBtn.style.display = posts.length < FORUM_PAGE_SIZE ? 'none' : 'block';
      loadBtn.dataset.offset = data.offset;
      loadBtn.dataset.recipeId = recipeId;
    }
  } catch {
    list.innerHTML = '<div class="forum-empty">Could not load tips right now.</div>';
  }
}

async function submitForumPost(recipeId, recipeTitle, ingredients) {
  if (!currentUser) { openAuthModal('signin'); return; }
  const bodyEl = document.getElementById('forum-post-body');
  const aiFeedback = document.getElementById('forum-ai-toggle')?.checked ?? false;
  const submitBtn = document.getElementById('forum-submit-btn');
  const body = bodyEl?.value.trim();
  if (!body) { bodyEl?.focus(); return; }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Posting…';
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/forum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'post', recipe_id: recipeId, body, recipe_title: recipeTitle, ingredients: ingredients || [], get_ai_feedback: aiFeedback }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    bodyEl.value = '';
    const list = document.getElementById('forum-posts-list');
    const empty = list?.querySelector('.forum-empty');
    if (empty) empty.remove();
    const newPost = { ...data.post, display_name: currentUser.email?.split('@')[0], replies: data.aiPost ? [data.aiPost] : [], viewer_upvoted: false };
    list?.insertAdjacentHTML('afterbegin', renderPost(newPost, recipeId));
  } catch (err) {
    alert('Failed to post: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Post tip';
  }
}

function toggleReplyForm(parentId, recipeId, btn) {
  const container = document.getElementById(`reply-form-${parentId}`);
  if (container.style.display !== 'none') {
    container.style.display = 'none'; btn.textContent = 'Reply'; return;
  }
  container.innerHTML = `
    <div class="forum-inline-form">
      <textarea class="forum-input forum-input--body" id="reply-body-${parentId}" placeholder="Add a reply…" maxlength="2000" rows="2"></textarea>
      <div class="forum-inline-form-actions">
        <button class="btn-primary forum-submit-btn" onclick="submitReply(${parentId}, ${recipeId})">Post reply</button>
        <button class="btn-secondary" onclick="document.getElementById('reply-form-${parentId}').style.display='none'">Cancel</button>
      </div>
    </div>`;
  container.style.display = 'block';
  btn.textContent = 'Cancel';
  document.getElementById(`reply-body-${parentId}`)?.focus();
}

async function submitReply(parentId, recipeId) {
  if (!currentUser) { openAuthModal('signin'); return; }
  const bodyEl = document.getElementById(`reply-body-${parentId}`);
  const body = bodyEl?.value.trim();
  if (!body) { bodyEl?.focus(); return; }
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/forum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'reply', recipe_id: recipeId, body, parent_id: parentId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const repliesEl = document.getElementById(`replies-${parentId}`);
    const newReply = { ...data.post, display_name: currentUser.email?.split('@')[0] };
    repliesEl?.insertAdjacentHTML('beforeend', renderReply(newReply));
    document.getElementById(`reply-form-${parentId}`).style.display = 'none';
  } catch (err) {
    alert('Failed to post reply: ' + err.message);
  }
}

async function toggleUpvote(id, btn) {
  if (!currentUser) { openAuthModal('signin'); return; }
  btn.disabled = true;
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/forum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'upvote', id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    btn.querySelector('.upvote-count').textContent = data.upvotes;
    btn.classList.toggle('forum-upvote--voted', data.upvoted);
  } catch (err) {
    console.error('Upvote failed:', err.message);
  } finally {
    btn.disabled = false;
  }
}

async function flagPost(id, btn) {
  if (!currentUser) { openAuthModal('signin'); return; }
  if (!confirm('Flag this post as incorrect or inappropriate?')) return;
  btn.disabled = true;
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/forum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'flag', id }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    btn.title = 'Flagged'; btn.style.color = 'var(--terracotta)';
  } catch (err) {
    alert('Could not flag post: ' + err.message);
    btn.disabled = false;
  }
}

function startEditPost(id) {
  const wrap = document.getElementById(`post-body-${id}`);
  if (!wrap) return;
  const currentText = wrap.querySelector('.forum-post-body')?.textContent || '';
  wrap.innerHTML = `
    <textarea class="forum-input forum-input--body" id="edit-body-${id}" rows="3">${escapeHtml(currentText)}</textarea>
    <div class="forum-inline-form-actions" style="margin-top:0.4rem;">
      <button class="btn-primary forum-submit-btn" onclick="saveEditPost(${id})">Save</button>
      <button class="btn-secondary" onclick="cancelEditPost(${id})">Cancel</button>
    </div>`;
  document.getElementById(`edit-body-${id}`)?.focus();
}

function cancelEditPost(id) {
  const bodyEl = document.getElementById(`edit-body-${id}`);
  const text = bodyEl?.value || '';
  const wrap = document.getElementById(`post-body-${id}`);
  if (wrap) wrap.innerHTML = `<p class="forum-post-body">${escapeHtml(text)}</p>`;
}

async function saveEditPost(id) {
  const bodyEl = document.getElementById(`edit-body-${id}`);
  const body = bodyEl?.value.trim();
  if (!body) { bodyEl?.focus(); return; }
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/forum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'edit', id, body }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const wrap = document.getElementById(`post-body-${id}`);
    if (wrap) wrap.innerHTML = `<p class="forum-post-body">${escapeHtml(body)}</p>`;
    const timeEl = document.querySelector(`[data-id="${id}"] .forum-post-time`);
    if (timeEl && !timeEl.textContent.includes('edited')) timeEl.textContent += ' · edited';
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
}

async function deletePost(id, recipeId) {
  if (!confirm('Delete this tip?')) return;
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/forum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'delete', id }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    document.querySelector(`.forum-post[data-id="${id}"]`)?.remove();
    const list = document.getElementById('forum-posts-list');
    if (list && !list.querySelector('.forum-post'))
      list.innerHTML = '<div class="forum-empty">No tips yet — be the first to share one!</div>';
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

async function deleteReply(id) {
  if (!confirm('Delete this reply?')) return;
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/forum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'delete', id }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    document.querySelector(`.forum-reply[data-id="${id}"]`)?.remove();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

async function summariseForum(recipeId, recipeTitle, ingredients) {
  const output = document.getElementById('forum-ai-summary');
  if (!output) return;
  output.textContent = 'Summarising tips…';
  output.classList.add('forum-ai-summary--loading');
  const tipTexts = [...document.querySelectorAll('#forum-posts-list .forum-post-body')]
    .map(el => el.textContent.trim()).filter(Boolean).slice(0, 20);
  if (!tipTexts.length) {
    output.textContent = 'Add some tips first, then ask for a summary.';
    output.classList.remove('forum-ai-summary--loading');
    return;
  }
  try {
    const res = await fetch('/api/forum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'summarise', recipe_id: recipeId, recipe_title: recipeTitle, ingredients, posts: tipTexts }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    output.textContent = data.summary;
  } catch {
    output.textContent = 'Could not generate summary right now.';
  } finally {
    output.classList.remove('forum-ai-summary--loading');
  }
}

async function loadRecentForum() {
  const feed = document.getElementById('forum-feed');
  if (!feed) return;
  feed.innerHTML = '<div class="forum-loading">Loading recent tips…</div>';
  try {
    const res = await fetch('/api/forum/recent');
    const data = await res.json();
    const posts = data.posts || [];
    if (!posts.length) {
      feed.innerHTML = '<div class="forum-empty">No community tips yet. Cook something and share a tip!</div>';
      return;
    }
    feed.innerHTML = posts.map(p => `
      <div class="forum-feed-item">
        <div class="forum-feed-recipe">${escapeHtml(p.recipe_title)}</div>
        <p class="forum-post-body">${escapeHtml(p.body)}</p>
        <div class="forum-post-header">
          ${postAvatar(p.display_name, null, false)}
          <span class="forum-post-author">${escapeHtml(p.display_name)}</span>
          <span class="forum-post-time">${timeAgo(p.created_at)}</span>
          <span class="forum-feed-upvotes">▲ ${p.upvotes}</span>
        </div>
      </div>`).join('');
  } catch {
    feed.innerHTML = '<div class="forum-empty">Could not load the community feed right now.</div>';
  }
}

function buildForumBlock(recipeId, recipeTitle, ingredients) {
  const ingJson = JSON.stringify(ingredients || []);
  const titleEs = escapeHtml(recipeTitle);
  return `
    <div class="forum-block">
      <div class="forum-header">
        <div class="modal-section-title">Community tips</div>
        <button class="forum-summarise-btn"
          onclick="summariseForum(${recipeId}, '${titleEs}', ${ingJson})">✨ AI summary</button>
      </div>
      <div class="forum-ai-summary" id="forum-ai-summary"></div>
      <div class="forum-posts-container">
        <div id="forum-posts-list"></div>
        <button id="forum-load-more" class="forum-load-more" style="display:none"
          onclick="loadForumPosts(this.dataset.recipeId, parseInt(this.dataset.offset), true)">
          Load more tips
        </button>
      </div>
      <div class="forum-post-gate" style="display:${currentUser ? 'none' : 'flex'}">
        <p>Sign in to share tips, reply, and upvote.</p>
        <button class="btn-primary"    onclick="openAuthModal('signin')">Sign in</button>
        <button class="btn-secondary"  onclick="openAuthModal('signup')">Create account</button>
      </div>
      <div class="forum-new-post forum-new-post-form" style="display:${currentUser ? 'block' : 'none'}">
        <div class="modal-section-title" style="margin-bottom:0.7rem;">Share a tip</div>
        <textarea id="forum-post-body" class="forum-input forum-input--body"
          placeholder="Share a substitution, technique, or variation…" maxlength="2000" rows="3"></textarea>
        <div class="forum-post-actions">
          <label class="forum-ai-label">
            <input type="checkbox" id="forum-ai-toggle" checked> Get AI feedback on my tip
          </label>
          <button id="forum-submit-btn" class="btn-primary"
            onclick="submitForumPost(${recipeId}, '${titleEs}', ${ingJson})">Post tip</button>
        </div>
      </div>
    </div>`;
}

function initForumInModal(recipeId, recipeTitle, ingredients) {
  const container = document.getElementById('modal-forum-container');
  if (!container) return;
  container.innerHTML = buildForumBlock(recipeId, recipeTitle, ingredients);
  loadForumPosts(recipeId);
}