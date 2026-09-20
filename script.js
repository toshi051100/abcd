/* =========================================================
   かんたん投稿シミュレーター（最終版）
   左：スマホ枠（実際のUI。押すとくるくる回るだけ）
   右：外側のフローチャート（普段見えない裏側。処理→保存→共有）
   GitHub Pages（サーバーなし）だけで完結する。
========================================================= */

const STORAGE_KEY = 'sns_sim_posts_v2';

// 「処理」ステップの具体例として、禁止ワードが含まれていたら
// ここで止まる、という挙動を持たせている。
const FORBIDDEN_WORDS = ['しね', 'ばか', 'うざい'];

const NODE_ORDER = ['data', 'process', 'save', 'share', 'friend'];

const NODE_TEXT = {
  data:    { active: '画像とコメントがひとまとまりになりました' },
  process: { active: '入力された内容を整理・チェックしています', done: '内容の整理・チェックが完了しました' },
  save:    { active: 'データを保存しています', done: '保存が完了しました' },
  share:   { active: '見られる状態（リンク）を作っています', done: '共有リンクができました' },
  friend:  { active: '友達の画面に届いています', done: '友達の画面に届きました' },
};

/* ---------- 小さなユーティリティ ---------- */

const $ = (selector, root = document) => root.querySelector(selector);
const $all = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDateTime(date) {
  return date.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function makePostId() {
  return 'p_' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
}

/* ---------- localStorage（＝「保存」の実体） ---------- */

function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function savePosts(posts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

/* ---------- 共有リンクの生成・解析 ---------- */
// 中身をそのまま生徒に見せる仕様ではなくなったので、圧縮はせず
// シンプルに JSON をそのまま URL パラメータへ載せている。

function buildShareUrl(post) {
  const json = JSON.stringify(post);
  return `${location.origin}${location.pathname}?post=${encodeURIComponent(json)}`;
}

function parseSharedPostFromUrl() {
  const params = new URLSearchParams(location.search);
  if (!params.has('post')) return null;
  try {
    return JSON.parse(decodeURIComponent(params.get('post')));
  } catch (e) {
    return null;
  }
}

/* ---------- 画面要素 ---------- */

const els = {
  composeView: $('#composeView'),
  receivedView: $('#receivedView'),
  form: $('#postForm'),
  imagePicker: $('#imagePicker'),
  commentInput: $('#commentInput'),
  submitBtn: $('#submitBtn'),
  revealToggle: $('#revealToggle'),
  demoGrid: $('#demoGrid'),
  phoneStatus: $('#phoneStatus'),
  phoneStatusText: $('#phoneStatusText'),
  spinner: $('#spinner'),
  result: $('#result'),
  postList: $('#postList'),
  resetBtn: $('#resetBtn'),
  receivedPost: $('#receivedPost'),
  backToComposeBtn: $('#backToComposeBtn'),
};

let selectedEmoji = null;

/* ---------- 画像選択 ---------- */

els.imagePicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.image-picker__item');
  if (!btn) return;
  $all('.image-picker__item', els.imagePicker).forEach(item => {
    item.classList.remove('is-selected');
    item.setAttribute('aria-pressed', 'false');
  });
  btn.classList.add('is-selected');
  btn.setAttribute('aria-pressed', 'true');
  selectedEmoji = btn.dataset.emoji;
  updateSubmitEnabled();
});

els.commentInput.addEventListener('input', updateSubmitEnabled);

function updateSubmitEnabled() {
  const hasText = els.commentInput.value.trim().length > 0;
  els.submitBtn.disabled = !(hasText && selectedEmoji);
}

/* ---------- フローチャートの表示／非表示トグル ---------- */

els.revealToggle.addEventListener('change', () => {
  els.demoGrid.classList.toggle('flow-hidden', !els.revealToggle.checked);
});
els.demoGrid.classList.add('flow-hidden'); // 初期状態：非表示（予想フェーズ）

/* ---------- フローチャートの制御 ---------- */

function resetFlow() {
  NODE_ORDER.forEach(name => {
    const node = $(`.flow-node[data-node="${name}"]`);
    node.classList.remove('is-active', 'is-done', 'is-fail');
    node.querySelector('.flow-node__caption').textContent = '';
  });
  $all('.flow-arrow').forEach(arrow => arrow.classList.remove('is-filled'));
}

function setNode(name, state, captionOverride) {
  const node = $(`.flow-node[data-node="${name}"]`);
  node.classList.remove('is-active', 'is-done', 'is-fail');
  node.classList.add(state);
  const caption = node.querySelector('.flow-node__caption');
  if (captionOverride !== undefined) {
    caption.textContent = captionOverride;
  } else if (state === 'is-active') {
    caption.textContent = NODE_TEXT[name].active;
  } else if (state === 'is-done') {
    caption.textContent = NODE_TEXT[name].done || NODE_TEXT[name].active;
  }
}

function fillArrowAfter(name) {
  const index = NODE_ORDER.indexOf(name);
  const arrows = $all('.flow-arrow');
  if (arrows[index]) arrows[index].classList.add('is-filled');
}

/* ---------- 投稿一覧の描画（＝保存の結果を見せる） ---------- */

function renderPostList() {
  const posts = loadPosts();
  els.postList.innerHTML = '';

  if (posts.length === 0) {
    els.postList.innerHTML = '<p class="post-list__empty">まだ投稿がありません。左のスマホから投稿してみましょう。</p>';
    return;
  }

  posts.slice().reverse().forEach(post => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.innerHTML = `
      <span class="post-card__emoji">${escapeHtml(post.image)}</span>
      <div class="post-card__body">
        <p class="post-card__text">${escapeHtml(post.text)}</p>
        <p class="post-card__meta">${escapeHtml(post.createdAt)}</p>
      </div>
    `;
    els.postList.appendChild(card);
  });
}

els.resetBtn.addEventListener('click', () => {
  if (confirm('保存されている投稿をすべて削除します。よろしいですか？')) {
    localStorage.removeItem(STORAGE_KEY);
    renderPostList();
  }
});

/* ---------- 結果パネル ---------- */

function showResult(html, variant) {
  els.result.hidden = false;
  els.result.className = 'result ' + (variant ? 'is-' + variant : '');
  els.result.innerHTML = html;
}
function hideResult() {
  els.result.hidden = true;
  els.result.innerHTML = '';
}

/* ---------- メインフロー：投稿ボタンを押したときの一連の流れ ---------- */

async function runPostFlow(text, image) {
  els.submitBtn.disabled = true;
  hideResult();
  resetFlow();

  els.form.hidden = true;
  els.phoneStatus.hidden = false;
  els.spinner.classList.remove('is-stopped');
  els.phoneStatusText.textContent = '投稿中…';

  await delay(300);

  // ---- 投稿データ ----
  setNode('data', 'is-active');
  await delay(500);
  setNode('data', 'is-done');
  fillArrowAfter('data');

  // ---- ①処理 ----
  setNode('process', 'is-active');
  await delay(750);

  const forbidden = FORBIDDEN_WORDS.find(word => text.includes(word));
  if (forbidden) {
    setNode('process', 'is-fail', `禁止ワード「${forbidden}」が含まれていたため、ここで止まりました`);
    els.spinner.classList.add('is-stopped');
    els.phoneStatusText.textContent = '❌ 投稿できませんでした';
    showResult(
      `<h3>❌ 処理でストップしました</h3><p>コメントに禁止ワード「${escapeHtml(forbidden)}」が含まれていたため、保存も共有も行われませんでした。</p>`,
      'blocked'
    );
    resetFormAfterFlow();
    return;
  }

  setNode('process', 'is-done');
  fillArrowAfter('process');

  // ---- ②保存 ----
  setNode('save', 'is-active');
  await delay(650);

  const post = {
    id: makePostId(),
    text,
    image,
    createdAt: formatDateTime(new Date()),
  };
  const posts = loadPosts();
  posts.push(post);
  savePosts(posts);
  renderPostList();

  setNode('save', 'is-done');
  fillArrowAfter('save');

  // ---- ③共有 ----
  setNode('share', 'is-active');
  await delay(600);
  const url = buildShareUrl(post);
  setNode('share', 'is-done');
  fillArrowAfter('share');

  // ---- 相手の画面 ----
  setNode('friend', 'is-active');
  await delay(500);
  setNode('friend', 'is-done');

  els.spinner.classList.add('is-stopped');
  els.phoneStatusText.textContent = '✅ 投稿完了！';

  showResult(
    `<h3>🔗 共有リンクができました</h3>
     <p>このリンクを友達に送ると、同じ投稿が表示されます。</p>
     <div class="share-link-box">
       <input type="text" readonly value="${escapeHtml(url)}" id="shareUrlInput">
       <button type="button" id="copyLinkBtn">コピー</button>
       <button type="button" id="openLinkBtn">開いてみる</button>
     </div>`,
    'success'
  );
  $('#copyLinkBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      $('#copyLinkBtn').textContent = 'コピーしました';
      setTimeout(() => { $('#copyLinkBtn').textContent = 'コピー'; }, 1500);
    } catch (e) {
      $('#shareUrlInput').select();
    }
  });
  $('#openLinkBtn').addEventListener('click', () => window.open(url, '_blank'));

  resetFormAfterFlow();
}

function resetFormAfterFlow() {
  // 少し結果を眺める時間を置いてから、フォームに戻す
  setTimeout(() => {
    els.phoneStatus.hidden = true;
    els.form.hidden = false;
    els.commentInput.value = '';
    $all('.image-picker__item', els.imagePicker).forEach(item => {
      item.classList.remove('is-selected');
      item.setAttribute('aria-pressed', 'false');
    });
    selectedEmoji = null;
    updateSubmitEnabled();
  }, 1600);
}

/* ---------- フォーム送信 ---------- */

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = els.commentInput.value.trim();
  runPostFlow(text, selectedEmoji);
});

/* ---------- 共有リンクから開かれた場合の表示 ---------- */

function showReceivedView(post) {
  els.composeView.hidden = true;
  els.receivedView.hidden = false;

  els.receivedPost.innerHTML = `
    <div class="post-card" style="border-left-color:var(--berry);">
      <span class="post-card__emoji">${escapeHtml(post.image || '❔')}</span>
      <div class="post-card__body">
        <p class="post-card__text">${escapeHtml(post.text || '（本文がありません）')}</p>
        <p class="post-card__meta">${escapeHtml(post.createdAt || '')}</p>
      </div>
    </div>
  `;
}

els.backToComposeBtn.addEventListener('click', () => {
  history.replaceState(null, '', location.pathname);
  els.receivedView.hidden = true;
  els.composeView.hidden = false;
});

/* ---------- 初期化 ---------- */

function init() {
  const shared = parseSharedPostFromUrl();
  if (shared) {
    showReceivedView(shared);
  } else {
    renderPostList();
    updateSubmitEnabled();
  }
}

init();
