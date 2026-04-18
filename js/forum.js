// ──────────────────────────────────────────────
// FORUM — per-recipe community tips, read-only panel
// ──────────────────────────────────────────────

const FORUM_PAGE_SIZE = 10;
let _forumOpen      = false;
let _forumRecipeId  = null;
let _forumTitle     = '';
let _forumIngredients = [];

// ── Helpers ────────────────────────────────────────────────────────────────
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
  const colors = ['#5A7D5B','#C4633A','#D4A843','#9E9488','#3D5A3E'];
  const color  = userId
    ? colors[Math.abs(String(userId).split('').reduce((a,c) => a + c.charCodeAt(0), 0)) % colors.length]
    : colors[0];
  const ini = (displayName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `<span class="forum-avatar" style="background:${color}">${ini}</span>`;
}

// ── Panel toggle ───────────────────────────────────────────────────────────
function toggleForumPanel() {
  const panel = document.getElementById('modal-forum-panel');
  const btn   = document.getElementById('forum-toggle-btn');
  if (!panel) return;

  _forumOpen = !_forumOpen;
  panel.style.display = _forumOpen ? 'flex' : 'none';
  if (btn) btn.classList.toggle('active', _forumOpen);

  if (_forumOpen && _forumRecipeId) {
    loadForumPosts(_forumRecipeId, 0, false);
  }
}

// ── Called when modal opens ────────────────────────────────────────────────
function initForumInModal(recipeId, recipeTitle, ingredients) {
  _forumRecipeId    = recipeId;
  _forumTitle       = recipeTitle;
  _forumIngredients = ingredients || [];
  _forumOpen        = false;

  // Reset panel state
  const panel = document.getElementById('modal-forum-panel');
  if (panel) panel.style.display = 'none';

  const list = document.getElementById('forum-posts-list');
  if (list) list.innerHTML = '';

  const summary = document.getElementById('forum-ai-summary');
  if (summary) summary.textContent = '';

  const btn = document.getElementById('forum-toggle-btn');
  if (btn) btn.classList.remove('active');

  // Wire summarise button
  const sumBtn = document.getElementById('forum-summarise-btn');
  if (sumBtn) {
    sumBtn.onclick = () => summariseForum(recipeId, recipeTitle, ingredients);
  }

  // Wire load more button
  const moreBtn = document.getElementById('forum-load-more');
  if (moreBtn) {
    moreBtn.onclick = () => {
      const offset = parseInt(moreBtn.dataset.offset || '0');
      loadForumPosts(recipeId, offset, true);
    };
  }
}

// ── Render a single post (read-only) ──────────────────────────────────────
function renderPost(post) {
  const replies = (post.replies || []).map(r => `
    <div class="forum-reply" data-id="${r.id}">
      <div class="forum-post-header">
        ${postAvatar(r.display_name, r.user_id, r.is_ai)}
        <div class="forum-post-meta">
          <span class="forum-post-author ${r.is_ai ? 'forum-post-author--ai' : ''}">
            ${r.is_ai ? '✨ Savr AI' : escapeHtml(r.display_name)}
          </span>
          <span class="forum-post-time">${timeAgo(r.created_at)}</span>
        </div>
        <div class="forum-post-actions-row">
          <span class="forum-upvote-static">▲ ${r.upvotes}</span>
        </div>
      </div>
      <p class="forum-post-body">${escapeHtml(r.body)}</p>
    </div>`).join('');

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
            onclick="toggleUpvote(${post.id}, this)" title="Upvote">
            ▲ <span class="upvote-count">${post.upvotes}</span>
          </button>
        </div>
      </div>
      <p class="forum-post-body">${escapeHtml(post.body)}</p>
      ${replies ? `<div class="forum-replies">${replies}</div>` : ''}
    </div>`;
}

// ── Load posts from Supabase ───────────────────────────────────────────────
async function loadForumPosts(recipeId, offset = 0, append = false) {
  const list    = document.getElementById('forum-posts-list');
  const moreBtn = document.getElementById('forum-load-more');
  if (!list) return;

  if (!append) {
    list.innerHTML = '<div class="forum-loading">Loading tips…</div>';
  }

  try {
    const res  = await fetch(`/api/forum?recipe_id=${recipeId}&offset=${offset}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const posts = data.posts || [];

    if (!append) {
      list.innerHTML = posts.length
        ? ''
        : '<div class="forum-empty">No community tips yet for this recipe.</div>';
    }

    posts.forEach(p => {
      list.insertAdjacentHTML('beforeend', renderPost(p));
    });

    if (moreBtn) {
      if (posts.length === FORUM_PAGE_SIZE) {
        moreBtn.style.display = 'block';
        moreBtn.dataset.offset = String(data.offset);
      } else {
        moreBtn.style.display = 'none';
      }
    }
  } catch (err) {
    if (!append) list.innerHTML = `<div class="forum-empty">Could not load tips: ${err.message}</div>`;
  }
}

// ── Upvote (still allowed read-only — just voting, no posting) ────────────
async function toggleUpvote(id, btn) {
  if (!currentUser) {
    openAuthModal('signin');
    return;
  }
  btn.disabled = true;
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/forum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'upvote', id }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data    = await res.json();
    const countEl = btn.querySelector('.upvote-count');
    if (countEl) countEl.textContent = data.upvotes;
    btn.classList.toggle('forum-upvote--voted', data.voted);
  } catch (err) {
    console.error('Upvote failed:', err.message);
  } finally {
    btn.disabled = false;
  }
}

// ── AI Summary ────────────────────────────────────────────────────────────
async function summariseForum(recipeId, recipeTitle, ingredients) {
  const output = document.getElementById('forum-ai-summary');
  if (!output) return;

  output.innerHTML = '<div class="forum-ai-summary--loading">✨ Generating summary…</div>';

  const tipTexts = [...document.querySelectorAll('#forum-posts-list .forum-post-body')]
    .map(el => el.textContent.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (!tipTexts.length) {
    output.innerHTML = '<div class="forum-ai-summary--empty">No tips to summarise yet.</div>';
    return;
  }

  try {
    const res = await fetch('/api/forum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:       'summarise',
        recipe_id:    recipeId,
        recipe_title: recipeTitle,
        ingredients,
        posts:        tipTexts,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    output.innerHTML = `
      <div class="forum-ai-summary--content">
        <span class="forum-ai-badge">✨ AI Summary</span>
        <p>${escapeHtml(data.summary)}</p>
      </div>`;
  } catch {
    output.innerHTML = '<div class="forum-ai-summary--empty">Could not generate summary right now.</div>';
  }
}

// ── Recent feed (homepage forum section) ──────────────────────────────────
async function loadRecentForum() {
  const feed = document.getElementById('forum-feed');
  if (!feed) return;
  feed.innerHTML = '<div class="forum-loading">Loading recent tips…</div>';
  try {
    const res   = await fetch('/api/forum/recent');
    const data  = await res.json();
    const posts = data.posts || [];
    if (!posts.length) {
      feed.innerHTML = '<div class="forum-empty">No community tips yet.</div>';
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
          <span style="margin-left:auto;font-size:0.78rem;color:var(--stone);">▲ ${p.upvotes}</span>
        </div>
      </div>`).join('');
  } catch {
    feed.innerHTML = '<div class="forum-empty">Could not load the community feed.</div>';
  }
}