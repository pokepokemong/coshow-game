// result.js — 결과 카드 렌더링 + 이미지 저장/공유

const CW = 216; // 카드 내부 해상도 (3배 스케일된 픽셀 느낌)
const CH = 300;

function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

// 결과 카드를 캔버스에 그린다
export function renderCard(canvas, { nickname, score, bananas, best, koaiSprite, bananaSprite }) {
  const SCALE = 3; // 저장용 PNG 선명도를 위해 3배 해상도로 렌더
  canvas.width = CW * SCALE;
  canvas.height = CH * SCALE;
  const g = canvas.getContext('2d');
  g.scale(SCALE, SCALE);
  g.imageSmoothingEnabled = true;

  // 배경 + 테두리
  px(g, 0, 0, CW, CH, '#29366f');
  px(g, 6, 6, CW - 12, CH - 12, '#1a1c2c');
  px(g, 0, 0, CW, 3, '#41a6f6');
  px(g, 0, CH - 3, CW, 3, '#41a6f6');
  px(g, 0, 0, 3, CH, '#41a6f6');
  px(g, CW - 3, 0, 3, CH, '#41a6f6');

  // 타이틀
  g.textAlign = 'center';
  g.fillStyle = '#ffd23f';
  g.font = '20px NeoDunggeunmo, monospace';
  g.fillText('CO-SHOW', CW / 2, 36);
  g.fillStyle = '#73eff7';
  g.font = '13px NeoDunggeunmo, monospace';
  g.fillText('코아이 러너', CW / 2, 56);

  // 코아이 스프라이트 (중앙, 4배)
  if (koaiSprite) {
    const s = 64;
    g.drawImage(koaiSprite, (CW - s) / 2, 70, s, s);
  }

  // 닉네임
  g.fillStyle = '#f4f4f4';
  g.font = '16px NeoDunggeunmo, monospace';
  g.fillText(nickname, CW / 2, 158);

  // 점수 패널
  px(g, 24, 172, CW - 48, 54, '#29366f');
  g.fillStyle = '#94b0c2';
  g.font = '11px NeoDunggeunmo, monospace';
  g.fillText('SCORE', CW / 2, 188);
  g.fillStyle = '#ffd23f';
  g.font = '26px NeoDunggeunmo, monospace';
  g.fillText(String(score), CW / 2, 216);

  // 바나나 개수 + 최고 기록
  if (bananaSprite) g.drawImage(bananaSprite, CW / 2 - 44, 236, 16, 16);
  g.fillStyle = '#f4f4f4';
  g.font = '13px NeoDunggeunmo, monospace';
  g.textAlign = 'left';
  g.fillText(`x ${bananas}`, CW / 2 - 22, 249);
  g.textAlign = 'center';
  g.fillStyle = '#94b0c2';
  g.font = '11px NeoDunggeunmo, monospace';
  g.fillText(`MY BEST ${best}`, CW / 2, 272);

  const d = new Date();
  const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  g.fillStyle = '#566c86';
  g.fillText(dateStr, CW / 2, 288);
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
