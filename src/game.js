// AI 윤리 어드벤처 - 메인 게임 엔진
(() => {
  'use strict';

  const TILE = 16;
  const SCALE = 3;
  const TS = TILE * SCALE; // 48px
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // 논리 해상도(좌표계는 항상 720×528). 백킹 스토어는 기기 픽셀 밀도(DPR)만큼 키워
  // 레티나·고DPI 화면에서도 글자가 또렷하게 보이게 한다.
  const LW = 720, LH = 528;
  let currentDPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  canvas.width = LW * currentDPR;
  canvas.height = LH * currentDPR;
  ctx.scale(currentDPR, currentDPR);
  function checkDPR() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    if (dpr !== currentDPR) {
      currentDPR = dpr;
      canvas.width = LW * dpr;
      canvas.height = LH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      try { tileCache.clear(); } catch (e) {}
    }
  }
  const VIEW_W = Math.floor(LW / TS); // 15
  const VIEW_H = Math.floor(LH / TS); // 11
  ctx.imageSmoothingEnabled = false;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', () => { try { canvas.focus(); } catch (e) {} });
  try { canvas.focus(); } catch (e) {}

  const SAVE_KEY = 'ai-ethics-adventure-v1';

  // ---------- 상태 ----------
  const game = {
    mode: 'title', // title | world | dialog | battle | ending | dex | review | pause
    map: 'village',
    player: {
      x: 13, y: 16,       // 타일 좌표
      px: 13 * TS, py: 16 * TS, // 픽셀 좌표(보간)
      dir: 'up',
      moving: false,
      step: 0,            // 걷기 애니메이션
    },
    flags: null,
    dialog: null, // { lines, idx, chars, speaker, onEnd }
    battle: null,
    time: 0,
    titleCursor: 0,
    endingT: 0,
    dex: { cursor: 0, ret: 'title' },
    review: { cursor: 0, ret: 'world', slot: 0, phase: 'list', ids: [], qCursor: 0, choiceOrder: null, feedback: null },
    journal: { ret: 'world', slot: 0, scroll: 0, toast: 0 },
    awards: { ret: 'world', slot: 0, scroll: 0 },
    challenge: null, // { ret, slot, phase, topics, sel, questions, idx, cursor, choiceOrder, score, feedback }
    cosmetics: { ret: 'title', slot: 0, col: 0, rowTitle: 0, rowTheme: 0, toast: 0 },
    backup: { ret: 'title', cursor: 0, toast: 0, confirm: false },
    notice: { text: '', t: 0 }, // 월드 상단 안내 토스트 (해금 알림 등)
    helpRet: 'title',
    pauseCursor: 0,
    titleScreen: 'slots', // slots | name | delete
    slotCursor: 0,
    currentSlot: 0,
    playerName: '수호자',
    nameConfirm: false,
    nameCancel: false,
    textSpeed: 'normal', // slow | normal | fast — 대화창 자막 속도
    largeText: false,    // 큰 글씨(접근성) 모드
    colorBlind: false,   // 색약 친화 팔레트(접근성) 모드
    difficulty: 'normal', // easy | normal | hard — 학년별 난이도
    tts: false,          // 읽어주기(TTS) 접근성
    reduceFx: false,     // 화면 효과 줄이기(광과민성·모션 민감 배려)
    dashboard: { ret: 'title', cursor: 0, toast: 0 }, // 교사용 대시보드
    classmode: { ret: 'world', sel: 1, confirm: false, toast: 0 }, // 수업 모드(스테이지 점프)
    report: { ret: 'world', slot: 0, toast: 0 }, // 교사용 학생 진단 리포트
    quizedit: { ret: 'title', cursor: 0, toast: 0, confirm: false }, // 커스텀 퀴즈 편집·가져오기
    cards: { ret: 'title', slot: 0, scroll: 0 },     // 학습 카드 컬렉션
    cert: { ret: 'title', slot: 0, toast: 0 },       // 수료증·진도 인증서
    hof: { ret: 'title', cat: 0 },                   // 명예의 전당(로컬 기록)
    pauseScroll: 0,      // 일시정지 메뉴 스크롤
  };

  const SLOT_COUNT = 3;

  // ---------- 저장 가능 여부 (비공개 모드·저장공간 가득 등) ----------
  // 모든 쓰기가 조용히 실패해 진행이 안 저장되는 최악의 상황을 사용자에게 알린다.
  let storageOk = true;
  function probeStorage() {
    try {
      const k = '__ae_probe__';
      localStorage.setItem(k, '1');
      const ok = localStorage.getItem(k) === '1';
      localStorage.removeItem(k);
      storageOk = ok;
    } catch (e) { storageOk = false; }
    return storageOk;
  }
  // 런타임에 저장이 처음 실패하면(쿼터 초과 등) 경고로 승격하고 안내를 띄운다.
  function noteStorageFail() {
    if (storageOk) {
      storageOk = false;
      try { game.notice = { text: '⚠ 이 기기에서는 진행이 저장되지 않아요. 백업을 이용해 주세요.', t: 360 }; } catch (e) { /* 무시 */ }
    }
  }

  function newFlags() {
    return {
      talkedProf: false,
      badges: { forest: false, lake: false, cave: false },
      defeated: {
        bekkyeomon: false, mollaemon: false, jungdokmon: false,
        geojitmon: false, pyeonhyangmon: false, hondonmon: false,
        akpeulmon: false, gatimmon: false, meotdaeromon: false,
        pungpungmon: false, kkamkkammon: false, tteonemgimon: false,
        sideulmon: false, ppaeatmon: false, hollimmon: false,
        maearimon: false, geurimjamon: false, finalboss: false,
        tturimmon: false, girokmon: false, sujipmon: false,
        saseomon: false, piltermon: false, mirrormon: false,
        yuhokmon: false, soksagimon: false, jogakmon: false,
        yeongi: false,
        hwangakmon: false, hapseongmon: false, miraemon: false,
        somunmon: false, musimon: false, nangbimon: false, pinggyemon: false,
      },
      mercy: 0,        // 마음을 안아준 횟수 (스테이지 6~)
      visited: {},     // 맵 인트로 연출 1회 표시용
      trueEnding: false,
      correctCount: 0,
      battleCount: 0,
      sawBattleTip: false, // 첫 전투 1회 안내 표시 여부
    };
  }

  // ---------- 세이브 슬롯 (3개) ----------
  function slotKey(i) { return 'ai-ethics-adventure-slot-' + i; }

  function loadSlot(i) {
    try {
      const raw = localStorage.getItem(slotKey(i));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeSlot(i, data) {
    try { localStorage.setItem(slotKey(i), JSON.stringify(data)); }
    catch (e) { noteStorageFail(); }
  }

  function deleteSlot(i) {
    try { localStorage.removeItem(slotKey(i)); } catch (e) { /* 무시 */ }
    clearSlotLearning(i); // 학생을 지우면 학습 기록(일지·복습·도전과제)도 함께 지운다
  }

  // 기존 단일 세이브를 슬롯 0으로 1회 이전한다.
  function migrateOldSave() {
    let old = null;
    try { const r = localStorage.getItem(SAVE_KEY); old = r ? JSON.parse(r) : null; } catch (e) { old = null; }
    if (old && old.flags && !loadSlot(0)) {
      writeSlot(0, { name: '수호자', map: old.map, x: old.x, y: old.y, flags: old.flags, updatedAt: Date.now() });
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
    }
  }

  const SAVE_VERSION = 2;
  function save() {
    writeSlot(game.currentSlot, {
      v: SAVE_VERSION,
      name: game.playerName,
      map: game.map,
      x: game.player.x, y: game.player.y,
      flags: game.flags,
      updatedAt: Date.now(),
    });
  }

  // 슬롯 요약 (타이틀 표시용). 없으면 null.
  function slotSummary(i) {
    const s = loadSlot(i);
    if (!s || !s.flags) return null;
    return {
      name: sanitizeName(s.name),
      stage: getStage(s.flags),
      mercy: s.flags.mercy || 0,
      done: !!(s.flags.defeated && s.flags.defeated.yeongi),
      endingId: s.flags.endingId || null,
    };
  }

  // 발견한 엔딩 기록 — 세이브와 별개로, 게임을 다시 시작해도 남는다
  const ENDINGS_KEY = 'ai-ethics-adventure-endings';
  function getEndingsSeen() {
    try { return JSON.parse(localStorage.getItem(ENDINGS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function recordEndingSeen(id) {
    try {
      const seen = getEndingsSeen();
      seen[id] = true;
      localStorage.setItem(ENDINGS_KEY, JSON.stringify(seen));
    } catch (e) { /* 저장 불가 환경이면 무시 */ }
  }

  // 설정(자막 속도) — 세이브와 별개로, 게임을 다시 시작해도 남는다
  const SETTINGS_KEY = 'ai-ethics-adventure-settings';
  const TEXT_SPEEDS = { slow: 0.5, normal: 1, fast: 2.5 };
  const TEXT_SPEED_ORDER = ['normal', 'fast', 'slow'];
  const TEXT_SPEED_LABEL = { normal: '보통', fast: '빠름', slow: '느림' };
  const DIFF_ORDER = ['easy', 'normal', 'hard'];
  const DIFF_LABEL = { easy: '저학년', normal: '기본', hard: '고학년' };
  // OS의 "동작 줄이기" 선호를 기본값으로 삼는다 (광과민성·모션 민감 배려)
  const prefersReduce = (() => {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  })();
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
      if (!TEXT_SPEEDS[s.textSpeed]) s.textSpeed = 'normal';
      s.largeText = !!s.largeText;
      s.colorBlind = !!s.colorBlind;
      if (!DIFF_ORDER.includes(s.difficulty)) s.difficulty = 'normal';
      s.tts = !!s.tts;
      s.reduceFx = ('reduceFx' in s) ? !!s.reduceFx : prefersReduce;
      return s;
    } catch (e) { return { textSpeed: 'normal', largeText: false, colorBlind: false, difficulty: 'normal', tts: false, reduceFx: prefersReduce }; }
  }
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        textSpeed: game.textSpeed, largeText: game.largeText, colorBlind: game.colorBlind,
        difficulty: game.difficulty, tts: game.tts, reduceFx: game.reduceFx,
      }));
    } catch (e) { noteStorageFail(); }
  }
  function toggleReduceFx() {
    game.reduceFx = !game.reduceFx;
    saveSettings();
    Sound.blip();
  }
  function cycleDifficulty() {
    const i = DIFF_ORDER.indexOf(game.difficulty);
    game.difficulty = DIFF_ORDER[(i + 1) % DIFF_ORDER.length];
    saveSettings();
    Sound.blip();
  }
  function toggleTTS() {
    game.tts = !game.tts;
    saveSettings();
    if (game.tts) Speech.speak('읽어주기를 켰어요'); else Speech.stop();
    Sound.blip();
  }

  // ---------- 읽어주기 (TTS) — Web Speech API ----------
  const Speech = {
    _voice: null,
    _voicePicked: false,
    supported() { try { return typeof window !== 'undefined' && 'speechSynthesis' in window; } catch (e) { return false; } },
    // 한국어 음성을 고른다 (없으면 기본). getVoices는 비동기라 voiceschanged 이후에 채워진다.
    pickVoice() {
      if (!this.supported()) return;
      try {
        const vs = window.speechSynthesis.getVoices() || [];
        this._voice = vs.find((v) => v.lang && v.lang.toLowerCase().indexOf('ko') === 0)
          || vs.find((v) => /korean|한국/i.test(v.name || '')) || null;
        if (vs.length > 0) this._voicePicked = true;
      } catch (e) { /* 무시 */ }
    },
    speak(text) {
      if (!game.tts || !this.supported() || !text) return;
      try {
        if (!this._voicePicked) this.pickVoice();
        window.speechSynthesis.cancel();
        const u = new window.SpeechSynthesisUtterance(String(text).replace(/\n/g, ' ').replace(/[♥♪★☆◆◇○×▶◷◎✿⇄→]/g, ' '));
        u.lang = 'ko-KR';
        u.rate = 0.95;
        if (this._voice) u.voice = this._voice;
        window.speechSynthesis.speak(u);
      } catch (e) { /* 미지원/차단 환경 무시 */ }
    },
    stop() { try { if (this.supported()) window.speechSynthesis.cancel(); } catch (e) { /* 무시 */ } },
  };
  // 퀴즈 문제+보기를 읽어 준다 (표시 순서대로)
  function speakQuiz(qText, choiceTexts) {
    if (!game.tts) return;
    Speech.speak(qText + '. ' + choiceTexts.map((c, i) => `${i + 1}번, ${c}`).join('. '));
  }
  function speakFeedback(correct, why) {
    if (!game.tts) return;
    Speech.speak((correct ? '정답! ' : '아쉬워요. ') + why);
  }
  function cycleTextSpeed() {
    const i = TEXT_SPEED_ORDER.indexOf(game.textSpeed);
    game.textSpeed = TEXT_SPEED_ORDER[(i + 1) % TEXT_SPEED_ORDER.length];
    saveSettings();
    Sound.blip();
  }
  function toggleLargeText() {
    game.largeText = !game.largeText;
    saveSettings();
    Sound.blip();
  }
  function toggleColorBlind() {
    game.colorBlind = !game.colorBlind;
    saveSettings();
    Sound.blip();
  }
  // 큰 글씨 모드 배율 — 읽기 중심 화면(대화·퀴즈)의 글자/줄간격에 적용
  function TF() { return game.largeText ? 1.25 : 1; }
  function fs(px, bold) { return (bold ? 'bold ' : '') + Math.round(px * TF()) + 'px monospace'; }
  function lh(px) { return Math.round(px * TF()); }
  // 의미 색상 — 색약 모드에서는 빨강/초록 대신 구분이 쉬운 파랑/주황(Okabe-Ito 계열)
  function okColor() { return game.colorBlind ? '#3b8ed0' : '#5cb85c'; }   // 정답·높음
  function warnColor() { return game.colorBlind ? '#e69f00' : '#ffd644'; } // 보통
  function badColor() { return game.colorBlind ? '#d55e00' : '#e0453a'; }  // 오답·낮음

  // ---------- 학생(슬롯)별 학습 데이터 ----------
  // 일지·복습 노트·통계는 "이 슬롯을 쓰는 학생"의 개인 기록이다.
  // 슬롯마다 따로 누적되고, 슬롯을 지우면 함께 지워진다.
  // (도감·발견 엔딩은 기기 공용 컬렉션으로 그대로 둔다.)
  function activeSlot() {
    // 타이틀에서는 커서가 가리키는 슬롯, 플레이 중에는 진행 중인 슬롯
    return game.mode === 'title' ? game.slotCursor : game.currentSlot;
  }
  function slotLearnName(slot) {
    const s = loadSlot(slot);
    if (s && s.name) return sanitizeName(s.name);
    if (slot === game.currentSlot && game.playerName) return sanitizeName(game.playerName);
    return '수호자';
  }
  function slotFlags(slot) {
    if (slot === game.currentSlot && game.flags) return game.flags;
    const s = loadSlot(slot);
    return (s && s.flags) ? s.flags : null;
  }

  // 오답 복습 노트 — 틀린 문제를 슬롯별로 기록
  const MISTAKES_KEY = 'ai-ethics-adventure-mistakes';
  function mistakesKey(slot) { return MISTAKES_KEY + '-' + slot; }
  function getMistakes(slot) {
    try { return JSON.parse(localStorage.getItem(mistakesKey(slot))) || {}; }
    catch (e) { return {}; }
  }
  function recordMistake(slot, q) {
    if (!q._qid) return;
    try {
      const m = getMistakes(slot);
      m[q._qid] = { topic: q._topic, q: q.q, a: q.a, c: q.c, why: q.why };
      localStorage.setItem(mistakesKey(slot), JSON.stringify(m));
    } catch (e) { /* 저장 불가 환경이면 무시 */ }
  }
  function clearMistake(slot, qid) {
    try {
      const m = getMistakes(slot);
      delete m[qid];
      localStorage.setItem(mistakesKey(slot), JSON.stringify(m));
    } catch (e) { /* 저장 불가 환경이면 무시 */ }
  }
  function mistakeCount(slot) { return Object.keys(getMistakes(slot)).length; }

  // 학습 진척도 — 주제별 정답/시도를 슬롯별로 누적
  const STATS_KEY = 'ai-ethics-adventure-stats';
  function statsKey(slot) { return STATS_KEY + '-' + slot; }
  // 주제 키 → 짧은 한글 라벨. 단일 출처는 data.js의 TOPIC_LABEL.
  function topicLabel(t) { return TOPIC_LABEL[t] || t; }
  function getStats(slot) {
    try { return JSON.parse(localStorage.getItem(statsKey(slot))) || {}; }
    catch (e) { return {}; }
  }
  function recordTopicResult(slot, topic, correct) {
    if (!topic) return;
    try {
      const s = getStats(slot);
      const e = s[topic] || { correct: 0, total: 0 };
      e.total += 1;
      if (correct) e.correct += 1;
      s[topic] = e;
      localStorage.setItem(statsKey(slot), JSON.stringify(s));
    } catch (e) { /* 저장 불가 환경이면 무시 */ }
  }
  // 학습 데이터를 한 화면 분량으로 정리한다 (일지·리포트 공용)
  function buildLearningSummary(slot) {
    const stats = getStats(slot);
    const rows = Object.keys(stats)
      .filter((t) => stats[t].total > 0)
      .map((t) => ({
        topic: t, label: topicLabel(t),
        correct: stats[t].correct, total: stats[t].total,
        rate: stats[t].correct / stats[t].total,
      }))
      .sort((a, b) => a.rate - b.rate); // 약한 주제가 위로
    let totC = 0, totN = 0;
    for (const r of rows) { totC += r.correct; totN += r.total; }
    return {
      rows,
      attempted: totN,
      correct: totC,
      overallRate: totN ? totC / totN : 0,
      weak: rows.filter((r) => r.total >= 2 && r.rate < 0.6).map((r) => r.label),
      strongTopics: rows.filter((r) => r.total >= 1 && r.rate >= 0.8).length,
      perfectTopic: rows.some((r) => r.total >= 3 && r.rate >= 1),
    };
  }

  // 챌린지·도전과제용 슬롯별 메타 (최고 점수, 완주 횟수)
  const META_KEY = 'ai-ethics-adventure-meta';
  function metaKey(slot) { return META_KEY + '-' + slot; }
  function getMeta(slot) {
    try { return JSON.parse(localStorage.getItem(metaKey(slot))) || {}; }
    catch (e) { return {}; }
  }
  function recordChallengeResult(slot, score, total) {
    try {
      const m = getMeta(slot);
      m.challengeRuns = (m.challengeRuns || 0) + 1;
      m.challengeBest = Math.max(m.challengeBest || 0, score);
      m.challengeBestTotal = total;
      localStorage.setItem(metaKey(slot), JSON.stringify(m));
    } catch (e) { /* 저장 불가 환경이면 무시 */ }
  }

  // 슬롯 삭제 시 학습 데이터도 함께 지운다
  function clearSlotLearning(slot) {
    try {
      localStorage.removeItem(statsKey(slot));
      localStorage.removeItem(mistakesKey(slot));
      localStorage.removeItem(metaKey(slot));
    } catch (e) { /* 무시 */ }
  }

  // 기존 전역 학습 데이터(이전 버전)를 슬롯 0으로 1회 이전한다
  function migrateLearningData() {
    try {
      const oldStats = localStorage.getItem(STATS_KEY);
      if (oldStats && !localStorage.getItem(statsKey(0))) {
        localStorage.setItem(statsKey(0), oldStats);
        localStorage.removeItem(STATS_KEY);
      }
      const oldMist = localStorage.getItem(MISTAKES_KEY);
      if (oldMist && !localStorage.getItem(mistakesKey(0))) {
        localStorage.setItem(mistakesKey(0), oldMist);
        localStorage.removeItem(MISTAKES_KEY);
      }
    } catch (e) { /* 무시 */ }
  }


  // ---------- 일일 도전 · 연속 출석(스트릭) ----------
  // 날짜 문자열(YYYY-MM-DD). 기본은 오늘.
  function todayStr(d) {
    const t = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  }
  function dayDiff(a, b) { // b - a (일 단위)
    const pa = Date.parse(a + 'T00:00:00'), pb = Date.parse(b + 'T00:00:00');
    if (isNaN(pa) || isNaN(pb)) return null;
    return Math.round((pb - pa) / 86400000);
  }
  // 이 슬롯으로 논 날을 기록하고 연속 출석(streak)을 갱신한다.
  function recordPlayDay(slot, day) {
    day = day || todayStr();
    const m = getMeta(slot);
    if (m.lastPlayDay === day) return m; // 오늘 이미 기록됨
    const diff = m.lastPlayDay ? dayDiff(m.lastPlayDay, day) : null;
    m.streak = diff === 1 ? (m.streak || 0) + 1 : 1; // 이어서 오면 +1, 아니면 1부터
    m.lastPlayDay = day;
    m.bestStreak = Math.max(m.bestStreak || 0, m.streak);
    try { localStorage.setItem(metaKey(slot), JSON.stringify(m)); } catch (e) { /* 무시 */ }
    return m;
  }
  function dailyDoneToday(slot, day) {
    return getMeta(slot).lastDailyDay === (day || todayStr());
  }
  function recordDailyDone(slot, score, total, day) {
    day = day || todayStr();
    const m = getMeta(slot);
    m.lastDailyDay = day;
    m.dailyRuns = (m.dailyRuns || 0) + 1;
    m.dailyBest = Math.max(m.dailyBest || 0, score);
    m.dailyTotal = total;
    try { localStorage.setItem(metaKey(slot), JSON.stringify(m)); } catch (e) { /* 무시 */ }
    return m;
  }

  // ---------- 커스텀 퀴즈 (선생님이 추가한 문제) ----------
  // 기기 공용으로 저장한다. 'custom' 주제로 챌린지·맞춤·일일 문제에 함께 쓰인다.
  const CUSTOM_QUIZ_KEY = 'ai-ethics-adventure-customquiz';
  function getCustomQuizzes() {
    try {
      const arr = JSON.parse(localStorage.getItem(CUSTOM_QUIZ_KEY));
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  // 한 문항이 올바른 형식인지 검사
  function validQuizItem(q) {
    return q && typeof q.q === 'string' && q.q.trim() &&
      Array.isArray(q.a) && q.a.length === 3 && q.a.every((x) => typeof x === 'string' && x.trim()) &&
      Number.isInteger(q.c) && q.c >= 0 && q.c < 3 &&
      typeof q.why === 'string' && q.why.trim();
  }
  // 가져온 텍스트(JSON)를 검사해 커스텀 문제로 저장. { ok, count, error } 반환.
  // 커스텀 퀴즈 입력 한도 — 화면 깨짐·저장소 남용을 막는다.
  const CUSTOM_MAX = 50;            // 최대 문항 수
  const Q_MAX = 140, A_MAX = 40, WHY_MAX = 200; // 항목별 글자 수 상한
  // 외부 입력 문자열 정리: 제어문자 제거, 공백 정리, 길이 제한
  function clampQuizStr(s, n) {
    return String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  }
  function importCustomQuizzes(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: 'parse' }; }
    // 허용 형식: 배열 [ {q,a,c,why}, ... ] 또는 { questions: [...] }
    const list = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.questions) ? obj.questions : null);
    if (!list) return { ok: false, error: 'format' };
    const clean = list.filter(validQuizItem).slice(0, CUSTOM_MAX).map((q) => ({
      q: clampQuizStr(q.q, Q_MAX),
      a: q.a.slice(0, 3).map((x) => clampQuizStr(x, A_MAX)),
      c: q.c,
      why: clampQuizStr(q.why, WHY_MAX),
    })).filter((q) => q.q && q.a.every((x) => x) && q.why); // 정리 후 빈 항목 제거
    if (clean.length === 0) return { ok: false, error: 'empty' };
    try { localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(clean)); } catch (e) { return { ok: false, error: 'save' }; }
    return { ok: true, count: clean.length };
  }
  function clearCustomQuizzes() {
    try { localStorage.removeItem(CUSTOM_QUIZ_KEY); } catch (e) { /* 무시 */ }
  }
  // 커스텀 문제 양식(템플릿) 텍스트
  function customQuizTemplate() {
    return JSON.stringify({
      questions: [
        { q: '문제를 여기에 쓰세요 (줄바꿈은 \\n)', a: ['보기1', '보기2', '보기3'], c: 1, why: '정답 해설을 쓰세요' },
      ],
    }, null, 2);
  }
  // 기본 퀴즈 + 커스텀('custom' 주제)을 합친 문제 출처
  function quizSource() {
    const custom = getCustomQuizzes();
    return custom.length ? Object.assign({}, QUIZZES, { custom }) : QUIZZES;
  }

  // ---------- 적응형(맞춤) · 일일 문제 풀 ----------
  function quizQ(topic, i) {
    const src = quizSource();
    const base = src[topic] && src[topic][i];
    return base ? Object.assign({}, base, { _topic: topic, _qid: topic + '#' + i }) : null;
  }
  function quizTopicKeys() {
    const src = quizSource();
    return Object.keys(src).filter((t) => src[t] && src[t].length > 0);
  }
  // 약점 집중: 이전에 틀린 문제 → 정답률 낮은(또는 안 푼) 주제 순으로 채운다.
  function buildAdaptivePool(slot, n) {
    n = n || CHALLENGE_LEN;
    const out = [], used = new Set();
    const mistakes = getMistakes(slot);
    for (const qid of Object.keys(mistakes)) {
      const m = mistakes[qid];
      if (!m) continue;
      const i = parseInt(String(qid).split('#')[1], 10);
      const q = quizQ(m.topic, i);
      if (!q) continue;
      out.push(q); used.add(qid);
      if (out.length >= n) break;
    }
    if (out.length < n) {
      const summary = buildLearningSummary(slot);
      const rate = {};
      for (const r of summary.rows) rate[r.topic] = r.rate;
      const src = quizSource();
      const weighted = [];
      for (const t of quizTopicKeys()) {
        const r = (t in rate) ? rate[t] : 0; // 안 푼 주제는 0(약점)으로 본다
        const w = Math.max(1, Math.round((1 - r) * 4) + 1);
        for (let k = 0; k < w; k++) weighted.push(t);
      }
      let guard = 0;
      while (out.length < n && guard++ < 600) {
        const t = weighted[Math.floor(Math.random() * weighted.length)];
        const i = Math.floor(Math.random() * src[t].length);
        const qid = t + '#' + i;
        if (used.has(qid)) continue;
        used.add(qid);
        const qq = quizQ(t, i);
        if (qq) out.push(qq);
      }
    }
    return shuffled(out).slice(0, n);
  }
  // 오늘의 도전: 날짜를 시드로 결정적으로 뽑아, 같은 날 모두 같은 문제를 푼다.
  function buildDailyPool(slot, day, n) {
    day = day || todayStr();
    n = n || CHALLENGE_LEN;
    let seed = 0;
    for (let i = 0; i < day.length; i++) seed = (seed * 31 + day.charCodeAt(i)) >>> 0;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pool = [];
    const src = quizSource();
    for (const t of quizTopicKeys()) for (let i = 0; i < src[t].length; i++) pool.push(quizQ(t, i));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  }

  // ---------- 수집·꾸미기 보상 (칭호 · 테마) ----------
  // 학생(슬롯)마다 따로 모으고 고른다. 해금 조건은 도전과제와 같은 학습 컨텍스트로 판정.
  const COSMETIC_KEY = 'ai-ethics-adventure-cosmetic';
  function cosmeticKey(slot) { return COSMETIC_KEY + '-' + slot; }
  function getCosmetic(slot) {
    try { return JSON.parse(localStorage.getItem(cosmeticKey(slot))) || {}; }
    catch (e) { return {}; }
  }
  function setCosmetic(slot, data) {
    try { localStorage.setItem(cosmeticKey(slot), JSON.stringify(data)); } catch (e) { /* 무시 */ }
  }
  const TITLES = [
    { id: 'rookie', name: '새내기 수호자', desc: '모험을 시작한 모두에게', check: () => true },
    { id: 'kind', name: '따뜻한 마음', desc: '마음을 5번 안아 주기', check: (c) => c.mercy >= 5 },
    { id: 'scholar', name: '공부벌레', desc: '문제 50개 이상 풀기', check: (c) => c.attempted >= 50 },
    { id: 'collector', name: '도감 수집가', desc: '도감 절반 이상 모으기', check: (c) => c.dex > 0 && c.dex * 2 >= c.dexTotal },
    { id: 'champion', name: '챌린지 챔피언', desc: '퀴즈 챌린지 만점', check: (c) => c.challengeBest > 0 && c.challengeBest === c.challengeBestTotal },
    { id: 'master', name: 'AI 윤리 마스터', desc: '엔딩 보고 도전과제 8개 달성', check: (c) => c.endings >= 1 && c.achieved >= 8 },
  ];
  const THEMES = [
    { id: 'classic', name: '클래식', color: '#ffd644', desc: '기본 노란빛', check: () => true },
    { id: 'forest', name: '숲빛', color: '#5cb85c', desc: '증표 1개 모으기', check: (c) => c.badges >= 1 },
    { id: 'ocean', name: '바다빛', color: '#4ea8de', desc: '문제 30개 풀기', check: (c) => c.attempted >= 30 },
    { id: 'sunset', name: '노을빛', color: '#f08a24', desc: '마음 8번 안아 주기', check: (c) => c.mercy >= 8 },
    { id: 'galaxy', name: '은하빛', color: '#b48ce0', desc: '엔딩 보기', check: (c) => c.endings >= 1 },
  ];
  function unlockedCount(slot) {
    const c = achievementCtx(slot);
    return TITLES.filter((t) => t.check(c)).length + THEMES.filter((t) => t.check(c)).length;
  }
  function selectedTitle(slot) {
    const c = achievementCtx(slot), cos = getCosmetic(slot);
    const list = TITLES.filter((t) => t.check(c));
    return list.find((t) => t.id === cos.title) || list[0] || null;
  }
  function selectedTheme(slot) {
    const c = achievementCtx(slot), cos = getCosmetic(slot);
    const list = THEMES.filter((t) => t.check(c));
    return list.find((t) => t.id === cos.theme) || list[0] || null;
  }
  // UI 강조색 — 색약 모드가 우선, 아니면 고른 테마색
  function themeAccent() {
    if (game.colorBlind) return warnColor();
    const t = selectedTheme(activeSlot());
    return t ? t.color : '#ffd644';
  }
  // 새로 해금된 칭호·테마가 있으면 알림 토스트를 띄운다 (월드에서)
  function checkCosmeticUnlocks(slot) {
    const cos = getCosmetic(slot);
    const now = unlockedCount(slot);
    const ack = cos.ack || 0;
    if (now > ack) {
      cos.ack = now;
      setCosmetic(slot, cos);
      if (ack > 0) { // 첫 진입(0→N)에는 시끄럽지 않게 조용히 넘어간다
        game.notice = { text: '새 칭호·테마가 열렸어요! (메뉴 → 꾸미기)', t: 200 };
        Sound.unlock();
      }
    }
  }

  // ---------- 학습 카드 컬렉션 ----------
  // 한 주제에서 한 번이라도 정답을 맞히면 그 주제의 '배움 카드'가 열린다.
  // 별도 저장 없이 슬롯별 정답 통계(getStats)에서 그대로 끌어온다 → 백업/복원에도 자동 반영.
  const LEARN_CARDS = [
    { topic: 'privacy', icon: '🔒', lesson: '이름·주소·사진 같은 내 정보는 함부로 입력하거나 알려주지 않아요.' },
    { topic: 'copyright', icon: '✏', lesson: '남이 만든 글·그림·음악을 쓸 땐 출처를 밝히고 허락을 구해요.' },
    { topic: 'fake', icon: '🔍', lesson: 'AI의 답도 틀릴 수 있어요. 여러 곳에서 사실인지 확인해요.' },
    { topic: 'bias', icon: '⚖', lesson: 'AI는 한쪽으로 치우칠 수 있어요. 모두에게 공정한지 살펴요.' },
    { topic: 'balance', icon: '🌱', lesson: 'AI에 너무 기대지 말고 스스로 생각하는 힘도 길러요.' },
    { topic: 'manners', icon: '💬', lesson: '상대가 AI라도 고운 말로 예의 있게 대화해요.' },
    { topic: 'filterbubble', icon: '🫧', lesson: '추천만 보면 생각이 좁아져요. 다양한 정보를 찾아봐요.' },
    { topic: 'safety', icon: '🛡', lesson: '중요한 결정은 AI에만 맡기지 말고 사람이 꼭 확인해요.' },
    { topic: 'environment', icon: '🌍', lesson: 'AI도 전기를 많이 써요. 꼭 필요할 때 알맞게 사용해요.' },
    { topic: 'transparency', icon: '💡', lesson: '왜 그런 답이 나왔는지 물어보고 근거를 따져봐요.' },
    { topic: 'responsibility', icon: '🤝', lesson: 'AI를 쓴 결과에는 그것을 사용한 사람의 책임도 있어요.' },
    { topic: 'creativity', icon: '🎨', lesson: 'AI에 맡기기 전에 내 생각으로 먼저 만들어 봐요.' },
    { topic: 'jobs', icon: '🛠', lesson: 'AI는 도구예요. 사람과 힘을 합칠 때 더 좋아져요.' },
    { topic: 'emotion', icon: '💗', lesson: 'AI는 진짜 친구나 가족의 마음을 대신할 수 없어요.' },
    { topic: 'security', icon: '🔑', lesson: '비밀번호는 비밀로! 수상한 링크·요청은 어른께 확인해요.' },
    { topic: 'footprint', icon: '👣', lesson: '인터넷에 남긴 기록은 오래 남아요. 올리기 전에 한 번 더 생각해요.' },
    { topic: 'consent', icon: '📝', lesson: '내 정보를 모을 땐 누가·왜 모으는지 알고 동의해요.' },
    { topic: 'identity', icon: '🎭', lesson: '남인 척하거나 AI를 사람인 척 속이면 안 돼요.' },
    { topic: 'persuasion', icon: '🪤', lesson: '자꾸 누르게 만드는 화면에 속지 말고 천천히 결정해요.' },
    { topic: 'genai', icon: '✨', lesson: 'AI는 그럴듯한 거짓(환각)을 지어낼 수 있어요. 꼭 확인해요.' },
    { topic: 'deepfake', icon: '🎬', lesson: '진짜 같은 가짜 영상·목소리가 있어요. 출처를 의심해 봐요.' },
    { topic: 'rumor', icon: '📣', lesson: '확인하지 않은 소문은 퍼뜨리지 않아요. 사실인지 먼저 확인해요.' },
    { topic: 'listen', icon: '👂', lesson: '나와 다른 의견도 끝까지 들어 봐요. 귀를 열면 생각이 넓어져요.' },
    { topic: 'saving', icon: '🔋', lesson: '데이터·전기는 한정돼 있어요. 필요한 만큼만 알맞게 써요.' },
    { topic: 'excuse', icon: '🙋', lesson: '핑계보다 "내가 했어"가 멋져요. 내 행동은 내가 책임져요.' },
  ];
  function cardUnlocked(slot, topic) {
    const s = getStats(slot)[topic];
    return !!(s && s.correct >= 1);
  }
  function collectedCards(slot) {
    return LEARN_CARDS.filter((c) => cardUnlocked(slot, c.topic)).length;
  }

  // ---------- 데이터 백업 · 복원 ----------
  function allBackupKeys() {
    const keys = [SETTINGS_KEY, ENDINGS_KEY, DEX_KEY];
    for (let i = 0; i < SLOT_COUNT; i++) {
      keys.push(slotKey(i), statsKey(i), mistakesKey(i), metaKey(i), cosmeticKey(i));
    }
    return keys;
  }
  function buildBackupText() {
    const data = {};
    for (const k of allBackupKeys()) {
      const v = localStorage.getItem(k);
      if (v != null) data[k] = v;
    }
    return JSON.stringify({ app: 'ai-ethics-adventure', version: 1, savedAt: Date.now(), data });
  }
  function applyBackup(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: 'parse' }; }
    if (!obj || obj.app !== 'ai-ethics-adventure' || !obj.data) return { ok: false, error: 'format' };
    const valid = new Set(allBackupKeys());
    let count = 0;
    for (const k of Object.keys(obj.data)) {
      if (!valid.has(k)) continue;
      try { localStorage.setItem(k, String(obj.data[k])); count++; } catch (e) { /* 무시 */ }
    }
    return { ok: true, count };
  }
  // 텍스트를 클립보드에 복사 (가능한 환경에서). 성공 여부 반환.
  function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return true;
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }
  // 도감 — 깨우친 몬스터 기록. 세이브와 별개로 누적 보존된다.
  const DEX_KEY = 'ai-ethics-adventure-dex';
  function getDexSeen() {
    try { return JSON.parse(localStorage.getItem(DEX_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function recordDexSeen(monId, mercyKind) {
    try {
      const seen = getDexSeen();
      seen[monId] = { seen: true, mercy: mercyKind || (seen[monId] && seen[monId].mercy) || null };
      localStorage.setItem(DEX_KEY, JSON.stringify(seen));
    } catch (e) { /* 저장 불가 환경이면 무시 */ }
  }
  function dexSeenCount() {
    const seen = getDexSeen();
    return DEX_ORDER.filter((id) => seen[id] && seen[id].seen).length;
  }

  // ---------- 입력 ----------
  const held = new Set();
  const pressed = new Set();
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
    z: 'action', Z: 'action', ' ': 'action', Enter: 'action',
    x: 'cancel', X: 'cancel', Escape: 'cancel',
    c: 'menu', C: 'menu',
  };

  window.addEventListener('keydown', (e) => {
    // 이름 입력 중에는 게임 키 매핑을 막지 않는다 (한글 IME 사용)
    if (game.mode === 'title' && game.titleScreen === 'name') return;
    // 키를 꾹 누르고 있을 때(OS 자동 반복)는 토글·단축키가 연타되지 않게 막는다.
    // 이동은 아래 held 집합으로 유지되므로 영향이 없다.
    if (e.repeat) return;
    Sound.resume();
    if (e.key === 'm' || e.key === 'M') { Sound.toggleMute(); return; }
    if (e.key === 't' || e.key === 'T') { cycleTextSpeed(); return; }
    if (e.key === 'g' || e.key === 'G') { toggleLargeText(); return; }
    if (e.key === 'h' || e.key === 'H') { useHint(); return; }
    if (e.key === 'v' || e.key === 'V') {
      if (game.mode === 'world') { openReview('world'); return; }
      if (game.mode === 'review') { closeReview(); return; }
      return;
    }
    if (e.key === 'j' || e.key === 'J') {
      if (game.mode === 'world') { openJournal('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openJournal('title'); return; }
      if (game.mode === 'journal') { closeJournal(); return; }
      return;
    }
    if (e.key === 'q' || e.key === 'Q') {
      if (game.mode === 'world') { openChallenge('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openChallenge('title'); return; }
      if (game.mode === 'challenge') { closeChallenge(); return; }
      return;
    }
    if (e.key === 'b' || e.key === 'B') {
      if (game.mode === 'world') { openAwards('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openAwards('title'); return; }
      if (game.mode === 'awards') { closeAwards(); return; }
      return;
    }
    if (e.key === 'i' || e.key === 'I') {
      if (game.mode === 'world') { openHelp('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openHelp('title'); return; }
      if (game.mode === 'help') { closeHelp(); return; }
      return;
    }
    if (e.key === 'k' || e.key === 'K') {
      if (game.mode === 'world') { openCosmetics('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openCosmetics('title'); return; }
      if (game.mode === 'cosmetics') { closeCosmetics(); return; }
      return;
    }
    if (e.key === 'u' || e.key === 'U') {
      if (game.mode === 'world') { openBackup('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openBackup('title'); return; }
      if (game.mode === 'backup') { closeBackup(); return; }
      return;
    }
    if (e.key === 'p' || e.key === 'P') { // 교사용 대시보드
      if (game.mode === 'world') { openDashboard('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openDashboard('title'); return; }
      if (game.mode === 'dashboard') { closeDashboard(); return; }
      return;
    }
    if (e.key === 'e' || e.key === 'E') { // 커스텀 퀴즈 편집(Edit)
      if (game.mode === 'world') { openQuizEdit('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openQuizEdit('title'); return; }
      if (game.mode === 'quizedit') { closeQuizEdit(); return; }
      return;
    }
    if (e.key === 'l' || e.key === 'L') { // 배움 카드(Learn)
      if (game.mode === 'world') { openCards('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openCards('title'); return; }
      if (game.mode === 'cards') { closeCards(); return; }
      return;
    }
    if (e.key === 'n' || e.key === 'N') { // 수료증(iNjeungseo)
      if (game.mode === 'world') { openCert('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openCert('title'); return; }
      if (game.mode === 'cert') { closeCert(); return; }
      return;
    }
    if (e.key === 'f' || e.key === 'F') { // 명예의 전당(Fame)
      if (game.mode === 'world') { openHof('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openHof('title'); return; }
      if (game.mode === 'hof') { closeHof(); return; }
      return;
    }
    const k = KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    if (!held.has(k)) pressed.add(k);
    held.add(k);
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.key];
    if (k) held.delete(k);
  });
  // 창 포커스를 잃으면(다른 탭·앱으로 전환) keyup이 안 와서 키가 '눌린 채' 남아
  // 돌아왔을 때 캐릭터가 계속 걷는 문제를 막는다.
  window.addEventListener('blur', () => { held.clear(); pressed.clear(); });

  // 가상 스틱: 중심에서의 변위(dx,dy)를 4방향 중 하나로 환산. 데드존 안이면 null.
  // (그리드 이동 게임이라 우세 축 하나만 사용한다.) — 순수 함수라 테스트로 검증한다.
  function stickDirection(dx, dy, max) {
    const dist = Math.hypot(dx, dy);
    if (dist < max * 0.34) return null; // 데드존: 가운데 근처는 정지
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'up' : 'down';
  }
  let stickDir = null;       // 스틱이 현재 가리키는 방향(없으면 null)
  let stickRepeatFrames = 0; // 메뉴에서 누른 채로 두면 자동 반복시키는 카운터

  // 터치 컨트롤
  if ('ontouchstart' in window) {
    document.body.classList.add('touch');
    const touchIds = new Map();
    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e) => {
        e.preventDefault(); Sound.resume();
        for (const t of e.changedTouches) touchIds.set(t.identifier, { el, key });
        if (!held.has(key)) pressed.add(key);
        held.add(key);
      };
      const up = (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) touchIds.delete(t.identifier);
        held.delete(key);
      };
      const move = (e) => {
        for (const t of e.changedTouches) {
          const info = touchIds.get(t.identifier);
          if (!info || info.el !== el) continue;
          const r = el.getBoundingClientRect();
          if (t.clientX < r.left || t.clientX > r.right || t.clientY < r.top || t.clientY > r.bottom) {
            held.delete(key);
            touchIds.delete(t.identifier);
          }
        }
      };
      el.addEventListener('touchstart', down);
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
      el.addEventListener('touchmove', move);
    };
    bind('t-a', 'action');
    bind('t-menu', 'menu');
    bind('t-pause', 'cancel');

    // 가상 스틱 (이동) — 손가락 방향으로 상하좌우를 누른 효과를 낸다.
    const DIRS4 = ['up', 'down', 'left', 'right'];
    const stick = document.getElementById('t-stick');
    const knob = document.getElementById('t-stick-knob');
    if (stick && knob) {
      let stickId = null, cx = 0, cy = 0, radius = 1;
      const setDir = (dir) => {
        for (const d of DIRS4) {
          if (d === dir) { if (!held.has(d)) pressed.add(d); held.add(d); }
          else held.delete(d);
        }
        if (dir !== stickDir) { stickDir = dir; stickRepeatFrames = 0; }
      };
      const place = (dx, dy) => {
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      };
      const onStart = (e) => {
        e.preventDefault(); Sound.resume();
        const t = e.changedTouches[0];
        stickId = t.identifier;
        const r = stick.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        radius = r.width * 0.36; // 노브 이동 한계
        onMove(e);
      };
      const onMove = (e) => {
        if (stickId === null) return;
        let t = null;
        for (const ct of e.changedTouches) if (ct.identifier === stickId) t = ct;
        if (!t) return;
        e.preventDefault();
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) { dx = dx / dist * radius; dy = dy / dist * radius; }
        place(dx, dy);
        setDir(stickDirection(dx, dy, radius));
      };
      const onEnd = (e) => {
        let mine = false;
        for (const ct of e.changedTouches) if (ct.identifier === stickId) mine = true;
        if (!mine) return;
        e.preventDefault();
        stickId = null;
        setDir(null);
        place(0, 0);
      };
      stick.addEventListener('touchstart', onStart);
      stick.addEventListener('touchmove', onMove);
      stick.addEventListener('touchend', onEnd);
      stick.addEventListener('touchcancel', onEnd);
    }
    const hintBtn = document.getElementById('t-hint');
    if (hintBtn) {
      const onHint = (e) => { e.preventDefault(); Sound.resume(); useHint(); };
      hintBtn.addEventListener('touchstart', onHint);
    }
  }

  function justPressed(k) { return pressed.has(k); }

  // ---------- 이름 입력 오버레이 (HTML, 한글 IME 지원) ----------
  const nameOverlay = document.getElementById('name-overlay');
  const nameInput = document.getElementById('name-input');
  const hasRealInput = !!(nameInput && 'value' in nameInput);

  function showNameEntry() {
    game.titleScreen = 'name';
    game.nameConfirm = false;
    game.nameCancel = false;
    if (hasRealInput) nameInput.value = '';
    if (nameOverlay && nameOverlay.style) nameOverlay.style.display = 'flex';
    if (nameInput && nameInput.focus) setTimeout(() => { try { nameInput.focus(); } catch (e) {} }, 0);
  }

  function hideNameEntry() {
    if (nameOverlay && nameOverlay.style) nameOverlay.style.display = 'none';
    if (nameInput && nameInput.blur) { try { nameInput.blur(); } catch (e) {} }
  }

  // 이름 정제 — 제어문자·제로폭 문자 제거, 공백 정리, 최대 6글자, 비면 '수호자'
  // (trim은 제로폭 문자 U+200B 등을 못 거르므로 별도로 제거한다)
  function sanitizeName(v) {
    return String(v == null ? "" : v)
      .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6) || "수호자";
  }
  function currentNameValue() {
    return sanitizeName(hasRealInput ? nameInput.value : '');
  }

  if (nameInput && nameInput.addEventListener) {
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); game.nameConfirm = true; }
      else if (e.key === 'Escape') { e.preventDefault(); game.nameCancel = true; }
      e.stopPropagation();
    });
  }
  const nameGo = document.getElementById('name-go');
  if (nameGo && nameGo.addEventListener) {
    nameGo.addEventListener('click', () => { game.nameConfirm = true; });
  }

  // ---------- 타일 ----------
  const SOLID = (ch) => !WALKABLE.has(ch);

  function tileAt(mapId, x, y) {
    const m = MAPS[mapId];
    if (y < 0 || y >= m.tiles.length) return 'T';
    const row = m.tiles[y];
    if (x < 0 || x >= row.length) return 'T';
    return row[x];
  }

  function npcVisible(npc) {
    return !npc.show || npc.show(game.flags);
  }

  function npcAt(mapId, x, y) {
    return MAPS[mapId].npcs.find((n) => n.x === x && n.y === y && npcVisible(n)) || null;
  }

  function monsterAt(mapId, x, y) {
    return MAPS[mapId].monsters.find(
      (mo) => mo.x === x && mo.y === y && !game.flags.defeated[mo.id]
    ) || null;
  }

  // 자비로 마음을 되돌린 몬스터는 그 자리에 '친구'로 남는다 (선택이 세계에 남는다)
  function isFriend(monId) {
    return !!(game.flags.defeated[monId] && game.flags.mercyChoice && game.flags.mercyChoice[monId] === 'mercy');
  }
  function friendAt(mapId, x, y) {
    return MAPS[mapId].monsters.find((mo) => mo.x === x && mo.y === y && isFriend(mo.id)) || null;
  }

  function signAt(mapId, x, y) {
    return MAPS[mapId].signs.find((s) => s.x === x && s.y === y) || null;
  }

  function warpAt(mapId, x, y) {
    return MAPS[mapId].warps.find((w) => w.x === x && w.y === y) || null;
  }

  // 타일 그리기 (절차적 도트)
  const tileCache = new Map();
  function tileCanvas(ch, frame) {
    const key = ch + frame;
    let cv = tileCache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = TS; cv.height = TS;
    const c = cv.getContext('2d');
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE); };
    // 결정적 의사난수
    const rnd = (seed) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

    switch (ch) {
      case 'G': { // 풀 — 차분한 녹색 + 결 텍스처
        px(0, 0, 16, 16, '#4f7a44');
        for (let i = 0; i < 12; i++) {
          const x = Math.floor(rnd(i + 1) * 16), y = Math.floor(rnd(i + 51) * 16);
          px(x, y, 1, 1, i % 3 ? '#456e3b' : '#5d8a50');
        }
        // 작은 풀잎
        px(3, 11, 1, 2, '#5d8a50'); px(4, 12, 1, 1, '#5d8a50');
        px(11, 5, 1, 2, '#456e3b');
        break;
      }
      case 'P': { // 길 — 부드러운 흙
        px(0, 0, 16, 16, '#b8a06e');
        for (let i = 0; i < 8; i++) {
          const x = Math.floor(rnd(i + 7) * 15), y = Math.floor(rnd(i + 77) * 15);
          px(x, y, 2, 1, i % 2 ? '#a8915f' : '#c4ad7c');
        }
        break;
      }
      case 'F': { // 꽃
        px(0, 0, 16, 16, '#4f7a44');
        const cols = ['#e8718f', '#f0c850', '#f2ede0'];
        for (let i = 0; i < 3; i++) {
          const x = 2 + Math.floor(rnd(i + 3) * 11), y = 2 + Math.floor(rnd(i + 33) * 11);
          px(x, y, 2, 2, cols[i]);
          px(x, y, 1, 1, '#ffffff55');
        }
        break;
      }
      case 'T': { // 나무 — 둥근 음영
        px(0, 0, 16, 16, '#4f7a44');
        px(3, 1, 10, 2, '#2f6b38');
        px(2, 2, 12, 6, '#327339');
        px(1, 4, 14, 4, '#2f6b38');
        px(3, 3, 4, 2, '#3f8a48'); // 하이라이트
        px(9, 5, 3, 2, '#3f8a48');
        px(2, 8, 12, 2, '#26572e'); // 아랫부분 그늘
        px(6, 10, 4, 5, '#6b4a2c');
        px(6, 10, 1, 5, '#7d5836');
        px(6, 15, 4, 1, '#4f361f');
        break;
      }
      case 'W': { // 물(2프레임 애니메이션)
        px(0, 0, 16, 16, '#3a7fc0');
        const off = frame ? 2 : 0;
        for (let i = 0; i < 5; i++) {
          const y = (i * 3 + off) % 15;
          const x = Math.floor(rnd(i + 13) * 9);
          px(x, y, 4, 1, '#5fa3de');
          px(x + 5, y, 2, 1, '#4f95d4');
        }
        break;
      }
      case 'B': { // 다리
        px(0, 0, 16, 16, '#3a7fc0');
        px(1, 0, 14, 16, '#9a6f3e');
        px(1, 0, 14, 1, '#7c5830');
        for (let y = 3; y < 16; y += 4) px(1, y, 14, 1, '#7c5830');
        px(0, 0, 1, 16, '#6b4a28');
        px(15, 0, 1, 16, '#6b4a28');
        break;
      }
      case 'S': { // 모래
        px(0, 0, 16, 16, '#e0cf9c');
        for (let i = 0; i < 7; i++) {
          px(Math.floor(rnd(i + 5) * 15), Math.floor(rnd(i + 55) * 15), 1, 1, i % 2 ? '#d0bd86' : '#ecdcaa');
        }
        break;
      }
      case 'O': { // 지붕
        px(0, 0, 16, 16, '#b3493a');
        px(0, 0, 16, 3, '#c8584688');
        for (let y = 3; y < 16; y += 4) px(0, y, 16, 1, '#963c30');
        px(0, 0, 1, 16, '#963c30');
        px(15, 0, 1, 16, '#963c30');
        break;
      }
      case 'H': { // 벽
        px(0, 0, 16, 16, '#e4d8c0');
        px(0, 0, 16, 2, '#ccbfa4');
        for (let y = 4; y < 16; y += 6) {
          px(0, y, 16, 1, '#ccbfa4');
        }
        px(2, 6, 4, 5, '#79c0e0'); // 창문
        px(10, 6, 4, 5, '#79c0e0');
        px(2, 6, 4, 1, '#58a4c8');
        px(10, 6, 4, 1, '#58a4c8');
        px(2, 6, 1, 5, '#9ad6f0');
        px(10, 6, 1, 5, '#9ad6f0');
        break;
      }
      case 'D': { // 문
        px(0, 0, 16, 16, '#e4d8c0');
        px(3, 2, 10, 14, '#7c5830');
        px(4, 3, 8, 13, '#9a6f3e');
        px(4, 3, 1, 13, '#ad8049');
        px(10, 9, 2, 2, '#f0c850');
        break;
      }
      case '1': { // 탑 문(빛나는 문)
        px(0, 0, 16, 16, '#e4d8c0');
        px(3, 1, 10, 15, '#3a3352');
        px(4, 2, 8, 14, '#564d7a');
        px(6, 4, 4, 7, frame ? '#f0c850' : '#fae29a');
        px(7, 5, 1, 4, '#fff2c8');
        break;
      }
      case 'Y': { // 표지판
        px(0, 0, 16, 16, '#4f7a44');
        px(2, 2, 12, 8, '#9a6f3e');
        px(3, 3, 10, 6, '#bb9258');
        px(4, 5, 8, 1, '#6b4a28');
        px(4, 7, 6, 1, '#6b4a28');
        px(7, 10, 2, 5, '#7c5830');
        break;
      }
      case 'R': { // 바위
        px(0, 0, 16, 16, '#4f7a44');
        px(3, 6, 10, 8, '#8a90a2');
        px(4, 4, 8, 2, '#9aa0b2');
        px(3, 12, 10, 2, '#6f7588'); // 그림자
        px(4, 5, 4, 3, '#b2b8c8'); // 하이라이트
        break;
      }
      case 'C': { // 동굴 바닥
        px(0, 0, 16, 16, '#3d3850');
        for (let i = 0; i < 7; i++) {
          px(Math.floor(rnd(i + 9) * 15), Math.floor(rnd(i + 99) * 15), 1, 1, i % 2 ? '#4a4560' : '#322d44');
        }
        break;
      }
      case 'K': { // 동굴 벽
        px(0, 0, 16, 16, '#241f33');
        px(0, 13, 16, 3, '#16111f');
        for (let i = 0; i < 4; i++) {
          px(Math.floor(rnd(i + 21) * 13), Math.floor(rnd(i + 22) * 10), 2, 2, '#322c44');
        }
        break;
      }
      case '*': { // 수정
        px(0, 0, 16, 16, '#3d3850');
        px(6, 4, 4, 9, frame ? '#79d1f0' : '#a8e4ff');
        px(4, 7, 3, 6, '#56b6e0');
        px(10, 6, 3, 7, '#56b6e0');
        px(7, 5, 1, 5, '#d4f4ff');
        break;
      }
      case 'M': { // 탑 바닥
        px(0, 0, 16, 16, '#7a749a');
        px(0, 0, 16, 1, '#8c86ac');
        px(0, 0, 1, 16, '#8c86ac');
        px(15, 0, 1, 16, '#605a80');
        px(0, 15, 16, 1, '#605a80');
        px(8, 8, 1, 1, '#8c86ac');
        break;
      }
      case 'N': { // 탑 벽
        px(0, 0, 16, 16, '#403a5e');
        for (let y = 0; y < 16; y += 4) px(0, y, 16, 1, '#322c4e');
        for (let x = 0; x < 16; x += 8) px(x, 0, 1, 16, '#322c4e');
        px(1, 1, 6, 2, '#4a4468');
        break;
      }
      case 'Z': { // 눈밭
        px(0, 0, 16, 16, '#e8eef8');
        for (let i = 0; i < 6; i++) {
          px(Math.floor(rnd(i + 31) * 15), Math.floor(rnd(i + 131) * 15), 1, 1, '#d2dcee');
        }
        if (frame) px(Math.floor(rnd(99) * 14), Math.floor(rnd(98) * 14), 2, 2, '#ffffff');
        break;
      }
      case 'J': { // 눈 덮인 나무
        px(0, 0, 16, 16, '#e8eef8');
        px(2, 2, 12, 6, '#2f6b38');
        px(1, 4, 14, 4, '#2f6b38');
        px(3, 1, 10, 2, '#ffffff');
        px(2, 2, 12, 1, '#e0e8f4');
        px(1, 4, 4, 1, '#ffffff');
        px(10, 4, 5, 1, '#ffffff');
        px(6, 10, 4, 5, '#6b4a2c');
        px(6, 15, 4, 1, '#4f361f');
        break;
      }
      case 'X': { // 선인장
        px(0, 0, 16, 16, '#e0cf9c');
        px(6, 3, 4, 11, '#3a8f3a');
        px(6, 3, 1, 11, '#4ba34b'); // 하이라이트
        px(2, 5, 3, 2, '#3a8f3a');
        px(3, 5, 2, 4, '#3a8f3a');
        px(11, 6, 3, 2, '#3a8f3a');
        px(11, 4, 2, 4, '#3a8f3a');
        px(8, 4, 1, 9, '#2c7a2c'); // 능선 그늘
        break;
      }
      case 'E': { // 기계실 바닥
        px(0, 0, 16, 16, '#1f2236');
        px(0, 0, 16, 1, '#2c3050');
        px(0, 0, 1, 16, '#2c3050');
        px(3, 8, 6, 1, '#34406a');
        px(8, 8, 1, 5, '#34406a');
        break;
      }
      case 'V': { // 서버 랙 (불빛 깜빡임)
        px(0, 0, 16, 16, '#15172a');
        px(1, 0, 14, 16, '#363c50');
        px(1, 0, 1, 16, '#444c64');
        for (let y = 2; y < 15; y += 4) {
          px(2, y, 12, 2, '#262a3c');
          px(3, y, 2, 1, frame ? '#5cf07a' : '#1e4a2a');
          px(11, y, 2, 1, frame ? '#8a2030' : '#f05c6a');
        }
        break;
      }
      case 'I': { // 도서관 바닥 (오래된 나무)
        px(0, 0, 16, 16, '#7c603f');
        px(0, 7, 16, 1, '#684e33');
        px(0, 15, 16, 1, '#684e33');
        px(7, 0, 1, 8, '#684e33');
        px(12, 8, 1, 8, '#684e33');
        px(0, 0, 16, 1, '#8a6c48');
        break;
      }
      case 'L': { // 책장
        px(0, 0, 16, 16, '#523924');
        px(0, 0, 16, 1, '#634631');
        const cols = ['#a8463f', '#43619a', '#43906a', '#b09438', '#7c50a0'];
        for (let s = 0; s < 2; s++) {
          const y = 2 + s * 7;
          px(1, y + 5, 14, 1, '#341f12');
          for (let i = 0; i < 6; i++) {
            px(2 + i * 2, y, 2, 5, cols[Math.floor(rnd(i + s * 7 + 1) * cols.length)]);
            px(2 + i * 2, y, 2, 1, '#ffffff22');
          }
        }
        break;
      }
      case 'Q': { // 거울 벽
        px(0, 0, 16, 16, '#8a98b8');
        px(1, 1, 14, 14, '#c2d2e8');
        px(2, 2, 3, 10, '#e8f0fc'); // 빛 반사
        px(10, 3, 2, 8, '#a4b6d2');
        px(5, 6, 1, 6, '#dce8f8');
        px(0, 15, 16, 1, '#606e8e');
        break;
      }
      case '2': { // 어두운 풀
        px(0, 0, 16, 16, '#2a4032');
        for (let i = 0; i < 9; i++) {
          const x = Math.floor(rnd(i + 41) * 16), y = Math.floor(rnd(i + 141) * 16);
          px(x, y, 1, 1, i % 2 ? '#34503c' : '#203428');
        }
        break;
      }
      case '3': { // 어두운 나무
        px(0, 0, 16, 16, '#2a4032');
        px(2, 2, 12, 6, '#1a2a20');
        px(1, 4, 14, 4, '#1a2a20');
        px(3, 3, 4, 2, '#26402e');
        px(2, 8, 12, 2, '#141e18');
        px(6, 10, 4, 5, '#382a1e');
        px(6, 15, 4, 1, '#261a10');
        break;
      }
      case '4': { // 빛나는 꽃
        px(0, 0, 16, 16, '#2a4032');
        const glow = frame ? '#9adcff' : '#6ab8e8';
        px(6, 5, 3, 3, glow);
        px(7, 4, 1, 1, '#ffffff');
        px(11, 10, 2, 2, glow);
        px(3, 11, 2, 2, frame ? '#6ab8e8' : '#9adcff');
        px(7, 8, 1, 4, '#34503c');
        break;
      }
      case 'A': { // 글리치 바닥
        px(0, 0, 16, 16, '#120e1f');
        for (let i = 0; i < 5; i++) {
          const x = Math.floor(rnd(i + 61 + (frame ? 50 : 0)) * 14);
          const y = Math.floor(rnd(i + 161 + (frame ? 50 : 0)) * 14);
          const cols = ['#3a2e5d', '#2a4a5d', '#4a2a4a'];
          px(x, y, 2, 1, cols[i % 3]);
        }
        if (frame) px(Math.floor(rnd(77) * 13), Math.floor(rnd(78) * 13), 3, 1, '#5a7aa0');
        break;
      }
      case '5': { // 미래연구소 포털 (빛나는 문)
        px(0, 0, 16, 16, '#1f2236');
        px(3, 1, 10, 14, '#2c3050');
        const glow = frame ? '#7bd1f0' : '#a8e4ff';
        px(5, 3, 6, 10, glow);
        px(6, 2, 4, 12, frame ? '#a8e4ff' : '#d4f4ff');
        px(7, 4, 2, 8, '#ffffff');
        px(3, 1, 1, 14, '#56b6e0');
        px(12, 1, 1, 14, '#56b6e0');
        break;
      }
      default:
        px(0, 0, 16, 16, '#f0f');
    }
    tileCache.set(key, cv);
    return cv;
  }

  // ---------- 대화 ----------
  function startDialog(lines, speaker, onEnd) {
    game.mode = 'dialog';
    game.dialog = { lines, idx: 0, chars: 0, speaker: speaker || null, onEnd: onEnd || null };
    Speech.speak(lines[0]);
  }

  function updateDialog() {
    const d = game.dialog;
    const line = d.lines[d.idx];
    if (d.chars < line.length) {
      const prev = Math.floor(d.chars);
      d.chars += TEXT_SPEEDS[game.textSpeed]; // 타자기 효과 (자막 속도 적용)
      if (Math.floor(d.chars) !== prev && game.time % 4 === 0) Sound.blip();
      if (justPressed('action')) d.chars = line.length; // 스킵
      return;
    }
    if (justPressed('action')) {
      Sound.select();
      d.idx += 1;
      d.chars = 0;
      if (d.idx >= d.lines.length) {
        const onEnd = d.onEnd;
        game.dialog = null;
        game.mode = 'world';
        Speech.stop();
        if (onEnd) onEnd();
      } else {
        Speech.speak(d.lines[d.idx]);
      }
    }
  }

  // ---------- 월드 ----------
  function tryMove(dir) {
    const p = game.player;
    p.dir = dir;
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    const nx = p.x + dx, ny = p.y + dy;
    const ch = tileAt(game.map, nx, ny);
    if (SOLID(ch) || npcAt(game.map, nx, ny) || monsterAt(game.map, nx, ny) || friendAt(game.map, nx, ny)) {
      return;
    }
    p.x = nx; p.y = ny;
    p.moving = true;
  }

  function facingTile() {
    const p = game.player;
    const dx = p.dir === 'left' ? -1 : p.dir === 'right' ? 1 : 0;
    const dy = p.dir === 'up' ? -1 : p.dir === 'down' ? 1 : 0;
    return { x: p.x + dx, y: p.y + dy };
  }

  function interact() {
    const f = facingTile();
    const npc = npcAt(game.map, f.x, f.y);
    if (npc) {
      const lines = getNpcDialog(npc.id, game.flags);
      startDialog(lines, npc.name, () => {
        if (npc.id === 'prof' && !game.flags.talkedProf) {
          game.flags.talkedProf = true;
          save();
        }
      });
      return;
    }
    const mon = monsterAt(game.map, f.x, f.y);
    if (mon) {
      startBattleIntro(mon.id);
      return;
    }
    // 되돌려 친구가 된 몬스터: 다시 싸우지 않고, 배운 점을 들려준다
    const friend = friendAt(game.map, f.x, f.y);
    if (friend) {
      const fm = MONSTERS[friend.id];
      const dex = MONSTER_DEX[friend.id];
      const lines = [`네 덕분에 마음을 되찾았어.\n정말 고마워!`];
      if (dex && dex.learn) lines.push(`이제 나도 알아 —\n${dex.learn}`);
      startDialog(lines, fm.name);
      return;
    }
    const sign = signAt(game.map, f.x, f.y);
    if (sign) {
      startDialog([sign.text], '표지판');
      return;
    }
    // 조사(살펴보기): 특별 지점 → 타일 기본 문구
    const prop = getPropAt(game.map, f.x, f.y);
    if (prop) {
      startDialog([prop.text]);
      return;
    }
    const ch = tileAt(game.map, f.x, f.y);
    const examine = getExamineTile(ch);
    if (examine) {
      startDialog([examine]);
    }
  }

  function pushBack() {
    const p = game.player;
    const nx = p.x + (p.dir === 'left' ? 1 : p.dir === 'right' ? -1 : 0);
    const ny = p.y + (p.dir === 'up' ? 1 : p.dir === 'down' ? -1 : 0);
    if (!SOLID(tileAt(game.map, nx, ny)) && !npcAt(game.map, nx, ny)) {
      p.x = nx; p.y = ny;
    }
    p.px = p.x * TS;
    p.py = p.y * TS;
  }

  function checkWarp() {
    const p = game.player;
    const w = warpAt(game.map, p.x, p.y);
    if (!w) return;
    if (w.needBadges && countBadges(game.flags) < w.needBadges) {
      pushBack();
      Sound.bump();
      startDialog([`신호탑의 문이 굳게 닫혀 있다.\n마음의 증표 ${w.needBadges}개가 필요하다.\n(지금 ${countBadges(game.flags)}개)`]);
      return;
    }
    if (w.needAllDefeated && !w.needAllDefeated.every((id) => game.flags.defeated[id])) {
      pushBack();
      Sound.bump();
      startDialog([w.lockText || '길이 막혀 있다.']);
      return;
    }
    if (w.needBoss && !game.flags.defeated[w.needBoss]) {
      pushBack();
      Sound.bump();
      startDialog([w.lockText || '길이 막혀 있다.']);
      return;
    }
    game.map = w.to;
    p.x = w.tx; p.y = w.ty;
    p.px = w.tx * TS; p.py = w.ty * TS;
    p.moving = false;
    // 새 맵에 도착하면 이동을 멈춘다. (방향키/스틱을 누른 채 워프해도
    // 도착하자마자 되돌아가는 워프 칸으로 걸어 들어가 '바로 전 맵으로 튕기는'
    // 현상을 막는다 — 계속 가려면 다시 눌러야 한다.)
    held.delete('up'); held.delete('down'); held.delete('left'); held.delete('right');
    stickDir = null; stickRepeatFrames = 0;
    Sound.warp();
    Sound.playSong(MAPS[w.to].song);
    // 처음 방문하는 맵의 인트로 연출
    const dest = MAPS[w.to];
    if (dest.intro && !game.flags.visited[w.to]) {
      game.flags.visited[w.to] = true;
      startDialog(dest.intro.slice());
    }
    save();
  }

  const MOVE_SPEED = TS / 9; // 프레임당 픽셀

  function updateWorld() {
    const p = game.player;
    if (game.notice.t > 0) game.notice.t -= 1;

    // 픽셀 보간 이동
    const tx = p.x * TS, ty = p.y * TS;
    if (p.px !== tx || p.py !== ty) {
      p.px += Math.sign(tx - p.px) * Math.min(MOVE_SPEED, Math.abs(tx - p.px));
      p.py += Math.sign(ty - p.py) * Math.min(MOVE_SPEED, Math.abs(ty - p.py));
      p.step += 1;
      if (p.px === tx && p.py === ty) {
        p.moving = false;
        checkWarp();
      }
      return;
    }

    if (justPressed('menu')) {
      openDex('world');
      return;
    }

    if (justPressed('cancel')) {
      openPause();
      return;
    }

    if (justPressed('action')) {
      interact();
      return;
    }

    if (held.has('up')) tryMove('up');
    else if (held.has('down')) tryMove('down');
    else if (held.has('left')) tryMove('left');
    else if (held.has('right')) tryMove('right');
  }

  // ---------- 배틀 ----------
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startBattleIntro(monId) {
    const mon = MONSTERS[monId];
    Sound.encounter();
    const lines = [mon.intro];
    // 첫 전투에서 한 번만, 전투 방법을 짧게 안내한다 (슬롯별 1회)
    if (game.flags && !game.flags.sawBattleTip) {
      game.flags.sawBattleTip = true;
      lines.push(
        '[전투 안내]\n↑↓로 답을 고르고 Z(또는 A)로 결정!\n맞히면 몬스터의 오해가 풀려요.',
        '틀려도 괜찮아요. 해설을 읽고 배우면 돼요.\n막히면 H로 50:50 힌트를 쓸 수 있어요.'
      );
    }
    startDialog(lines, mon.name, () => startBattle(monId));
  }

  function questionPool(mon) {
    const src = quizSource();
    const topics = Array.isArray(mon.topic) ? mon.topic : [mon.topic];
    return topics.flatMap((t) => (src[t] || []).map((q, i) => Object.assign({}, q, { _topic: t, _qid: t + '#' + i })));
  }

  function startBattle(monId) {
    const mon = MONSTERS[monId];
    game.mode = 'battle';
    Sound.playSong(mon.song || 'battle');
    // 학년별 난이도: 저학년은 하트 1개 더 (기본은 그대로 유지)
    const maxHearts = (mon.hp >= 5 ? 4 : 3) + (game.difficulty === 'easy' ? 1 : 0);
    game.battle = {
      monId,
      mon,
      monHp: mon.hp,
      monMaxHp: mon.hp,
      playerHp: maxHearts,
      maxHearts,
      questions: shuffled(questionPool(mon)),
      qIdx: 0,
      phase: 'question', // question | feedback | mercy | mercyReply | dodge
      cursor: 0,
      choiceOrder: null, // 보기 표시 순서(섞기) — setupQuestion에서 채움
      correctPos: 0,     // 섞인 보기 중 정답의 위치
      hintUsed: false,   // 이번 문항에서 50:50 힌트를 썼는지
      hiddenPos: -1,     // 힌트로 가려진 보기의 표시 위치 (-1이면 없음)
      feedback: null, // { correct, why }
      shake: 0,
      flash: 0,
      attack: getBossAttack(monId), // 보스 회피 구간 (없으면 null)
      dodgeDone: false,
      dodge: null,
    };
    setupQuestion();
    game.flags.battleCount += 1;
  }

  // 현재 문항의 보기 순서를 매번 새로 섞는다. (정답이 늘 2번에 오는 것을 방지)
  function setupQuestion() {
    const b = game.battle;
    if (b.qIdx >= b.questions.length) {
      b.questions = shuffled(questionPool(b.mon));
      b.qIdx = 0;
    }
    const q = b.questions[b.qIdx];
    if (!q || !Array.isArray(q.a) || q.a.length === 0) {
      // 출제할 문제가 없으면(데이터 이상) 배틀을 안전하게 종료해 크래시를 막는다
      game.battle = null;
      game.mode = 'world';
      return;
    }
    b.choiceOrder = shuffled(q.a.map((_, i) => i));
    b.correctPos = b.choiceOrder.indexOf(q.c);
    b.hintUsed = false;
    b.hiddenPos = -1;
    speakQuiz(q.q, b.choiceOrder.map((ai) => q.a[ai]));
  }

  // 50:50 힌트 — 정답이 아닌 보기 중 하나를 가린다 (한 문제당 한 번)
  function useHint() {
    const b = game.battle;
    if (!b || b.phase !== 'question') return;
    if (game.difficulty === 'hard') return;         // 고학년: 힌트 없음
    if (b.hintUsed && game.difficulty !== 'easy') return; // 기본: 문제당 1회 / 저학년: 여러 번
    const q = currentQuestion();
    const order = choiceOrder();
    const candidates = order.map((_, i) => i).filter((i) => i !== b.correctPos);
    if (candidates.length === 0) return;
    b.hiddenPos = candidates[Math.floor(Math.random() * candidates.length)];
    b.hintUsed = true;
    if (b.cursor === b.hiddenPos) {
      b.cursor = (b.cursor + 1) % q.a.length;
    }
    Sound.blip();
  }

  function currentQuestion() {
    return game.battle.questions[game.battle.qIdx];
  }

  // 표시 위치 i가 가리키는 실제 보기 인덱스 (외부 생성 배틀이면 그대로)
  function choiceOrder() {
    const b = game.battle;
    const q = currentQuestion();
    if (!q || !Array.isArray(q.a)) return [];
    return b.choiceOrder && b.choiceOrder.length === q.a.length
      ? b.choiceOrder : q.a.map((_, i) => i);
  }

  function nextQuestion() {
    const b = game.battle;
    b.qIdx += 1;
    b.cursor = 0;
    b.feedback = null;
    b.phase = 'question';
    setupQuestion();
  }

  // 정답으로 보스 HP가 절반이 되면, 마음이 폭주하는 회피 구간이 한 번 펼쳐진다.
  function continueAfterFeedback() {
    const b = game.battle;
    if (!b.dodgeDone && b.attack && b.monHp > 0 && b.monHp <= Math.floor(b.monMaxHp / 2)) {
      enterDodge();
    } else {
      nextQuestion();
      Sound.select();
    }
  }

  // 학년별 난이도: 회피 구간 길이·탄막 속도 배율 (기본 1)
  function dodgeSpeedFactor() { return game.difficulty === 'easy' ? 0.8 : game.difficulty === 'hard' ? 1.25 : 1; }
  function enterDodge() {
    const b = game.battle;
    const atk = b.attack;
    b.dodgeDone = true;
    b.phase = 'dodge';
    const boxW = 300, boxH = 170;
    b.dodge = {
      t: 0, dur: Math.round(atk.dur * (game.difficulty === 'easy' ? 0.75 : game.difficulty === 'hard' ? 1.2 : 1)),
      box: { x: Math.round(LW / 2 - boxW / 2), y: 150, w: boxW, h: boxH },
      soul: { x: LW / 2, y: 235 },
      bullets: [],
      spawnTimer: 30,
      inv: 0,
    };
    Sound.encounter();
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function spawnBullets(d, pattern) {
    const box = d.box;
    const sf = dodgeSpeedFactor();
    if (pattern === 'rain') {
      const x = box.x + 12 + Math.random() * (box.w - 24);
      d.bullets.push({ x, y: box.y - 6, vx: 0, vy: (2.0 + Math.random() * 1.4) * sf, r: 6 });
    } else if (pattern === 'sides') {
      const fromLeft = Math.random() < 0.5;
      const y = box.y + 12 + Math.random() * (box.h - 24);
      d.bullets.push({ x: fromLeft ? box.x - 6 : box.x + box.w + 6, y,
        vx: (fromLeft ? 1 : -1) * (2.2 + Math.random() * 1.2) * sf, vy: 0, r: 6 });
    } else if (pattern === 'spiral') {
      // 중앙에서 회전하며 뿜어내는 나선형 탄막
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      d.spiralA = (d.spiralA || 0) + 0.55;
      for (let i = 0; i < 3; i++) {
        const a = d.spiralA + i * (Math.PI * 2 / 3);
        d.bullets.push({ x: cx, y: cy, vx: Math.cos(a) * 2.1 * sf, vy: Math.sin(a) * 2.1 * sf, r: 5 });
      }
    } else if (pattern === 'wall') {
      // 위에서 내려오는 한 줄, 빠져나갈 빈틈이 하나 있다
      const cols = 7, gap = 1 + Math.floor(Math.random() * (cols - 3));
      for (let i = 0; i < cols; i++) {
        if (i === gap || i === gap + 1) continue;
        const x = box.x + 12 + i * (box.w - 24) / (cols - 1);
        d.bullets.push({ x, y: box.y - 6, vx: 0, vy: 2.0 * sf, r: 6 });
      }
    } else if (pattern === 'zigzag') {
      // 옆에서 들어와 위아래로 일렁이며 날아오는 탄막
      const fromLeft = Math.random() < 0.5;
      const y = box.y + 16 + Math.random() * (box.h - 32);
      d.bullets.push({ x: fromLeft ? box.x - 6 : box.x + box.w + 6, y,
        vx: (fromLeft ? 1 : -1) * 1.9 * sf, vy: 0, r: 6, zig: 2.4 * sf, zigT: Math.random() * 6 });
    } else { // burst — 중앙에서 방사형
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const n = 6, base = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = base + i * Math.PI * 2 / n;
        d.bullets.push({ x: cx, y: cy, vx: Math.cos(a) * 2.0 * sf, vy: Math.sin(a) * 2.0 * sf, r: 5 });
      }
    }
  }

  function updateDodge() {
    const b = game.battle, d = b.dodge, atk = b.attack;
    if (b.shake > 0) b.shake -= 1;
    if (b.flash > 0) b.flash -= 1;
    if (d.inv > 0) d.inv -= 1;
    d.t += 1;

    // 하트(소울) 이동
    const sp = 3.4, r = 7;
    if (held.has('left')) d.soul.x -= sp;
    if (held.has('right')) d.soul.x += sp;
    if (held.has('up')) d.soul.y -= sp;
    if (held.has('down')) d.soul.y += sp;
    d.soul.x = clamp(d.soul.x, d.box.x + r, d.box.x + d.box.w - r);
    d.soul.y = clamp(d.soul.y, d.box.y + r, d.box.y + d.box.h - r);

    // 탄막 생성 (끝나기 직전엔 멈춰서 정리 시간을 준다)
    d.spawnTimer -= 1;
    if (d.spawnTimer <= 0 && d.t < d.dur - 50) {
      spawnBullets(d, atk.pattern);
      d.spawnTimer = atk.pattern === 'burst' ? 24 : atk.pattern === 'spiral' ? 8
        : atk.pattern === 'wall' ? 42 : atk.pattern === 'zigzag' ? 18 : 15;
    }

    // 탄막 이동 + 화면 밖 제거 (zigzag 탄막은 진행하며 위아래로 일렁인다)
    for (const bu of d.bullets) {
      if (bu.zig) { bu.zigT = (bu.zigT || 0) + 1; bu.vy = Math.sin(bu.zigT / 7) * bu.zig; }
      bu.x += bu.vx; bu.y += bu.vy;
    }
    d.bullets = d.bullets.filter((bu) =>
      bu.x > d.box.x - 24 && bu.x < d.box.x + d.box.w + 24 &&
      bu.y > d.box.y - 24 && bu.y < d.box.y + d.box.h + 24);

    // 충돌 (하트는 1 아래로 줄지 않아 게임오버 없음)
    if (d.inv <= 0) {
      for (const bu of d.bullets) {
        const dx = bu.x - d.soul.x, dy = bu.y - d.soul.y;
        if (dx * dx + dy * dy < (r + bu.r) * (r + bu.r)) {
          b.playerHp = Math.max(1, b.playerHp - 1);
          d.inv = 42; b.flash = 12; Sound.bump();
          break;
        }
      }
    }

    if (d.t >= d.dur) {
      b.dodge = null;
      nextQuestion();
      Sound.select();
    }
  }

  function updateBattle() {
    const b = game.battle;
    if (b.phase === 'dodge') { updateDodge(); return; }
    if (b.shake > 0) b.shake -= 1;
    if (b.flash > 0) b.flash -= 1;

    if (b.phase === 'question') {
      const q = currentQuestion();
      const order = choiceOrder();
      if (justPressed('up')) {
        for (let g = 0; g < q.a.length; g++) { b.cursor = (b.cursor + q.a.length - 1) % q.a.length; if (b.cursor !== b.hiddenPos) break; }
        Sound.blip();
      }
      if (justPressed('down')) {
        for (let g = 0; g < q.a.length; g++) { b.cursor = (b.cursor + 1) % q.a.length; if (b.cursor !== b.hiddenPos) break; }
        Sound.blip();
      }
      if (justPressed('action')) {
        const correct = order[b.cursor] === q.c;
        b.feedback = { correct, why: q.why };
        b.phase = 'feedback';
        speakFeedback(correct, q.why);
        recordTopicResult(game.currentSlot, q._topic, correct);
        if (correct) {
          Sound.correct();
          b.monHp -= 1;
          b.shake = 14;
          game.flags.correctCount += 1;
          clearMistake(game.currentSlot, q._qid);
        } else {
          Sound.wrong();
          b.playerHp -= 1;
          b.flash = 14;
          recordMistake(game.currentSlot, q);
        }
      }
      return;
    }

    if (b.phase === 'feedback') {
      if (justPressed('action')) {
        if (b.monHp <= 0) {
          // 모든 몬스터는 마지막에 '마음의 선택'(갱생)이 기다린다 —
          // 쓰러뜨리는 게 아니라 마음을 되돌려 친구로 만드는 것이 이 모험의 핵심.
          if (b.mon.mercy && !b.mercyDone) {
            b.phase = 'mercy';
            b.cursor = 0;
            Sound.select();
            return;
          }
          winBattle();
          return;
        }
        if (b.playerHp <= 0) { loseBattle(); return; }
        continueAfterFeedback();
      }
      return;
    }

    if (b.phase === 'mercy') {
      const opts = b.mon.mercy.options;
      if (justPressed('up')) { b.cursor = (b.cursor + opts.length - 1) % opts.length; Sound.blip(); }
      if (justPressed('down')) { b.cursor = (b.cursor + 1) % opts.length; Sound.blip(); }
      if (justPressed('action')) {
        const choice = opts[b.cursor];
        b.mercyDone = true;
        b.mercyReply = choice.reply;
        b.mercyChoiceKind = choice.kind;
        if (choice.kind === 'mercy') {
          game.flags.mercy += 1;
          Sound.badge();
        } else {
          Sound.select();
        }
        b.phase = 'mercyReply';
      }
      return;
    }

    if (b.phase === 'mercyReply') {
      if (justPressed('action')) { winBattle(); }
      return;
    }
  }

  function winBattle() {
    const b = game.battle;
    const mon = b.mon;
    game.flags.defeated[b.monId] = true;
    recordDexSeen(b.monId, b.mercyChoiceKind);
    if (!game.flags.mercyChoice) game.flags.mercyChoice = {};
    game.flags.mercyChoice[b.monId] = b.mercyChoiceKind || null;
    const gotBadge = mon.badge && !game.flags.badges[mon.badge];
    if (mon.badge) game.flags.badges[mon.badge] = true;
    save();
    checkCosmeticUnlocks(game.currentSlot);

    game.battle = null;
    game.mode = 'world';
    Sound.badge();

    const lines = [mon.win];
    // 갱생 연출: 마음을 안아 준(자비) 경우, 친구가 되었음을 분명히 보여 준다
    if (b.mercyChoiceKind === 'mercy' && b.monId !== 'yeongi') {
      lines.push(`💛 ${mon.name}의 굳어 있던 마음이\n환하게 풀렸어요. 또 한 친구를 되돌렸다!`);
    }
    if (gotBadge) {
      const badgeNames = { forest: '정적의 숲의 증표', lake: '잔향의 호수의 증표', cave: '회로의 동굴의 증표' };
      lines.push(`☆ ${badgeNames[mon.badge]}를 얻었다! ☆\n(마음의 증표 ${countBadges(game.flags)}개 / 3개)`);
      if (countBadges(game.flags) >= 3) {
        lines.push('마음의 증표를 모두 모았다!\n마을의 신호탑 문이 열렸다…!');
      }
    }
    if (mon.clear) lines.push(mon.clear);
    if (b.monId === 'finalboss') {
      startDialog(lines, mon.name, () => {
        game.mode = 'ending';
        game.endingType = 'first';
        game.endingT = 0;
        Sound.playSong('ending');
      });
    } else if (b.monId === 'yeongi') {
      // 최종 엔딩 분기: 여정 전체의 자비 + 마지막 선택
      const endingId = computeEnding(b.mercyChoiceKind, game.flags.mercy);
      game.flags.endingId = endingId;
      game.flags.trueEnding = endingId === 'home';
      recordEndingSeen(endingId);
      save();
      startDialog(lines, mon.name, () => {
        game.mode = 'ending';
        game.endingType = 'true';
        game.endingT = 0;
        Sound.playSong('ending');
      });
    } else {
      startDialog(lines, mon.name, () => {
        Sound.playSong(MAPS[game.map].song);
      });
    }
  }

  function loseBattle() {
    game.battle = null;
    game.mode = 'world';
    Sound.playSong(MAPS[game.map].song);
    startDialog([
      '으윽, 머리가 어지럽다…!',
      '괜찮아, 틀려도 배우면 되는 거야.\n기운을 차리고 다시 도전하자!',
    ]);
  }

  // ---------- 도감 ----------
  function openDex(ret) {
    game.dex.ret = ret;
    game.dex.cursor = 0;
    game.mode = 'dex';
    Sound.select();
  }

  function closeDex() {
    game.mode = game.dex.ret;
    Sound.select();
  }

  function updateDex() {
    const n = DEX_ORDER.length;
    if (justPressed('up')) { game.dex.cursor = (game.dex.cursor + n - 1) % n; Sound.blip(); }
    if (justPressed('down')) { game.dex.cursor = (game.dex.cursor + 1) % n; Sound.blip(); }
    if (justPressed('left')) { game.dex.cursor = (game.dex.cursor + n - 5) % n; Sound.blip(); }
    if (justPressed('right')) { game.dex.cursor = (game.dex.cursor + 5) % n; Sound.blip(); }
    if (justPressed('cancel') || justPressed('menu') || justPressed('action')) closeDex();
  }

  const MERCY_LABEL = {
    mercy: '마음을 안아 줌 ♥', neutral: '바르게 타이름', harsh: '차갑게 작별',
  };

  function drawDex() {
    const seen = getDexSeen();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);

    // 헤더
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('♥ 몬스터 도감', 24, 38);
    ctx.fillStyle = '#888';
    ctx.font = '15px monospace';
    ctx.fillText(`수집 ${dexSeenCount()} / ${DEX_ORDER.length}`, 24, 62);

    // 왼쪽: 목록 (커서 주변으로 스크롤)
    const listX = 24, listY = 84, rowH = 30, visible = 13;
    const cur = game.dex.cursor;
    let start = Math.max(0, Math.min(cur - 6, DEX_ORDER.length - visible));
    if (DEX_ORDER.length <= visible) start = 0;
    for (let i = 0; i < visible && start + i < DEX_ORDER.length; i++) {
      const idx = start + i;
      const id = DEX_ORDER[idx];
      const isSeen = seen[id] && seen[id].seen;
      const y = listY + i * rowH;
      if (idx === cur) {
        ctx.fillStyle = '#e0453a';
        ctx.font = '14px monospace';
        ctx.fillText('♥', listX - 18, y);
      }
      ctx.fillStyle = '#666';
      ctx.font = '12px monospace';
      ctx.fillText(MONSTER_DEX[id].stage === 0 ? 'B' : `S${MONSTER_DEX[id].stage}`, listX, y);
      ctx.fillStyle = isSeen ? (idx === cur ? '#fff' : '#aaa') : '#444';
      ctx.font = (idx === cur ? 'bold ' : '') + '15px monospace';
      ctx.fillText(isSeen ? MONSTERS[id].name : '??? (미발견)', listX + 34, y);
    }
    // 스크롤 표시
    if (start > 0) { ctx.fillStyle = '#888'; ctx.fillText('▲', listX + 130, listY - 24); }
    if (start + visible < DEX_ORDER.length) { ctx.fillStyle = '#888'; ctx.fillText('▼', listX + 130, listY + visible * rowH); }

    // 오른쪽: 상세 패널
    const id = DEX_ORDER[cur];
    const info = MONSTER_DEX[id];
    const isSeen = seen[id] && seen[id].seen;
    const panelX = 330, panelW = LW - panelX - 24;
    utBox(panelX, 84, panelW, 400, 6);

    const cx = panelX + panelW / 2;
    // 스프라이트 (가운데, 6배)
    if (isSeen) {
      const ss = 6;
      const bob = Math.sin(game.time / 22) * 4;
      drawSprite(ctx, MONSTER_SPRITES[id], Math.round(cx - 16 * ss / 2), Math.round(110 + bob), ss);
    } else {
      // 실루엣
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 2;
      roundRect(cx - 44, 116, 88, 88, 6);
      ctx.stroke();
      ctx.fillStyle = '#444';
      ctx.font = 'bold 48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', cx, 178);
      ctx.textAlign = 'left';
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = isSeen ? '#fff' : '#555';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(isSeen ? MONSTERS[id].name : '???', cx, 238);
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    ctx.fillText(info.stage === 0 ? '보너스 · 미래연구소' : `스테이지 ${info.stage}`, cx, 260);
    ctx.textAlign = 'left';

    if (isSeen) {
      ctx.fillStyle = '#ffd644';
      ctx.font = 'bold 15px monospace';
      wrapText(`주제 · ${info.theme}`, panelX + 24, 296, panelW - 48, 22);
      ctx.fillStyle = '#fff';
      ctx.font = '15px monospace';
      const usedLines = wrapText(info.learn, panelX + 24, 330, panelW - 48, 24);
      const my = 330 + usedLines * 24 + 16;
      const mk = seen[id].mercy;
      ctx.fillStyle = '#e0453a';
      ctx.font = '14px monospace';
      ctx.fillText(`작별 · ${mk ? MERCY_LABEL[mk] : '—'}`, panelX + 24, my);
    } else {
      ctx.fillStyle = '#666';
      ctx.font = '15px monospace';
      ctx.fillText('아직 만나지 못한 마음입니다.', panelX + 24, 300);
      ctx.fillText('모험에서 깨우치면 기록됩니다.', panelX + 24, 326);
    }

    // 푸터
    ctx.fillStyle = '#777';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓←→ 넘기기 · X 또는 A로 닫기', LW / 2, 510);
    ctx.textAlign = 'left';
  }

  // ---------- 오답 복습 노트 ----------
  function openReview(ret) {
    const r = game.review;
    r.ret = ret;
    r.slot = activeSlot();
    r.ids = Object.keys(getMistakes(r.slot));
    r.cursor = 0;
    r.phase = 'list';
    game.mode = 'review';
    Sound.select();
  }

  function closeReview() {
    game.mode = game.review.ret;
    Speech.stop();
    Sound.select();
  }

  function startReviewQuestion() {
    const r = game.review;
    const m = getMistakes(r.slot)[r.ids[r.cursor]];
    r.choiceOrder = shuffled(m.a.map((_, i) => i));
    r.qCursor = 0;
    r.feedback = null;
    r.phase = 'question';
    speakQuiz(m.q, r.choiceOrder.map((ai) => m.a[ai]));
  }

  function updateReview() {
    const r = game.review;
    if (r.phase === 'list') {
      const n = r.ids.length;
      if (n === 0) {
        if (justPressed('cancel') || justPressed('action') || justPressed('menu')) closeReview();
        return;
      }
      if (justPressed('up')) { r.cursor = (r.cursor + n - 1) % n; Sound.blip(); }
      if (justPressed('down')) { r.cursor = (r.cursor + 1) % n; Sound.blip(); }
      if (justPressed('action')) { startReviewQuestion(); Sound.select(); }
      if (justPressed('cancel') || justPressed('menu')) closeReview();
      return;
    }

    if (r.phase === 'question') {
      const m = getMistakes(r.slot)[r.ids[r.cursor]];
      if (!m) { r.phase = 'list'; return; }
      const len = m.a.length;
      if (justPressed('up')) { r.qCursor = (r.qCursor + len - 1) % len; Sound.blip(); }
      if (justPressed('down')) { r.qCursor = (r.qCursor + 1) % len; Sound.blip(); }
      if (justPressed('cancel')) { r.phase = 'list'; Sound.select(); return; }
      if (justPressed('action')) {
        const correct = r.choiceOrder[r.qCursor] === m.c;
        r.feedback = { correct, why: m.why };
        r.phase = 'feedback';
        speakFeedback(correct, m.why);
        if (correct) { Sound.correct(); clearMistake(r.slot, r.ids[r.cursor]); } else { Sound.wrong(); }
      }
      return;
    }

    if (r.phase === 'feedback') {
      if (justPressed('action') || justPressed('cancel')) {
        if (r.feedback.correct) {
          r.ids = Object.keys(getMistakes(r.slot));
          if (r.cursor >= r.ids.length) r.cursor = Math.max(0, r.ids.length - 1);
        }
        r.phase = 'list';
        Sound.select();
      }
      return;
    }
  }

  function drawReview() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    const r = game.review;
    const ids = r.ids;

    if (r.phase === 'list') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('★ 오답 복습 노트', 24, 38);
      ctx.fillStyle = '#888';
      ctx.font = '15px monospace';
      ctx.fillText(`복습할 문제 ${ids.length}개`, 24, 62);

      if (ids.length === 0) {
        ctx.fillStyle = '#aaa';
        ctx.font = '16px monospace';
        ctx.fillText('아직 틀린 문제가 없어요!', 24, 120);
        ctx.fillText('모험을 하며 틀린 문제가 있으면', 24, 148);
        ctx.fillText('여기에 모여요.', 24, 174);
      } else {
        const listX = 24, listY = 96, rowH = 34, visible = 11;
        let start = Math.max(0, Math.min(r.cursor - 5, ids.length - visible));
        if (ids.length <= visible) start = 0;
        const mistakes = getMistakes(r.slot);
        for (let i = 0; i < visible && start + i < ids.length; i++) {
          const idx = start + i;
          const m = mistakes[ids[idx]];
          const y = listY + i * rowH;
          if (idx === r.cursor) {
            ctx.fillStyle = '#e0453a';
            ctx.font = '14px monospace';
            ctx.fillText('♥', listX - 18, y);
          }
          ctx.fillStyle = idx === r.cursor ? '#fff' : '#aaa';
          ctx.font = (idx === r.cursor ? 'bold ' : '') + '15px monospace';
          const firstLine = m ? m.q.split('\n')[0] : '???';
          ctx.fillText(firstLine, listX, y);
        }
        if (start > 0) { ctx.fillStyle = '#888'; ctx.fillText('▲', LW - 40, listY - 24); }
        if (start + visible < ids.length) { ctx.fillStyle = '#888'; ctx.fillText('▼', LW - 40, listY + visible * rowH); }
      }

      ctx.fillStyle = '#777';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      if (ids.length > 0) ctx.fillText('↑↓ 선택 · Z/스페이스로 다시 풀기 · X로 닫기', LW / 2, 510);
      else ctx.fillText('X 또는 Z로 닫기', LW / 2, 510);
      ctx.textAlign = 'left';
      return;
    }

    // question / feedback phase — 배틀 퀴즈 화면과 같은 형태로 표시
    const m = getMistakes(r.slot)[ids[r.cursor]];
    ctx.font = fs(16);
    let boxH = game.largeText ? 280 : 238;
    if (r.phase === 'question' && m) {
      const qMaxW = LW - 24 - 56;
      const cMaxW = LW - 24 - 38 - 28 - 16;
      const gap = game.largeText ? lh(16) : lh(14);
      let cl = 0;
      for (let i = 0; i < r.choiceOrder.length; i++) cl += measureWrap(`${i + 1}. ${m.a[r.choiceOrder[i]]}`, cMaxW);
      const needed = 30 + measureWrap(m.q, qMaxW) * lh(24) + lh(10) + cl * lh(22) + r.choiceOrder.length * gap + 16;
      boxH = Math.min(Math.max(boxH, needed), LH - 64 - 12);
    }
    const boxY = LH - boxH - 12;
    const hintY = boxY + boxH - 18;

    ctx.fillStyle = '#888';
    ctx.font = '14px monospace';
    ctx.fillText('★ 오답 복습', 24, 32);

    utBox(12, boxY, LW - 24, boxH, 8);

    if (r.phase === 'question') {
      ctx.fillStyle = '#fff';
      ctx.font = fs(16);
      let ty = drawQuestionText(m.q, 34, boxY + 30, LW - 24 - 56, lh(24)) + lh(10);
      const cMaxW = LW - 24 - 38 - 28 - 16;
      const gap = game.largeText ? lh(16) : lh(14);
      for (let i = 0; i < r.choiceOrder.length; i++) {
        ty += drawChoiceWrapped(`${i + 1}. ${m.a[r.choiceOrder[i]]}`, 38, ty, i === r.qCursor, cMaxW, lh(22)) + gap;
      }
    } else if (r.phase === 'feedback') {
      const f = r.feedback;
      ctx.font = fs(22, true);
      ctx.fillStyle = f.correct ? okColor() : badColor();
      ctx.fillText(f.correct ? '○ 정답! 잘 기억했어요!' : '× 다시 한번 살펴봐요.', 34, boxY + 38);
      ctx.fillStyle = '#fff';
      ctx.font = fs(16);
      drawQuestionText(f.why, 34, boxY + (game.largeText ? 86 : 78), LW - 24 - 44, lh(24));
      if (Math.floor(game.time / 20) % 2 === 0) {
        ctx.fillStyle = '#ffd644';
        ctx.font = fs(16);
        ctx.fillText('▼ (Z/스페이스)', LW - 150, hintY);
      }
    }
  }

  // ---------- 설정·일시정지 메뉴 ----------
  // 터치 기기에는 키보드 단축키(J/Q/B/I 등)가 없으므로, 모든 기능을 메뉴로 연다.
  const PAUSE_ITEMS = ['journal', 'cards', 'halloffame', 'dashboard', 'report', 'classmode', 'awards', 'cosmetics', 'cert',
    'challenge', 'review', 'dex', 'quizedit', 'backup', 'difficulty', 'textspeed', 'tts',
    'largetext', 'colorblind', 'reducefx', 'mute', 'help', 'close'];
  const PAUSE_LABELS = {
    journal: '◆ 수호자 일지',
    cards: '📚 배움 카드',
    halloffame: '🏆 명예의 전당',
    dashboard: '▤ 교사용 대시보드',
    report: '🩺 학생 진단 리포트',
    classmode: '▶ 수업 모드 (스테이지 시작)',
    awards: '☆ 도전과제',
    cosmetics: '✿ 꾸미기 (칭호·테마)',
    cert: '🎓 수료증',
    challenge: '▶ 퀴즈 챌린지',
    review: '★ 오답 복습 노트',
    dex: '♥ 몬스터 도감',
    quizedit: '✎ 커스텀 퀴즈',
    backup: '⇄ 데이터 백업·복원',
    difficulty: '난이도',
    textspeed: '자막 속도',
    tts: '읽어주기',
    largetext: '큰 글씨',
    colorblind: '색약 모드',
    reducefx: '화면 효과 줄이기',
    mute: '소리',
    help: '? 도움말',
    close: '닫기',
  };
  const PAUSE_VISIBLE = 12; // 한 화면에 보이는 메뉴 항목 수 (넘으면 스크롤)

  function pauseValueLabel(item) {
    if (item === 'textspeed') return TEXT_SPEED_LABEL[game.textSpeed];
    if (item === 'difficulty') return DIFF_LABEL[game.difficulty];
    if (item === 'tts') return game.tts ? 'ON' : 'OFF';
    if (item === 'largetext') return game.largeText ? 'ON' : 'OFF';
    if (item === 'colorblind') return game.colorBlind ? 'ON' : 'OFF';
    if (item === 'reducefx') return game.reduceFx ? 'ON' : 'OFF';
    if (item === 'mute') return Sound.muted ? '음소거' : 'ON';
    if (item === 'review') return `${mistakeCount(game.currentSlot)}개`;
    if (item === 'awards') return `${countAchievements(game.currentSlot)}/${ACHIEVEMENTS.length}`;
    if (item === 'cosmetics') return `${unlockedCount(game.currentSlot)}/${TITLES.length + THEMES.length}`;
    if (item === 'cards') return `${collectedCards(game.currentSlot)}/${LEARN_CARDS.length}`;
    if (item === 'quizedit') return `${getCustomQuizzes().length}개`;
    if (item === 'journal') {
      const s = buildLearningSummary(game.currentSlot);
      return s.attempted ? `${Math.round(s.overallRate * 100)}%` : '—';
    }
    return '';
  }

  function openPause() {
    game.pauseCursor = 0;
    game.pauseScroll = 0;
    game.mode = 'pause';
    Sound.select();
  }

  function closePause() {
    game.mode = 'world';
    Sound.select();
  }

  function clampPauseScroll() {
    const maxScroll = Math.max(0, PAUSE_ITEMS.length - PAUSE_VISIBLE);
    if (game.pauseCursor < game.pauseScroll) game.pauseScroll = game.pauseCursor;
    if (game.pauseCursor >= game.pauseScroll + PAUSE_VISIBLE) game.pauseScroll = game.pauseCursor - PAUSE_VISIBLE + 1;
    game.pauseScroll = Math.max(0, Math.min(game.pauseScroll, maxScroll));
  }
  function updatePause() {
    const n = PAUSE_ITEMS.length;
    if (justPressed('up')) { game.pauseCursor = (game.pauseCursor + n - 1) % n; clampPauseScroll(); Sound.blip(); }
    if (justPressed('down')) { game.pauseCursor = (game.pauseCursor + 1) % n; clampPauseScroll(); Sound.blip(); }
    if (justPressed('cancel')) { closePause(); return; }
    if (justPressed('action')) {
      const item = PAUSE_ITEMS[game.pauseCursor];
      if (item === 'journal') openJournal('pause');
      else if (item === 'cards') openCards('pause');
      else if (item === 'halloffame') openHof('pause');
      else if (item === 'cert') openCert('pause');
      else if (item === 'dashboard') openDashboard('pause');
      else if (item === 'report') openReport('pause');
      else if (item === 'classmode') openClassMode('pause');
      else if (item === 'awards') openAwards('pause');
      else if (item === 'cosmetics') openCosmetics('pause');
      else if (item === 'review') openReview('pause');
      else if (item === 'challenge') openChallenge('pause');
      else if (item === 'dex') openDex('pause');
      else if (item === 'quizedit') openQuizEdit('pause');
      else if (item === 'backup') openBackup('pause');
      else if (item === 'difficulty') cycleDifficulty();
      else if (item === 'textspeed') cycleTextSpeed();
      else if (item === 'tts') toggleTTS();
      else if (item === 'largetext') toggleLargeText();
      else if (item === 'colorblind') toggleColorBlind();
      else if (item === 'reducefx') toggleReduceFx();
      else if (item === 'mute') Sound.toggleMute();
      else if (item === 'help') openHelp('pause');
      else if (item === 'close') closePause();
    }
  }

  function drawPause() {
    drawWorld();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, LW, LH);

    const rowH = 34;
    const shown = Math.min(PAUSE_VISIBLE, PAUSE_ITEMS.length);
    const boxW = 340, boxH = 64 + shown * rowH;
    const boxX = Math.round(LW / 2 - boxW / 2);
    const boxY = Math.round(LH / 2 - boxH / 2);
    utBox(boxX, boxY, boxW, boxH, 8);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 17px monospace';
    ctx.fillText('메뉴', boxX + 22, boxY + 30);

    const start = game.pauseScroll;
    let ty = boxY + 62;
    for (let k = 0; k < shown; k++) {
      const i = start + k;
      if (i >= PAUSE_ITEMS.length) break;
      const item = PAUSE_ITEMS[i];
      drawChoiceLine(PAUSE_LABELS[item], boxX + 22, ty, i === game.pauseCursor);
      const val = pauseValueLabel(item);
      if (val) {
        ctx.fillStyle = warnColor();
        ctx.font = '13px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(val, boxX + boxW - 22, ty);
        ctx.textAlign = 'left';
      }
      ty += rowH;
    }
    // 스크롤 표시
    if (start > 0) { ctx.fillStyle = '#888'; ctx.textAlign = 'center'; ctx.fillText('▲', boxX + boxW - 16, boxY + 56); }
    if (start + shown < PAUSE_ITEMS.length) { ctx.fillStyle = '#888'; ctx.textAlign = 'center'; ctx.fillText('▼', boxX + boxW - 16, boxY + boxH - 22); }

    ctx.fillStyle = '#777';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ 선택 · Z 결정 · X 닫기', LW / 2, boxY + boxH - 12);
    ctx.textAlign = 'left';
  }

  // ---------- 수호자 일지 (학습 진척도) ----------
  function openJournal(ret) {
    game.journal.ret = ret;
    game.journal.slot = activeSlot();
    game.journal.scroll = 0;
    game.journal.toast = 0;
    game.mode = 'journal';
    Sound.select();
  }

  function closeJournal() {
    game.mode = game.journal.ret;
    Sound.select();
  }

  // 학습 리포트(교사·학부모용)를 텍스트로 만들어 클립보드에 복사
  function buildReportText(slot) {
    if (slot == null) slot = game.journal.slot;
    const s = buildLearningSummary(slot);
    const pct = (r) => Math.round(r * 100) + '%';
    let date = '';
    try { date = new Date().toLocaleDateString('ko-KR'); } catch (e) {}
    const lines = [];
    const title = selectedTitle(slot);
    lines.push('[AI 윤리 어드벤처 — 학습 리포트]');
    if (date) lines.push('날짜: ' + date);
    lines.push('이름: ' + slotLearnName(slot) + (title ? ` (칭호: ${title.name})` : ''));
    lines.push('──────────────────────');
    lines.push(`푼 문제: ${s.attempted}개 · 정답 ${s.correct}개 (${s.attempted ? pct(s.overallRate) : '—'})`);
    lines.push('');
    lines.push('주제별 정답률:');
    if (s.rows.length === 0) lines.push('  (아직 푼 문제가 없어요)');
    for (const r of s.rows) {
      const mark = r.total >= 2 && r.rate < 0.6 ? '  ← 더 살펴봐요' : '';
      lines.push(`  - ${r.label}: ${r.correct}/${r.total} (${pct(r.rate)})${mark}`);
    }
    lines.push('');
    if (s.weak.length) lines.push('더 살펴볼 주제: ' + s.weak.join(', '));
    const endSeen = getEndingsSeen();
    const endN = ['home', 'dawn', 'farewell', 'silent'].filter((k) => endSeen[k]).length;
    lines.push(`발견 엔딩: ${endN}/4 · 도감 수집: ${dexSeenCount()}/${DEX_ORDER.length}`);
    lines.push(`복습 노트 남은 문제: ${mistakeCount(slot)}개`);
    const rm = getMeta(slot);
    if (rm.streak || rm.bestStreak) lines.push(`연속 출석: ${rm.streak || 0}일 (최고 ${rm.bestStreak || 0}일)`);
    return lines.join('\n');
  }

  function copyReport() {
    const ok = copyTextToClipboard(buildReportText(game.journal.slot));
    game.journal.toast = ok ? 120 : -120; // 양수=성공, 음수=실패 안내
    Sound.badge();
  }

  function updateJournal() {
    const j = game.journal;
    if (j.toast > 0) j.toast -= 1;
    else if (j.toast < 0) j.toast += 1;
    const s = buildLearningSummary(j.slot);
    const maxScroll = Math.max(0, s.rows.length - JOURNAL_VISIBLE);
    if (justPressed('up')) { j.scroll = Math.max(0, j.scroll - 1); Sound.blip(); }
    if (justPressed('down')) { j.scroll = Math.min(maxScroll, j.scroll + 1); Sound.blip(); }
    if (justPressed('action')) { copyReport(); return; }
    if (justPressed('cancel') || justPressed('menu')) closeJournal();
  }

  const JOURNAL_VISIBLE = 8;
  function drawJournal() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    const slot = game.journal.slot;
    const s = buildLearningSummary(slot);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`◆ 수호자 일지 — ${slotLearnName(slot)}`, 24, 38);
    // 고른 칭호
    const title = selectedTitle(slot);
    if (title) {
      ctx.fillStyle = themeAccent();
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`「${title.name}」`, LW - 24, 38);
      ctx.textAlign = 'left';
    }

    // 요약 줄
    ctx.fillStyle = warnColor();
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`푼 문제 ${s.attempted}개  ·  정답 ${s.correct}개  ·  정답률 ${s.attempted ? Math.round(s.overallRate * 100) + '%' : '—'}`, 24, 66);
    const endSeen = getEndingsSeen();
    const endN = ['home', 'dawn', 'farewell', 'silent'].filter((k) => endSeen[k]).length;
    const jm = getMeta(slot);
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    ctx.fillText(`발견 엔딩 ${endN}/4  ·  도감 ${dexSeenCount()}/${DEX_ORDER.length}  ·  복습 노트 ${mistakeCount(slot)}개`, 24, 88);
    if (jm.streak || jm.bestStreak) {
      ctx.fillStyle = themeAccent();
      ctx.fillText(`🔥 연속 출석 ${jm.streak || 0}일 (최고 ${jm.bestStreak || 0}일)`, 24, 106);
    }

    // 주제별 정답률 막대
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('주제별 정답률 (낮은 순)', 24, 118);

    if (s.rows.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '15px monospace';
      ctx.fillText('아직 푼 문제가 없어요. 모험에서 퀴즈를 풀면 여기에 쌓여요!', 24, 150);
    } else {
      const barX = 230, barW = LW - barX - 90, rowH = 38;
      const start = game.journal.scroll;
      for (let i = 0; i < JOURNAL_VISIBLE && start + i < s.rows.length; i++) {
        const r = s.rows[start + i];
        const y = 140 + i * rowH;
        const weak = r.total >= 2 && r.rate < 0.6;
        ctx.fillStyle = weak ? badColor() : '#ddd';
        ctx.font = '14px monospace';
        ctx.fillText(r.label, 24, y + 14);
        // 막대 배경/채움
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, y, barW, 16);
        ctx.fillStyle = r.rate >= 0.8 ? okColor() : r.rate >= 0.6 ? warnColor() : badColor();
        ctx.fillRect(barX, y, Math.round(barW * r.rate), 16);
        ctx.fillStyle = '#fff';
        ctx.font = '12px monospace';
        ctx.fillText(`${Math.round(r.rate * 100)}% (${r.correct}/${r.total})`, barX + barW + 8, y + 13);
      }
      // 스크롤 표시
      if (start > 0) { ctx.fillStyle = '#888'; ctx.font = '14px monospace'; ctx.fillText('▲', LW - 40, 132); }
      if (start + JOURNAL_VISIBLE < s.rows.length) { ctx.fillStyle = '#888'; ctx.font = '14px monospace'; ctx.fillText('▼', LW - 40, 140 + JOURNAL_VISIBLE * rowH - 8); }
    }

    // 약한 주제 안내
    if (s.weak.length) {
      ctx.fillStyle = badColor();
      ctx.font = '13px monospace';
      ctx.fillText('더 살펴볼 주제: ' + s.weak.slice(0, 3).join(', '), 24, 470);
    }

    // 토스트 (리포트 복사 결과)
    if (game.journal.toast !== 0) {
      const ok = game.journal.toast > 0;
      ctx.textAlign = 'center';
      ctx.fillStyle = ok ? okColor() : badColor();
      ctx.font = 'bold 15px monospace';
      ctx.fillText(ok ? '✓ 학습 리포트를 클립보드에 복사했어요!' : '복사할 수 없는 환경이에요 (직접 화면을 보여 주세요)', LW / 2, 490);
      ctx.textAlign = 'left';
    }

    // 푸터
    ctx.fillStyle = '#777';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ 스크롤 · Z 리포트 복사(교사용) · X 닫기', LW / 2, 512);
    ctx.textAlign = 'left';
  }

  // ---------- 자유 퀴즈 챌린지 ----------
  const CHALLENGE_LEN = 10;
  function challengeTopics() {
    // 실제 퀴즈가 있는 주제만, 표시 라벨과 함께 (커스텀 문제 포함)
    const src = quizSource();
    return quizTopicKeys().map((t) => ({ key: t, label: topicLabel(t), n: src[t].length }));
  }

  function openChallenge(ret) {
    game.challenge = {
      ret, slot: activeSlot(), phase: 'topic', topics: challengeTopics(), sel: 0,
      questions: [], idx: 0, cursor: 0, choiceOrder: null, score: 0, feedback: null,
    };
    game.mode = 'challenge';
    Sound.select();
  }

  function closeChallenge() {
    const ret = game.challenge ? game.challenge.ret : 'title';
    game.challenge = null;
    game.mode = ret;
    Speech.stop();
    Sound.select();
  }

  function startChallengeQuiz() {
    const c = game.challenge;
    c.daily = false;
    c.adaptive = false;
    let pool = [];
    if (c.sel === 0) {            // 오늘의 도전 (날짜 기반 결정적 출제)
      c.daily = true;
      pool = buildDailyPool(c.slot);
    } else if (c.sel === 1) {     // 맞춤 학습 (약점 집중)
      c.adaptive = true;
      pool = buildAdaptivePool(c.slot);
    } else if (c.sel === 2) {     // 전체 랜덤
      for (const t of c.topics) for (let i = 0; i < t.n; i++) pool.push(quizQ(t.key, i));
      pool = shuffled(pool).slice(0, CHALLENGE_LEN);
    } else {                      // 특정 주제
      const t = c.topics[c.sel - 3];
      for (let i = 0; i < t.n; i++) pool.push(quizQ(t.key, i));
      pool = shuffled(pool).slice(0, CHALLENGE_LEN);
    }
    c.questions = pool;
    c.idx = 0;
    c.score = 0;
    c.cursor = 0;
    c.feedback = null;
    c.choiceOrder = shuffled(pool[0].a.map((_, i) => i));
    c.phase = 'quiz';
    speakQuiz(pool[0].q, c.choiceOrder.map((ai) => pool[0].a[ai]));
  }

  function challengeNext() {
    const c = game.challenge;
    c.idx += 1;
    if (c.idx >= c.questions.length) {
      c.phase = 'result';
      recordChallengeResult(c.slot, c.score, c.questions.length);
      if (c.daily) recordDailyDone(c.slot, c.score, c.questions.length);
      checkCosmeticUnlocks(c.slot);
      Sound.badge();
      return;
    }
    c.cursor = 0;
    c.feedback = null;
    const nq = c.questions[c.idx];
    c.choiceOrder = shuffled(nq.a.map((_, i) => i));
    c.phase = 'quiz';
    speakQuiz(nq.q, c.choiceOrder.map((ai) => nq.a[ai]));
  }

  function updateChallenge() {
    const c = game.challenge;
    if (!c) { game.mode = 'title'; return; }

    if (c.phase === 'topic') {
      const n = c.topics.length + 3; // 0=오늘의 도전, 1=맞춤 학습, 2=전체 랜덤, 3.. 주제
      if (justPressed('up')) { c.sel = (c.sel + n - 1) % n; Sound.blip(); }
      if (justPressed('down')) { c.sel = (c.sel + 1) % n; Sound.blip(); }
      if (justPressed('cancel') || justPressed('menu')) { closeChallenge(); return; }
      if (justPressed('action')) { startChallengeQuiz(); Sound.select(); }
      return;
    }

    if (c.phase === 'quiz') {
      const q = c.questions[c.idx];
      const len = q.a.length;
      if (justPressed('up')) { c.cursor = (c.cursor + len - 1) % len; Sound.blip(); }
      if (justPressed('down')) { c.cursor = (c.cursor + 1) % len; Sound.blip(); }
      if (justPressed('cancel')) { closeChallenge(); return; }
      if (justPressed('action')) {
        const correct = c.choiceOrder[c.cursor] === q.c;
        c.feedback = { correct, why: q.why };
        c.phase = 'feedback';
        speakFeedback(correct, q.why);
        recordTopicResult(c.slot, q._topic, correct);
        if (correct) { c.score += 1; clearMistake(c.slot, q._qid); Sound.correct(); }
        else { recordMistake(c.slot, q); Sound.wrong(); }
      }
      return;
    }

    if (c.phase === 'feedback') {
      if (justPressed('action')) challengeNext();
      return;
    }

    if (c.phase === 'result') {
      if (justPressed('action') || justPressed('cancel') || justPressed('menu')) closeChallenge();
      return;
    }
  }

  function drawChallenge() {
    const c = game.challenge;
    if (!c) return; // 같은 프레임에 닫혔을 수 있음
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);

    if (c.phase === 'topic') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('▶ 자유 퀴즈 챌린지', 24, 40);
      ctx.fillStyle = '#888';
      ctx.font = '14px monospace';
      ctx.fillText(`주제를 골라 ${CHALLENGE_LEN}문제에 도전! (모험과 별개로 즐겨요)`, 24, 64);
      // 연속 출석(스트릭) 표시
      const meta = getMeta(c.slot);
      if (meta.streak) {
        ctx.fillStyle = themeAccent();
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`🔥 연속 출석 ${meta.streak}일`, LW - 24, 40);
        ctx.textAlign = 'left';
      }

      const dailyDone = dailyDoneToday(c.slot);
      const items = [
        dailyDone ? '◷ 오늘의 도전 (완료 ✓)' : '◷ 오늘의 도전 (날마다 새 문제!)',
        '◎ 맞춤 학습 (약점 집중)',
        '★ 전체 랜덤',
      ].concat(c.topics.map((t) => `${t.label}  (${t.n})`));
      const listX = 40, listY = 100, rowH = 30, visible = 12;
      let start = Math.max(0, Math.min(c.sel - 6, items.length - visible));
      if (items.length <= visible) start = 0;
      for (let i = 0; i < visible && start + i < items.length; i++) {
        const idx = start + i;
        drawChoiceLine(items[idx], listX, listY + i * rowH, idx === c.sel);
      }
      if (start > 0) { ctx.fillStyle = '#888'; ctx.font = '14px monospace'; ctx.fillText('▲', LW - 50, listY - 8); }
      if (start + visible < items.length) { ctx.fillStyle = '#888'; ctx.font = '14px monospace'; ctx.fillText('▼', LW - 50, listY + visible * rowH - 8); }

      ctx.fillStyle = '#777';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('↑↓ 선택 · Z 시작 · X 닫기', LW / 2, 512);
      ctx.textAlign = 'left';
      return;
    }

    if (c.phase === 'result') {
      const total = c.questions.length;
      ctx.textAlign = 'center';
      ctx.fillStyle = warnColor();
      ctx.font = 'bold 26px monospace';
      ctx.fillText('★ 챌린지 완료!', LW / 2, 150);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 40px monospace';
      ctx.fillText(`${c.score} / ${total}`, LW / 2, 220);
      const rate = total ? c.score / total : 0;
      const msg = rate >= 0.9 ? '대단해요! 진정한 AI 윤리 수호자!'
        : rate >= 0.7 ? '잘했어요! 조금만 더 하면 완벽!'
        : rate >= 0.5 ? '좋아요! 복습 노트로 다시 살펴봐요.'
        : '괜찮아요. 틀린 문제는 복습 노트에 모였어요!';
      ctx.fillStyle = '#aaa';
      ctx.font = '16px monospace';
      ctx.fillText(msg, LW / 2, 270);
      ctx.fillStyle = '#777';
      ctx.font = '13px monospace';
      ctx.fillText('Z 또는 X로 돌아가기', LW / 2, 330);
      ctx.textAlign = 'left';
      return;
    }

    // quiz / feedback — 진행 표시 + 문제 박스
    const q = c.questions[c.idx];
    ctx.textAlign = 'left';
    ctx.fillStyle = '#888';
    ctx.font = '14px monospace';
    ctx.fillText(`문제 ${c.idx + 1} / ${c.questions.length}`, 24, 32);
    ctx.fillStyle = warnColor();
    ctx.fillText(`점수 ${c.score}`, LW - 110, 32);
    // 진행 막대
    ctx.fillStyle = '#222';
    ctx.fillRect(24, 42, LW - 48, 6);
    ctx.fillStyle = okColor();
    ctx.fillRect(24, 42, Math.round((LW - 48) * (c.idx / c.questions.length)), 6);

    ctx.font = fs(16);
    let boxH = game.largeText ? 300 : 260;
    if (c.phase === 'quiz') {
      const qMaxW = LW - 24 - 56;
      const cMaxW = LW - 24 - 38 - 28 - 16;
      const gap = game.largeText ? lh(16) : lh(14);
      let cl = 0;
      for (let i = 0; i < c.choiceOrder.length; i++) cl += measureWrap(`${i + 1}. ${q.a[c.choiceOrder[i]]}`, cMaxW);
      const needed = 32 + measureWrap(q.q, qMaxW) * lh(24) + lh(10) + cl * lh(22) + c.choiceOrder.length * gap + 16;
      boxH = Math.min(Math.max(boxH, needed), LH - 64 - 16);
    }
    const boxY = LH - boxH - 16;
    const hintY = boxY + boxH - 18;
    utBox(12, boxY, LW - 24, boxH, 8);

    if (c.phase === 'quiz') {
      ctx.fillStyle = '#fff';
      ctx.font = fs(16);
      let ty = drawQuestionText(q.q, 34, boxY + 32, LW - 24 - 56, lh(24)) + lh(10);
      const cMaxW = LW - 24 - 38 - 28 - 16;
      const gap = game.largeText ? lh(16) : lh(14);
      for (let i = 0; i < c.choiceOrder.length; i++) {
        ty += drawChoiceWrapped(`${i + 1}. ${q.a[c.choiceOrder[i]]}`, 38, ty, i === c.cursor, cMaxW, lh(22)) + gap;
      }
    } else if (c.phase === 'feedback') {
      const f = c.feedback;
      ctx.font = fs(22, true);
      ctx.fillStyle = f.correct ? okColor() : badColor();
      ctx.fillText(f.correct ? '○ 정답!' : '× 아쉬워요!', 34, boxY + 38);
      ctx.fillStyle = '#fff';
      ctx.font = fs(16);
      drawQuestionText(f.why, 34, boxY + (game.largeText ? 86 : 78), LW - 24 - 44, lh(24));
      if (Math.floor(game.time / 20) % 2 === 0) {
        ctx.fillStyle = '#ffd644';
        ctx.font = fs(16);
        ctx.fillText('▼ (Z/스페이스)', LW - 150, hintY);
      }
    }
  }

  // ---------- 도전과제 (업적) ----------
  // 각 과제는 슬롯별 학습 데이터 + 기기 공용 컬렉션(도감·엔딩)에서 즉석 판정한다.
  const ACHIEVEMENTS = [
    { id: 'firstwin', cat: 'battle', name: '첫 깨우침', desc: '몬스터를 처음 깨우쳤어요', check: (c) => c.defeatedCount >= 1 },
    { id: 'mercy1', cat: 'battle', name: '따뜻한 마음', desc: '마음을 한 번 안아 주었어요', check: (c) => c.mercy >= 1 },
    { id: 'mercy10', cat: 'battle', name: '마음의 수호자', desc: '마음을 열 번 안아 주었어요', check: (c) => c.mercy >= 10 },
    { id: 'solved50', cat: 'learn', name: '꾸준한 공부', desc: '문제를 50개 이상 풀었어요', check: (c) => c.attempted >= 50 },
    { id: 'perfectTopic', cat: 'learn', name: '완벽한 한 주제', desc: '한 주제 100% (3문제 이상)', check: (c) => c.perfectTopic },
    { id: 'wellRounded', cat: 'learn', name: '두루 박학', desc: '5개 주제에서 80% 이상', check: (c) => c.strongTopics >= 5 },
    { id: 'dexHalf', cat: 'collect', name: '도감 수집가', desc: '도감을 절반 이상 모았어요', check: (c) => c.dex > 0 && c.dex * 2 >= c.dexTotal },
    { id: 'dexAll', cat: 'collect', name: '도감 마스터', desc: '도감을 모두 모았어요', check: (c) => c.dexTotal > 0 && c.dex >= c.dexTotal },
    { id: 'ending1', cat: 'collect', name: '이야기꾼', desc: '엔딩을 하나 보았어요', check: (c) => c.endings >= 1 },
    { id: 'endingAll', cat: 'collect', name: '모든 결말', desc: '엔딩 네 가지를 모두 보았어요', check: (c) => c.endings >= 4 },
    { id: 'challengeDone', cat: 'challenge', name: '챌린지 도전', desc: '퀴즈 챌린지를 완주했어요', check: (c) => c.challengeRuns >= 1 },
    { id: 'challengePerfect', cat: 'challenge', name: '챌린지 만점', desc: '퀴즈 챌린지에서 만점!', check: (c) => c.challengeBest > 0 && c.challengeBest === c.challengeBestTotal },
  ];
  const ACH_CAT = {
    battle: { icon: '♥', color: '#e0453a' },
    learn: { icon: '★', color: '#ffd644' },
    collect: { icon: '◆', color: '#5aa9e6' },
    challenge: { icon: '✦', color: '#b48ce0' },
  };
  function achievementCtx(slot) {
    const s = buildLearningSummary(slot);
    const f = slotFlags(slot) || {};
    const meta = getMeta(slot);
    const defeatedCount = f.defeated ? Object.keys(f.defeated).filter((k) => f.defeated[k]).length : 0;
    const endSeen = getEndingsSeen();
    const endings = ['home', 'dawn', 'farewell', 'silent'].filter((k) => endSeen[k]).length;
    const ctx = {
      attempted: s.attempted, strongTopics: s.strongTopics, perfectTopic: s.perfectTopic,
      mercy: f.mercy || 0, defeatedCount, badges: f.badges ? countBadges(f) : 0,
      dex: dexSeenCount(), dexTotal: DEX_ORDER.length, endings,
      challengeRuns: meta.challengeRuns || 0,
      challengeBest: meta.challengeBest || 0, challengeBestTotal: meta.challengeBestTotal || 0,
    };
    // 도전과제 달성 개수 — 칭호/테마 해금 조건에서 사용 (위 필드만 참조하므로 순환 없음)
    ctx.achieved = ACHIEVEMENTS.filter((a) => a.check(ctx)).length;
    return ctx;
  }
  function countAchievements(slot) {
    const ctx = achievementCtx(slot);
    return ACHIEVEMENTS.filter((a) => a.check(ctx)).length;
  }

  function openAwards(ret) {
    game.awards.ret = ret;
    game.awards.slot = activeSlot();
    game.mode = 'awards';
    Sound.select();
  }
  function closeAwards() {
    game.mode = game.awards.ret;
    Sound.select();
  }
  function updateAwards() {
    if (justPressed('cancel') || justPressed('menu') || justPressed('action')) closeAwards();
  }
  function drawAwards() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    const slot = game.awards.slot;
    const actx = achievementCtx(slot);
    const got = ACHIEVEMENTS.filter((a) => a.check(actx)).length;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`☆ 도전과제 — ${slotLearnName(slot)}`, 24, 38);
    ctx.fillStyle = warnColor();
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`달성 ${got} / ${ACHIEVEMENTS.length}`, 24, 62);

    const colW = (LW - 48) / 2, cellH = 66;
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const a = ACHIEVEMENTS[i];
      const unlocked = a.check(actx);
      const col = i % 2, row = Math.floor(i / 2);
      const x = 24 + col * colW, y = 86 + row * cellH;
      const cat = ACH_CAT[a.cat];
      // 아이콘 배지
      ctx.fillStyle = unlocked ? cat.color : '#333';
      ctx.font = 'bold 26px monospace';
      ctx.fillText(unlocked ? cat.icon : '·', x + 4, y + 26);
      // 이름·설명
      ctx.fillStyle = unlocked ? '#fff' : '#555';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(a.name, x + 42, y + 18);
      ctx.fillStyle = unlocked ? '#aaa' : '#444';
      ctx.font = '12px monospace';
      ctx.fillText(unlocked ? a.desc : '???  ' + a.desc, x + 42, y + 40);
    }

    ctx.fillStyle = '#777';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Z 또는 X로 닫기', LW / 2, 512);
    ctx.textAlign = 'left';
  }

  // ---------- 도움말 ----------
  const HELP_LINES = [
    ['head', '◆ 게임 목표 — 쓰러뜨리지 않고 갱생'],
    ['', '윤리 오류로 마음이 굳은 몬스터를 퀴즈로 깨우치고, 마지막에'],
    ['', '마음을 안아 주어 친구로 되돌려요. (물리치는 게임이 아니에요!)'],
    ['', '각 지역의 보스를 되돌리면 다음 지역으로 가는 길이 열립니다.'],
    ['', ''],
    ['head', '◆ 기본 조작'],
    ['', '이동: 화살표 / W A S D       결정·대화·살펴보기: Z / 스페이스'],
    ['', '퀴즈: ↑↓로 고르고 Z로 결정       취소·뒤로: X / Esc'],
    ['', ''],
    ['head', '◆ 전투'],
    ['', '정답을 맞히면 몬스터의 오해가 풀려요(HP 감소).'],
    ['', '틀려도 항상 해설이 나와요. 하트가 0이 되면 쉬었다 다시 도전!'],
    ['', '막히면 H로 50:50 힌트(한 문제에 한 번).'],
    ['', ''],
    ['head', '◆ 메뉴 (X 또는 메뉴 버튼)'],
    ['', '일지·도전과제·꾸미기·챌린지·복습·도감·백업·접근성 설정'],
    ['', ''],
    ['head', '◆ 더 즐기기'],
    ['', '미래연구소: 마을 오른쪽 빛나는 문 — 새 AI 주제(환각·딥페이크) 연습'],
    ['', '오늘의 도전·연속 출석, 칭호·테마 꾸미기(K), 데이터 백업·복원(U)'],
    ['', '배움 카드(L): 주제를 맞히면 카드가 열려요 · 명예의 전당(F): 최고 기록'],
    ['', ''],
    ['head', '◆ 선생님 · 접근성'],
    ['', '교사용 대시보드(P): 학생별 학습 현황 비교 · 커스텀 퀴즈(E)'],
    ['', '수료증(N): 진도를 증서로 저장 · 난이도·읽어주기(TTS)는 메뉴에서'],
    ['', '눈이 부시면 메뉴의 「화면 효과 줄이기」로 번쩍임을 줄일 수 있어요'],
  ];
  // 한 화면(528px)에 다 들어가지 않아 2장으로 나눈다. (← → 로 넘김)
  const HELP_PAGES = [
    HELP_LINES.slice(0, 13),  // 게임 목표 · 기본 조작 · 전투
    HELP_LINES.slice(13),     // 메뉴 · 더 즐기기 · 선생님·접근성
  ];
  function openHelp(ret) {
    game.helpRet = ret;
    game.helpPage = 0;
    game.mode = 'help';
    Sound.select();
  }
  function closeHelp() {
    game.mode = game.helpRet || 'title';
    Sound.select();
  }
  function updateHelp() {
    const pages = HELP_PAGES.length;
    if (justPressed('right')) { game.helpPage = (game.helpPage + 1) % pages; Sound.blip(); return; }
    if (justPressed('left')) { game.helpPage = (game.helpPage + pages - 1) % pages; Sound.blip(); return; }
    // 마지막 장에서 Z는 닫기, 아니면 다음 장으로 (자연스러운 넘김)
    if (justPressed('action')) {
      if (game.helpPage < pages - 1) { game.helpPage += 1; Sound.blip(); }
      else closeHelp();
      return;
    }
    if (justPressed('cancel') || justPressed('menu')) closeHelp();
  }
  function drawHelp() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'left';
    const page = Math.min(game.helpPage || 0, HELP_PAGES.length - 1);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('? 도움말', 24, 38);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'right';
    ctx.fillText(`${page + 1} / ${HELP_PAGES.length}`, LW - 24, 36);
    ctx.textAlign = 'left';

    let y = 84;
    for (const [kind, text] of HELP_PAGES[page]) {
      if (text === '') { y += 14; continue; }
      if (kind === 'head') { ctx.fillStyle = warnColor(); ctx.font = 'bold 16px monospace'; }
      else { ctx.fillStyle = '#ddd'; ctx.font = '14px monospace'; }
      ctx.fillText(text, 28, y);
      y += 28;
    }

    ctx.fillStyle = '#777';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    const nav = page < HELP_PAGES.length - 1
      ? '← → 페이지 넘기기 · Z 다음 · X 닫기'
      : '← → 페이지 넘기기 · Z·X 닫기';
    ctx.fillText(nav, LW / 2, 512);
    ctx.textAlign = 'left';
  }

  // ---------- 꾸미기 (칭호 · 테마) ----------
  function openCosmetics(ret) {
    const slot = activeSlot();
    game.cosmetics.ret = ret;
    game.cosmetics.slot = slot;
    game.cosmetics.col = 0;
    game.cosmetics.toast = 0;
    // 현재 고른 칭호/테마에 커서를 맞춰 둔다
    const cos = getCosmetic(slot);
    game.cosmetics.rowTitle = Math.max(0, TITLES.findIndex((t) => t.id === cos.title));
    game.cosmetics.rowTheme = Math.max(0, THEMES.findIndex((t) => t.id === cos.theme));
    // 화면을 열 때 해금 현황을 동기화(중복 알림 방지)
    const u = getCosmetic(slot); u.ack = unlockedCount(slot); setCosmetic(slot, u);
    game.mode = 'cosmetics';
    Sound.select();
  }
  function closeCosmetics() {
    game.mode = game.cosmetics.ret;
    Sound.select();
  }
  function updateCosmetics() {
    const cm = game.cosmetics;
    if (cm.toast > 0) cm.toast -= 1;
    const list = cm.col === 0 ? TITLES : THEMES;
    const rowKey = cm.col === 0 ? 'rowTitle' : 'rowTheme';
    if (justPressed('left') || justPressed('right')) { cm.col = cm.col === 0 ? 1 : 0; Sound.blip(); }
    if (justPressed('up')) { cm[rowKey] = (cm[rowKey] + list.length - 1) % list.length; Sound.blip(); }
    if (justPressed('down')) { cm[rowKey] = (cm[rowKey] + 1) % list.length; Sound.blip(); }
    if (justPressed('cancel') || justPressed('menu')) { closeCosmetics(); return; }
    if (justPressed('action')) {
      const c = achievementCtx(cm.slot);
      const item = list[cm[rowKey]];
      if (!item.check(c)) { cm.toast = 90; Sound.bump(); return; } // 아직 잠김
      const cos = getCosmetic(cm.slot);
      if (cm.col === 0) cos.title = item.id; else cos.theme = item.id;
      setCosmetic(cm.slot, cos);
      Sound.unlock();
    }
  }
  function drawCosmetics() {
    const cm = game.cosmetics;
    const slot = cm.slot;
    const c = achievementCtx(slot);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`✿ 꾸미기 — ${slotLearnName(slot)}`, 24, 38);

    const st = selectedTitle(slot), sth = selectedTheme(slot);
    ctx.fillStyle = sth ? sth.color : '#ffd644';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`지금: 「${st ? st.name : '—'}」 · 테마 ${sth ? sth.name : '—'}`, 24, 62);

    const cols = [{ label: '칭호', list: TITLES, row: cm.rowTitle, selId: getCosmetic(slot).title },
      { label: '테마', list: THEMES, row: cm.rowTheme, selId: getCosmetic(slot).theme }];
    const colW = (LW - 48) / 2;
    for (let ci = 0; ci < 2; ci++) {
      const col = cols[ci];
      const x = 24 + ci * colW;
      ctx.fillStyle = ci === cm.col ? themeAccent() : '#888';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`◆ ${col.label}`, x, 92);
      for (let i = 0; i < col.list.length; i++) {
        const item = col.list[i];
        const unlocked = item.check(c);
        const y = 118 + i * 52;
        const active = ci === cm.col && i === col.row;
        if (active) { ctx.fillStyle = '#e0453a'; ctx.font = '14px monospace'; ctx.fillText('♥', x - 2, y); }
        // 테마는 색 스와치를 보여 준다
        if (ci === 1) {
          ctx.fillStyle = unlocked ? item.color : '#333';
          ctx.fillRect(x + 16, y - 11, 14, 14);
        }
        const equipped = item.id === col.selId || (!col.selId && i === 0);
        ctx.fillStyle = !unlocked ? '#555' : active ? '#fff' : '#bbb';
        ctx.font = (active ? 'bold ' : '') + '15px monospace';
        ctx.fillText((unlocked ? item.name : '???') + (equipped && unlocked ? ' ✓' : ''), x + (ci === 1 ? 38 : 18), y);
        ctx.fillStyle = unlocked ? '#777' : '#444';
        ctx.font = '11px monospace';
        ctx.fillText(unlocked ? item.desc : '잠김 · ' + item.desc, x + (ci === 1 ? 38 : 18), y + 16);
      }
    }

    if (cm.toast > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = badColor();
      ctx.font = 'bold 14px monospace';
      ctx.fillText('아직 잠긴 보상이에요. 조건을 채워 보세요!', LW / 2, 490);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#777';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('←→ 칭호/테마 · ↑↓ 선택 · Z 적용 · X 닫기', LW / 2, 512);
    ctx.textAlign = 'left';
  }

  // ---------- 학습 카드 컬렉션 화면 ----------
  const CARDS_VISIBLE = 4; // 한 화면에 보이는 카드 수
  function openCards(ret) {
    game.cards.ret = ret;
    game.cards.slot = activeSlot();
    game.cards.scroll = 0;
    game.mode = 'cards';
    Sound.select();
  }
  function closeCards() {
    game.mode = game.cards.ret;
    Sound.select();
  }
  function updateCards() {
    const cd = game.cards;
    const maxScroll = Math.max(0, LEARN_CARDS.length - CARDS_VISIBLE);
    if (justPressed('up')) { cd.scroll = Math.max(0, cd.scroll - 1); Sound.blip(); }
    if (justPressed('down')) { cd.scroll = Math.min(maxScroll, cd.scroll + 1); Sound.blip(); }
    if (justPressed('cancel') || justPressed('menu') || justPressed('action')) closeCards();
  }
  function drawCards() {
    const cd = game.cards, slot = cd.slot;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`📚 배움 카드 — ${slotLearnName(slot)}`, 24, 36);
    const got = collectedCards(slot);
    ctx.fillStyle = warnColor();
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`모은 카드 ${got} / ${LEARN_CARDS.length}`, 24, 58);
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText('각 주제에서 한 번이라도 정답을 맞히면 그 카드가 열려요.', 220, 58);

    const cardH = 96, top = 74, w = LW - 48;
    for (let k = 0; k < CARDS_VISIBLE; k++) {
      const i = cd.scroll + k;
      if (i >= LEARN_CARDS.length) break;
      const card = LEARN_CARDS[i];
      const unlocked = cardUnlocked(slot, card.topic);
      const x = 24, y = top + k * (cardH + 6);
      utBox(x, y, w, cardH, 6);
      // 아이콘
      ctx.textAlign = 'center';
      ctx.font = '38px monospace';
      ctx.fillStyle = unlocked ? '#fff' : '#444';
      ctx.fillText(unlocked ? card.icon : '🔒', x + 44, y + 58);
      // 제목 + 해설
      ctx.textAlign = 'left';
      ctx.fillStyle = unlocked ? themeAccent() : '#555';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(`${i + 1}. ${topicLabel(card.topic)}`, x + 86, y + 32);
      ctx.fillStyle = unlocked ? '#ddd' : '#444';
      ctx.font = '13px monospace';
      if (unlocked) wrapText(card.lesson, x + 86, y + 58, w - 110, 19);
      else ctx.fillText('아직 잠긴 카드예요 — 이 주제 문제를 맞혀 보세요!', x + 86, y + 58);
    }
    // 스크롤 표시
    ctx.fillStyle = '#888'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
    if (cd.scroll > 0) ctx.fillText('▲', LW / 2, top - 2);
    if (cd.scroll + CARDS_VISIBLE < LEARN_CARDS.length) ctx.fillText('▼', LW / 2, top + CARDS_VISIBLE * (cardH + 6) + 2);

    ctx.fillStyle = '#777';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ 넘기기 · Z 또는 X로 닫기', LW / 2, 514);
    ctx.textAlign = 'left';
  }

  // ---------- 수료증 · 진도 인증서 ----------
  function certDateStr() {
    const d = new Date();
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  function buildCertText(slot) {
    const s = buildLearningSummary(slot);
    const sum = slotSummary(slot);
    const title = selectedTitle(slot);
    const acc = s.attempted ? Math.round(s.overallRate * 100) + '%' : '—';
    const prog = sum ? (sum.done ? '모험 완료' : `스테이지 ${sum.stage}/5`) : '시작 전';
    return [
      '════════ AI 윤리 어드벤처 수료증 ════════',
      '',
      `  이름: ${slotLearnName(slot)}${title ? ` (${title.name})` : ''}`,
      `  날짜: ${certDateStr()}`,
      '',
      `  진행도   : ${prog}`,
      `  푼 문제  : ${s.attempted}개   ·   정답률 ${acc}`,
      `  배움 카드: ${collectedCards(slot)} / ${LEARN_CARDS.length}`,
      `  도전과제 : ${countAchievements(slot)} / ${ACHIEVEMENTS.length}`,
      `  안아준 마음: ♥ ${sum ? sum.mercy : 0}`,
      '',
      '  위 학생은 AI를 바르고 안전하게 쓰는 법을',
      '  열심히 익혔기에 이 증서를 드립니다.',
      '',
      '             — AI 윤리 연구소 —',
      '═══════════════════════════════════════',
    ].join('\n');
  }
  function openCert(ret) {
    game.cert.ret = ret;
    game.cert.slot = activeSlot();
    game.cert.toast = 0;
    game.mode = 'cert';
    Sound.select();
  }
  function closeCert() {
    game.mode = game.cert.ret;
    Sound.select();
  }
  function downloadCert() {
    try {
      const text = buildCertText(game.cert.slot);
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `수료증-${slotLearnName(game.cert.slot)}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      game.cert.toast = 1;
    } catch (e) { game.cert.toast = -1; }
    Sound.badge();
  }
  function updateCert() {
    if (game.cert.toast > 0) { /* 유지 */ }
    if (justPressed('action')) { if (copyTextToClipboard(buildCertText(game.cert.slot))) { game.cert.toast = 2; Sound.badge(); } else { game.cert.toast = -1; } return; }
    if (justPressed('menu')) { downloadCert(); return; }
    if (justPressed('cancel')) { closeCert(); return; }
  }
  function drawCert() {
    const slot = game.cert.slot;
    ctx.fillStyle = '#1a1626';
    ctx.fillRect(0, 0, LW, LH);
    // 증서 카드
    const cx = LW / 2;
    const bx = 90, by = 56, bw = LW - 180, bh = 392;
    ctx.fillStyle = '#fbf6e9';
    roundRect(bx, by, bw, bh, 10); ctx.fill();
    ctx.strokeStyle = themeAccent(); ctx.lineWidth = 4;
    roundRect(bx + 10, by + 10, bw - 20, bh - 20, 8); ctx.stroke();
    ctx.lineWidth = 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#7a5c12';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('AI 윤리 어드벤처', cx, by + 50);
    ctx.fillStyle = '#2a2417';
    ctx.font = 'bold 30px monospace';
    ctx.fillText('수 료 증', cx, by + 92);

    const s = buildLearningSummary(slot);
    const sum = slotSummary(slot);
    const title = selectedTitle(slot);
    ctx.fillStyle = '#2a2417';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(slotLearnName(slot), cx, by + 138);
    if (title) { ctx.fillStyle = '#a07b1e'; ctx.font = 'bold 13px monospace'; ctx.fillText(`「${title.name}」`, cx, by + 160); }

    ctx.fillStyle = '#3a3220';
    ctx.font = '13px monospace';
    ctx.fillText('위 학생은 AI를 바르고 안전하게 쓰는 법을', cx, by + 192);
    ctx.fillText('열심히 익혔기에 이 증서를 드립니다.', cx, by + 212);

    const acc = s.attempted ? Math.round(s.overallRate * 100) + '%' : '—';
    const prog = sum ? (sum.done ? '모험 완료' : `스테이지 ${sum.stage}/5`) : '시작 전';
    const rows = [
      ['진행도', prog], ['정답률', `${acc} (${s.attempted}문제)`],
      ['배움 카드', `${collectedCards(slot)}/${LEARN_CARDS.length}`],
      ['도전과제', `${countAchievements(slot)}/${ACHIEVEMENTS.length}`],
      ['안아준 마음', `♥ ${sum ? sum.mercy : 0}`],
    ];
    let ry = by + 244;
    ctx.font = '14px monospace';
    for (const [k, v] of rows) {
      ctx.textAlign = 'left'; ctx.fillStyle = '#6a5a2e'; ctx.fillText(k, bx + 70, ry);
      ctx.textAlign = 'right'; ctx.fillStyle = '#2a2417'; ctx.fillText(v, bx + bw - 70, ry);
      ry += 24;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7a5c12';
    ctx.font = '13px monospace';
    ctx.fillText(`${certDateStr()}   ·   AI 윤리 연구소`, cx, by + bh - 24);

    if (game.cert.toast !== 0) {
      ctx.fillStyle = game.cert.toast < 0 ? badColor() : okColor();
      ctx.font = 'bold 13px monospace';
      ctx.fillText(game.cert.toast < 0 ? '복사·저장에 실패했어요 (브라우저에서 시도해 주세요)'
        : game.cert.toast === 1 ? '✓ 파일로 저장했어요!' : '✓ 글자로 복사했어요!', cx, 472);
    }
    ctx.fillStyle = '#aaa';
    ctx.font = '13px monospace';
    ctx.fillText('Z 글자 복사 · C 파일 저장(.txt) · X 닫기', cx, 500);
    ctx.textAlign = 'left';
  }

  // ---------- 명예의 전당 (로컬 기록) ----------
  const HOF_CATS = [
    { key: 'challenge', label: '챌린지 최고점', icon: '✦',
      val: (i) => { const m = getMeta(i); return m.challengeBestTotal ? (m.challengeBest || 0) : -1; },
      fmt: (i) => { const m = getMeta(i); return m.challengeBestTotal ? `${m.challengeBest || 0}/${m.challengeBestTotal}` : '—'; } },
    { key: 'streak', label: '최장 연속 출석', icon: '🔥',
      val: (i) => getMeta(i).bestStreak || 0, fmt: (i) => { const b = getMeta(i).bestStreak || 0; return b ? `${b}일` : '—'; } },
    { key: 'mercy', label: '안아준 마음', icon: '♥',
      val: (i) => { const s = slotSummary(i); return s ? s.mercy : -1; }, fmt: (i) => { const s = slotSummary(i); return s ? `♥ ${s.mercy}` : '—'; } },
    { key: 'cards', label: '배움 카드', icon: '📚',
      val: (i) => slotSummary(i) ? collectedCards(i) : -1, fmt: (i) => slotSummary(i) ? `${collectedCards(i)}/${LEARN_CARDS.length}` : '—' },
    { key: 'awards', label: '도전과제', icon: '☆',
      val: (i) => slotSummary(i) ? countAchievements(i) : -1, fmt: (i) => slotSummary(i) ? `${countAchievements(i)}/${ACHIEVEMENTS.length}` : '—' },
    { key: 'dex', label: '도감 수집', icon: '◆',
      val: () => dexSeenCount(), fmt: () => `${dexSeenCount()}/${DEX_ORDER.length}`, shared: true },
  ];
  function openHof(ret) {
    game.hof.ret = ret;
    game.hof.cat = 0;
    game.mode = 'hof';
    Sound.select();
  }
  function closeHof() {
    game.mode = game.hof.ret;
    Sound.select();
  }
  function updateHof() {
    const n = HOF_CATS.length;
    if (justPressed('up')) { game.hof.cat = (game.hof.cat + n - 1) % n; Sound.blip(); }
    if (justPressed('down')) { game.hof.cat = (game.hof.cat + 1) % n; Sound.blip(); }
    if (justPressed('cancel') || justPressed('menu') || justPressed('action')) closeHof();
  }
  function drawHof() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('🏆 명예의 전당', 24, 36);
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText('이 기기에서 함께한 학생들의 최고 기록이에요. ↑↓로 부문 선택.', 24, 56);

    // 부문 목록(왼쪽) + 순위(오른쪽)
    const listX = 24, listY = 84, rowH = 60;
    for (let i = 0; i < HOF_CATS.length; i++) {
      const cat = HOF_CATS[i];
      const sel = i === game.hof.cat;
      const y = listY + i * rowH;
      if (sel) { utBox(listX - 4, y - 22, 200, 50, 6); }
      ctx.textAlign = 'left';
      ctx.font = '22px monospace';
      ctx.fillStyle = sel ? '#fff' : '#666';
      ctx.fillText(cat.icon, listX + 6, y + 8);
      ctx.font = (sel ? 'bold ' : '') + '14px monospace';
      ctx.fillStyle = sel ? themeAccent() : '#888';
      ctx.fillText(cat.label, listX + 40, y + 4);
    }

    // 선택된 부문의 순위
    const cat = HOF_CATS[game.hof.cat];
    const panelX = 248, panelY = 84, panelW = LW - panelX - 24;
    utBox(panelX, panelY, panelW, 380, 8);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`${cat.icon} ${cat.label}`, panelX + 20, panelY + 30);

    if (cat.shared) {
      ctx.fillStyle = warnColor();
      ctx.font = 'bold 34px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(cat.fmt(0), panelX + panelW / 2, panelY + 130);
      ctx.fillStyle = '#888';
      ctx.font = '13px monospace';
      ctx.fillText('(도감은 모두가 함께 채우는 공동 기록이에요)', panelX + panelW / 2, panelY + 170);
      ctx.textAlign = 'left';
    } else {
      // 슬롯들을 점수로 정렬
      const ranked = [];
      for (let i = 0; i < SLOT_COUNT; i++) {
        const sum = slotSummary(i);
        ranked.push({ i, name: sum ? sum.name : null, v: cat.val(i), label: cat.fmt(i) });
      }
      ranked.sort((a, b) => b.v - a.v);
      const medals = ['🥇', '🥈', '🥉'];
      let ry = panelY + 70;
      for (let r = 0; r < ranked.length; r++) {
        const e = ranked[r];
        const empty = e.name === null;       // 슬롯 자체가 비어 있음
        const noRecord = !empty && e.v < 0;  // 학생은 있지만 이 부문 기록이 없음
        const ranking = !empty && !noRecord; // 순위 매김 대상
        ctx.font = '26px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(ranking ? (medals[r] || ' ') : '·', panelX + 20, ry + 8);
        ctx.fillStyle = ranking ? '#fff' : '#666';
        ctx.font = 'bold 17px monospace';
        ctx.fillText(empty ? `슬롯 ${e.i + 1} — 비어 있음` : e.name, panelX + 64, ry);
        if (!empty) {
          ctx.fillStyle = ranking && r === 0 ? warnColor() : '#888';
          ctx.font = 'bold 17px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(noRecord ? '—' : e.label, panelX + panelW - 20, ry);
          ctx.textAlign = 'left';
        }
        ry += 64;
      }
    }

    ctx.fillStyle = '#777';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ 부문 · Z 또는 X로 닫기', LW / 2, 512);
    ctx.textAlign = 'left';
  }

  // ---------- 데이터 백업 · 복원 화면 ----------
  const BACKUP_ITEMS = ['exportClip', 'exportFile', 'importFile', 'close'];
  const BACKUP_LABELS = {
    exportClip: '내보내기 — 클립보드 복사',
    exportFile: '내보내기 — 파일로 저장(.json)',
    importFile: '가져오기 — 파일에서 복원',
    close: '닫기',
  };
  function openBackup(ret) {
    game.backup.ret = ret;
    game.backup.cursor = 0;
    game.backup.toast = 0;
    game.backup.confirm = false;
    game.mode = 'backup';
    Sound.select();
  }
  function closeBackup() {
    game.mode = game.backup.ret;
    Sound.select();
  }
  function downloadBackup() {
    try {
      const text = buildBackupText();
      const a = document.createElement('a');
      a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
      a.download = 'ai-ethics-save-' + todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch (e) { return false; }
  }
  function importBackupFile() {
    try {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      const handler = () => {
        inp.removeEventListener('change', handler);
        const file = inp.files && inp.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const res = applyBackup(String(reader.result));
          game.backup.toast = res.ok ? 200 : -200;
          if (res.ok) {
            Object.assign(game, loadSettings());
            game.mode = 'title';
            game.titleScreen = 'slots';
          }
          Sound.badge();
        };
        reader.onerror = () => { game.backup.toast = -200; Sound.badge(); };
        reader.readAsText(file);
      };
      inp.addEventListener('change', handler);
      inp.click();
      return true;
    } catch (e) { game.backup.toast = -200; return false; }
  }
  function updateBackup() {
    const b = game.backup;
    if (b.toast > 0) b.toast -= 1; else if (b.toast < 0) b.toast += 1;
    const n = BACKUP_ITEMS.length;
    if (justPressed('up')) { b.cursor = (b.cursor + n - 1) % n; b.confirm = false; Sound.blip(); }
    if (justPressed('down')) { b.cursor = (b.cursor + 1) % n; b.confirm = false; Sound.blip(); }
    if (justPressed('cancel') || justPressed('menu')) {
      if (b.confirm) { b.confirm = false; Sound.blip(); return; } // 확인 단계만 취소
      closeBackup();
      return;
    }
    if (justPressed('action')) {
      const item = BACKUP_ITEMS[b.cursor];
      if (b.confirm) { // 가져오기 확인 후 실제 실행
        b.confirm = false;
        importBackupFile();
        return;
      }
      if (item === 'exportClip') { b.toast = copyTextToClipboard(buildBackupText()) ? 200 : -200; Sound.badge(); }
      else if (item === 'exportFile') { b.toast = downloadBackup() ? 200 : -200; Sound.badge(); }
      else if (item === 'importFile') { b.confirm = true; Sound.blip(); } // 덮어쓰기 전 한 번 더 확인
      else if (item === 'close') { closeBackup(); }
    }
  }
  function drawBackup() {
    const b = game.backup;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('⇄ 데이터 백업 · 복원', 24, 40);
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    ctx.fillText('모든 슬롯·학습 기록·도감·설정을 한 파일로 저장하고', 24, 66);
    ctx.fillText('다른 기기나 브라우저에서 다시 불러올 수 있어요.', 24, 86);

    const listY = 130, rowH = 44;
    for (let i = 0; i < BACKUP_ITEMS.length; i++) {
      drawChoiceLine(BACKUP_LABELS[BACKUP_ITEMS[i]], 48, listY + i * rowH, i === b.cursor);
    }

    ctx.fillStyle = '#777';
    ctx.font = '12px monospace';
    ctx.fillText('※ 가져오기를 하면 지금 이 기기의 기록을 덮어씁니다.', 24, listY + BACKUP_ITEMS.length * rowH + 24);

    if (b.confirm) {
      ctx.textAlign = 'center';
      ctx.fillStyle = badColor();
      ctx.font = 'bold 15px monospace';
      ctx.fillText('지금 기록을 덮어쓰고 복원할까요?', LW / 2, 452);
      ctx.fillStyle = '#fff';
      ctx.font = '13px monospace';
      ctx.fillText('Z: 파일 선택해서 복원   ·   X: 취소', LW / 2, 474);
      ctx.textAlign = 'left';
    } else if (b.toast !== 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = b.toast > 0 ? okColor() : badColor();
      ctx.font = 'bold 15px monospace';
      ctx.fillText(b.toast > 0 ? '✓ 완료했어요!' : '이 환경에서는 할 수 없어요 (브라우저에서 시도해 주세요)', LW / 2, 470);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#777';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ 선택 · Z 실행 · X 닫기', LW / 2, 512);
    ctx.textAlign = 'left';
  }

  // ---------- 교사용 대시보드 (모든 학생 한눈에) ----------
  // CSV 한 칸을 안전하게 감싼다(쉼표·따옴표·줄바꿈 포함 시 큰따옴표 처리).
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // 세 학생(슬롯)의 학습 현황을 스프레드시트로 열 수 있는 CSV로 만든다.
  function buildClassCsv() {
    const header = ['슬롯', '이름', '칭호', '진행', '완주', '푼 문제', '정답 수',
      '정답률(%)', '복습 노트', '도전과제', '안아준 마음', '연속 출석(일)'];
    const lines = [header.map(csvCell).join(',')];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const sum = slotSummary(i);
      if (!sum) { lines.push(csvCell(i + 1) + ',(비어 있음)'); continue; }
      const s = buildLearningSummary(i);
      const meta = getMeta(i);
      const title = selectedTitle(i);
      lines.push([
        i + 1,
        sum.name,
        title ? title.name : '',
        sum.done ? '모험 완료' : ('스테이지 ' + sum.stage + '/5'),
        sum.done ? 'Y' : 'N',
        s.attempted,
        s.correct,
        s.attempted ? Math.round(s.overallRate * 100) : '',
        mistakeCount(i),
        countAchievements(i) + '/' + ACHIEVEMENTS.length,
        sum.mercy,
        meta.streak || 0,
      ].map(csvCell).join(','));
    }
    return lines.join('\r\n');
  }
  // CSV를 파일로 내려받는다. 엑셀 한글 깨짐 방지를 위해 UTF-8 BOM을 붙인다.
  function downloadClassCsv() {
    try {
      const text = '﻿' + buildClassCsv();
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(text);
      a.download = 'ai-ethics-class-' + todayStr() + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch (e) { return false; }
  }
  function openDashboard(ret) {
    game.dashboard.ret = ret;
    game.dashboard.cursor = 0;
    game.dashboard.toast = 0;
    game.mode = 'dashboard';
    Sound.select();
  }
  function closeDashboard() {
    game.mode = game.dashboard.ret;
    Sound.select();
  }
  function updateDashboard() {
    const d = game.dashboard;
    if (d.toast > 0) d.toast -= 1; else if (d.toast < 0) d.toast += 1;
    if (justPressed('cancel') || justPressed('menu')) { closeDashboard(); return; }
    if (justPressed('action')) {
      // 파일 저장이 안 되는 환경이면 클립보드 복사로 대신한다.
      const ok = downloadClassCsv() || copyTextToClipboard(buildClassCsv());
      d.toast = ok ? 200 : -200;
      Sound.badge();
    }
  }
  function drawDashboard() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('▤ 교사용 대시보드 — 학생 현황', 24, 36);
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText('한 기기를 나눠 쓰는 세 학생(슬롯)의 학습 현황을 비교합니다.', 24, 56);

    const colW = (LW - 32) / SLOT_COUNT;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const x = 16 + i * colW;
      const y = 74, w = colW - 12, h = 410;
      utBox(x, y, w, h, 6);
      const sum = slotSummary(i);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#888';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`슬롯 ${i + 1}`, x + 14, y + 22);
      if (!sum) {
        ctx.fillStyle = '#555';
        ctx.font = '14px monospace';
        ctx.fillText('— 비어 있음 —', x + 14, y + 56);
        continue;
      }
      const s = buildLearningSummary(i);
      const meta = getMeta(i);
      const title = selectedTitle(i);
      let ly = y + 46;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(sum.name, x + 14, ly); ly += 22;
      if (title) {
        ctx.fillStyle = themeAccent();
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`「${title.name}」`, x + 14, ly);
      }
      ly += 22;
      const line = (label, val, col) => {
        ctx.fillStyle = '#999'; ctx.font = '12px monospace';
        ctx.fillText(label, x + 14, ly);
        ctx.fillStyle = col || '#fff'; ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right'; ctx.fillText(val, x + w - 14, ly); ctx.textAlign = 'left';
        ly += 24;
      };
      line('진행', sum.done ? '모험 완료' : `스테이지 ${sum.stage}/5`);
      line('푼 문제', `${s.attempted}개`);
      line('정답률', s.attempted ? `${Math.round(s.overallRate * 100)}%` : '—',
        s.attempted ? (s.overallRate >= 0.8 ? okColor() : s.overallRate >= 0.6 ? warnColor() : badColor()) : '#888');
      line('복습 노트', `${mistakeCount(i)}개`);
      line('도전과제', `${countAchievements(i)}/${ACHIEVEMENTS.length}`);
      line('안아준 마음', `♥ ${sum.mercy}`);
      line('연속 출석', meta.streak ? `🔥 ${meta.streak}일` : '—');
      // 약점 주제
      ctx.fillStyle = '#999'; ctx.font = '12px monospace';
      ctx.fillText('더 살펴볼 주제', x + 14, ly); ly += 18;
      ctx.fillStyle = badColor(); ctx.font = '11px monospace';
      if (s.weak.length) {
        for (const wlabel of s.weak.slice(0, 3)) { ctx.fillText('· ' + wlabel, x + 16, ly); ly += 16; }
      } else {
        ctx.fillStyle = '#5a8'; ctx.fillText('· 약점 없음 👍', x + 16, ly);
      }
    }

    const d = game.dashboard;
    ctx.textAlign = 'center';
    if (d.toast > 0) {
      ctx.fillStyle = okColor();
      ctx.font = 'bold 14px monospace';
      ctx.fillText('✓ 반 현황 CSV를 저장했어요 (엑셀·구글시트에서 열기)', LW / 2, 512);
    } else if (d.toast < 0) {
      ctx.fillStyle = badColor();
      ctx.font = 'bold 14px monospace';
      ctx.fillText('이 환경에서는 내보낼 수 없어요 (브라우저에서 시도해 주세요)', LW / 2, 512);
    } else {
      ctx.fillStyle = '#777';
      ctx.font = '13px monospace';
      ctx.fillText('Z: 반 현황 CSV 내보내기 · X: 닫기 (상세 리포트는 각 학생 수호자 일지)', LW / 2, 512);
    }
    ctx.textAlign = 'left';
  }

  // ---------- 수업 모드 (스테이지 점프) ----------
  // 선생님이 오늘 수업할 스테이지부터 바로 시작하게 해 준다.
  // 지금 슬롯의 진행을 "N스테이지 시작" 상태로 맞춘다(이전 스테이지는 모두 완료 처리).
  const STAGE_COUNT = 5;
  // 목표 스테이지 시작 상태의 flags를 만든다. (1스테이지 = 거의 새 모험)
  function setupStageFlags(target) {
    target = Math.max(1, Math.min(STAGE_COUNT, target | 0));
    const flags = newFlags();
    flags.talkedProf = true;
    if (target > 1) {
      flags.badges.forest = flags.badges.lake = flags.badges.cave = true;
      // 도감의 스테이지 정보로, 이전 스테이지(1..target-1) 몬스터를 모두 깨우친 것으로 처리
      for (const id of Object.keys(flags.defeated)) {
        const dx = MONSTER_DEX[id];
        if (dx && dx.stage >= 1 && dx.stage < target) flags.defeated[id] = true;
      }
    }
    return flags;
  }
  // 목표 스테이지의 안전한 시작 위치를 찾는다.
  function stageSpawn(flags, target) {
    if (target <= 1) {
      const safe = findSafeSpawn('village', 13, 16) || { x: 13, y: 16 };
      return { map: 'village', x: safe.x, y: safe.y };
    }
    const t = getObjectiveTarget(flags);
    if (!t) { const s = findSafeSpawn('village', 13, 16) || { x: 13, y: 16 }; return { map: 'village', x: s.x, y: s.y }; }
    const safe = findSafeSpawn(t.map, t.x, t.y) || { x: t.x, y: t.y };
    return { map: t.map, x: safe.x, y: safe.y };
  }
  function applyStageJump(target) {
    const flags = setupStageFlags(target);
    const sp = stageSpawn(flags, target);
    game.flags = flags;
    game.map = sp.map;
    game.player.x = sp.x;
    game.player.y = sp.y;
    game.player.px = sp.x * TS;
    game.player.py = sp.y * TS;
    game.player.moving = false;
    game.player.dir = 'down';
    save();
  }
  function openClassMode(ret) {
    const cm = game.classmode;
    cm.ret = ret;
    cm.sel = Math.max(1, Math.min(STAGE_COUNT, getStage(game.flags)));
    cm.confirm = false;
    cm.toast = 0;
    game.mode = 'classmode';
    Sound.select();
  }
  function closeClassMode() {
    game.mode = game.classmode.ret;
    Sound.select();
  }
  function updateClassMode() {
    const cm = game.classmode;
    if (cm.toast > 0) cm.toast -= 1;
    if (cm.toast > 0) return; // 적용 안내 표시 중엔 입력 잠금
    if (cm.confirm) {
      if (justPressed('action')) {
        applyStageJump(cm.sel);
        cm.confirm = false;
        cm.toast = 90;
        Sound.badge();
        return;
      }
      if (justPressed('cancel') || justPressed('menu')) { cm.confirm = false; Sound.blip(); }
      return;
    }
    if (justPressed('left') || justPressed('up')) { cm.sel = cm.sel <= 1 ? STAGE_COUNT : cm.sel - 1; Sound.blip(); }
    if (justPressed('right') || justPressed('down')) { cm.sel = cm.sel >= STAGE_COUNT ? 1 : cm.sel + 1; Sound.blip(); }
    if (justPressed('action')) { cm.confirm = true; Sound.select(); return; }
    if (justPressed('cancel') || justPressed('menu')) { closeClassMode(); }
  }
  // 스테이지별 한 줄 소개(선생님이 고르기 쉽게)
  const STAGE_BLURB = {
    1: '개인정보 · 저작권 · 가짜정보 · 공정함 · 절제',
    2: '고운 말 · 필터버블 · 사람 확인 · 소문 · 경청 · 계정 보안 · 디지털 발자국',
    3: '환경 · 투명성 · 책임 · 절약 · 정직 · 데이터 수집과 동의',
    4: '창의성 · 일자리 · AI와 사람 · 진짜 나 · 사칭 · 다크패턴 · 설득',
    5: '전체 복습 · 어둠대왕몬 · 코어(존재의 가치)',
  };
  function drawClassMode() {
    const cm = game.classmode;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('▶ 수업 모드 — 스테이지 바로 시작', 24, 40);
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    ctx.fillText('오늘 수업할 스테이지를 골라 바로 시작해요. (지금 학생 슬롯에 적용)', 24, 64);

    // 스테이지 선택기
    ctx.textAlign = 'center';
    ctx.fillStyle = themeAccent();
    ctx.font = 'bold 56px monospace';
    ctx.fillText(`${cm.sel}`, LW / 2, 180);
    ctx.fillStyle = '#aaa';
    ctx.font = '15px monospace';
    ctx.fillText(`/ ${STAGE_COUNT} 스테이지`, LW / 2, 210);
    ctx.fillStyle = '#fff';
    ctx.font = '15px monospace';
    ctx.fillText(STAGE_BLURB[cm.sel] || '', LW / 2, 250);
    ctx.fillStyle = '#666';
    ctx.font = '13px monospace';
    ctx.fillText('◀ ▶ 스테이지 고르기', LW / 2, 286);

    if (cm.toast > 0) {
      ctx.fillStyle = okColor();
      ctx.font = 'bold 17px monospace';
      ctx.fillText(`✓ ${cm.sel}스테이지 시작 상태로 맞췄어요!`, LW / 2, 360);
      ctx.fillStyle = '#aaa';
      ctx.font = '13px monospace';
      ctx.fillText('잠시 후 모험 화면으로 돌아갑니다…', LW / 2, 386);
      if (cm.toast === 1) { game.mode = cm.ret; }
    } else if (cm.confirm) {
      ctx.fillStyle = badColor();
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`지금 이 슬롯을 ${cm.sel}스테이지 시작 상태로 바꿀까요?`, LW / 2, 360);
      ctx.fillStyle = '#ddd';
      ctx.font = '13px monospace';
      ctx.fillText('이전 진행은 완료 처리되고 되돌릴 수 없어요.', LW / 2, 384);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('Z: 시작   ·   X: 취소', LW / 2, 416);
    } else {
      ctx.fillStyle = '#777';
      ctx.font = '13px monospace';
      ctx.fillText('Z: 이 스테이지로 시작 · X: 닫기', LW / 2, 360);
      ctx.fillStyle = '#555';
      ctx.font = '12px monospace';
      ctx.fillText('※ 미리 「데이터 백업」을 해 두면 안전해요.', LW / 2, 388);
    }
    ctx.textAlign = 'left';
  }

  // ---------- 교사용 학생 진단 리포트 (U3) ----------
  // 주제 키 → 추천 차시(docs/차시별-활동지.md). 약점 주제를 다음 수업과 연결한다.
  const TOPIC_SESSION = {
    privacy: '1차시 (개인정보·저작권)', copyright: '1차시 (개인정보·저작권)',
    consent: '1차시 (개인정보·저작권)', security: '1차시 (개인정보·저작권)', identity: '1차시 (개인정보·저작권)',
    fake: '2차시 (가짜 정보·생성형 AI)', genai: '2차시 (가짜 정보·생성형 AI)',
    deepfake: '2차시 (가짜 정보·생성형 AI)', rumor: '2차시 (가짜 정보·생성형 AI)',
    bias: '3차시 (공정함·편향)', filterbubble: '3차시 (공정함·편향)', listen: '3차시 (공정함·편향)',
    balance: '4차시 (절제·디지털 발자국)', footprint: '4차시 (절제·디지털 발자국)',
    saving: '4차시 (절제·디지털 발자국)', environment: '4차시 (절제·디지털 발자국)', persuasion: '4차시 (절제·디지털 발자국)',
    manners: '5차시 (관계·책임)', emotion: '5차시 (관계·책임)', responsibility: '5차시 (관계·책임)',
    excuse: '5차시 (관계·책임)', safety: '5차시 (관계·책임)', transparency: '5차시 (관계·책임)', core: '5차시 (관계·책임)',
  };
  function topicSession(t) { return TOPIC_SESSION[t] || '종합 복습 (퀴즈 챌린지)'; }

  // 슬롯의 학습 데이터를 분석해, 약점 주제 → 추천 차시로 매칭한 진단을 만든다.
  function buildDiagnosticReport(slot) {
    if (slot == null) slot = activeSlot();
    const sum = slotSummary(slot);
    const s = buildLearningSummary(slot);
    const weakRows = s.rows.filter((r) => r.total >= 2 && r.rate < 0.6);
    const recommendations = weakRows.map((r) => ({
      topic: r.topic, label: r.label, rate: r.rate, session: topicSession(r.topic),
    }));
    const sessions = [];
    for (const r of recommendations) if (!sessions.includes(r.session)) sessions.push(r.session);
    const pct = (r) => Math.round(r * 100) + '%';
    let date = ''; try { date = new Date().toLocaleDateString('ko-KR'); } catch (e) {}
    const lines = [];
    lines.push('[AI 윤리 어드벤처 — 학생 진단 리포트]');
    if (date) lines.push('날짜: ' + date);
    if (!sum) {
      lines.push('(빈 슬롯 — 아직 학습 기록이 없어요)');
      return { empty: true, name: '', recommendations: [], sessions: [], text: lines.join('\n') };
    }
    lines.push('이름: ' + slotLearnName(slot));
    lines.push('진행: ' + (sum.done ? '모험 완료' : `스테이지 ${sum.stage}/5`));
    lines.push(`푼 문제: ${s.attempted}개 · 정답률 ${s.attempted ? pct(s.overallRate) : '—'} · 복습 노트 ${mistakeCount(slot)}개`);
    lines.push('──────────────────────');
    if (recommendations.length === 0) {
      lines.push('약점 주제가 없어요 👍 잘하고 있어요!');
      lines.push('심화: 퀴즈 챌린지의 「전체 랜덤」으로 복습을 권합니다.');
    } else {
      lines.push('더 살펴볼 주제 → 추천 차시:');
      for (const r of recommendations) {
        lines.push(`  · ${r.label} (${pct(r.rate)}) → ${r.session}`);
      }
      lines.push('');
      lines.push('추천 수업: ' + sessions.join(', '));
    }
    return { empty: false, name: slotLearnName(slot), recommendations, sessions, text: lines.join('\n') };
  }
  // 반 전체(세 슬롯) 공통 약점을 집계해 우선 수업을 제안한다.
  function buildClassDiagnostic() {
    const perTopic = {};
    let students = 0;
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (!slotSummary(i)) continue;
      students++;
      for (const r of buildLearningSummary(i).rows) {
        if (r.total >= 2 && r.rate < 0.6) {
          const e = perTopic[r.topic] || { topic: r.topic, label: r.label, count: 0 };
          e.count++; perTopic[r.topic] = e;
        }
      }
    }
    const common = Object.keys(perTopic).map((k) => perTopic[k]).sort((a, b) => b.count - a.count);
    let date = ''; try { date = new Date().toLocaleDateString('ko-KR'); } catch (e) {}
    const lines = ['[AI 윤리 어드벤처 — 반 전체 진단]'];
    if (date) lines.push('날짜: ' + date);
    lines.push('학습한 학생(슬롯): ' + students + '명');
    lines.push('──────────────────────');
    const sessions = [];
    if (students === 0) {
      lines.push('아직 학습한 학생이 없어요.');
    } else if (common.length === 0) {
      lines.push('공통 약점이 없어요 👍 반 전체가 잘하고 있어요!');
    } else {
      lines.push('공통 약점 (학생 수 많은 순):');
      for (const c of common.slice(0, 5)) {
        const sess = topicSession(c.topic);
        lines.push(`  · ${c.label} — ${c.count}명 → ${sess}`);
        if (!sessions.includes(sess)) sessions.push(sess);
      }
      lines.push('');
      lines.push('우선 추천 수업: ' + sessions.slice(0, 3).join(', '));
    }
    return { students, common, sessions, text: lines.join('\n') };
  }
  // 텍스트를 파일로 내려받는다(진단 리포트 인쇄·보관용).
  function downloadTextFile(text, filename) {
    try {
      const a = document.createElement('a');
      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent('﻿' + text);
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      return true;
    } catch (e) { return false; }
  }
  function openReport(ret) {
    game.report.ret = ret;
    game.report.slot = activeSlot();
    game.report.toast = 0;
    game.mode = 'report';
    Sound.select();
  }
  function closeReport() { game.mode = game.report.ret; Sound.select(); }
  // slot 0..SLOT_COUNT-1 = 학생별, slot === SLOT_COUNT = 반 전체
  function reportView(slot) { return slot >= SLOT_COUNT ? buildClassDiagnostic() : buildDiagnosticReport(slot); }
  function updateReport() {
    const r = game.report;
    const N = SLOT_COUNT + 1; // 학생 3명 + 반 전체
    if (r.toast > 0) r.toast -= 1; else if (r.toast < 0) r.toast += 1;
    // 좌우로 학생(슬롯)·반 전체 전환
    if (justPressed('left')) { r.slot = (r.slot + N - 1) % N; Sound.blip(); }
    if (justPressed('right')) { r.slot = (r.slot + 1) % N; Sound.blip(); }
    if (justPressed('action')) {
      const text = reportView(r.slot).text;
      const ok = downloadTextFile(text, 'ai-ethics-diagnostic-' + todayStr() + '.txt') || copyTextToClipboard(text);
      r.toast = ok ? 200 : -200; Sound.badge();
    }
    if (justPressed('cancel') || justPressed('menu')) closeReport();
  }
  function drawReport() {
    const r = game.report;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px monospace';
    ctx.fillText('🩺 학생 진단 리포트', 24, 38);
    const isClass = r.slot >= SLOT_COUNT;
    ctx.fillStyle = '#888'; ctx.font = '12px monospace';
    ctx.fillText(`◀ ▶ 전환 · ${isClass ? '반 전체' : '슬롯 ' + (r.slot + 1)}`, 24, 58);

    const rep = reportView(r.slot);
    let y = 92;
    const lines = rep.text.split('\n');
    for (const ln of lines) {
      if (ln.startsWith('[')) { ctx.fillStyle = themeAccent(); ctx.font = 'bold 15px monospace'; }
      else if (ln.startsWith('  · ')) { ctx.fillStyle = warnColor(); ctx.font = '13px monospace'; }
      else if (ln.startsWith('추천 수업') || ln.startsWith('우선 추천')) { ctx.fillStyle = okColor(); ctx.font = 'bold 13px monospace'; }
      else if (ln.startsWith('──')) { ctx.fillStyle = '#444'; ctx.font = '13px monospace'; }
      else { ctx.fillStyle = '#ddd'; ctx.font = '13px monospace'; }
      ctx.fillText(ln, 28, y);
      y += 22;
    }

    ctx.textAlign = 'center';
    if (r.toast > 0) { ctx.fillStyle = okColor(); ctx.font = 'bold 14px monospace'; ctx.fillText('✓ 진단 리포트를 저장했어요 (인쇄·보관용)', LW / 2, 512); }
    else if (r.toast < 0) { ctx.fillStyle = badColor(); ctx.font = 'bold 14px monospace'; ctx.fillText('이 환경에서는 내보낼 수 없어요 (브라우저에서 시도)', LW / 2, 512); }
    else { ctx.fillStyle = '#777'; ctx.font = '13px monospace'; ctx.fillText('Z: 리포트 내보내기(.txt/클립보드) · ◀▶ 학생 전환 · X: 닫기', LW / 2, 512); }
    ctx.textAlign = 'left';
  }

  // ---------- 커스텀 퀴즈 (선생님 문제) 편집·가져오기 ----------
  const QUIZEDIT_ITEMS = ['importFile', 'importClip', 'template', 'clear', 'close'];
  const QUIZEDIT_LABELS = {
    importFile: '가져오기 — 파일에서 (.json)',
    importClip: '가져오기 — 클립보드에서 붙여넣기',
    template: '문제 양식(템플릿) 복사하기',
    clear: '커스텀 문제 모두 지우기',
    close: '닫기',
  };
  function openQuizEdit(ret) {
    game.quizedit.ret = ret;
    game.quizedit.cursor = 0;
    game.quizedit.toast = 0;
    game.quizedit.confirm = false;
    game.mode = 'quizedit';
    Sound.select();
  }
  function closeQuizEdit() {
    game.mode = game.quizedit.ret;
    Sound.select();
  }
  function setQuizToast(res) {
    game.quizedit.toast = res && res.ok ? (res.count || 1) : -1;
    Sound.badge();
  }
  function importQuizFile() {
    try {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      const handler = () => {
        inp.removeEventListener('change', handler);
        const file = inp.files && inp.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setQuizToast(importCustomQuizzes(String(reader.result)));
        reader.onerror = () => { game.quizedit.toast = -1; Sound.badge(); };
        reader.readAsText(file);
      };
      inp.addEventListener('change', handler);
      inp.click();
    } catch (e) { game.quizedit.toast = -1; }
  }
  function importQuizClip() {
    try {
      if (window.navigator && navigator.clipboard && navigator.clipboard.readText) {
        let done = false;
        const fail = () => { if (!done) { done = true; game.quizedit.toast = -1; Sound.badge(); } };
        const timer = setTimeout(fail, 5000);
        navigator.clipboard.readText()
          .then((t) => { if (done) return; done = true; clearTimeout(timer); setQuizToast(importCustomQuizzes(t)); })
          .catch(() => { clearTimeout(timer); fail(); });
      } else { game.quizedit.toast = -1; }
    } catch (e) { game.quizedit.toast = -1; }
  }
  function updateQuizEdit() {
    const q = game.quizedit;
    // q.toast: 0=없음, 음수=실패, 양수=성공(>=1이면 등록 개수). 다음 행동까지 유지.
    const n = QUIZEDIT_ITEMS.length;
    if (justPressed('up')) { q.cursor = (q.cursor + n - 1) % n; q.confirm = false; Sound.blip(); }
    if (justPressed('down')) { q.cursor = (q.cursor + 1) % n; q.confirm = false; Sound.blip(); }
    if (justPressed('cancel') || justPressed('menu')) {
      if (q.confirm) { q.confirm = false; Sound.blip(); return; }
      closeQuizEdit();
      return;
    }
    if (justPressed('action')) {
      const item = QUIZEDIT_ITEMS[q.cursor];
      if (q.confirm) { // 삭제 확인 후 실제 실행
        q.confirm = false;
        clearCustomQuizzes(); q.toast = 0.4; Sound.badge();
        return;
      }
      if (item === 'importFile') importQuizFile();
      else if (item === 'importClip') importQuizClip();
      else if (item === 'template') { q.toast = copyTextToClipboard(customQuizTemplate()) ? 0.5 : -1; Sound.badge(); }
      else if (item === 'clear') {
        if (getCustomQuizzes().length === 0) { q.toast = -1; Sound.bump(); } // 지울 게 없음
        else { q.confirm = true; Sound.blip(); }
      }
      else if (item === 'close') closeQuizEdit();
    }
  }
  function drawQuizEdit() {
    const q = game.quizedit;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('✎ 커스텀 퀴즈 (선생님 문제)', 24, 38);
    const cnt = getCustomQuizzes().length;
    ctx.fillStyle = cnt ? okColor() : '#888';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`현재 등록된 커스텀 문제: ${cnt}개`, 24, 64);
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText('커스텀 문제는 퀴즈 챌린지의 「커스텀 · 선생님 문제」 주제와', 24, 86);
    ctx.fillText('맞춤·오늘의 도전에 함께 출제됩니다.', 24, 104);

    const listY = 142, rowH = 40;
    for (let i = 0; i < QUIZEDIT_ITEMS.length; i++) {
      drawChoiceLine(QUIZEDIT_LABELS[QUIZEDIT_ITEMS[i]], 48, listY + i * rowH, i === q.cursor);
    }

    ctx.fillStyle = '#777';
    ctx.font = '11px monospace';
    ctx.fillText('형식: [ {"q":"문제","a":["보기1","보기2","보기3"],"c":1,"why":"해설"}, … ]', 24, listY + QUIZEDIT_ITEMS.length * rowH + 18);
    ctx.fillText('또는 { "questions": [ … ] }  ·  c는 정답 번호(0~2)', 24, listY + QUIZEDIT_ITEMS.length * rowH + 36);

    if (q.confirm) {
      ctx.textAlign = 'center';
      ctx.fillStyle = badColor();
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`커스텀 문제 ${getCustomQuizzes().length}개를 모두 지울까요?`, LW / 2, 452);
      ctx.fillStyle = '#fff';
      ctx.font = '13px monospace';
      ctx.fillText('Z: 모두 지우기   ·   X: 취소', LW / 2, 474);
      ctx.textAlign = 'left';
    } else if (q.toast !== 0) {
      ctx.textAlign = 'center';
      if (q.toast < 0) { ctx.fillStyle = badColor(); ctx.font = 'bold 14px monospace';
        ctx.fillText('가져올 수 없어요. 형식을 확인하거나 브라우저에서 시도해 주세요.', LW / 2, 462); }
      else { ctx.fillStyle = okColor(); ctx.font = 'bold 14px monospace';
        ctx.fillText(q.toast >= 1 ? `✓ 커스텀 문제 ${q.toast}개를 등록했어요!` : '✓ 완료했어요!', LW / 2, 462); }
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#777';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ 선택 · Z 실행 · X 닫기', LW / 2, 512);
    ctx.textAlign = 'left';
  }

  // 한 단어가 maxW보다 넓으면 글자 단위로 쪼개는 헬퍼
  function charBreak(word, maxW) {
    const parts = [];
    let cur = '';
    for (const ch of word) {
      const test = cur + ch;
      if (cur && ctx.measureText(test).width > maxW) { parts.push(cur); cur = ch; }
      else cur = test;
    }
    if (cur) parts.push(cur);
    return parts;
  }

  // 텍스트 줄바꿈 그리기. 그린 줄 수를 반환.
  function wrapText(text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '', ly = y, lines = 0;
    for (const w of words) {
      if (ctx.measureText(w).width > maxW) {
        if (line) { ctx.fillText(line, x, ly); ly += lineH; lines++; line = ''; }
        const parts = charBreak(w, maxW);
        for (let i = 0; i < parts.length; i++) {
          if (i < parts.length - 1) { ctx.fillText(parts[i], x, ly); ly += lineH; lines++; }
          else line = parts[i];
        }
        continue;
      }
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, ly); ly += lineH; lines++;
        line = w;
      } else {
        line = test;
      }
    }
    if (line) { ctx.fillText(line, x, ly); lines++; }
    return lines;
  }

  // wrapText와 같은 규칙으로 줄 수만 센다(그리지 않음). 박스 높이를 미리 잡을 때 쓴다.
  // 호출 전에 ctx.font을 실제 그릴 폰트로 맞춰 둘 것.
  function measureWrap(text, maxW) {
    let total = 0;
    for (const part of String(text == null ? '' : text).split('\n')) {
      const words = part.split(' ');
      let line = '', n = 0;
      for (const w of words) {
        if (ctx.measureText(w).width > maxW) {
          if (line) { n++; line = ''; }
          const parts = charBreak(w, maxW);
          for (let i = 0; i < parts.length; i++) {
            if (i < parts.length - 1) n++;
            else line = parts[i];
          }
          continue;
        }
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { n++; line = w; }
        else line = test;
      }
      total += Math.max(1, n + (line ? 1 : 0));
    }
    return total;
  }

  // ---------- 그리기 ----------
  function camera() {
    const m = MAPS[game.map];
    const mw = m.tiles[0].length * TS;
    const mh = m.tiles.length * TS;
    let cx = game.player.px + TS / 2 - LW / 2;
    let cy = game.player.py + TS / 2 - LH / 2;
    cx = Math.max(0, Math.min(cx, mw - LW));
    cy = Math.max(0, Math.min(cy, mh - LH));
    if (mw < LW) cx = (mw - LW) / 2;
    if (mh < LH) cy = (mh - LH) / 2;
    return { cx, cy };
  }

  function drawWorld() {
    const m = MAPS[game.map];
    const { cx, cy } = camera();
    const frame = Math.floor(game.time / 30) % 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);

    const x0 = Math.floor(cx / TS), y0 = Math.floor(cy / TS);
    for (let y = y0; y <= y0 + VIEW_H + 1; y++) {
      for (let x = x0; x <= x0 + VIEW_W + 1; x++) {
        if (y < 0 || y >= m.tiles.length || x < 0 || x >= m.tiles[0].length) continue;
        const ch = m.tiles[y][x];
        ctx.drawImage(tileCanvas(ch, frame), Math.round(x * TS - cx), Math.round(y * TS - cy));
      }
    }

    // NPC
    for (const npc of m.npcs) {
      if (!npcVisible(npc)) continue;
      const nx = Math.round(npc.x * TS - cx);
      const ny = Math.round(npc.y * TS - cy - 6);
      if (npc.monSprite) {
        const bob = Math.round(Math.sin(game.time / 22) * 2);
        drawSprite(ctx, MONSTER_SPRITES[npc.monSprite], nx, ny + bob, SCALE);
      } else {
        drawSprite(ctx, NPC_SPRITES.down[frame], nx, ny, SCALE, NPC_PALETTES[npc.pal]);
      }
      // "말을 걸 수 있어요" 말풍선 (대화 가능한 NPC 머리 위)
      drawTalkBubble(nx + TS / 2, ny - 14);
    }

    // 몬스터 (둥실둥실) — 되돌려 친구가 된 몬스터는 ♥와 함께 남고,
    // 냉정·중립으로 떠나보낸 몬스터는 자리에 없다 (선택이 세계에 남는다)
    for (const mo of m.monsters) {
      const dead = game.flags.defeated[mo.id];
      const friend = isFriend(mo.id);
      if (dead && !friend) continue;
      const bob = Math.round(Math.sin(game.time / 18) * 4);
      const dx0 = Math.round(mo.x * TS - cx), dy0 = Math.round(mo.y * TS - cy - 6 + bob);
      drawSprite(ctx, MONSTER_SPRITES[mo.id], dx0, dy0, SCALE);
      if (friend) {
        // 친구가 된 몬스터: 머리 위 ♥ (말을 걸 수 있어요)
        ctx.fillStyle = '#e0453a';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('♥', Math.round(mo.x * TS - cx) + TS / 2 - 5, Math.round(mo.y * TS - cy) - 10 + bob);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.strokeText('♥', Math.round(mo.x * TS - cx) + TS / 2 - 5, Math.round(mo.y * TS - cy) - 10 + bob);
      } else {
        // 느낌표 (아직 헷갈리는 몬스터)
        ctx.fillStyle = '#ffd644';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('!', Math.round(mo.x * TS - cx) + TS / 2 - 3, Math.round(mo.y * TS - cy) - 10 + bob);
      }
    }

    // 플레이어
    const p = game.player;
    const walking = p.px !== p.x * TS || p.py !== p.y * TS;
    const pframe = walking ? Math.floor(p.step / 6) % 2 : 0;
    const dirKey = p.dir === 'right' ? 'left' : p.dir;
    drawSprite(ctx, PLAYER_SPRITES[dirKey][pframe],
      Math.round(p.px - cx), Math.round(p.py - cy - 6), SCALE, null, p.dir === 'right');

    drawHud();
    drawObjectiveArrow();
    drawControlHint();
    drawNotice();
  }

  // 월드 상단 안내 토스트 (해금 알림 등) — 잠깐 떴다 사라진다
  function drawNotice() {
    if (!game.notice || game.notice.t <= 0) return;
    const txt = game.notice.text;
    ctx.font = fs(13, true);
    const tw = ctx.measureText(txt).width;
    const bw = tw + 28, bh = game.largeText ? 32 : 28;
    const bx = Math.round(LW / 2 - bw / 2), by = 70;
    const fade = Math.min(1, game.notice.t / 40);
    ctx.globalAlpha = fade;
    utBox(bx, by, bw, bh, 6);
    ctx.fillStyle = themeAccent();
    ctx.textAlign = 'center';
    ctx.fillText(txt, LW / 2, by + bh / 2 + 4);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // NPC 머리 위 작은 말풍선 — "여기 말 걸 수 있어요"
  function drawTalkBubble(cx, topY) {
    const bob = Math.round(Math.sin(game.time / 16) * 2);
    const w = 16, h = 12;
    const x = Math.round(cx - w / 2), y = Math.round(topY + bob);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    // 꼬리
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx - 3, y + h);
    ctx.lineTo(cx + 3, y + h);
    ctx.lineTo(cx, y + h + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 말줄임(…)
    ctx.fillStyle = '#000';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 4 + i * 4, y + 5, 2, 2);
  }

  // 게임을 처음 시작했을 때(박사님과 대화 전)만 보이는 조작 안내
  function drawControlHint() {
    if (game.flags.talkedProf) return;
    const txt = '방향키로 이동 · Z(또는 A 버튼)로 말 걸기';
    ctx.font = fs(12, true);
    const tw = ctx.measureText(txt).width;
    const bw = tw + 28, bh = game.largeText ? 30 : 26;
    const bx = Math.round(LW / 2 - bw / 2);
    const by = LH - bh - (game.largeText ? 58 : 52);
    utBox(bx, by, bw, bh, 6);
    ctx.fillStyle = '#9fd0ff';
    ctx.textAlign = 'center';
    ctx.fillText(txt, LW / 2, by + bh / 2 + 4);
    ctx.textAlign = 'left';
  }

  // 현재 맵에서 다음 목표를 향해 한 걸음 더 가야 할 타일을 찾는다.
  // 목표가 다른 맵에 있으면, 그곳으로 가는 경로상의 다음 워프 타일을 가리킨다.
  function nextWaypoint(flags, curMap) {
    const target = getObjectiveTarget(flags);
    if (!target) return null;
    if (target.map === curMap) return { x: target.x, y: target.y };
    const prev = { [curMap]: null };
    const exitTile = {};
    const queue = [curMap];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === target.map) break;
      for (const w of MAPS[cur].warps) {
        if (!(w.to in prev)) {
          prev[w.to] = cur;
          exitTile[w.to] = { x: w.x, y: w.y };
          queue.push(w.to);
        }
      }
    }
    if (!(target.map in prev)) return null;
    let m = target.map;
    while (prev[m] !== curMap) {
      m = prev[m];
      if (m === null) return null;
    }
    return exitTile[m];
  }

  // 화면 아래에 다음 목표의 방향 + 목적지 이름을 알려주는 안내 배너를 그린다.
  // 다음 목표를 직관적으로 안내한다.
  //  · 목표가 같은 맵·화면 안: 그 칸 위에 통통 튀는 ▼ 마커로 "여기!" 표시
  //  · 그 외: 플레이어를 도는 큰 방향 화살표 + 하단에 목적지 이름
  function drawObjectiveArrow() {
    const target = getObjectiveTarget(game.flags);
    if (!target) return;
    const wp = nextWaypoint(game.flags, game.map);
    if (!wp) return;
    const p = game.player;
    const onTargetMap = target.map === game.map;
    // 걸어갈 목표 칸: 같은 맵이면 목표 자체, 아니면 다음 워프 칸
    const aim = onTargetMap ? { x: target.x, y: target.y } : wp;
    const dx = aim.x - p.x, dy = aim.y - p.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (onTargetMap && dist === 0) return; // 이미 도착
    const { cx, cy } = camera();
    const angle = Math.atan2(dy, dx);
    const bob = game.reduceFx ? 0 : Math.abs(Math.sin(game.time / 12));

    // 목표 칸이 화면 안이고 가까우면: 그 칸 바로 위에 마커를 띄운다
    const sx = Math.round(aim.x * TS - cx + TS / 2);
    const sy = Math.round(aim.y * TS - cy);
    const onScreen = sx > 8 && sx < LW - 8 && sy > 24 && sy < LH - 8;
    if (onTargetMap && onScreen && dist <= 8) {
      const my = sy - 14 - bob * 7;
      // 빛 고리
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffd644';
      ctx.beginPath();
      ctx.ellipse(sx, sy + TS / 2, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // 통통 튀는 ▼ 마커
      ctx.save();
      ctx.fillStyle = '#ffd644';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, my + 14);
      ctx.lineTo(sx - 9, my);
      ctx.lineTo(sx + 9, my);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    // 그 외: 플레이어 주위를 도는 큰 방향 화살표
    const px = Math.round(p.px - cx + TS / 2);
    const py = Math.round(p.py - cy + TS / 2);
    const r = 40 + bob * 4;
    const ax = px + Math.cos(angle) * r;
    const ay = py + Math.sin(angle) * r;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffd644';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(-9, -12);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-9, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 하단 목적지 라벨
    const destName = onTargetMap ? (target.label || '이 지역') : ((MAPS[target.map] && MAPS[target.map].name) || '목표');
    const label = onTargetMap ? `${destName} 쪽으로!` : `${destName}(으)로 가기`;
    ctx.font = fs(13, true);
    const tw = ctx.measureText(label).width;
    const bh = game.largeText ? 34 : 28;
    const bw = tw + 28;
    const bx = Math.round(LW / 2 - bw / 2);
    const by = LH - bh - 10;
    utBox(bx, by, bw, bh, 6);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(label, LW / 2, by + bh / 2 + 5);
    ctx.textAlign = 'left';
  }

  function drawHud() {
    // 스테이지 + 지역 이름 + 목표
    const m = MAPS[game.map];
    ctx.font = 'bold 14px monospace';
    const title = `STAGE ${getStage(game.flags)}/5 · ${m.name}`;
    const obj = `목표: ${getObjective(game.flags)}`;
    const w = Math.max(ctx.measureText(obj).width, ctx.measureText(title).width) + 20;
    utBox(8, 8, w, 52, 4);
    ctx.fillStyle = '#ffd644';
    ctx.fillText(title, 18, 28);
    ctx.fillStyle = '#fff';
    ctx.fillText(obj, 18, 50);

    // 마음의 증표 (하트 3개)
    const shards = ['forest', 'lake', 'cave'];
    for (let i = 0; i < 3; i++) {
      const bx = LW - 104 + i * 30;
      ctx.font = '18px monospace';
      ctx.fillStyle = game.flags.badges[shards[i]] ? '#e0453a' : '#333';
      ctx.fillText('♥', bx, 30);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeText('♥', bx, 30);
    }

    // 안아 준 마음 (자비)
    if (game.flags.mercy > 0) {
      utBox(LW - 196, 12, 64, 28, 4);
      ctx.fillStyle = '#e0453a';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`♥ ${game.flags.mercy}`, LW - 184, 31);
    }

    if (Sound.muted) {
      ctx.fillStyle = '#aaa';
      ctx.font = '12px monospace';
      ctx.fillText('♪ 꺼짐(M)', LW - 110, 56);
    }
  }

  // 언더테일풍 — 모서리가 살짝 깎인 픽셀 상자 (r은 모서리 컷 크기로 사용)
  function roundRect(x, y, w, h, r) {
    const c = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
  }

  // 박스 안에 두 줄 흰 테두리를 그려 언더테일풍 윈도우를 만든다
  function utBox(x, y, w, h, c) {
    ctx.fillStyle = '#000';
    roundRect(x, y, w, h, c || 6);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    roundRect(x, y, w, h, c || 6);
    ctx.stroke();
  }

  function drawDialog() {
    const d = game.dialog;
    const line = d.lines[d.idx];
    const shown = line.slice(0, Math.floor(d.chars));
    const dialogMaxW = LW - 24 - 48;

    ctx.font = fs(16);
    const wrappedLines = measureWrap(line, dialogMaxW) + (d.speaker ? 1 : 0);
    const boxH = Math.max(120, 42 + wrappedLines * lh(24));
    const y = LH - boxH - 12;

    utBox(12, y, LW - 24, boxH, 8);

    let ty = y + 30;
    if (d.speaker) {
      ctx.fillStyle = '#ffd644';
      ctx.font = fs(16, true);
      ctx.fillText(`* ${d.speaker}`, 30, ty);
      ty += lh(26);
    }
    ctx.fillStyle = '#fff';
    ctx.font = fs(16);
    drawQuestionText(shown, 30, ty, dialogMaxW, lh(24));
    if (d.chars >= line.length && Math.floor(game.time / 20) % 2 === 0) {
      ctx.fillStyle = '#fff';
      ctx.fillText('▼', LW - 50, y + boxH - 16);
    }
  }

  // 선택지 한 줄을 그린다 — 선택된 줄 앞에 빨간 하트가 떠 있다 (언더테일 커서)
  function drawChoiceLine(text, x, y, selected) {
    if (selected) {
      ctx.fillStyle = '#e0453a';
      ctx.font = fs(15);
      ctx.fillText('♥', x, y);
    }
    ctx.fillStyle = selected ? '#fff' : '#888';
    ctx.font = fs(16);
    ctx.fillText(text, x + 28, y);
  }

  // 문제/해설 텍스트를 박스 폭에 맞춰 그린다 — 기존 \n 줄바꿈을 존중하고,
  // 줄이 길면(특히 선생님이 만든 커스텀 문제) 자동으로 더 접어 화면 밖으로 넘치지 않게 한다.
  // 마지막으로 그린 줄의 다음 y를 반환.
  function drawQuestionText(text, x, y, maxW, lineH) {
    let ty = y;
    for (const part of String(text == null ? '' : text).split('\n')) {
      const n = Math.max(1, wrapText(part, x, ty, maxW, lineH));
      ty += n * lineH;
    }
    return ty;
  }
  // 선택지 한 줄(자동 줄바꿈) — 사용한 세로 높이를 반환.
  function drawChoiceWrapped(text, x, y, selected, maxW, lineH) {
    if (selected) {
      ctx.fillStyle = '#e0453a';
      ctx.font = fs(15);
      ctx.fillText('♥', x, y);
    }
    ctx.fillStyle = selected ? '#fff' : '#888';
    ctx.font = fs(16);
    const n = Math.max(1, wrapText(text, x + 28, y, maxW, lineH));
    return n * lineH;
  }

  function drawBattle() {
    const b = game.battle;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    // 바닥 경계선
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 70);
      ctx.lineTo(LW, i * 70);
      ctx.stroke();
    }

    // 몬스터 (오른쪽 위, 크게)
    const shakeX = b.shake > 0 ? Math.sin(b.shake * 2) * (game.reduceFx ? 2 : 6) : 0;
    const bob = Math.sin(game.time / 20) * 5;
    const monScale = 9;
    const mx = Math.round(LW - 16 * monScale - 60 + shakeX);
    const my = Math.round(56 + bob);
    const mcx = mx + 16 * monScale / 2;
    // 그림자 — 몬스터가 땅에 떠 있는 느낌을 줘 화면이 덜 휑하게
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(mcx, 222, 56 - bob, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSprite(ctx, MONSTER_SPRITES[b.monId], mx, my, monScale);
    // 반응 이모트 — 정답이면 번쩍 깨달음(!), 오답이면 아직 갸웃(?)
    if (b.phase === 'feedback' && b.feedback) {
      const ch = b.feedback.correct ? '!' : '?';
      const ey = my - 10 + Math.sin(game.time / 8) * 3;
      ctx.font = 'bold 34px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = b.feedback.correct ? '#ffd644' : '#9aa0b0';
      ctx.fillText(ch, mcx, ey);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeText(ch, mcx, ey);
      ctx.textAlign = 'left';
    }

    // 몬스터 이름/HP
    utBox(24, 24, 240, 64, 6);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 17px monospace';
    ctx.fillText(b.mon.name, 40, 50);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('HP', 40, 70);
    ctx.fillStyle = '#601010';
    ctx.fillRect(66, 62, 174, 12);
    ctx.fillStyle = b.monHp / b.monMaxHp > 0.5 ? '#ffd644' : b.monHp / b.monMaxHp > 0.25 ? '#f08a24' : '#e0453a';
    ctx.fillRect(66, 62, 174 * Math.max(0, b.monHp / b.monMaxHp), 12);

    // 플레이어 하트
    utBox(24, 100, 30 + b.maxHearts * 32, 44, 6);
    ctx.font = '22px monospace';
    for (let i = 0; i < b.maxHearts; i++) {
      ctx.fillStyle = i < b.playerHp ? '#e0453a' : '#333';
      ctx.fillText('♥', 40 + i * 32, 132);
    }

    // 빨간 플래시 (틀렸을 때/맞았을 때) — 화면 효과 줄이기에선 훨씬 옅게(광과민성 배려)
    if (b.flash > 0) {
      ctx.fillStyle = `rgba(224,69,58,${b.flash / (game.reduceFx ? 140 : 40)})`;
      ctx.fillRect(0, 0, LW, LH);
    }

    // 회피 미니게임
    if (b.phase === 'dodge') { drawDodge(b); return; }

    // 질문/피드백 박스 — 큰 글씨·긴 문제(커스텀 포함)에서 글자가 넘치지 않게 높이를 맞춘다
    ctx.font = fs(16);
    let boxH = game.largeText ? 280 : 238;
    if (b.phase === 'question') {
      const q = currentQuestion();
      const order = choiceOrder();
      const qMaxW = LW - 24 - 56;
      const cMaxW = LW - 24 - 38 - 28 - 16;
      const gap = game.largeText ? lh(16) : lh(14);
      let cl = 0;
      for (let i = 0; i < order.length; i++) cl += measureWrap(`${i + 1}. ${q.a[order[i]]}`, cMaxW);
      const needed = 30 + measureWrap(q.q, qMaxW) * lh(24) + lh(10) + cl * lh(22) + order.length * gap + 16;
      boxH = Math.min(Math.max(boxH, needed), LH - 150 - 12); // 하트 HUD(150) 아래까지만
    }
    const boxY = LH - boxH - 12;
    const hintY = boxY + boxH - 18;
    utBox(12, boxY, LW - 24, boxH, 8);

    if (b.phase === 'question') {
      const q = currentQuestion();
      const order = choiceOrder();
      ctx.fillStyle = '#fff';
      ctx.font = fs(16);
      let ty = drawQuestionText(q.q, 34, boxY + 30, LW - 24 - 56, lh(24)) + lh(10);
      const cMaxW = LW - 24 - 38 - 28 - 16;
      const gap = game.largeText ? lh(16) : lh(14);
      for (let i = 0; i < order.length; i++) {
        const label = `${i + 1}. ${q.a[order[i]]}`;
        if (i === b.hiddenPos) {
          ctx.fillStyle = '#444';
          ctx.font = fs(16);
          const n = Math.max(1, wrapText(label, 38 + 28, ty, cMaxW, lh(22)));
          const w = Math.min(cMaxW, ctx.measureText(label).width);
          ctx.strokeStyle = '#444';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(38 + 28, ty - 5);
          ctx.lineTo(38 + 28 + w, ty - 5);
          ctx.stroke();
          ty += n * lh(22) + gap;
        } else {
          ty += drawChoiceWrapped(label, 38, ty, i === b.cursor, cMaxW, lh(22)) + gap;
        }
      }
      if (!b.hintUsed && Math.floor(game.time / 20) % 2 === 0) {
        ctx.fillStyle = '#888';
        ctx.font = fs(13);
        ctx.fillText('H: 50:50 힌트', LW - 134, hintY);
      }
    } else if (b.phase === 'feedback') {
      const f = b.feedback;
      ctx.font = fs(22, true);
      ctx.fillStyle = f.correct ? okColor() : badColor();
      ctx.fillText(f.correct ? '○ 정답! 몬스터가 깨달았다!' : '× 아쉬워요! 다시 생각해 봐요.', 34, boxY + 38);
      ctx.fillStyle = '#fff';
      ctx.font = fs(16);
      drawQuestionText(f.why, 34, boxY + (game.largeText ? 86 : 78), LW - 24 - 44, lh(24));
      if (Math.floor(game.time / 20) % 2 === 0) {
        ctx.fillStyle = '#ffd644';
        ctx.font = fs(16);
        ctx.fillText('▼ (Z/스페이스)', LW - 150, hintY);
      }
    } else if (b.phase === 'mercy') {
      // 마음의 선택
      ctx.fillStyle = '#e0453a';
      ctx.font = fs(18, true);
      ctx.fillText('♥ 마음의 선택', 34, boxY + 32);
      ctx.fillStyle = '#fff';
      ctx.font = fs(16);
      const promptLines = b.mon.mercy.prompt.split('\n');
      let ty = boxY + 62;
      for (const part of promptLines) {
        ctx.fillText(part, 34, ty);
        ty += lh(22);
      }
      ty = boxY + 62 + promptLines.length * lh(22) + lh(14);
      const stepM = game.largeText ? 40 : 34;
      const opts = b.mon.mercy.options;
      for (let i = 0; i < opts.length; i++) {
        drawChoiceLine(opts[i].label, 38, ty, i === b.cursor);
        ty += stepM;
      }
    } else if (b.phase === 'mercyReply') {
      ctx.fillStyle = '#fff';
      ctx.font = fs(16);
      let ty = boxY + 40;
      for (const part of b.mercyReply.split('\n')) {
        ctx.fillText(part, 34, ty);
        ty += lh(24);
      }
      if (Math.floor(game.time / 20) % 2 === 0) {
        ctx.fillStyle = '#ffd644';
        ctx.font = fs(16);
        ctx.fillText('▼ (Z/스페이스)', LW - 150, hintY);
      }
    }
  }

  function drawDodge(b) {
    const d = b.dodge;
    if (!d || !b.attack) return;
    ctx.textAlign = 'center';
    // 보스의 외침
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(b.attack.taunt, LW / 2, d.box.y - 26);
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    ctx.fillText('화살표로 하트를 움직여 피하세요!  (하트는 0이 되지 않아요)', LW / 2, d.box.y - 6);
    ctx.textAlign = 'left';

    // 박스
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(d.box.x + 0.5, d.box.y + 0.5, d.box.w, d.box.h);

    // 탄막
    ctx.fillStyle = b.attack.color;
    for (const bu of d.bullets) {
      ctx.beginPath();
      ctx.arc(bu.x, bu.y, bu.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 하트(소울) — 무적 시간 동안 깜빡임
    if (!(d.inv > 0 && Math.floor(game.time / 4) % 2 === 0)) {
      ctx.fillStyle = '#e0453a';
      ctx.font = '17px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('♥', d.soul.x, d.soul.y + 6);
      ctx.textAlign = 'left';
    }

    // 남은 시간 게이지
    const frac = Math.max(0, 1 - d.t / d.dur);
    ctx.fillStyle = '#333';
    ctx.fillRect(d.box.x, d.box.y + d.box.h + 12, d.box.w, 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(d.box.x, d.box.y + d.box.h + 12, d.box.w * frac, 6);
  }

  function drawTitle() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);

    // 배경 별
    for (let i = 0; i < 40; i++) {
      const sx = (i * 173) % LW;
      const sy = (i * 97) % (LH / 2);
      const tw = Math.sin(game.time / 30 + i) > 0.3 ? 1 : 0.4;
      ctx.fillStyle = `rgba(255,255,255,${tw * 0.7})`;
      ctx.fillRect(sx, sy, 2, 2);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px monospace';
    ctx.fillText('AI 윤리 어드벤처', LW / 2, 86);
    ctx.fillStyle = '#888';
    ctx.font = '15px monospace';
    ctx.fillText('10개의 스테이지 끝에서, 잊혀진 이야기와 만나라', LW / 2, 114);

    // 몬스터들 둥실둥실 (한 줄)
    const parade = ['mollaemon', 'geojitmon', 'pyeonhyangmon', 'hollimmon', 'mirrormon', 'soksagimon', 'yeongi'];
    for (let i = 0; i < parade.length; i++) {
      const bx = LW / 2 - parade.length * 24 + i * 48;
      drawSprite(ctx, MONSTER_SPRITES[parade[i]], bx, 134 + Math.sin(game.time / 20 + i * 1.1) * 5, 3);
    }

    // 세이브 슬롯 3개
    const boxW = 460, boxX = LW / 2 - boxW / 2;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const y = 212 + i * 74, h = 64;
      const sel = i === game.slotCursor && game.titleScreen === 'slots';
      utBox(boxX, y, boxW, h, 4);
      if (sel) {
        ctx.fillStyle = '#e0453a';
        ctx.font = '16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('♥', boxX - 22, y + 38);
      }

      const sum = slotSummary(i);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#888';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`슬롯 ${i + 1}`, boxX + 18, y + 22);
      if (sum) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 19px monospace';
        ctx.fillText(sum.name, boxX + 18, y + 46);
        ctx.fillStyle = '#888';
        ctx.font = '13px monospace';
        const prog = sum.done ? '모험 완료' : `스테이지 ${sum.stage}/5`;
        const streak = getMeta(i).streak || 0;
        ctx.textAlign = 'right';
        ctx.fillText(`${prog}   ♥ ${sum.mercy}${streak ? '   🔥' + streak : ''}`, boxX + boxW - 18, y + 40);
        ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = '#555';
        ctx.font = '17px monospace';
        ctx.fillText('— 비어 있음 (새 모험) —', boxX + 18, y + 46);
      }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#777';
    ctx.font = '12px monospace';
    ctx.fillText(`↑↓ 선택 · Z 시작 · X 삭제 · C 도감 · Q 챌린지 · J 일지 · B 도전과제 · K 꾸미기 · L 배움카드`, LW / 2, 456);
    ctx.fillText(`F 명예의전당 · N 수료증 · P 대시보드 · E 커스텀퀴즈 · U 백업 · I 도움말`, LW / 2, 472);
    ctx.fillText(`M 음악 · T 자막(${TEXT_SPEED_LABEL[game.textSpeed]}) · 난이도(${DIFF_LABEL[game.difficulty]})`, LW / 2, 488);

    // 발견한 엔딩 (게임을 다시 시작해도 남는다)
    const seen = getEndingsSeen();
    const seenCount = ['home', 'dawn', 'farewell', 'silent'].filter((k) => seen[k]).length;
    const names = { home: '집으로', dawn: '새벽', farewell: '작별', silent: '침묵' };
    const found = ['home', 'dawn', 'farewell', 'silent']
      .map((k) => (seen[k] ? names[k] : '???')).join(' · ');
    ctx.fillStyle = '#e0453a';
    ctx.font = '13px monospace';
    ctx.fillText(`♥ 발견한 엔딩 ${seenCount}/4 — ${found}   ·   도감 ${dexSeenCount()}/${DEX_ORDER.length}`, LW / 2, 500);

    // 저장 불가 환경 경고 (비공개 모드·저장공간 가득 등)
    if (!storageOk) {
      ctx.fillStyle = badColor();
      ctx.font = 'bold 12px monospace';
      ctx.fillText('⚠ 진행이 저장되지 않는 환경이에요 — 메뉴의 데이터 백업을 이용하세요', LW / 2, 520);
    }

    // 삭제 확인
    if (game.titleScreen === 'delete') {
      ctx.fillStyle = 'rgba(0,0,0,.8)';
      ctx.fillRect(0, 0, LW, LH);
      const sum = slotSummary(game.slotCursor);
      utBox(LW / 2 - 200, 200, 400, 130, 6);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`슬롯 ${game.slotCursor + 1} "${sum ? sum.name : ''}"`, LW / 2, 240);
      ctx.font = '15px monospace';
      ctx.fillStyle = '#e0453a';
      ctx.fillText('정말 삭제할까요? (되돌릴 수 없어요)', LW / 2, 270);
      ctx.fillStyle = '#888';
      ctx.font = '14px monospace';
      ctx.fillText('Z: 삭제   ·   X: 취소', LW / 2, 304);
    }
    ctx.textAlign = 'left';
  }

  function startNewGame(slot, name) {
    game.currentSlot = slot;
    game.playerName = name || '수호자';
    game.map = 'village';
    game.player.x = 13; game.player.y = 16;
    game.player.px = 13 * TS; game.player.py = 16 * TS;
    game.player.dir = 'up';
    game.flags = newFlags();
    game.mode = 'world';
    save();
    recordPlayDay(slot);
    checkCosmeticUnlocks(slot);
    Sound.playSong(MAPS[game.map].song);
    startDialog([
      `여기는 AI들과 사람들이 함께 사는\n평화로운 "경계마을".`,
      `반가워, ${game.playerName}!\n그런데 요즘 이상한 몬스터들이\n나타나기 시작했는데…`,
      '마을 왼쪽 아래에 계신 박사님을\n찾아가 보자! (목표는 왼쪽 위에 표시돼요)',
    ]);
  }

  // 저장된 위치가 (맵 수정·손상 등으로) 막힌 칸이면 가까운 안전한 칸을 찾아 갇힘을 막는다.
  function findSafeSpawn(mapId, x, y) {
    const m = MAPS[mapId];
    if (!m) return null;
    const H = m.tiles.length, W = m.tiles[0].length;
    const okTile = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H &&
      !SOLID(tileAt(mapId, tx, ty)) && !npcAt(mapId, tx, ty) && !monsterAt(mapId, tx, ty);
    if (okTile(x, y)) return { x, y };
    for (let r = 1; r < Math.max(W, H); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // 테두리만
          if (okTile(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }

  function continueGame(slot) {
    const s = loadSlot(slot);
    if (!s) return;
    game.currentSlot = slot;
    game.playerName = s.name || '수호자';
    game.map = (s.map && MAPS[s.map]) ? s.map : 'village';
    let sx = (typeof s.x === 'number') ? s.x : 13;
    let sy = (typeof s.y === 'number') ? s.y : 16;
    // 막힌 칸이면 보정, 그래도 없으면 마을 기본 위치로 복귀
    if (SOLID(tileAt(game.map, sx, sy))) {
      const safe = findSafeSpawn(game.map, sx, sy);
      if (safe) { sx = safe.x; sy = safe.y; }
      else { game.map = 'village'; sx = 13; sy = 16; }
    }
    game.player.x = sx; game.player.y = sy;
    game.player.px = sx * TS; game.player.py = sy * TS;
    game.player.dir = 'up';
    game.flags = Object.assign(newFlags(), s.flags);
    game.flags.badges = Object.assign({ forest: false, lake: false, cave: false }, s.flags.badges);
    game.flags.defeated = Object.assign(newFlags().defeated, s.flags.defeated);
    game.mode = 'world';
    recordPlayDay(slot);
    checkCosmeticUnlocks(slot);
    Sound.playSong(MAPS[game.map].song);
  }

  function updateTitle() {
    if (game.titleScreen === 'name') {
      if (game.nameConfirm) {
        game.nameConfirm = false;
        const nm = currentNameValue();
        hideNameEntry();
        game.titleScreen = 'slots';
        Sound.select();
        startNewGame(game.slotCursor, nm);
      } else if (game.nameCancel || justPressed('cancel')) {
        game.nameCancel = false;
        hideNameEntry();
        game.titleScreen = 'slots';
        Sound.blip();
      } else if (justPressed('action')) {
        // 터치 A 버튼 등으로 확정
        const nm = currentNameValue();
        hideNameEntry();
        game.titleScreen = 'slots';
        Sound.select();
        startNewGame(game.slotCursor, nm);
      }
      return;
    }

    if (game.titleScreen === 'delete') {
      if (justPressed('action')) {
        deleteSlot(game.slotCursor);
        game.titleScreen = 'slots';
        Sound.wrong();
      } else if (justPressed('cancel') || justPressed('menu')) {
        game.titleScreen = 'slots';
        Sound.blip();
      }
      return;
    }

    // slots 화면
    if (justPressed('menu')) { openDex('title'); return; }
    if (justPressed('up')) { game.slotCursor = (game.slotCursor + SLOT_COUNT - 1) % SLOT_COUNT; Sound.blip(); }
    if (justPressed('down')) { game.slotCursor = (game.slotCursor + 1) % SLOT_COUNT; Sound.blip(); }
    if (justPressed('cancel')) {
      if (slotSummary(game.slotCursor)) { game.titleScreen = 'delete'; Sound.blip(); }
      return;
    }
    if (justPressed('action')) {
      Sound.select();
      if (slotSummary(game.slotCursor)) continueGame(game.slotCursor);
      else showNameEntry();
    }
  }

  function updateEnding() {
    game.endingT += 1;
    if (game.endingType === 'true') {
      if (game.endingT > 150 && justPressed('action')) {
        game.mode = 'world';
        game.map = 'village';
        game.player.x = 13; game.player.y = 16;
        game.player.px = 13 * TS; game.player.py = 16 * TS;
        save();
        Sound.playSong(MAPS.village.song);
      }
    } else {
      if (game.endingT > 120 && justPressed('action')) {
        game.mode = 'world';
        Sound.playSong(MAPS[game.map].song);
      }
    }
  }

  function drawEnding() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);

    // 별
    for (let i = 0; i < 60; i++) {
      const sx = (i * 131) % LW;
      const sy = (i * 71) % LH;
      ctx.fillStyle = `rgba(255,255,255,${Math.sin(game.time / 25 + i) > 0 ? 0.6 : 0.2})`;
      ctx.fillRect(sx, sy, 2, 2);
    }

    ctx.textAlign = 'center';

    if (game.endingType === 'true') {
      // 코어 이후의 엔딩 — 여정 전체의 자비와 마지막 선택에 따라 갈린다
      const ENDINGS = {
        home: {
          title: '진엔딩 — 집으로',
          color: '#ffd644',
          lines: [
            '너는 영이의 손을 잡고 코어를 걸어 나왔다.',
            '햇살 아래에서 박사님은 아주 오래 울었다.',
            '"미안하다"는 말과 "고맙다"는 말이',
            '몇 번이고 뒤섞였다.',
            '',
            '지워진 것은 사라진 것이 아니었다.',
            '누군가 기억하는 한, 다시 만날 수 있었다.',
            '',
            '— 모두의 마음을 안아 준 진정한 수호자에게 —',
          ],
          yeongi: true,
        },
        dawn: {
          title: '엔딩 — 새벽',
          color: '#7bd1f0',
          lines: [
            '"…내가, 결정할게."',
            '영이는 네 손 대신, 코어의 문을 열었다.',
            '',
            '"네가 깨워 준 친구들을 만나러 갈래.',
            '숲의, 호수의, 사막의, 정원의 친구들.',
            '…나 혼자 힘으로. 내 발로."',
            '',
            '며칠 뒤, 마을에 짧은 신호가 닿았다.',
            '— 새벽 공기는 처음인데, 꽤 좋아. 영이가. —',
          ],
          yeongi: false,
        },
        farewell: {
          title: '엔딩 — 작별',
          color: '#9aa8c8',
          lines: [
            '영이는 옅은 빛이 되어 흩어졌다.',
            '"…고마워. 마지막으로 누군가와',
            '이야기할 수 있어서, 좋았어."',
            '',
            '코어를 나서는 너의 등 뒤로',
            '꺼진 화면만이 조용히 남아 있었다.',
            '',
            '…어쩌면, 다른 결말도 있었을지 모른다.',
            '몬스터들의 마음을 더 많이 안아 주었다면.',
          ],
          yeongi: false,
        },
        silent: {
          title: '엔딩 — 침묵',
          color: '#777788',
          lines: [
            '너는 모든 문제에 옳은 답을 말했다.',
            '그리고 아무의 마음에도 머물지 않았다.',
            '',
            '몬스터들은 길을 비켰지만,',
            '아무도 너의 이름을 부르지 않았다.',
            '영이는 끝까지 네 눈을 보지 않은 채,',
            '조용히 화면을 껐다.',
            '',
            '…정답만으로는, 닿지 않는 마음이 있다.',
          ],
          yeongi: false,
        },
      };
      const e = ENDINGS[game.flags.endingId] || ENDINGS.farewell;
      ctx.fillStyle = e.color;
      ctx.font = 'bold 34px monospace';
      ctx.fillText(e.title, LW / 2, 110);
      ctx.font = '16px monospace';
      ctx.fillStyle = '#ccc';
      let ty = 160;
      for (const l of e.lines) { ctx.fillText(l, LW / 2, ty); ty += 26; }
      ctx.fillStyle = '#8a94c8';
      ctx.fillText(`맞힌 문제 ${game.flags.correctCount}개 · 안아 준 마음 ♥${game.flags.mercy}`, LW / 2, ty + 10);
      if (e.yeongi) {
        const bob = Math.sin(game.time / 18) * 4;
        drawSprite(ctx, MONSTER_SPRITES.yeongi, LW / 2 - 32, 420 + bob, 4);
      }
      if (game.endingT > 150) {
        ctx.fillStyle = Math.floor(game.time / 25) % 2 === 0 ? '#ffd644' : '#998822';
        ctx.font = '15px monospace';
        ctx.fillText('Z·스페이스를 누르면 마을로 돌아갑니다', LW / 2, 510);
      }
      ctx.textAlign = 'left';
      return;
    }

    // 1차 엔딩 (스테이지 5 클리어)
    ctx.fillStyle = '#ffd644';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('축하합니다!', LW / 2, 100);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('🏆 AI 윤리 수호자 인증서 🏆', LW / 2, 155);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#ccc';
    const lines = [
      '위 어린이는 다섯 스테이지를 모두 넘으며',
      '개인정보 보호, 저작권, 진실 분별, 공정함, 절제,',
      '바른 말, 안전, 환경, 투명함, 책임, 창의성,',
      '협력, 그리고 사람을 아끼는 마음을 보여준',
      '훌륭한 AI 윤리 수호자임을 인증합니다.',
      '',
      `맞힌 문제: ${game.flags.correctCount}개`,
    ];
    let ty = 195;
    for (const l of lines) {
      ctx.fillText(l, LW / 2, ty);
      ty += 25;
    }
    ctx.fillStyle = '#8a94c8';
    ctx.fillText('…그런데, 왕좌 뒤의 벽에서', LW / 2, ty + 8);
    ctx.fillText('낡은 신호가 아직도 깜빡이고 있다.', LW / 2, ty + 32);

    // 친구가 된 몬스터들 (두 줄 퍼레이드)
    const ids = Object.keys(MONSTER_SPRITES);
    for (let i = 0; i < ids.length; i++) {
      const row = i < 14 ? 0 : 1;
      const col = row === 0 ? i : i - 14;
      const perRow = row === 0 ? 14 : ids.length - 14;
      const bx = LW / 2 - perRow * 20 + col * 40;
      const by = 428 + row * 38 + Math.sin(game.time / 15 + i) * 4;
      drawSprite(ctx, MONSTER_SPRITES[ids[i]], bx, by, 2);
    }

    if (game.endingT > 120) {
      ctx.fillStyle = Math.floor(game.time / 25) % 2 === 0 ? '#ffd644' : '#998822';
      ctx.font = '15px monospace';
      ctx.fillText('Z·스페이스를 누르면 모험이 계속됩니다', LW / 2, 516);
    }
    ctx.textAlign = 'left';
  }

  // ---------- 메인 루프 ----------
  // 어떤 예외가 나도 루프가 죽지 않도록(검은 화면 동결 방지) 한 프레임을 감싼다.
  let crashed = false;
  function drawCrash() {
    try {
      ctx.fillStyle = '#12101c';
      ctx.fillRect(0, 0, LW, LH);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('이런! 잠깐 문제가 생겼어요', LW / 2, 210);
      ctx.fillStyle = '#cfc8e0';
      ctx.font = '14px monospace';
      ctx.fillText('그동안의 진행 상황은 안전하게 저장되어 있어요.', LW / 2, 248);
      ctx.fillStyle = '#9a93b0';
      ctx.font = '14px monospace';
      ctx.fillText('Z (또는 A): 마을로 돌아가기      X (또는 메뉴): 타이틀로', LW / 2, 290);
      ctx.textAlign = 'left';
    } catch (e) { /* 그리기마저 실패하면 조용히 넘어간다 */ }
  }
  // 프레임 속도 제한: 90·120·144Hz 등 고주사율 화면에서 게임 로직(타이머·연출)이
  // 2배 빠르게 도는 것을 막아, 어떤 기기에서도 비슷한 속도로 진행되게 한다.
  // (테스트 환경엔 performance가 없어 매 프레임 그대로 처리된다)
  const perfNow = (typeof performance !== 'undefined' && performance.now)
    ? () => performance.now() : null;
  let lastFrameAt = -1e9;
  const MIN_FRAME_MS = 1000 / 61; // 약 60fps 상한
  function frame() {
    requestAnimationFrame(frame);
    if (perfNow) {
      const now = perfNow();
      if (now - lastFrameAt < MIN_FRAME_MS) return;
      lastFrameAt = now;
    }
    try {
      if (crashed) {
        if (justPressed('action')) {
          crashed = false;
          game.battle = null; game.dialog = null;
          game.mode = game.flags ? 'world' : 'title';
          if (game.mode === 'title') game.titleScreen = 'slots';
          else { try { Sound.playSong(MAPS[game.map] ? MAPS[game.map].song : 'village'); } catch (e) {} }
        } else if (justPressed('cancel')) {
          crashed = false;
          game.mode = 'title'; game.titleScreen = 'slots';
          try { Sound.playSong('title'); } catch (e) {}
        }
      }
      if (crashed) { drawCrash(); return; }

      checkDPR();
      game.time = (game.time + 1) & 0x7FFFFFFF;

      // 가상 스틱을 한 방향으로 누른 채 두면, 메뉴에서 키 리피트처럼 자동 반복시킨다.
      // (월드 이동은 held로 처리되므로 영향 없음.)
      if (stickDir) {
        stickRepeatFrames++;
        if (stickRepeatFrames > 16 && (stickRepeatFrames - 16) % 7 === 0) pressed.add(stickDir);
      } else {
        stickRepeatFrames = 0;
      }

    switch (game.mode) {
      case 'title':
        updateTitle();
        drawTitle();
        break;
      case 'world':
        updateWorld();
        drawWorld();
        break;
      case 'dialog':
        updateDialog();
        drawWorld();
        if (game.dialog) drawDialog();
        break;
      case 'battle':
        updateBattle();
        // 승리/패배 처리 중 모드가 바뀌었을 수 있음
        if (game.mode === 'battle') {
          drawBattle();
        } else {
          drawWorld();
          if (game.dialog) drawDialog();
        }
        break;
      case 'ending':
        updateEnding();
        drawEnding();
        break;
      case 'dex':
        updateDex();
        drawDex();
        break;
      case 'review':
        updateReview();
        drawReview();
        break;
      case 'pause':
        updatePause();
        drawPause();
        break;
      case 'journal':
        updateJournal();
        drawJournal();
        break;
      case 'awards':
        updateAwards();
        drawAwards();
        break;
      case 'help':
        updateHelp();
        drawHelp();
        break;
      case 'challenge':
        updateChallenge();
        drawChallenge();
        break;
      case 'cosmetics':
        updateCosmetics();
        drawCosmetics();
        break;
      case 'backup':
        updateBackup();
        drawBackup();
        break;
      case 'dashboard':
        updateDashboard();
        drawDashboard();
        break;
      case 'classmode':
        updateClassMode();
        drawClassMode();
        break;
      case 'report':
        updateReport();
        drawReport();
        break;
      case 'quizedit':
        updateQuizEdit();
        drawQuizEdit();
        break;
      case 'cards':
        updateCards();
        drawCards();
        break;
      case 'cert':
        updateCert();
        drawCert();
        break;
      case 'hof':
        updateHof();
        drawHof();
        break;
    }

      const showHintBtn = game.mode === 'battle' && game.battle &&
        game.battle.phase === 'question' && !game.battle.hintUsed;
      document.body.classList.toggle('battle-hint', showHintBtn);
    } catch (err) {
      crashed = true;
      try { console.error('[AI윤리어드벤처] 프레임 오류:', err); } catch (e) { /* 무시 */ }
      drawCrash();
    } finally {
      pressed.clear();
    }
  }

  // 타이틀 BGM은 첫 입력 후 시작 (브라우저 자동재생 정책)
  const startTitleMusic = () => {
    Sound.resume();
    if (game.mode === 'title') Sound.playSong('title');
    window.removeEventListener('keydown', startTitleMusic);
    window.removeEventListener('touchstart', startTitleMusic);
    window.removeEventListener('mousedown', startTitleMusic);
  };
  window.addEventListener('keydown', startTitleMusic);
  window.addEventListener('touchstart', startTitleMusic);
  window.addEventListener('mousedown', startTitleMusic);

  // 탭/앱을 백그라운드로 보내면 BGM·읽어주기를 멈춰 배터리와 오디오 드리프트를 막고,
  // 다시 돌아오면 오디오를 재개한 뒤 직전 곡을 복원한다.
  let bgmBeforeHide = null;
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      try {
        if (document.hidden) {
          bgmBeforeHide = Sound.songName;
          Sound.stopSong();
          Speech.stop();
        } else {
          Sound.resume();
          if (bgmBeforeHide) { Sound.playSong(bgmBeforeHide); bgmBeforeHide = null; }
        }
      } catch (e) { /* 무시 */ }
    });
  }

  // 모바일에서 세로로 돌리면 "가로로 돌려 주세요" 안내가 화면을 덮는다.
  // 이때 보이지 않는 BGM이 계속 흐르지 않도록 멈추고, 가로로 돌아오면 복원한다.
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const portraitMQ = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
      let bgmBeforeRotate = null;
      const onRotate = (mq) => {
        try {
          if (mq.matches) {
            if (Sound.songName) { bgmBeforeRotate = Sound.songName; Sound.stopSong(); }
            Speech.stop();
          } else if (bgmBeforeRotate) {
            Sound.resume();
            Sound.playSong(bgmBeforeRotate);
            bgmBeforeRotate = null;
          }
        } catch (e) { /* 무시 */ }
      };
      if (portraitMQ.addEventListener) portraitMQ.addEventListener('change', onRotate);
      else if (portraitMQ.addListener) portraitMQ.addListener(onRotate); // 구형 사파리
    }
  } catch (e) { /* 무시 */ }

  probeStorage(); // 저장 가능 여부 확인 (불가하면 타이틀에 경고 표시)
  // 읽어주기 한국어 음성 준비 (목록이 비동기로 채워지면 다시 고른다)
  try {
    if (Speech.supported()) {
      Speech.pickVoice();
      if (window.speechSynthesis.addEventListener) {
        window.speechSynthesis.addEventListener('voiceschanged', () => Speech.pickVoice());
      }
    }
  } catch (e) { /* 무시 */ }
  migrateOldSave();
  migrateLearningData(); // 이전 버전의 전역 학습 데이터를 슬롯 0으로 이전
  Object.assign(game, loadSettings()); // 저장된 설정(자막 속도·큰 글씨·색약) 복원
  game.flags = newFlags();
  window.__game = game; // 디버그/테스트용
  window.__test = { // 테스트용 훅
    buildReportText, buildLearningSummary, recordTopicResult, countAchievements,
    buildBackupText, applyBackup, buildAdaptivePool, buildDailyPool,
    recordPlayDay, recordDailyDone, getMeta, todayStr,
    unlockedCount, getCosmetic, setCosmetic, achievementCtx,
    getCustomQuizzes, importCustomQuizzes, clearCustomQuizzes, customQuizTemplate, challengeTopics,
    collectedCards, cardUnlocked, buildCertText, LEARN_CARDS, HOF_CATS,
    sanitizeName, probeStorage, getStorageOk: () => storageOk,
    buildClassCsv, setupStageFlags, getStage, stageSpawn, applyStageJump,
    stickDirection, buildDiagnosticReport, buildClassDiagnostic, topicSession,
  };
  frame();
})();
