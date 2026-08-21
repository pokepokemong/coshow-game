// assets.js — 에셋 로더
// assets/ 폴더에 koai.png(코아이), banana.png(로고/바나나), obstacle.png(장애물)를
// 넣으면 자동으로 그 이미지를 쓰고, 없으면 코드로 그린 픽셀 플레이스홀더를 사용한다.

const PAL = {
  K: '#2a1e16', // 외곽선
  B: '#5c4433', // 몸통
  L: '#8a6a4f', // 밝은 털
  F: '#c9a882', // 얼굴/가슴
  E: '#141414', // 눈
  Y: '#ffd23f', // 바나나 노랑
  D: '#d9a520', // 바나나 음영
  S: '#7a4a1e', // 꼭지
  C: '#b5763a', // 상자
  X: '#8a5426', // 상자 판자
  G: '#8d9aa5', // 돌
  H: '#6a7680', // 돌 음영
  W: '#ffffff',
};

// 코아이 플레이스홀더(고릴라) 16x16 — 달리기 2프레임
const KOAI_F1 = [
  '....KKKKKK......',
  '...KBBBBBBK.....',
  '..KBBFFFFBBK....',
  '..KBFEFFEFBK....',
  '..KBFFFFFFBK....',
  '..KBBFKKFBBK....',
  '.KBBBBBBBBBBK...',
  '.KBLBFFFFBLBK...',
  'KBBKBFFFFBKBBK..',
  'KBBKBBFFBBKBBK..',
  'KBBK.BBBB.KBBK..',
  '.KK..BBBB..KK...',
  '....KBBBBK......',
  '....KBK.KBK.....',
  '...KBK...KBK....',
  '...KK.....KK....',
];
const KOAI_F2 = [
  '....KKKKKK......',
  '...KBBBBBBK.....',
  '..KBBFFFFBBK....',
  '..KBFEFFEFBK....',
  '..KBFFFFFFBK....',
  '..KBBFKKFBBK....',
  '.KBBBBBBBBBBK...',
  '.KBLBFFFFBLBK...',
  'KBBKBFFFFBKBBK..',
  'KBBKBBFFBBKBBK..',
  'KBBK.BBBB.KBBK..',
  '.KK..BBBB..KK...',
  '....KBBBBK......',
  '....KBBBBK......',
  '....KBKKBK......',
  '....KK..KK......',
];

// 바나나 12x12
const BANANA = [
  '........SS..',
  '.......KSK..',
  '......KYYK..',
  '.....KYYDK..',
  '....KYYDK...',
  '...KYYDK....',
  '.KKYYYDK....',
  'KYYYYDK.....',
  'KYYYDK......',
  'KYYDK.......',
  '.KKK........',
  '............',
];

// 나무상자 16x16
const CRATE = [
  'KKKKKKKKKKKKKKKK',
  'KCCCCCCCCCCCCCCK',
  'KCXCCCCCCCCCCXCK',
  'KCCXCCCCCCCCXCCK',
  'KCCCXCCCCCCXCCCK',
  'KCCCCXCCCCXCCCCK',
  'KCCCCCXCCXCCCCCK',
  'KCCCCCCXXCCCCCCK',
  'KCCCCCCXXCCCCCCK',
  'KCCCCCXCCXCCCCCK',
  'KCCCCXCCCCXCCCCK',
  'KCCCXCCCCCCXCCCK',
  'KCCXCCCCCCCCXCCK',
  'KCXCCCCCCCCCCXCK',
  'KCCCCCCCCCCCCCCK',
  'KKKKKKKKKKKKKKKK',
];

// 돌 16x10
const ROCK = [
  '.....KKKKK......',
  '...KKGGGGGKK....',
  '..KGGGGGGGGGK...',
  '.KGGGGWGGGGGGK..',
  '.KGGGGGGGGHHGK..',
  'KGGGGGGGGHHHHGK.',
  'KGGGGGGGHHHHHGK.',
  'KGHHGGGGHHHHHGK.',
  'KHHHHGHHHHHHHHK.',
  'KKKKKKKKKKKKKKK.',
];

// 드론 (공중 장애물, 레벨 2+) 16x11
const DRONE = [
  'KK....KK....KK..',
  '.KKKKKKKKKKKK...',
  '...K...K...K....',
  '..KGGGGGGGGK....',
  '.KGWWGGGGGGGK...',
  '.KGWGGGGGGYGK...',
  '.KGGGGGGGGYGK...',
  '..KGGGGGGGGK....',
  '...KKKKKKKK.....',
  '....K.....K.....',
  '...KK.....KK....',
];

// 구름 20x8
const CLOUD = [
  '......WWWW..........',
  '....WWWWWWWW........',
  '..WWWWWWWWWWWW......',
  '.WWWWWWWWWWWWWWWW...',
  'WWWWWWWWWWWWWWWWWW..',
  'WWWWWWWWWWWWWWWWWWW.',
  '.WWWWWWWWWWWWWWWWW..',
  '....................',
];

export function makeSprite(map, scale = 1) {
  const h = map.length;
  const w = map[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = map[y][x];
      if (ch === '.' || ch === ' ') continue;
      g.fillStyle = PAL[ch] || '#f0f';
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}

function tryImg(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadAssets() {
  // 컨소시엄 심볼 18종 — 먹는 아이템 (COSS_로고정리본_260605ver 기준)
  const symbolPaths = Array.from({ length: 18 }, (_, i) => `assets/symbols/sym${String(i + 1).padStart(2, '0')}.png`);
  const [koaiImg, koaiImg2, koaiHitImg, koaiHappyImg, bananaImg, obstacleImg, ...symbolImgs] = await Promise.all([
    tryImg('assets/koai.png'),
    tryImg('assets/koai2.png'), // 있으면 달리기 2번째 프레임으로 사용
    tryImg('assets/koai_hit.png'), // 충돌 시 표정
    tryImg('assets/koai_happy.png'), // 결과 카드 표정
    tryImg('assets/banana.png'),
    tryImg('assets/obstacle.png'),
    ...symbolPaths.map(tryImg),
  ]);
  const symbols = symbolImgs.filter(Boolean);

  const koaiFrames = koaiImg
    ? [koaiImg, koaiImg2 || koaiImg]
    : [makeSprite(KOAI_F1), makeSprite(KOAI_F2)];

  return {
    koai: koaiFrames,
    koaiCustom: !!koaiImg, // 커스텀 이미지면 바운스 애니메이션으로 대체
    koaiHit: koaiHitImg || koaiFrames[0],
    koaiHappy: koaiHappyImg || koaiFrames[0],
    // 아이템: 심볼 13종이 있으면 그걸 쓰고, 없으면 banana.png → 픽셀 바나나 순서로 대체
    items: symbols.length ? symbols : [bananaImg || makeSprite(BANANA)],
    itemsCustom: symbols.length > 0 || !!bananaImg,
    crate: obstacleImg || makeSprite(CRATE),
    crateCustom: !!obstacleImg,
    rock: makeSprite(ROCK),
    drone: makeSprite(DRONE),
    cloud: makeSprite(CLOUD),
  };
}
