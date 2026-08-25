// game.js — 코아이 러너 메인 (게임 루프 + 화면 전환)
import { loadAssets } from './assets.js?v=14';
import { initFirebase, registerUser, submitScore, fetchLeaderboard, isOnline, getUid } from './firebase.js?v=14';
import { renderCard, saveCard } from './result.js?v=14';

// ───────── 내부 해상도 (픽셀아트 기준) ─────────
const W = 400, H = 240;
const GROUND_Y = 200;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// 표시 크기 × 기기 픽셀 비율에 맞춰 내부 해상도를 잡아 어떤 화면에서도 1:1로 선명하게 렌더
let fittedKey = '';
function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || W;
  const key = `${cssW}x${dpr}`;
  if (key === fittedKey) return;
  fittedKey = key;
  const scale = Math.max(1, Math.min(4, (cssW * dpr) / W));
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
fitCanvas();

// 모바일 세로 화면이면 게임 전체를 90도 회전시켜 가로로 보여준다
function updateOrientation() {
  const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 820;
  document.body.classList.toggle('rotated', portrait);
  const wrap = document.getElementById('wrap');
  if (portrait) {
    wrap.style.width = window.innerHeight + 'px';
    wrap.style.height = window.innerWidth + 'px';
  } else {
    wrap.style.width = '';
    wrap.style.height = '';
  }
  fittedKey = '';
  fitCanvas();
}
updateOrientation();
window.addEventListener('resize', updateOrientation);

// 안드로이드 크롬: 게임 시작 시 전체화면 + 가로 방향 잠금 시도 (실패하면 CSS 회전으로 대체)
async function tryLandscapeLock() {
  try {
    if (window.innerHeight > window.innerWidth && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    }
  } catch (e) { /* 미지원 브라우저는 CSS 회전 사용 */ }
}

// 벡터풍 커스텀 이미지는 스무딩을 켜고, 코드로 그린 픽셀 스프라이트는 끈 채로 그린다
function drawSprite(img, smooth, x, y, w, h) {
  ctx.imageSmoothingEnabled = smooth;
  ctx.drawImage(img, x, y, w, h);
  ctx.imageSmoothingEnabled = false;
}

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
  level: () => { beep(660, 0.1, 'square', 0, 0.08); setTimeout(() => beep(880, 0.18, 'square', 220, 0.08), 100); },
};

// 키비주얼 네온 팔레트: 레벨마다 네온 색상 순환 (시안 → 마젠타 → 그린)
const PALETTES = [
  { sky: '#141a3a', neon: '#57e6ff', mountainFar: '#1d2752', mountain: '#28336a', ground: '#1a2148', groundDark: '#242e63', hud: '#eaf6ff' },
  { sky: '#1f1438', neon: '#ff5fd0', mountainFar: '#2c1d50', mountain: '#392765', ground: '#251a46', groundDark: '#31245c', hud: '#ffeaf9' },
  { sky: '#0d1f33', neon: '#5fffa8', mountainFar: '#173049', mountain: '#20405c', ground: '#142c43', groundDark: '#1d3a57', hud: '#eafff3' },
];

// 무등산 실루엣 (한 세그먼트 400px, 시작·끝 높이 0으로 이어짐)
const MTN_FAR = [[0, 0], [55, -26], [130, -44], [200, -34], [265, -50], [330, -22], [400, 0]];
const MTN_NEAR = [[0, 0], [50, -20], [110, -42], [150, -58], [250, -58], [300, -40], [350, -16], [400, 0]];
const MTN_COLUMNS = [[155, 17], [173, 23], [191, 20], [209, 25], [227, 18], [245, 22]]; // 주상절리(서석대) 기둥 [x, 높이]

function drawRidge(pts, shift, color, columns) {
  const seg = 400;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-seg, GROUND_Y);
  for (let i = -1; i < 2; i++) {
    const bx = i * seg - shift;
    for (const [dx, dy] of pts) ctx.lineTo(bx + dx, GROUND_Y + dy);
  }
  ctx.lineTo(W + seg, GROUND_Y);
  ctx.closePath();
  ctx.fill();
  if (columns) {
    for (let i = -1; i < 2; i++) {
      const bx = i * seg - shift;
      for (const [cx, h] of columns) ctx.fillRect(bx + cx, GROUND_Y - 58 - h, 13, h + 4);
    }
  }
}

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
  level: 1,
  levelBannerT: 0,
  collected: [], // 심볼 인덱스별 획득 개수
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
  S.level = 1;
  S.levelBannerT = 0;
  S.collected = new Array(A ? A.items.length : 18).fill(0);
  S.playStart = Date.now(); // 물리 검증용 플레이 시작 시각
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

// e.isTrusted: 사람의 실제 입력에만 브라우저가 찍어주는 도장 — 스크립트가 만든 가짜 입력(매크로) 차단
canvas.addEventListener('pointerdown', (e) => { if (!e.isTrusted) return; e.preventDefault(); pressJump(); });
canvas.addEventListener('pointerup', releaseJump);
canvas.addEventListener('pointercancel', releaseJump);
window.addEventListener('keydown', (e) => {
  if (!e.isTrusted) return;
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
  // 스폰 지점 근처에 심볼 아이템이 있으면 겹치지 않게 잠시 미룬다
  if (S.items.some((it) => it.x > W - 40 && it.x < W + 110)) {
    S.nextObstacle = 60;
    return;
  }
  // 레벨 2부터 공중 장애물(드론) 등장 — 서 있으면 지나가지만, 점프 타이밍이 겹치면 위험
  if (S.level >= 2 && Math.random() < 0.25) {
    const baseY = GROUND_Y - rand(48, 66);
    S.obstacles.push({ x: W + 20, y: baseY, baseY, w: 18, h: 12, spr: 'drone', fly: true, phase: Math.random() * 6.28 });
    S.nextObstacle = rand(160, 300) + S.speed * 26;
    return;
  }
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
  // 스폰 지점 근처에 장애물이 있으면 겹치지 않게 잠시 미룬다
  if (S.obstacles.some((o) => o.x > W - 40 && o.x < W + 110)) {
    S.nextItem = 60;
    return;
  }
  const count = 1 + Math.floor(Math.random() * 3); // 1~3개 묶음
  const air = Math.random() < 0.45;
  const baseY = air ? GROUND_Y - rand(62, 82) : GROUND_Y - 34;
  for (let i = 0; i < count; i++) {
    const bx = W + 20 + i * 26;
    // 혹시라도 장애물과 가까우면 2단 상자보다 높은 공중으로 올린다
    const clash = S.obstacles.some((o) => Math.abs(o.x - bx) < 55);
    S.items.push({
      x: bx,
      y: clash ? GROUND_Y - 88 : baseY,
      w: 20,
      h: 20,
      spr: Math.floor(Math.random() * A.items.length), // 컨소시엄 심볼 랜덤
      phase: Math.random() * Math.PI * 2, // 둥실거림 고정 위상 (부드러운 움직임)
    });
  }
  S.nextItem = rand(200, 420);
}

// ───────── 업데이트 ─────────
function update(f) {
  S.frame++;
  if (S.state === 'play') {
    // 레벨이 오를수록 속도 상한도 올라간다
    S.speed = Math.min(Math.min(8, 6 + S.level * 0.5), S.speed + 0.00045 * f);
    S.dist += S.speed * f;
    // 1000점마다 레벨업: 배너 + 속도 점프
    const lv = Math.floor(score() / 1000) + 1;
    if (lv > S.level) {
      S.level = lv;
      S.levelBannerT = 110;
      S.speed = Math.min(8, S.speed + 0.5);
      sfx.level();
    }
  }
  if (S.levelBannerT > 0) S.levelBannerT -= f;
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

  // 이동 (드론은 약간 더 빠르고 위아래로 흔들림)
  S.obstacles.forEach((o) => {
    o.x -= sp * (o.fly ? 1.15 : 1);
    if (o.fly) o.y = o.baseY + Math.sin(S.frame * 0.08 + o.phase) * 4;
  });
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
      S.collected[it.spr] = (S.collected[it.spr] || 0) + 1;
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

  const pal = PALETTES[(S.level - 1) % PALETTES.length];

  // 하늘 (키비주얼 다크 네이비)
  ctx.fillStyle = pal.sky;
  ctx.fillRect(-8, -8, W + 16, H + 16);

  // 네온 입자(별) — 반짝임
  for (let i = 0; i < 24; i++) {
    let px = (i * 71 - Math.floor(S.dist * 0.04)) % (W + 20);
    if (px < 0) px += W + 20;
    ctx.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(S.frame * 0.04 + i * 1.7));
    ctx.fillStyle = i % 3 === 0 ? pal.neon : '#cfe0ff';
    ctx.fillRect(px, 8 + ((i * 37) % (GROUND_Y - 100)), 2, 2);
  }
  ctx.globalAlpha = 1;

  // 네온 웨이브 (키비주얼의 흐르는 라인)
  ctx.strokeStyle = pal.neon;
  ctx.lineWidth = 1;
  for (let wv = 0; wv < 3; wv++) {
    ctx.globalAlpha = 0.28 - wv * 0.08;
    ctx.beginPath();
    for (let x = -8; x <= W + 8; x += 8) {
      const y = 42 + wv * 30 + Math.sin((x + S.dist * (0.3 + wv * 0.12)) * 0.02 + wv * 2.1) * 14;
      x === -8 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 구름 (다크 톤에 맞게 희미하게)
  ctx.globalAlpha = 0.18;
  S.clouds.forEach((c) => ctx.drawImage(A.cloud, c.x, c.y));
  ctx.globalAlpha = 1;

  // 무등산 실루엣 2겹 (근경 정상엔 주상절리 기둥)
  drawRidge(MTN_FAR, Math.floor((S.dist * 0.1) % 400), pal.mountainFar, null);
  drawRidge(MTN_NEAR, Math.floor((S.dist * 0.22) % 400), pal.mountain, MTN_COLUMNS);

  // 지면: 네온 그라운드 라인 + 다크 + 회로 점선
  ctx.fillStyle = pal.neon;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(-8, GROUND_Y, W + 16, 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.ground;
  ctx.fillRect(-8, GROUND_Y + 2, W + 16, H - GROUND_Y);
  ctx.fillStyle = pal.groundDark;
  const gShift = Math.floor(S.dist % 24);
  for (let x = -gShift; x < W + 24; x += 24) {
    ctx.fillRect(x, GROUND_Y + 12, 10, 3);
    ctx.fillRect(x + 14, GROUND_Y + 24, 8, 3);
  }

  // 아이템 (둥실 애니메이션 — 고정 위상 + 소수점 좌표로 부드럽게)
  S.items.forEach((it) => {
    const bob = Math.sin(S.frame * 0.06 + (it.phase || 0)) * 2.5;
    drawSprite(A.items[it.spr || 0], A.itemsCustom, it.x, it.y + bob, it.w, it.h);
  });

  // 장애물
  S.obstacles.forEach((o) => {
    const spr = o.spr === 'rock' ? A.rock : o.spr === 'drone' ? A.drone : A.crate;
    drawSprite(spr, o.spr === 'crate' ? A.crateCustom : false, o.x, o.y, o.w, o.h);
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
  const bounce = A.koaiCustom && onGround && S.state === 'play' ? Math.abs(Math.sin(S.frame * 0.16)) * -2.5 : 0;
  drawSprite(frame, A.koaiCustom, p.x, p.y + bounce, p.w, p.h);
  ctx.restore();

  // 파티클 (+10)
  ctx.font = '9px Galmuri11, NeoDunggeunmo, monospace';
  ctx.fillStyle = '#ff8f2b';
  S.particles.forEach((pt) => ctx.fillText(pt.text, Math.round(pt.x), Math.round(pt.y)));

  // HUD
  ctx.fillStyle = pal.hud;
  ctx.font = '11px Galmuri11, NeoDunggeunmo, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE ${String(score()).padStart(5, '0')}`, W - 8, 18);
  ctx.fillText(`LV ${S.level}`, W - 8, 32);
  ctx.textAlign = 'left';
  // HUD 아이콘: 심볼 18종이 천천히 돌아가며 표시
  drawSprite(A.items[Math.floor(S.frame / 60) % A.items.length], A.itemsCustom, 8, 5, 15, 15);
  ctx.fillText(`x ${S.bananas}`, 27, 18);

  // 레벨업 배너 (깜빡임)
  if (S.levelBannerT > 0 && Math.floor(S.frame / 5) % 2 === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8f2b';
    ctx.font = '20px Galmuri11, NeoDunggeunmo, monospace';
    ctx.fillText(`LEVEL ${S.level}!`, W / 2, 88);
    ctx.font = '10px Galmuri11, NeoDunggeunmo, monospace';
    ctx.fillText('속도 UP!', W / 2, 104);
    ctx.font = '11px Galmuri11, NeoDunggeunmo, monospace';
    ctx.textAlign = 'left';
  }

  if (S.state === 'ready') {
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.hud;
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
  fitCanvas(); // 레이아웃/배율 변경 감지 (같으면 즉시 반환)
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
  const kinds = S.collected.filter((c) => c > 0).length;
  const playTime = Math.max(1, Math.round((Date.now() - (S.playStart || Date.now())) / 1000));
  const { best } = await submitScore(S.nickname, finalScore, S.bananas, kinds, playTime);

  renderCard($('cardCanvas'), {
    nickname: S.nickname,
    score: finalScore,
    bananas: S.bananas,
    best,
    koaiSprite: A.koaiHappy,
    symbols: A.items,
    collected: S.collected,
    emblem: A.emblem,
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
  tryLandscapeLock(); // 모바일: 가로 화면 전환 시도
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
  try { await document.fonts.load('11px Galmuri11'); } catch (e) { /* 폰트 실패해도 진행 */ }
  // 시작화면 미리보기 스프라이트
  const pv = $('preview');
  pv.width = 128; pv.height = 128;
  pv.style.width = '64px';
  pv.style.height = '64px';
  const pg = pv.getContext('2d');
  pg.imageSmoothingEnabled = A.koaiCustom;
  pg.drawImage(A.koai[0], 0, 0, 128, 128);

  const savedNick = localStorage.getItem('coshow_nick');
  if (savedNick) $('nickname').value = savedNick;

  initFirebase().then((ok) => {
    $('netState').textContent = ok ? '● 온라인 랭킹 연결됨' : '○ 오프라인 모드 (기록은 이 기기에만 저장)';
    $('netState').style.color = ok ? '#73eff7' : '#94b0c2';
  });

  requestAnimationFrame(loop);
})();
