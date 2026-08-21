// game.js — 코아이 러너 메인 (게임 루프 + 화면 전환)
import { loadAssets } from './assets.js';
import { initFirebase, registerUser, submitScore, fetchLeaderboard, isOnline, getUid } from './firebase.js';
import { renderCard, saveCard } from './result.js';

// ───────── 내부 해상도 (픽셀아트 기준) ─────────
const W = 400, H = 240;
const GROUND_Y = 200;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;
ctx.imageSmoothingEnabled = false;

let A = null; // assets

// ───────── 사운드 (WebAudio 삑삑이) ─────────
let audioCtx = null;
let muted = false;
function beep(freq, dur, type = 'square', slide = 0, vol = 0.08) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, audioCtx.currentTime + dur);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* 사운드는 실패해도 무시 */ }
}
const sfx = {
  jump: () => beep(500, 0.12, 'square', 350),
  eat: () => beep(1100, 0.08, 'square', 300, 0.06),
  die: () => beep(300, 0.4, 'sawtooth', -220, 0.1),
};

// ───────── 게임 상태 ─────────
const S = {
  state: 'ready', // ready | play | dying | over
  nickname: '',
  dist: 0,
  bananas: 0,
  speed: 2.2,
  player: { x: 48, y: GROUND_Y - 32, w: 32, h: 32, vy: 0, jumps: 0, holding: false },
  obstacles: [],
  items: [],
  clouds: [],
  particles: [],
  nextObstacle: 300,
  nextItem: 160,
  frame: 0,
  dieTimer: 0,
  shake: 0,
};

const rand = (a, b) => a + Math.random() * (b - a);
const score = () => Math.floor(S.dist * 0.12) + S.bananas * 10;

function resetGame() {
  S.dist = 0;
  S.bananas = 0;
  S.speed = 2.2;
  S.player.y = GROUND_Y - S.player.h;
  S.player.vy = 0;
  S.player.jumps = 0;
  S.obstacles = [];
  S.items = [];
  S.particles = [];
  S.nextObstacle = 300;
  S.nextItem = 160;
  S.frame = 0;
  S.shake = 0;
}

// ───────── 입력 ─────────
function pressJump() {
  if (S.state !== 'play') return;
  const p = S.player;
  const maxJumps = 2; // 더블점프
  if (p.jumps < maxJumps) {
    p.vy = p.jumps === 0 ? -6.4 : -5.6;
    p.jumps++;
    p.holding = true;
    sfx.jump();
  }
}
function releaseJump() {
  const p = S.player;
  p.holding = false;
  if (S.state === 'play' && p.vy < -2.5) p.vy = -2.5; // 짧게 누르면 낮게 점프
}

canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); pressJump(); });
canvas.addEventListener('pointerup', releaseJump);
canvas.addEventListener('pointercancel', releaseJump);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    if (e.repeat) return;
    e.preventDefault();
    pressJump();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') releaseJump();
});

// ───────── 스폰 ─────────
function spawnObstacle() {
  const roll = Math.random();
  if (roll < 0.45) {
    S.obstacles.push({ x: W + 20, y: GROUND_Y - 16, w: 16, h: 16, spr: 'crate' }); // 상자 1개
  } else if (roll < 0.7) {
    S.obstacles.push({ x: W + 20, y: GROUND_Y - 10, w: 16, h: 10, spr: 'rock' }); // 돌
  } else if (roll < 0.9) {
    // 상자 2개 나란히
    S.obstacles.push({ x: W + 20, y: GROUND_Y - 16, w: 16, h: 16, spr: 'crate' });
    S.obstacles.push({ x: W + 36, y: GROUND_Y - 16, w: 16, h: 16, spr: 'crate' });
  } else {
    // 상자 2단 (더블점프 유도) — 난이도 후반에만
    if (S.speed > 3.2) {
      S.obstacles.push({ x: W + 20, y: GROUND_Y - 16, w: 16, h: 16, spr: 'crate' });
      S.obstacles.push({ x: W + 20, y: GROUND_Y - 32, w: 16, h: 16, spr: 'crate' });
    } else {
      S.obstacles.push({ x: W + 20, y: GROUND_Y - 16, w: 16, h: 16, spr: 'crate' });
    }
  }
  S.nextObstacle = rand(160, 300) + S.speed * 26;
}

function spawnItems() {
  const count = 1 + Math.floor(Math.random() * 3); // 1~3개 묶음
  const air = Math.random() < 0.45;
  const baseY = air ? GROUND_Y - rand(58, 78) : GROUND_Y - 30;
  for (let i = 0; i < count; i++) {
    const bx = W + 20 + i * 18;
    // 장애물과 겹치면 공중으로 올린다
    const clash = S.obstacles.some((o) => Math.abs(o.x - bx) < 30);
    S.items.push({ x: bx, y: clash ? GROUND_Y - 70 : baseY, w: 14, h: 14 });
  }
  S.nextItem = rand(200, 420);
}

// ───────── 업데이트 ─────────
function update(f) {
  S.frame++;
  if (S.state === 'play') {
    S.speed = Math.min(6.5, S.speed + 0.00045 * f);
    S.dist += S.speed * f;
  }
  const sp = S.speed * f;

  // 플레이어 물리
  const p = S.player;
  if (S.state === 'play' || S.state === 'dying') {
    const gravity = p.holding && p.vy < 0 ? 0.22 : 0.38;
    p.vy += gravity * f;
    p.y += p.vy * f;
    if (p.y + p.h >= GROUND_Y && S.state === 'play') {
      p.y = GROUND_Y - p.h;
      p.vy = 0;
      p.jumps = 0;
    }
  }

  // 구름 (배경)
  if (S.clouds.length < 4 && Math.random() < 0.01) {
    S.clouds.push({ x: W + 30, y: rand(16, 90), s: rand(0.2, 0.5) });
  }
  S.clouds.forEach((c) => (c.x -= c.s * S.speed * 0.4 * f));
  S.clouds = S.clouds.filter((c) => c.x > -60);

  if (S.state !== 'play') {
    // 죽는 연출
    if (S.state === 'dying') {
      S.dieTimer -= f * 16.7;
      S.shake = Math.max(0, S.shake - 0.5 * f);
      if (S.dieTimer <= 0) showOver();
    }
    S.particles.forEach((pt) => { pt.x += pt.vx * f; pt.y += pt.vy * f; pt.life -= f; });
    S.particles = S.particles.filter((pt) => pt.life > 0);
    return;
  }

  // 스폰 카운트다운
  S.nextObstacle -= sp;
  S.nextItem -= sp;
  if (S.nextObstacle <= 0) spawnObstacle();
  if (S.nextItem <= 0) spawnItems();

  // 이동
  S.obstacles.forEach((o) => (o.x -= sp));
  S.items.forEach((it) => (it.x -= sp));
  S.obstacles = S.obstacles.filter((o) => o.x > -40);
  S.items = S.items.filter((it) => it.x > -30);

  // 파티클
  S.particles.forEach((pt) => { pt.x += pt.vx * f; pt.y += pt.vy * f; pt.life -= f; });
  S.particles = S.particles.filter((pt) => pt.life > 0);

  // 충돌 판정 (히트박스는 넉넉히 줄여서 억울한 죽음 방지)
  const hb = { x: p.x + 7, y: p.y + 6, w: p.w - 14, h: p.h - 8 };
  for (const o of S.obstacles) {
    const ob = { x: o.x + 2, y: o.y + 2, w: o.w - 4, h: o.h - 3 };
    if (hb.x < ob.x + ob.w && hb.x + hb.w > ob.x && hb.y < ob.y + ob.h && hb.y + hb.h > ob.y) {
      die();
      return;
    }
  }

  // 바나나 획득
  for (const it of S.items) {
    if (it.got) continue;
    if (hb.x < it.x + it.w && hb.x + hb.w > it.x && hb.y < it.y + it.h && hb.y + hb.h > it.y) {
      it.got = true;
      S.bananas++;
      sfx.eat();
      S.particles.push({ x: it.x, y: it.y - 4, vx: 0.3, vy: -0.8, life: 30, text: '+10' });
    }
  }
  S.items = S.items.filter((it) => !it.got);
}

function die() {
  S.state = 'dying';
  S.dieTimer = 700;
  S.shake = 6;
  S.player.vy = -4;
  sfx.die();
}

// ───────── 렌더 ─────────
function draw() {
  const sx = S.shake ? rand(-S.shake, S.shake) * 0.5 : 0;
  const sy = S.shake ? rand(-S.shake, S.shake) * 0.5 : 0;
  ctx.save();
  ctx.translate(Math.round(sx), Math.round(sy));

  // 하늘
  ctx.fillStyle = '#a2dcff';
  ctx.fillRect(-8, -8, W + 16, H + 16);

  // 구름
  S.clouds.forEach((c) => ctx.drawImage(A.cloud, Math.round(c.x), Math.round(c.y)));

  // 원경 언덕
  ctx.fillStyle = '#8fd47a';
  const hillShift = Math.floor((S.dist * 0.25) % 160);
  for (let i = -1; i < 4; i++) {
    const bx = i * 160 - hillShift;
    ctx.beginPath();
    ctx.moveTo(bx, GROUND_Y);
    ctx.lineTo(bx + 80, GROUND_Y - 36);
    ctx.lineTo(bx + 160, GROUND_Y);
    ctx.fill();
  }

  // 지면
  ctx.fillStyle = '#5cab48';
  ctx.fillRect(-8, GROUND_Y, W + 16, 6);
  ctx.fillStyle = '#7a4a1e';
  ctx.fillRect(-8, GROUND_Y + 6, W + 16, H - GROUND_Y);
  ctx.fillStyle = '#5c3714';
  const gShift = Math.floor(S.dist % 24);
  for (let x = -gShift; x < W + 24; x += 24) {
    ctx.fillRect(x, GROUND_Y + 12, 10, 3);
    ctx.fillRect(x + 14, GROUND_Y + 24, 8, 3);
  }

  // 아이템 (둥실 애니메이션)
  S.items.forEach((it) => {
    const bob = Math.sin((S.frame + it.x) * 0.1) * 2;
    ctx.drawImage(A.banana, Math.round(it.x), Math.round(it.y + bob), it.w, it.h);
  });

  // 장애물
  S.obstacles.forEach((o) => {
    ctx.drawImage(o.spr === 'rock' ? A.rock : A.crate, Math.round(o.x), Math.round(o.y), o.w, o.h);
  });

  // 코아이
  const p = S.player;
  const onGround = p.y + p.h >= GROUND_Y - 0.5;
  let frame;
  if (S.state === 'dying') {
    frame = A.koaiHit; // 충돌 표정
  } else if (A.koaiCustom) {
    frame = A.koai[0]; // 커스텀 이미지는 1프레임 + 살짝 바운스
  } else {
    frame = onGround && S.state === 'play' ? A.koai[Math.floor(S.frame / 6) % 2] : A.koai[0];
  }
  ctx.save();
  if (S.state === 'dying') {
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(-0.5);
    ctx.translate(-(p.x + p.w / 2), -(p.y + p.h / 2));
  }
  const bounce = A.koaiCustom && onGround && S.state === 'play' ? Math.abs(Math.sin(S.frame * 0.2)) * -2 : 0;
  ctx.drawImage(frame, Math.round(p.x), Math.round(p.y + bounce), p.w, p.h);
  ctx.restore();

  // 파티클 (+10)
  ctx.font = '9px NeoDunggeunmo, monospace';
  ctx.fillStyle = '#ff8f2b';
  S.particles.forEach((pt) => ctx.fillText(pt.text, Math.round(pt.x), Math.round(pt.y)));

  // HUD
  ctx.fillStyle = '#10121f';
  ctx.font = '11px NeoDunggeunmo, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE ${String(score()).padStart(5, '0')}`, W - 8, 18);
  ctx.textAlign = 'left';
  ctx.drawImage(A.banana, 8, 7, 13, 13);
  ctx.fillText(`x ${S.bananas}`, 25, 18);

  if (S.state === 'ready') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#29366f';
    ctx.fillText('탭 또는 스페이스로 점프!', W / 2, 110);
  }
  ctx.restore();
}

// ───────── 메인 루프 ─────────
let lastT = 0;
function loop(t) {
  const dt = lastT ? t - lastT : 16.7;
  lastT = t;
  const f = Math.min(dt / 16.7, 2.5); // 60fps 기준 배속 팩터
  update(f);
  draw();
  requestAnimationFrame(loop);
}

// ───────── 화면 전환 / UI ─────────
const $ = (id) => document.getElementById(id);
const startScreen = $('startScreen');
const overScreen = $('overScreen');

function showLeaderboard(list) {
  const ol = $('lbList');
  ol.innerHTML = '';
  if (!list.length) {
    ol.innerHTML = '<li><span>아직 기록이 없어요</span></li>';
    return;
  }
  const myUid = getUid();
  list.forEach((r, i) => {
    const li = document.createElement('li');
    if (myUid && r.id === myUid) li.className = 'me';
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    li.innerHTML = `<span><span class="rank">${medal}</span>${escapeHtml(r.nickname)}</span><span>${r.score}</span>`;
    ol.appendChild(li);
  });
  $('lbMode').textContent = isOnline() ? '' : '(오프라인 — 이 기기 기록)';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function showOver() {
  S.state = 'over';
  const finalScore = score();
  const { best } = await submitScore(S.nickname, finalScore, S.bananas);

  renderCard($('cardCanvas'), {
    nickname: S.nickname,
    score: finalScore,
    bananas: S.bananas,
    best,
    koaiSprite: A.koaiHappy,
    bananaSprite: A.banana,
  });
  overScreen.classList.remove('hidden');
  fetchLeaderboard().then(showLeaderboard).catch(() => {});
}

function startGame() {
  resetGame();
  overScreen.classList.add('hidden');
  startScreen.classList.add('hidden');
  S.state = 'play';
}

// 시작 버튼
$('startBtn').addEventListener('click', async () => {
  const nick = $('nickname').value.trim().slice(0, 8);
  if (!nick) {
    $('nickname').focus();
    $('nickname').placeholder = '닉네임을 입력하세요!';
    return;
  }
  S.nickname = nick;
  $('startBtn').disabled = true;
  registerUser(nick).finally(() => {
    $('startBtn').disabled = false;
    startGame();
  });
});

$('nickname').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('startBtn').click();
});

$('retryBtn').addEventListener('click', startGame);
$('saveBtn').addEventListener('click', () => saveCard($('cardCanvas'), S.nickname));

$('muteBtn').addEventListener('click', () => {
  muted = !muted;
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
});

// ───────── 부팅 ─────────
(async function boot() {
  A = await loadAssets();
  // 시작화면 미리보기 스프라이트
  const pv = $('preview');
  pv.width = 64; pv.height = 64;
  const pg = pv.getContext('2d');
  pg.imageSmoothingEnabled = false;
  pg.drawImage(A.koai[0], 0, 0, 64, 64);

  const savedNick = localStorage.getItem('coshow_nick');
  if (savedNick) $('nickname').value = savedNick;

  initFirebase().then((ok) => {
    $('netState').textContent = ok ? '● 온라인 랭킹 연결됨' : '○ 오프라인 모드 (기록은 이 기기에만 저장)';
    $('netState').style.color = ok ? '#73eff7' : '#94b0c2';
  });

  requestAnimationFrame(loop);
})();
