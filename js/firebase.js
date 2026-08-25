// firebase.js — Firebase 연동 (익명 인증 + Firestore)
// ─────────────────────────────────────────────────────────────
// [설정 방법]
// 1. https://console.firebase.google.com 에서 프로젝트 생성
// 2. 웹앱(</>) 추가 → 표시되는 firebaseConfig 값을 아래에 붙여넣기
// 3. Authentication → 로그인 방법 → "익명" 사용 설정
// 4. Firestore Database 생성 (프로덕션 모드) → 규칙은 README.md 참고
// 키가 비어 있으면 자동으로 오프라인 모드(localStorage)로 동작한다.
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: 'AIzaSyDpT26lkqe6CxHMG3CZi_MT5Mbrwe5BZaA',
  authDomain: 'coshow-game-2026.firebaseapp.com',
  projectId: 'coshow-game-2026',
  storageBucket: 'coshow-game-2026.firebasestorage.app',
  messagingSenderId: '724126755197',
  appId: '1:724126755197:web:7fc2af7c384e00b2f60414',
};

// admin.html 접근 키의 SHA-256 지문 — 키 원문은 코드에 없음 (관리자키.txt 참고, 저장소 미포함)
export const ADMIN_KEY_HASH = '99a3b7665b1a35f6a4f73de324324f49321eedb8d3e5583d73fff822931e64bb';

const FB_VER = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${FB_VER}`;

let fs = null; // firestore 모듈 네임스페이스
let db = null;
let uid = null;

export const isConfigured = () => !!firebaseConfig.apiKey;
export const isOnline = () => !!db;
export const getUid = () => uid;

// Firebase 초기화 + 익명 로그인. 실패하면 조용히 오프라인 모드.
export async function initFirebase() {
  if (!isConfigured()) return false;
  if (db) return true; // 이미 초기화됨
  try {
    const appMod = await import(`${CDN}/firebase-app.js`);
    const authMod = await import(`${CDN}/firebase-auth.js`);
    fs = await import(`${CDN}/firebase-firestore.js`);
    const app = appMod.initializeApp(firebaseConfig);
    const cred = await authMod.signInAnonymously(authMod.getAuth(app));
    uid = cred.user.uid;
    db = fs.getFirestore(app);
    return true;
  } catch (e) {
    console.warn('[firebase] 초기화 실패 — 오프라인 모드로 전환:', e);
    db = null;
    return false;
  }
}

// 접속(닉네임 확정) 시 사용자 등록/갱신 → 고유 이용자 KPI의 기준
export async function registerUser(nickname) {
  localStorage.setItem('coshow_nick', nickname);
  if (!db) return;
  try {
    const ref = fs.doc(db, 'users', uid);
    const snap = await fs.getDoc(ref);
    const base = { nickname, lastVisitAt: fs.serverTimestamp() };
    if (!snap.exists()) {
      await fs.setDoc(ref, { ...base, firstVisitAt: fs.serverTimestamp(), playCount: 0, bestScore: 0 });
    } else {
      await fs.setDoc(ref, base, { merge: true });
    }
  } catch (e) {
    console.warn('[firebase] 사용자 등록 실패:', e);
  }
}

// 게임 종료 시 점수 저장 (scores 로그 + users 집계)
export async function submitScore(nickname, score, bananas, kinds = 0) {
  // 로컬 기록은 항상 유지 (오프라인 리더보드 겸 개인 최고점)
  const best = Math.max(score, Number(localStorage.getItem('coshow_best') || 0));
  localStorage.setItem('coshow_best', String(best));
  const local = JSON.parse(localStorage.getItem('coshow_scores') || '[]');
  local.push({ nickname, score, bananas, kinds, at: Date.now() });
  localStorage.setItem('coshow_scores', JSON.stringify(local.slice(-200)));

  if (!db) return { online: false, best };
  try {
    await fs.addDoc(fs.collection(db, 'scores'), {
      uid, nickname, score, bananas, kinds, createdAt: fs.serverTimestamp(),
    });
    const ref = fs.doc(db, 'users', uid);
    const snap = await fs.getDoc(ref);
    const prevBest = snap.exists() ? (snap.data().bestScore || 0) : 0;
    await fs.setDoc(ref, {
      nickname,
      playCount: fs.increment(1),
      bestScore: Math.max(prevBest, score),
      lastVisitAt: fs.serverTimestamp(),
    }, { merge: true });
    return { online: true, best };
  } catch (e) {
    console.warn('[firebase] 점수 저장 실패:', e);
    return { online: false, best };
  }
}

// TOP 10 리더보드 (사용자별 최고점 기준)
export async function fetchLeaderboard() {
  if (db) {
    try {
      const q = fs.query(
        fs.collection(db, 'users'),
        fs.orderBy('bestScore', 'desc'),
        fs.limit(10)
      );
      const snap = await fs.getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, nickname: d.data().nickname || '???', score: d.data().bestScore || 0 }))
        .filter((r) => r.score > 0);
    } catch (e) {
      console.warn('[firebase] 리더보드 조회 실패:', e);
    }
  }
  // 오프라인: 이 기기 기록으로 대체
  const local = JSON.parse(localStorage.getItem('coshow_scores') || '[]');
  const bestByNick = {};
  for (const r of local) {
    if (!bestByNick[r.nickname] || r.score > bestByNick[r.nickname]) bestByNick[r.nickname] = r.score;
  }
  return Object.entries(bestByNick)
    .map(([nickname, score]) => ({ id: nickname, nickname, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

// ───────── 관리자 대시보드용 ─────────
export async function fetchAdminData() {
  if (!db) return null;
  const usersSnap = await fs.getDocs(fs.collection(db, 'users'));
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const scoresSnap = await fs.getDocs(
    fs.query(fs.collection(db, 'scores'), fs.orderBy('createdAt', 'desc'), fs.limit(300))
  );
  const scores = scoresSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const totalPlaysSnap = await fs.getCountFromServer(fs.collection(db, 'scores'));
  const totalPlays = totalPlaysSnap.data().count;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const todaySnap = await fs.getDocs(
    fs.query(fs.collection(db, 'scores'), fs.where('createdAt', '>=', fs.Timestamp.fromDate(start)))
  );
  const todayScores = todaySnap.docs.map((d) => d.data());

  return { users, scores, totalPlays, todayScores };
}
