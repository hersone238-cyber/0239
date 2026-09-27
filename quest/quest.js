// Квест «02:39»: цепочка зашифрованных загадок (формат — tools/build_quest.py).
(() => {
  const STORE = 'q0239';
  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let chain = null;
  let step = 0;      // номер текущей загадки
  let key = null;    // сырой ключ текущей загадки (для сохранения)
  let current = null;
  let shownHints = 0;

  // подсказки: не больше одной в день на весь квест; открытые остаются видны
  const HINTS = 'q0239h';
  const today = () => new Date().toLocaleDateString('sv');  // ГГГГ-ММ-ДД по местному времени
  function hintLog() {
    try { return JSON.parse(localStorage.getItem(HINTS) || 'null') || { day: '', shown: {} }; }
    catch (e) { return { day: '', shown: {} }; }
  }
  function saveHintLog(log) {
    try { localStorage.setItem(HINTS, JSON.stringify(log)); } catch (e) { /* приватный режим */ }
  }

  // Должна совпадать с norm() в tools/build_quest.py
  const norm = (s) => s.normalize('NFC').toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я]/g, '');
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const tob64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));

  async function open(rawKey, box) {
    const k = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.n) }, k, unb64(box.c));
    return JSON.parse(dec.decode(pt));
  }

  async function derive(answer, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(norm(answer)), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: chain.iter }, base, 256));
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ i: step, k: key ? tob64(key) : null })); } catch (e) { /* приватный режим */ }
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
  }

  // текст загадки: экранируем и превращаем ссылки в кликабельные
  function renderText(el, text) {
    el.textContent = '';
    const parts = text.split(/(https?:\/\/\S+)/g);
    for (const part of parts) {
      if (/^https?:\/\//.test(part)) {
        const a = document.createElement('a');
        a.href = part;
        a.textContent = part.replace(/^https?:\/\//, '');
        a.target = '_blank';
        a.rel = 'noopener';
        el.append(a);
      } else {
        el.append(part);
      }
    }
  }

  function show(p) {
    current = p;
    shownHints = 0;
    $('loading').hidden = true;
    if (p.final) return showFinal(p);
    $('card').hidden = false;
    $('num').textContent = '№ ' + (p.i + 1) + (p.label ? ' · ' + p.label : '');
    renderText($('text'), p.text);
    const pic = $('pic');
    if (p.image) { pic.src = p.image; pic.hidden = false; } else { pic.hidden = true; pic.removeAttribute('src'); }
    $('hints').textContent = '';
    shownHints = Math.min(hintLog().shown[p.i] || 0, (p.hints || []).length);
    for (let h = 0; h < shownHints; h++) addHint(p.hints[h]);
    $('hintBtn').hidden = !(p.hints && shownHints < p.hints.length);
    $('msg').textContent = '';
    $('msg').className = 'msg';
    $('input').value = '';
    // перезапуск анимации появления
    const card = $('card');
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
  }

  function showFinal(p) {
    $('card').hidden = true;
    $('final').hidden = false;
    renderText($('finalText'), p.text);
    const box = $('video');
    box.textContent = '';
    if (p.video) {
      const isFile = /\.(mp4|webm|mov)(\?|$)/i.test(p.video);
      const el = document.createElement(isFile ? 'video' : 'iframe');
      el.src = p.video;
      if (isFile) { el.controls = true; el.playsInline = true; }
      else { el.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'; el.allowFullscreen = true; }
      box.append(el);
    }
  }

  async function goTo(i, rawKey) {
    const s = chain.steps[i];
    const p = s.open ? s.open : await open(rawKey, s.box);
    step = i;
    key = rawKey;
    save();
    show(p);
  }

  async function tryAnswer(value) {
    const s = chain.steps[step];
    if (!s.locks || !norm(value)) return false;
    const k = await derive(value, s.salt);
    for (const lock of s.locks) {
      try {
        const { k: next } = await open(k, lock);
        await goTo(step + 1, unb64(next));
        return true;
      } catch (e) { /* не этот замок */ }
    }
    return false;
  }

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('input');
    const msg = $('msg');
    const value = input.value;
    if (!value.trim()) return;
    $('go').disabled = true;
    msg.className = 'msg';
    msg.textContent = '…';
    const ok = await tryAnswer(value);
    $('go').disabled = false;
    if (!ok) {
      msg.textContent = 'не то';
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
      input.select();
    }
  });

  function addHint(text) {
    const li = document.createElement('li');
    li.textContent = text;
    $('hints').append(li);
  }

  $('hintBtn').addEventListener('click', () => {
    if (!current || !current.hints || shownHints >= current.hints.length) return;
    const log = hintLog();
    if (log.day === today()) {
      $('msg').className = 'msg';
      $('msg').textContent = 'подсказка на сегодня уже была. следующая — завтра';
      return;
    }
    $('msg').textContent = '';
    addHint(current.hints[shownHints++]);
    log.day = today();
    log.shown[current.i] = shownHints;
    saveHintLog(log);
    if (shownHints >= current.hints.length) $('hintBtn').hidden = true;
  });

  // перенос прогресса между устройствами
  $('menuBtn').addEventListener('click', () => {
    $('saveCode').value = btoa(JSON.stringify({ i: step, k: key ? tob64(key) : null }));
    $('loadCode').value = '';
    $('sheet').showModal();
  });
  $('closeBtn').addEventListener('click', () => $('sheet').close());
  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('saveCode').value); $('copyBtn').textContent = 'скопировано'; }
    catch (e) { $('saveCode').select(); }
  });
  $('loadBtn').addEventListener('click', async () => {
    try {
      const { i, k } = JSON.parse(atob($('loadCode').value.trim()));
      await goTo(i, k ? unb64(k) : null);
      $('final').hidden = !current.final;
      $('sheet').close();
    } catch (e) {
      $('loadCode').value = '';
      $('loadCode').placeholder = 'код не подошёл';
    }
  });

  (async () => {
    chain = await (await fetch('chain.json', { cache: 'no-cache' })).json();
    const saved = load();
    if (saved && saved.i > 0 && saved.k) {
      try { return await goTo(saved.i, unb64(saved.k)); } catch (e) { /* цепочку пересобрали — начинаем заново */ }
    }
    await goTo(0, null);
  })();
})();
