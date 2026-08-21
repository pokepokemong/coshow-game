// result.js — 결과 카드 렌더링 + 이미지 저장/공유 (키비주얼 네온 테마)

const CW = 216; // 카드 내부 좌표계
const CH = 316;
const NAVY = '#141a3a';
const PANEL = '#1d2752';
const NEON = '#57e6ff';

function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

// 결과 카드를 캔버스에 그린다
export function renderCard(canvas, { nickname, score, bananas, best, koaiSprite, symbols = [], collected = [], emblem = null }) {
  const SCALE = 3; // 저장용 PNG 선명도
  canvas.width = CW * SCALE;
  canvas.height = CH * SCALE;
  const g = canvas.getContext('2d');
  g.scale(SCALE, SCALE);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';

  // 배경 + 네온 테두리
  px(g, 0, 0, CW, CH, NEON);
  px(g, 3, 3, CW - 6, CH - 6, NAVY);

  // 네온 웨이브 장식 (하단)
  g.strokeStyle = NEON;
  g.lineWidth = 1;
  for (let wv = 0; wv < 2; wv++) {
    g.globalAlpha = 0.25 - wv * 0.1;
    g.beginPath();
    for (let x = 6; x <= CW - 6; x += 6) {
      const y = CH - 26 + wv * 6 + Math.sin(x * 0.06 + wv * 2) * 4;
      x === 6 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;

  // 상단: 키비주얼 방패 엠블럼 (없으면 텍스트 타이틀)
  if (emblem) {
    const ew = 62;
    const eh = Math.round((ew * emblem.naturalHeight) / emblem.naturalWidth);
    g.drawImage(emblem, (CW - ew) / 2, 8, ew, eh);
  } else {
    g.textAlign = 'center';
    g.fillStyle = '#ffd23f';
    g.font = '20px Galmuri11, NeoDunggeunmo, monospace';
    g.fillText('CO-SHOW', CW / 2, 40);
  }

  // 코아이 (엠블럼 옆 왼쪽)
  if (koaiSprite) g.drawImage(koaiSprite, 14, 26, 44, 44);

  // 닉네임
  g.textAlign = 'center';
  g.fillStyle = '#f4f4f4';
  g.font = '15px Galmuri11, NeoDunggeunmo, monospace';
  g.fillText(nickname, CW / 2, 92);

  // 점수 패널
  px(g, 24, 100, CW - 48, 46, PANEL);
  px(g, 24, 100, CW - 48, 1, NEON);
  g.fillStyle = '#94b0c2';
  g.font = '10px Galmuri11, NeoDunggeunmo, monospace';
  g.fillText('SCORE', CW / 2, 114);
  g.fillStyle = '#ffd23f';
  g.font = '24px Galmuri11, NeoDunggeunmo, monospace';
  g.fillText(String(score), CW / 2, 139);

  // 합계 + 최고 기록
  g.fillStyle = '#94b0c2';
  g.font = '10px Galmuri11, NeoDunggeunmo, monospace';
  const kinds = collected.filter((c) => c > 0).length;
  g.fillText(`심볼 ${bananas}개 · ${kinds}/${symbols.length || 18}종 · BEST ${best}`, CW / 2, 160);

  // 심볼 수집 그리드 (6열)
  g.fillStyle = NEON;
  g.font = '9px Galmuri11, NeoDunggeunmo, monospace';
  g.fillText('- 컨소시엄 심볼 수집 -', CW / 2, 176);
  const cols = 6;
  const cellW = 30;
  const cellH = 32;
  const gx0 = (CW - cols * cellW) / 2;
  const gy0 = 182;
  symbols.forEach((spr, i) => {
    const cx = gx0 + (i % cols) * cellW;
    const cy = gy0 + Math.floor(i / cols) * cellH;
    const n = collected[i] || 0;
    g.globalAlpha = n > 0 ? 1 : 0.22; // 못 모은 심볼은 어둡게
    g.drawImage(spr, cx + 6, cy, 18, 18);
    g.globalAlpha = 1;
    g.fillStyle = n > 0 ? '#f4f4f4' : '#566c86';
    g.font = '7px Galmuri11, NeoDunggeunmo, monospace';
    g.fillText(`x${n}`, cx + 15, cy + 27);
  });

  // 날짜
  const d = new Date();
  const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} CO-SHOW`;
  g.fillStyle = '#566c86';
  g.font = '8px Galmuri11, NeoDunggeunmo, monospace';
  g.fillText(dateStr, CW / 2, CH - 8);
}

// 카드 이미지를 저장(모바일: 공유 시트 우선, PC: 다운로드)
export async function saveCard(canvas, nickname) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return;
  const file = new File([blob], `coshow_${nickname}_${Date.now()}.png`, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'CO-SHOW 코아이 러너' });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // 사용자가 공유 취소
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
