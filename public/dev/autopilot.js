// Dev-инструмент для прогонов: ведёт дайвера через тот же touchInput, что и сенсорный стик. Не часть игры.
(() => {
  const A = {
    steer: null,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    dive() { return window.__deepHaul.game.scene.getScene('Dive'); },
    base() { return window.__deepHaul.game.scene.getScene('Base'); },
    st() { return window.__deepHaul.state; },
    async ready() {
      for (let i = 0; i < 100 && !(window.__deepHaul && window.__deepHaul.game && window.__deepHaul.game.loop); i++) await this.sleep(100);
      const g = window.__deepHaul.game;
      // Скрытая панель: RAF может не тикать вовсе — шагаем цикл сами и снимаем авто-паузу Phaser по hidden/blur.
      g.events.off('hidden', g.onHidden, g); g.events.off('blur', g.onBlur, g);
      g.loop.inFocus = true; if (typeof g.loop.resume === 'function') g.loop.resume();
      this.driveLoop(true);
      for (let i = 0; i < 300; i++) {
        const d = this.dive();
        if (d && d.player && d.mode) {
          this.st().autoPause = false;
          const b = document.getElementById('btn-resume'); if (b) b.click();
          return true;
        }
        await this.sleep(100);
      }
      return false;
    },
    /** В скрытой панели RAF почти не тикает: шагаем цикл Phaser сами, догоняя реальное время кадрами по 1/60 с. */
    driveLoop(on) {
      const g = window.__deepHaul.game;
      if (!on) { if (this._drive) clearInterval(this._drive); this._drive = null; return; }
      if (this._drive) return;
      g.loop.raf.stop();
      let last = performance.now();
      g.loop.lastTime = last;
      this._drive = setInterval(() => {
        const now = performance.now();
        const steps = Math.min(240, Math.floor((now - last) / (1000 / 60)));
        for (let i = 0; i < steps; i++) { last += 1000 / 60; g.loop.step(last); }
      }, 8);
    },
    install() {
      const d = this.dive(); if (d.__autoInstalled) return; d.__autoInstalled = true;
      d.events.on('update', () => {
        const AA = window.__auto; const s = AA.steer; if (!s) return; // всегда актуальный объект автопилота
        if (d.mode !== 'diving') { d.touchInput.x = 0; d.touchInput.y = 0; AA.steer = null; s.resolve('ended'); return; }
        const dx = s.x - d.player.x, dy = s.y - d.player.y, len = Math.hypot(dx, dy);
        if (len < s.tol || performance.now() > s.deadline) { d.touchInput.x = 0; d.touchInput.y = 0; AA.steer = null; s.resolve(len < s.tol ? 'ok' : 'timeout'); return; }
        d.touchInput.x = dx / len; d.touchInput.y = dy / len;
        if (s.pick) d.touchAction('pick');
      });
    },
    goto(x, y, opts = {}) { this.install(); return new Promise((resolve) => { this.steer = { x, y, tol: opts.tol ?? 14, deadline: performance.now() + (opts.timeout ?? 20000), resolve, pick: !!opts.pick }; }); },
    async path(points, opts) { for (const [x, y] of points) { const r = await this.goto(x, y, opts); if (r !== 'ok') return r; } return 'ok'; },
    pick() { this.dive().touchAction('pick'); },
    fire() { this.dive().touchAction('fire'); },
    o2() { this.dive().touchAction('o2'); },
    drop() { this.dive().touchAction('drop'); },
    face(dir) { const d = this.dive(); d.player.facing = dir; d.player.setFlipX(dir < 0); },
    async collect(rect, max, types) {
      const d = this.dive(); let n = 0;
      while (n < max) {
        if (d.mode !== 'diving') return 'ended';
        const px = d.player.x, py = d.player.y;
        const cands = d.loot.entities.filter((e) => e.state === 'world' && e.sprite.x >= rect[0] && e.sprite.x <= rect[2] && e.sprite.y >= rect[1] && e.sprite.y <= rect[3] && (!types || types.includes(e.type)));
        cands.sort((a, b) => Math.hypot(a.sprite.x - px, a.sprite.y - py) - Math.hypot(b.sprite.x - px, b.sprite.y - py));
        const e = cands[0]; if (!e) break;
        const r = await this.goto(e.sprite.x, e.sprite.y, { tol: 22 }); if (r !== 'ok') return r;
        const count = () => this.st().cargo.length + this.st().belt.packs.length + (this.st().save.knife.owned ? 1 : 0);
        const before = count();
        this.pick(); await this.sleep(120);
        const after = count();
        if (after === before) return 'full';
        n++;
      }
      return 'ok';
    },
    async cut(x, y, ms = 5000) {
      const d = this.dive(); const r = await this.goto(x, y, { tol: 26 }); if (r !== 'ok') return r;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) { if (!d.barriers.nearest(d.player.x, d.player.y)) return 'cut'; d.touchAction('pick'); await this.sleep(30); }
      return 'timeout';
    },
    creatures() { return this.dive().creatures.group.getChildren().map((c) => ({ kind: c.kind, x: Math.round(c.x), y: Math.round(c.y), hp: c.hp, state: c.dartState })); },
    status() {
      const d = this.dive(), s = this.st();
      return { mode: d.mode, pos: [Math.round(d.player.x), Math.round(d.player.y)], o2: Math.round(s.dive.oxygen), cargo: s.cargo.map((c) => c.type).join(','), weight: d.hud.weight, speed: d.hud.speedPct, coins: s.save.coins, parts: s.save.parts, belt: JSON.parse(JSON.stringify(s.belt)), knife: { ...s.save.knife }, last: s.last && s.last.result, msg: d.hud.message && d.hud.message.text };
    },
    repair(n) { return this.base().repair(n); },
    world(prefix) { return this.dive().loot.entities.filter((e) => e.state === 'world' && (!prefix || e.id.startsWith(prefix))).map((e) => [e.id, Math.round(e.sprite.x), Math.round(e.sprite.y), e.n]); },
    startDive() { this.dive().startDive(); },
    buy(id) { return this.base().buy(id); },
    buySupply(k, n) { return this.base().buySupply(k, n); },
    // ---- Планы погружений для автопрогона (выполняются асинхронно, прогресс в A.progress) ----
    pathLen(pts, from) { let d = 0; let prev = from; for (const p of pts) { if (prev) d += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; } return d; },
    speedNow(extraWeight = 0) { const d = this.dive(), s = this.st(); const v0 = 140 + 14 * s.save.upgrades.fins, C = 6 + 3 * s.save.upgrades.haul; const W = d.hud.weight + extraWeight; return v0 / (1 + 0.5 * (W / C) * (W / C)); },
    o2Needed(homePts, extraWeight = 0) { const d = this.dive(); const len = this.pathLen(homePts, [d.player.x, d.player.y]); return len / this.speedNow(extraWeight); },
    async shoot(kind, maxShots) {
      const d = this.dive(), s = this.st();
      if (s.save.upgrades.weapon <= 0) return 'no-weapon';
      for (let i = 0; i < maxShots; i++) {
        if (s.belt.base.harpoons + s.belt.packs.reduce((a, p) => (p.kind === 'harpoons' ? a + p.n : a), 0) <= 0) return 'no-ammo';
        const c = this.creatures().find((c) => c.kind === kind); if (!c) return 'dead';
        if (Math.abs(c.x - d.player.x) > 230) { await this.goto(c.x + (c.x < d.player.x ? 150 : -150), c.y, { tol: 20, timeout: 4000 }); }
        await this.goto(d.player.x, c.y, { tol: 6, timeout: 1500 });
        const cc = this.creatures().find((c) => c.kind === kind); if (!cc) return 'dead';
        this.face(cc.x < d.player.x ? -1 : 1); this.fire(); await this.sleep(500);
      }
      return this.creatures().find((c) => c.kind === kind) ? 'alive' : 'dead';
    },
    async collectGuarded(rect, max, types, homePts, margin = 5) {
      const d = this.dive(), s = this.st(); let n = 0;
      while (n < max) {
        if (d.mode !== 'diving') return 'ended';
        if (homePts && this.o2Needed(homePts, 2) + margin > s.dive.oxygen) return 'low-o2';
        // как игрок: если только что укусили и запас уже меньше полутора дорог домой — уходим
        if (homePts && d.time.now - d.player.hurtUntil < 2000 && this.o2Needed(homePts, 2) * 1.5 > s.dive.oxygen) { this.progress.log.push('укусили при малом запасе — ухожу'); return 'low-o2'; }
        const px = d.player.x, py = d.player.y;
        const cands = d.loot.entities.filter((e) => e.state === 'world' && e.sprite.x >= rect[0] && e.sprite.x <= rect[2] && e.sprite.y >= rect[1] && e.sprite.y <= rect[3] && (!types || types.includes(e.type)));
        cands.sort((a, b) => Math.hypot(a.sprite.x - px, a.sprite.y - py) - Math.hypot(b.sprite.x - px, b.sprite.y - py));
        const e = cands[0]; if (!e) return 'empty';
        const r = await this.goto(e.sprite.x, e.sprite.y, { tol: 22, timeout: 6000 }); if (r !== 'ok') return r;
        const count = () => s.cargo.length + s.belt.packs.length + (s.save.knife.owned ? 1 : 0);
        const before = count();
        this.pick(); await this.sleep(100);
        const after = count();
        if (after === before) return 'full';
        n++;
      }
      return 'ok';
    },
    async home(pts) {
      const d = this.dive(), s = this.st();
      for (const p of pts) {
        const r = await this.gotoWithO2(p[0], p[1]); if (r !== 'ok') return r;
      }
      void d; void s; return 'ok';
    },
    gotoWithO2(x, y) {
      // как игрок: баллончик, когда запас падает ниже 8 с и он есть на поясе
      const s = this.st(); const self = this;
      return new Promise((resolve) => {
        const tick = setInterval(() => { const o2n = s.belt.base.o2 + s.belt.packs.reduce((a, p) => (p.kind === 'o2' ? a + p.n : a), 0); if (s.dive.active && s.dive.oxygen < 6 && o2n > 0) { self.o2(); self.progress.log.push('баллончик при O2<6'); } }, 300);
        this.goto(x, y, { tol: 20, timeout: 25000 }).then((r) => { clearInterval(tick); resolve(r); });
      });
    },
    progress: { running: false, step: 0, status: '', log: [] },
    snaps: {},
    async runPlan(steps) {
      const P = this.progress; P.running = true; P.step = 0; P.status = 'run'; P.log = [];
      try {
        for (const st of steps) {
          P.step++;
          let r = 'ok';
          if (st.t === 'path') r = await this.path(st.pts, { tol: st.tol ?? 18, timeout: st.timeout ?? 12000 });
          else if (st.t === 'collect') r = await this.collectGuarded(st.rect, st.max, st.types, st.home, st.margin);
          else if (st.t === 'cut') r = await this.cut(st.x, st.y, st.ms ?? 6000);
          else if (st.t === 'shoot') r = await this.shoot(st.kind, st.max ?? 4);
          else if (st.t === 'home') r = await this.home(st.pts);
          else if (st.t === 'o2') { this.o2(); await this.sleep(150); }
          else if (st.t === 'snapshot') { await this.snapshot(st.name); }
          else if (st.t === 'wait') await this.sleep(st.ms);
          P.log.push(`${st.t}:${r}`);
          if (r === 'ended') break;
          if (r === 'low-o2' && st.t === 'collect') { P.log.push('возврат: кислорода впритык'); }
        }
        P.status = this.dive().mode === 'base' ? 'at-base' : 'done';
      } catch (e) { P.status = 'error: ' + (e && e.message); }
      P.running = false;
    },
    async snapshot(name) {
      const url = await window.__deepHaul.snapshot();
      const img = new Image(); img.src = url; await new Promise((r) => (img.onload = r));
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      this.snaps[name] = c.toDataURL('image/jpeg', 0.92); return this.snaps[name].length;
    },
  };
  window.__auto = A;
})();

// ---------------------------------------------------------------------------------------------
// Кампания: автономное прохождение до капсулы без DEV. Политика покупок + жадный сбор с O2-страховкой.
// Знает координаты (это проверка логики и экономики, не читаемости).
// ---------------------------------------------------------------------------------------------
(() => {
  const A = window.__auto;
  const DOCK = [1200, 184];
  const H1 = [[1200, 560], [1200, 680]];
  const H2 = [...H1, [1296, 760], [1296, 1104], [1280, 1250]];
  const H3 = [...H2, [1552, 1300], [1552, 1600], [1660, 1624], [1740, 1624], [1780, 1672], [1860, 1672], [1920, 1620], [2160, 1620], [2160, 1800], [2160, 1960], [1870, 2070]];
  const R = {
    shaft: { path: [[1200, 400]], rect: [1100, 224, 1300, 560], tier: 1 },
    hub1: { path: H1, rect: [880, 528, 1480, 840], tier: 1 },
    w1: { path: [...H1, [930, 720], [760, 720], [690, 720]], rect: [600, 630, 915, 780], tier: 1 },
    e1: { path: [...H1, [1430, 700], [1500, 704], [1630, 700]], rect: [1450, 620, 1720, 780], tier: 1, net: 'net-e1', netAt: [1440, 704] },
    s2: { path: [...H1, [1296, 760], [1296, 950]], rect: [1248, 800, 1380, 1104], tier: 1 },
    hub2: { path: H2, rect: [920, 1060, 1640, 1470], tier: 2, fish: true },
    w2: { path: [...H2, [900, 1216], [744, 1208]], rect: [660, 1130, 960, 1290], tier: 2 },
    crev: { path: [...H2, [1000, 1380], [928, 1380]], rect: [890, 1300, 965, 1430], tier: 2 },
    e2: { path: [...H2, [1560, 1248], [1580, 1248], [1780, 1250]], rect: [1580, 1160, 1880, 1340], tier: 2, net: 'net-e2', netAt: [1584, 1248], tools: 1 },
    hub3: { path: H3, rect: [1500, 1860, 2220, 2280], tier: 3, big: true },
    d1: { path: [...H3, [1600, 2064], [1560, 2064], [1480, 2064], [1320, 2060]], rect: [1225, 1975, 1540, 2150], tier: 3, net: 'net-d1', netAt: [1556, 2064], tools: 1 },
    cap: { path: [...H3, [1920, 2200], [1920, 2400], [1800, 2480], [1690, 2500]], rect: [1600, 2400, 2064, 2560], tier: 3, capsule: true },
  };
  const rev = (pts) => [...pts].reverse().concat([DOCK]);
  const remaining = (reg) => A.dive().loot.entities.filter((e) => e.state === 'world' && e.sprite.x >= reg.rect[0] && e.sprite.x <= reg.rect[2] && e.sprite.y >= reg.rect[1] && e.sprite.y <= reg.rect[3]);
  const value = (e) => ({ shard: 3, ore: 9, crystal: 24, parts: 6, o2: 10, harpoons: 6, knife: 30, capsule: 100 })[e.type] || 0;
  const pathLen = (pts, from) => { let d = 0, p = from; for (const q of pts) { d += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; } return d; };
  const sp = (lvls, w, c) => { const v0 = 140 + 14 * lvls.fins; const r = w / c; const m = r <= 1 ? 1 / (1 + 0.5 * r * r) : (2 / 3) / (1 + 6 * (r - 1) * (r - 1)); return v0 * m; };

  function policy(s) {
    const u = s.save.upgrades; const coins = s.save.coins; const parts = s.save.parts; const log = [];
    const buy = (id) => { const before = s.save.coins; A.buy(id); if (s.save.coins !== before) { log.push(`${id}→${s.save.upgrades[id]}`); return true; } return false; };
    const sup = (k, n) => { let bought = 0; for (let i = 0; i < n; i++) { const before = s.save.coins; A.buySupply(k, 1); if (s.save.coins === before) break; bought++; } if (bought) log.push(`+${bought} ${k}`); };
    const tier3 = u.tank >= 5;
    // ремонт ножа, если есть целые сети
    const netsLeft = A.dive().barriers.nets.filter((n) => !n.cut).length;
    if (s.save.knife.owned && netsLeft > 0 && s.save.knife.durability < 1) { const before = s.save.coins; A.repair(1); if (s.save.coins !== before) log.push('repair+1'); }
    // на глубине сначала баллончики (резерв), потом улучшения
    if (tier3) { const need = (u.tank >= 7 ? 3 : 2) - s.belt.base.o2; if (need > 0) sup('o2', need); }
    // приоритеты
    const order = [
      () => u.tank < 2 && buy('tank'), () => u.haul < 1 && buy('haul'), () => u.tank < 4 && buy('tank'), () => u.haul < 2 && buy('haul'),
      () => u.lantern < 1 && buy('lantern'), () => u.tank < 6 && buy('tank'), () => u.haul < 3 && buy('haul'),
      () => u.weapon < 1 && parts >= 2 && buy('weapon'), () => u.tools < 1 && s.save.knife.owned && buy('tools'),
      () => u.fins < 2 && buy('fins'), () => u.tank < 8 && buy('tank'), () => u.haul < 4 && buy('haul'), () => u.lantern < 2 && buy('lantern'), () => u.haul < 5 && buy('haul'),
    ];
    for (let pass = 0; pass < 3; pass++) for (const step of order) step();
    if (u.weapon >= 1) { const need = 6 - (s.belt.base.harpoons); if (need > 0) sup('harpoons', Math.min(need, 5)); }
    if (tier3) { const need = (u.tank >= 7 ? 3 : 2) - s.belt.base.o2; if (need > 0) sup('o2', need); }
    if (u.weapon >= 1 && s.belt.base.harpoons < 4) sup('harpoons', 4 - s.belt.base.harpoons);
    void coins;
    return log;
  }

  function dynamicRegions() {
    const out = {};
    const inAny = (e) => Object.values(R).some((reg) => e.sprite.x >= reg.rect[0] && e.sprite.x <= reg.rect[2] && e.sprite.y >= reg.rect[1] && e.sprite.y <= reg.rect[3]);
    const stray = A.dive().loot.entities.filter((e) => e.state === 'world' && !inAny(e));
    for (const e of stray) {
      // ближайшая путевая точка среди статических маршрутов → путь до неё + сам предмет
      let best = null;
      for (const reg of Object.values(R)) reg.path.forEach((pt, i) => { const d = Math.hypot(pt[0] - e.sprite.x, pt[1] - e.sprite.y); if (!best || d < best.d) best = { d, path: reg.path.slice(0, i + 1), tier: reg.tier }; });
      if (!best || best.d > 400) continue;
      const key = `stray:${e.id}`;
      out[key] = { path: [...best.path, [e.sprite.x, e.sprite.y]], rect: [e.sprite.x - 40, e.sprite.y - 40, e.sprite.x + 40, e.sprite.y + 40], tier: best.tier, capsule: e.type === 'capsule', stray: true };
    }
    return out;
  }

  function pickRegion(s) {
    const u = s.save.upgrades; const maxO2 = s.dive.maxOxygen; const C = 6 + 3 * u.haul;
    const cands = [];
    for (const [key, reg] of Object.entries({ ...R, ...dynamicRegions() })) {
      if (reg.capsule) { if (s.save.capsuleDelivered || C < 12) continue; }
      if (reg.tools && u.tools < reg.tools) continue;
      if (reg.net && !s.save.netsCut.includes(reg.net) && !(s.save.knife.owned && s.save.knife.durability > 0)) continue;
      const items = remaining(reg);
      if (!reg.capsule && items.length === 0) continue;
      const len = pathLen(reg.path, DOCK);
      const tOut = len / sp(u, 0, C);
      const backW = reg.capsule ? 24 : Math.min(C, 2 * C);
      const tBack = len / sp(u, backW, C);
      const fightTime = (reg.tier >= 2 && u.weapon >= 1 ? 8 : 0) + (reg.big && u.weapon >= 1 ? 5 : 0);
      const collect = reg.capsule ? 4 : Math.min(10, 2 + 1.5 * Math.min(items.length, reg.tier === 3 ? 4 : 6));
      const enemyPenalty = (reg.fish && u.weapon < 1 ? 12 : 0) + (reg.big && u.weapon < 1 ? 10 : 0) + (reg.net && !s.save.netsCut.includes(reg.net) ? 2 : 0);
      const total = (tOut + tBack + collect + fightTime) * 1.1 + enemyPenalty;
      if (total > maxO2 + 8 * s.belt.base.o2 * 0.8) continue;
      const score = items.reduce((a, e) => a + value(e), 0) * (reg.capsule ? 10 : 1) / Math.max(1, total / 20);
      cands.push({ key, reg, score, total, items: items.length });
    }
    cands.sort((a, b) => b.score - a.score);
    return cands[0] || null;
  }

  async function runRegion(c, s) {
    const P = A.progress; const d = A.dive(); const u = s.save.upgrades; const C = 6 + 3 * u.haul;
    const home = rev(c.reg.path);
    P.log.push(`→ ${c.key} (${c.items} предм., ~${Math.round(c.total)} с)`);
    // по пути на глубину — снять рыб второго хаба, иначе на обратном пути они топят гружёного дайвера
    if (c.reg.tier === 3 && u.weapon >= 1 && A.creatures().some((x) => x.kind === 'fish')) {
      const r0 = await A.path(H2, { tol: 18, timeout: 15000 });
      if (r0 === 'ok') { const f1 = await A.shoot('fish', 2); const f2 = await A.shoot('fish', 2); P.log.push(`рыбы хаба 2 по пути: ${f1}/${f2}`); }
    }
    const r = await A.path(c.reg.path, { tol: 18, timeout: 15000 });
    if (r !== 'ok') { P.log.push(`путь: ${r}`); if (d.mode !== 'diving') return; }
    if (c.reg.fish && u.weapon >= 1) { const sh = await A.shoot('fish', 3); P.log.push(`рыбы: ${sh}`); const sh2 = await A.shoot('fish', 2); P.log.push(`рыбы: ${sh2}`); }
    if (c.reg.big && u.weapon >= 1) { const sh = await A.shoot('fishBig', 3); P.log.push(`большая рыба: ${sh}`); }
    if (c.reg.net && !s.save.netsCut.includes(c.reg.net)) { const cr = await A.cut(c.reg.netAt[0], c.reg.netAt[1], 7000); P.log.push(`сеть ${c.reg.net}: ${cr}, нож ${s.save.knife.durability}`); if (cr !== 'cut') { await A.home(home); return; } }
    if (c.reg.capsule) {
      const cap = remaining(c.reg).find((e) => e.type === 'capsule') || A.dive().loot.entities.find((e) => e.state === 'world' && e.type === 'capsule' && Math.hypot(e.sprite.x - A.dive().player.x, e.sprite.y - A.dive().player.y) < 120);
      if (cap) { await A.goto(cap.sprite.x, cap.sprite.y, { tol: 20, timeout: 8000 }); A.pick(); await A.sleep(150); P.log.push(`капсула: ${s.cargo.some((x) => x.type === 'capsule') ? 'взята' : 'нет'}`); }
    } else {
      // жадный сбор: ценность/вес, с O2-страховкой на возврат и без перегруза выше 1.3C
      let guard = 0;
      while (d.mode === 'diving' && guard++ < 40 && !A.abortCampaign) {
        const W = s.cargo.reduce((a, x) => a + x.weight, 0);
        const items = remaining(c.reg).filter((e) => e.visible || true);
        const px = d.player.x, py = d.player.y;
        const pickable = items.filter((e) => { const w = { shard: 1, ore: 2, crystal: 4, parts: 2 }[e.type] ?? 0; return W + w <= C * 1.3 || w === 0; });
        pickable.sort((a, b) => (value(b) / Math.max(1, Math.hypot(b.sprite.x - px, b.sprite.y - py))) - (value(a) / Math.max(1, Math.hypot(a.sprite.x - px, a.sprite.y - py))));
        const e = pickable[0]; if (!e) break;
        const w = { shard: 1, ore: 2, crystal: 4, parts: 2 }[e.type] ?? 0;
        const risk = (c.reg.fish || c.reg.big) && u.weapon < 1 ? 1.45 : 1.2;
        const back = (pathLen(home, [e.sprite.x, e.sprite.y]) / sp(u, W + w, C)) * risk + 4;
        const o2avail = s.dive.oxygen + 8 * 0.7 * (s.belt.base.o2 + s.belt.packs.reduce((a, p) => (p.kind === 'o2' ? a + p.n : a), 0));
        if (back > o2avail) { P.log.push('страховка O2: домой'); break; }
        const g = await A.goto(e.sprite.x, e.sprite.y, { tol: 22, timeout: 6000 });
        if (g !== 'ok') { if (d.mode !== 'diving') return; continue; }
        A.pick(); await A.sleep(100);
      }
    }
    const hr = await A.home(home);
    P.log.push(`домой: ${hr}`);
  }

  A.campaign = async function (opts = {}) {
    const { maxDives = 60 } = opts; const s = A.st(); const P = A.progress; P.running = true; P.status = 'campaign'; P.log = []; P.dives = 0;
    try {
      A.abortCampaign = false;
      while (P.dives < maxDives && !s.save.capsuleDelivered && !A.abortCampaign) {
        const d = A.dive();
        // на базе: покупки и выбор цели
        for (let i = 0; i < 100 && d.mode !== 'base'; i++) await A.sleep(100);
        if (d.mode !== 'base') { P.log.push('не на базе, стоп'); break; }
        const bought = policy(s); if (bought.length) P.log.push(`покупки: ${bought.join(', ')}`);
        const c = pickRegion(s);
        if (!c) { P.log.push('нет достижимой цели — стоп'); P.stuck = true; break; }
        for (let i = 0; i < 60 && !(window.__deepHaul.game.scene.isActive('Base') && A.base().root); i++) await A.sleep(100);
        A.base().closeAndDive(); for (let i = 0; i < 40 && d.mode !== 'diving'; i++) await A.sleep(100);
        if (d.mode !== 'diving') { d.startDive(); await A.sleep(300); }
        if (d.mode !== 'diving') { P.log.push('не удалось начать заход'); break; }
        P.dives++;
        await runRegion(c, s);
        for (let i = 0; i < 60 && d.mode !== 'base'; i++) await A.sleep(100); // докинг-переход
        const l = s.save.log[s.save.log.length - 1];
        if (l) P.log.push(`#${l.n} ${l.result} ${l.durationS}с +${l.coins}м +${l.parts}д ${JSON.stringify(l.delivered)} ${l.notes.join('; ')}`);
      }
      P.status = s.save.capsuleDelivered ? 'capsule-delivered' : 'stopped';
    } catch (e) { P.status = 'error: ' + (e && e.message); P.log.push(String(e && e.stack)); }
    P.running = false;
  };
})();
