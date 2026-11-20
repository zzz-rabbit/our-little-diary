/* ============================================================
   我们的小日记 · 云端版 (Supabase)
   - 数据存在 Supabase 云数据库，手机/电脑/任意网络均可访问
   - 账号登录，实时同步
   ============================================================ */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://egsymbchpllgsrjcrxas.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_qmmPMsEK16Xt09XP9qrNNg_VvmXnple';

  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // 两个账号的信息映射（id 来自创建账号时返回值）
  const USERS = {
    '12f3859d-f9d4-4805-9a24-483a6948c9c6': { name: '小暖', avatar: '🌸', color: '#E9A178', soft: '#FCE9DC' },
    'c5d7337e-3876-4c07-a417-260dad6691f7': { name: '小阳', avatar: '🌞', color: '#8FB6D4', soft: '#E7F1F9' }
  };
  const DEFAULT_USER = { name: 'TA', avatar: '💛', color: '#E9A178', soft: '#FCE9DC' };

  const MOODS = [
    { e: '😊', t: '开心' }, { e: '🥰', t: '甜蜜' }, { e: '😌', t: '平静' }, { e: '🥺', t: '想念' },
    { e: '😢', t: '难过' }, { e: '😤', t: '生气' }, { e: '🎉', t: '兴奋' }, { e: '🌙', t: '晚安' }
  ];
  const WEATHERS = [
    { e: '☀️', t: '晴' }, { e: '⛅', t: '多云' }, { e: '🌧️', t: '雨' },
    { e: '❄️', t: '雪' }, { e: '🌈', t: '彩虹' }, { e: '🌤️', t: '晴间多云' }
  ];

  let currentUser = null;      // Supabase user 对象
  let diaries = [];            // 云端日记数组
  let currentFilter = 'all';
  let searchTerm = '';
  let openDiaryId = null;
  let selectedMood = '😊';
  let selectedWeather = '☀️';
  let pendingImages = [];
  let toastTimer = null;
  let realtimeChannel = null;

  const $ = (id) => document.getElementById(id);

  /* ---------------- 工具 ---------------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function formatTime(iso) {
    const d = new Date(iso), now = new Date();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (sameDay(d, now)) return '今天 ' + hhmm;
    if (sameDay(d, yest)) return '昨天 ' + hhmm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hhmm;
  }
  function formatFull(iso) {
    const d = new Date(iso);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function getUser(id) { return USERS[id] || DEFAULT_USER; }
  function moodObj(e) { return MOODS.find((m) => m.e === e) || MOODS[0]; }
  function weatherObj(e) { return WEATHERS.find((w) => w.e === e) || WEATHERS[0]; }
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function setSync(state) {
    const dot = $('syncDot'), txt = $('syncText');
    if (state === 'syncing') { dot.classList.add('off'); txt.textContent = '同步中...'; }
    else { dot.classList.remove('off'); txt.textContent = '已同步 ☁️'; }
  }

  /* ---------------- 图片压缩 ---------------- */
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read'));
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode'));
        img.onload = () => {
          const MAX = 1024, QUALITY = 0.62;
          let w = img.width, h = img.height;
          if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
          else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', QUALITY));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function renderImagePreview() {
    $('imagePreview').innerHTML = pendingImages.map((src, i) => `
      <div class="preview-item">
        <img src="${src}" alt="配图 ${i + 1}" />
        <button type="button" class="preview-del" data-del-image="${i}" aria-label="移除">✕</button>
      </div>`).join('');
  }
  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const room = 6 - pendingImages.length;
    if (room <= 0) { toast('一篇日记最多 6 张图哦'); return; }
    toast('正在处理图片...');
    let added = 0;
    for (const f of files.slice(0, room)) {
      if (!f.type || f.type.indexOf('image/') !== 0) continue;
      if (f.size > 12 * 1024 * 1024) { toast('有张图太大，已跳过'); continue; }
      try { pendingImages.push(await compressImage(f)); added++; } catch (e) {}
    }
    renderImagePreview();
    if (added) toast('已添加 ' + added + ' 张图 📷');
  }

  /* ---------------- 认证 ---------------- */
  async function doLogin(email, password) {
    const err = $('loginError');
    err.textContent = '';
    if (!email || !password) { err.textContent = '请填写邮箱和密码'; return; }
    const btn = $('loginBtn'); btn.disabled = true; btn.textContent = '登录中...';
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email.trim(), password });
    btn.disabled = false; btn.textContent = '登 录';
    if (error) { err.textContent = '登录失败：邮箱或密码不对'; return; }
    currentUser = data.user;
    showMain();
    toast('欢迎回来，' + getUser(currentUser.id).name + ' ' + getUser(currentUser.id).avatar);
  }
  async function doLogout() {
    await supabaseClient.auth.signOut();
    currentUser = null; diaries = [];
    if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
    $('appMain').style.display = 'none';
    $('loginScreen').classList.remove('hidden');
    $('loginPassword').value = '';
  }
  async function doChangePassword() {
    const err = $('pwError');
    err.textContent = '';
    const cur = $('pwCurrent').value, neu = $('pwNew').value, conf = $('pwConfirm').value;
    if (!cur || !neu || !conf) { err.textContent = '请把三项都填好'; return; }
    if (neu.length < 6) { err.textContent = '新密码至少 6 位'; return; }
    if (neu !== conf) { err.textContent = '两次输入的新密码不一致'; return; }
    const btn = $('savePwBtn'); btn.disabled = true; btn.textContent = '修改中...';
    // 先用当前密码重新登录验证，再改密码（Supabase 安全要求）
    const email = currentUser.email;
    const { error: loginErr } = await supabaseClient.auth.signInWithPassword({ email, password: cur });
    if (loginErr) { btn.disabled = false; btn.textContent = '确认修改'; err.textContent = '当前密码不对'; return; }
    const { error } = await supabaseClient.auth.updateUser({ password: neu });
    btn.disabled = false; btn.textContent = '确认修改';
    if (error) { err.textContent = '修改失败：' + (error.message || '请重试'); return; }
    closeModal('pwModal');
    $('pwCurrent').value = ''; $('pwNew').value = ''; $('pwConfirm').value = '';
    toast('密码已修改，请用新密码重新登录 🔑');
    setTimeout(() => doLogout(), 800);
  }

  function showMain() {
    $('loginScreen').classList.add('hidden');
    $('appMain').style.display = '';
    const u = getUser(currentUser.id);
    $('accountAvatar').textContent = u.avatar;
    $('accountAvatar').style.background = u.soft;
    $('accountName').textContent = u.name;
    loadDiaries();
    setupRealtime();
  }

  /* ---------------- 云端数据 ---------------- */
  async function loadDiaries() {
    setSync('syncing');
    const { data, error } = await supabaseClient
      .from('diaries').select('*').order('created_at', { ascending: false });
    if (error) { toast('加载失败，请刷新重试'); setSync('off'); return; }
    diaries = data || [];
    setSync('ok');
    renderAll();
  }
  function setupRealtime() {
    if (realtimeChannel) return;
    realtimeChannel = supabaseClient.channel('diary-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diaries' }, () => loadDiaries())
      .subscribe();
    // 兜底：每 6 秒静默同步一次，确保即使实时订阅未生效也能同步
    setInterval(() => {
      if (currentUser && !$('editorModal').classList.contains('open')) {
        supabaseClient.from('diaries').select('*').order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (!error && data && JSON.stringify(data) !== JSON.stringify(diaries)) {
              diaries = data; renderAll();
            }
          });
      }
    }, 6000);
  }

  async function saveDiary() {
    const title = $('diaryTitle').value.trim();
    const content = $('diaryContent').value.trim();
    if (!content && !pendingImages.length) { toast('写点什么，或者加张图吧 ✍️'); return; }
    const finalTitle = title || (content ? content.split('\n')[0].slice(0, 16) : '一张照片 📷') || '无题';
    const editId = $('editId').value;
    const u = getUser(currentUser.id);
    const payload = {
      author_id: currentUser.id, author_name: u.name, author_avatar: u.avatar,
      title: finalTitle, content: content, mood: selectedMood, weather: selectedWeather,
      is_private: $('diaryPrivate').checked, images: pendingImages,
      updated_at: new Date().toISOString()
    };
    setSync('syncing');
    let error;
    if (editId) {
      ({ error } = await supabaseClient.from('diaries').update(payload).eq('id', editId));
    } else {
      payload.id = uid(); payload.created_at = new Date().toISOString();
      ({ error } = await supabaseClient.from('diaries').insert(payload));
    }
    if (error) { toast('保存失败，请重试'); setSync('off'); return; }
    closeModal('editorModal');
    toast(editId ? '已保存修改 💾' : '日记已存到云端 ☁️');
    await loadDiaries();
    if (openDiaryId && editId === openDiaryId) openDetail(openDiaryId);
  }
  async function deleteCurrentDiary() {
    const d = diaries.find((x) => x.id === openDiaryId);
    if (!d || d.author_id !== currentUser.id) return;
    if (!confirm('确定删除这篇日记吗？删除后无法恢复哦 🥺')) return;
    const { error } = await supabaseClient.from('diaries').delete().eq('id', openDiaryId);
    if (error) { toast('删除失败'); return; }
    closeModal('detailModal'); openDiaryId = null;
    toast('已删除'); loadDiaries();
  }
  async function updateComments(d) {
    const { error } = await supabaseClient.from('diaries')
      .update({ comments: d.comments }).eq('id', d.id);
    if (error) { toast('操作失败'); return false; }
    return true;
  }
  async function addComment() {
    const d = diaries.find((x) => x.id === openDiaryId);
    if (!d) return;
    const input = $('commentInput');
    const text = input.value.trim();
    if (!text) { toast('先写点什么再发送 💬'); return; }
    d.comments = d.comments || [];
    d.comments.push({ id: uid(), authorId: currentUser.id, content: text, createdAt: new Date().toISOString() });
    if (await updateComments(d)) { openDetail(openDiaryId); toast('留言已送达对方 💌'); }
  }
  async function deleteComment(cid) {
    const d = diaries.find((x) => x.id === openDiaryId);
    if (!d) return;
    d.comments = (d.comments || []).filter((c) => !(c.id === cid && c.authorId === currentUser.id));
    if (await updateComments(d)) { openDetail(openDiaryId); toast('已删除留言'); }
  }

  /* ---------------- 渲染 ---------------- */
  function renderAll() { renderWelcome(); renderDiaries(); }
  function getVisibleDiaries() {
    return diaries.filter((d) => !d.is_private || d.author_id === currentUser.id);
  }
  function renderWelcome() {
    const me = getUser(currentUser.id);
    const otherId = Object.keys(USERS).find((id) => id !== currentUser.id);
    const other = getUser(otherId || '');
    const hour = new Date().getHours();
    const greet = hour < 6 ? '夜深了，早点休息呀' : hour < 11 ? '早上好呀' : hour < 14 ? '中午好呀' : hour < 18 ? '下午好呀' : '晚上好呀';
    $('welcomeTitle').textContent = greet + '，' + me.name + ' ' + (hour < 6 ? '🌙' : '☀️');
    const all = getVisibleDiaries();
    const days = new Set(all.map((d) => new Date(d.created_at).toDateString())).size;
    const comments = all.reduce((n, d) => n + ((d.comments || []).length), 0);
    $('welcomeSub').textContent = '和 ' + other.name + ' 一起，已经写下 ' + all.length + ' 篇日记、' + comments + ' 句悄悄话啦 💌';
    $('stats').innerHTML = `
      <div class="stat-item"><div class="num">${all.length}</div><div class="label">篇日记</div></div>
      <div class="stat-item"><div class="num">${days}</div><div class="label">个日子</div></div>
      <div class="stat-item"><div class="num">${comments}</div><div class="label">次互动</div></div>`;
  }
  function renderDiaries() {
    const list = $('diaryList');
    let data = getVisibleDiaries();
    if (currentFilter === 'mine') data = data.filter((d) => d.author_id === currentUser.id);
    if (currentFilter === 'other') data = data.filter((d) => d.author_id !== currentUser.id);
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      data = data.filter((d) => (d.title + d.content).toLowerCase().includes(t));
    }
    if (!data.length) {
      list.innerHTML = `<div class="empty-state">
        <span class="empty-emoji">${searchTerm ? '🔍' : '📝'}</span>
        <h3>${searchTerm ? '没有找到相关回忆' : '这里还是空白的一页'}</h3>
        <p>${searchTerm ? '换个关键词再试试吧～' : '写下第一篇日记，开始属于你们的故事吧 💕'}</p></div>`;
      return;
    }
    list.innerHTML = data.map((d, i) => {
      const u = getUser(d.author_id);
      const mood = moodObj(d.mood), weather = weatherObj(d.weather);
      const excerpt = (d.title + '\n' + d.content).trim();
      const imgs = d.images || [];
      return `
        <article class="diary-card" data-id="${esc(d.id)}"
          style="--author-color:${esc(u.color)}; --author-soft:${esc(u.soft)}; animation-delay:${i * 0.04}s">
          <div class="card-top">
            <div class="card-author">
              <span class="avatar" style="background:${esc(u.soft)}">${esc(u.avatar)}</span>
              <div class="meta"><div class="name">${esc(u.name)}</div><div class="time">${formatTime(d.created_at)}</div></div>
            </div>
            <div class="card-badges">
              <span class="badge" title="${mood.t}">${mood.e}</span>
              <span class="badge" title="${weather.t}">${weather.e}</span>
              ${d.is_private ? '<span class="badge private">🔒 私密</span>' : ''}
            </div>
          </div>
          ${imgs.length ? `<div class="card-images">${imgs.slice(0, 3).map((src, idx) => `<img src="${src}" alt="日记配图" data-zoom="${esc(d.id)}" data-idx="${idx}" />`).join('')}</div>` : ''}
          <h3 class="card-title">${esc(d.title)}</h3>
          <p class="card-excerpt">${esc(excerpt)}</p>
          <div class="card-bottom">
            <div class="card-foot-left">
              <span>💬 ${(d.comments || []).length} 条评论</span>
              ${d.updated_at && d.updated_at !== d.created_at ? '<span>✏️ 编辑过</span>' : ''}
            </div>
            <span class="card-arrow">→</span>
          </div>
        </article>`;
    }).join('');
  }

  /* ---------------- 弹窗 ---------------- */
  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }
  function renderChoices() {
    $('moodChoices').innerHTML = MOODS.map((m) => `<button type="button" class="choice ${m.e === selectedMood ? 'selected' : ''}" data-mood="${m.e}" title="${m.t}">${m.e}</button>`).join('');
    $('weatherChoices').innerHTML = WEATHERS.map((w) => `<button type="button" class="choice ${w.e === selectedWeather ? 'selected' : ''}" data-weather="${w.e}" title="${w.t}">${w.e}</button>`).join('');
  }
  function openEditor(diary) {
    renderChoices();
    if (diary) {
      $('editId').value = diary.id;
      $('diaryTitle').value = diary.title;
      $('diaryContent').value = diary.content;
      $('diaryPrivate').checked = !!diary.is_private;
      selectedMood = diary.mood; selectedWeather = diary.weather;
      renderChoices();
      pendingImages = (diary.images || []).slice();
      $('editorTitle').textContent = '编辑这篇日记 ✍️';
      $('editorSub').textContent = '改一改，让它更接近此刻的心意';
    } else {
      $('editId').value = ''; $('diaryTitle').value = ''; $('diaryContent').value = '';
      $('diaryPrivate').checked = false;
      selectedMood = '😊'; selectedWeather = '☀️'; renderChoices();
      pendingImages = [];
      $('editorTitle').textContent = '写一篇日记 ✍️';
      $('editorSub').textContent = '此刻的心情，值得被好好记下';
    }
    updateCharCount(); renderImagePreview();
    openModal('editorModal');
    setTimeout(() => $('diaryTitle').focus(), 100);
  }
  function updateCharCount() { $('charCount').textContent = $('diaryContent').value.length + ' 字'; }
  function openDetail(id) {
    const d = diaries.find((x) => x.id === id);
    if (!d || (d.is_private && d.author_id !== currentUser.id)) { toast('这篇日记不可查看 🔒'); return; }
    openDiaryId = id;
    const u = getUser(d.author_id);
    const mine = d.author_id === currentUser.id;
    const mood = moodObj(d.mood), weather = weatherObj(d.weather);
    const comments = d.comments || [];
    const imgs = d.images || [];
    $('detailBody').innerHTML = `
      <div class="detail-meta" style="--author-soft:${esc(u.soft)}">
        <span class="avatar" style="background:${esc(u.soft)}">${esc(u.avatar)}</span>
        <div><div class="name">${esc(u.name)} ${mine ? '<span style="font-size:11px;color:#B7A69B;font-weight:400">· 我</span>' : ''}</div>
        <div class="time">${formatFull(d.created_at)}</div></div>
        <div class="badges">
          <span class="badge" title="${mood.t}">${mood.e} ${mood.t}</span>
          <span class="badge" title="${weather.t}">${weather.e} ${weather.t}</span>
          ${d.is_private ? '<span class="badge private">🔒 仅自己可见</span>' : ''}
        </div>
      </div>
      <h3 class="detail-title">${esc(d.title)}</h3>
      <div class="detail-content">${esc(d.content)}</div>
      ${imgs.length ? `<div class="detail-images">${imgs.map((src, idx) => `<img src="${src}" alt="日记配图" data-zoom="${esc(d.id)}" data-idx="${idx}" />`).join('')}</div>` : ''}
      <div class="comments-section">
        <h4 class="comments-title">💬 我们的对话 <span style="font-weight:400;color:#B7A69B">(${comments.length})</span></h4>
        <div id="commentList">
          ${comments.length ? comments.map((c) => {
            const cu = getUser(c.authorId);
            const canDel = c.authorId === currentUser.id;
            return `<div class="comment" style="--comment-soft:${esc(cu.soft)}">
              <span class="avatar" style="background:${esc(cu.soft)}">${esc(cu.avatar)}</span>
              <div class="comment-bubble">
                <span class="c-name">${esc(cu.name)}</span><span class="c-time">${formatTime(c.createdAt)}</span>
                ${canDel ? `<button class="comment-del" data-del-comment="${esc(c.id)}" title="删除">删除</button>` : ''}
                <div class="c-text">${esc(c.content)}</div>
              </div></div>`;
          }).join('') : '<div class="no-comments">还没有留言，来说第一句吧 👇</div>'}
        </div>
        <div class="comment-input-row">
          <textarea id="commentInput" rows="2" placeholder="留下一句想说的话...（Ctrl + Enter 发送）"></textarea>
          <button class="btn-primary" id="sendCommentBtn">发送</button>
        </div>
      </div>`;
    $('editDiaryBtn').style.display = mine ? '' : 'none';
    $('deleteDiaryBtn').style.display = mine ? '' : 'none';
    openModal('detailModal');
  }

  /* ---------------- 事件 ---------------- */
  function bindEvents() {
    document.addEventListener('click', (e) => {
      const closeEl = e.target.closest('[data-close]');
      if (closeEl) { closeModal(closeEl.dataset.close); return; }
      if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('open');
        if (e.target.id === 'detailModal') openDiaryId = null;
      }
    });

    $('loginBtn').addEventListener('click', () => doLogin($('loginEmail').value, $('loginPassword').value));
    $('loginPassword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin($('loginEmail').value, $('loginPassword').value);
    });
    document.querySelectorAll('.quick-login').forEach((b) => b.addEventListener('click', () => {
      $('loginEmail').value = b.dataset.email;
      $('loginPassword').value = b.dataset.pw;
      doLogin(b.dataset.email, b.dataset.pw);
    }));
    $('logoutBtn').addEventListener('click', doLogout);
    $('changePwBtn').addEventListener('click', () => {
      $('pwError').textContent = '';
      $('pwCurrent').value = ''; $('pwNew').value = ''; $('pwConfirm').value = '';
      openModal('pwModal');
    });
    $('savePwBtn').addEventListener('click', doChangePassword);

    $('filterTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-filter]');
      if (!tab) return;
      currentFilter = tab.dataset.filter;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      renderDiaries();
    });
    $('searchInput').addEventListener('input', (e) => { searchTerm = e.target.value.trim(); renderDiaries(); });

    $('writeBtn').addEventListener('click', () => openEditor(null));
    $('saveDiaryBtn').addEventListener('click', saveDiary);
    $('diaryContent').addEventListener('input', updateCharCount);
    $('moodChoices').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mood]'); if (!b) return;
      selectedMood = b.dataset.mood; renderChoices();
    });
    $('weatherChoices').addEventListener('click', (e) => {
      const b = e.target.closest('[data-weather]'); if (!b) return;
      selectedWeather = b.dataset.weather; renderChoices();
    });

    $('imageInput').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
    const zone = $('uploadZone');
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => {
      e.preventDefault(); e.stopPropagation(); zone.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => {
      e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragover');
    }));
    zone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    $('imagePreview').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del-image]'); if (!b) return;
      pendingImages.splice(Number(b.dataset.delImage), 1); renderImagePreview();
    });

    $('diaryList').addEventListener('click', (e) => {
      if (e.target.closest('[data-zoom]')) return;
      const card = e.target.closest('[data-id]');
      if (card) openDetail(card.dataset.id);
    });
    document.addEventListener('click', (e) => {
      const img = e.target.closest('[data-zoom]');
      if (!img) return;
      const d = diaries.find((x) => x.id === img.dataset.zoom);
      const src = d && d.images && d.images[Number(img.dataset.idx)];
      if (src) { $('lightboxImg').src = src; $('lightbox').classList.add('open'); }
    });
    $('lightboxClose').addEventListener('click', () => $('lightbox').classList.remove('open'));
    $('lightbox').addEventListener('click', (e) => {
      if (e.target === $('lightbox')) $('lightbox').classList.remove('open');
    });

    $('detailBody').addEventListener('click', (e) => {
      if (e.target.closest('#sendCommentBtn')) { addComment(); return; }
      const del = e.target.closest('[data-del-comment]');
      if (del) { deleteComment(del.dataset.delComment); return; }
    });
    $('detailBody').addEventListener('keydown', (e) => {
      if (e.target.id === 'commentInput' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addComment(); }
    });
    $('editDiaryBtn').addEventListener('click', () => {
      const d = diaries.find((x) => x.id === openDiaryId);
      if (d) openEditor(d);
    });
    $('deleteDiaryBtn').addEventListener('click', deleteCurrentDiary);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $('lightbox').classList.remove('open');
        document.querySelectorAll('.modal-overlay.open').forEach((m) => {
          m.classList.remove('open'); if (m.id === 'detailModal') openDiaryId = null;
        });
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  async function init() {
    bindEvents();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) { currentUser = session.user; showMain(); }
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session && !currentUser) { currentUser = session.user; showMain(); }
      else if (!session && currentUser) { currentUser = null; diaries = [];
        if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
        $('appMain').style.display = 'none'; $('loginScreen').classList.remove('hidden'); }
    });
  }
  init();
})();
