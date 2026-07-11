// AI 윤리 어드벤처 - 메인 게임 엔진
(() => {
  'use strict';

  const TILE = 16;
  const SCALE = 3;
  const TS = TILE * SCALE; // 48px
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // 논리 해상도(좌표계는 항상 720×528). 백킹 스토어는 기기 픽셀 밀도(DPR)만큼 키우되,
  // 교실 태블릿·저전력 노트북에서 버벅이지 않도록 고해상도 백킹 스토어를 더 낮게 제한한다.
  const LW = 720, LH = 528;
  const DPR_CAP = 1.5;
  function effectiveDprCap() { return (typeof game !== 'undefined' && game.lowGraphics) ? 1 : DPR_CAP; }
  let currentDPR = Math.max(1, Math.min(window.devicePixelRatio || 1, DPR_CAP));
  canvas.width = LW * currentDPR;
  canvas.height = LH * currentDPR;
  ctx.scale(currentDPR, currentDPR);
  function checkDPR() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, effectiveDprCap()));
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
    teacherCursor: 0,    // 「선생님 방」 메뉴 커서
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
    lowGraphics: false,  // 저사양 그래픽(백킹 해상도 1x + 무거운 효과 최소화)
    dashboard: { ret: 'title', cursor: 0, toast: 0 }, // 교사용 대시보드
    classmode: { ret: 'world', sel: 0, confirm: false, toast: 0 }, // 수업 모드(챕터 바로 시작)
    report: { ret: 'world', slot: 0, toast: 0 }, // 교사용 학생 진단 리포트
    quizedit: { ret: 'title', cursor: 0, toast: 0, confirm: false }, // 커스텀 퀴즈 편집·가져오기
    cards: { ret: 'title', slot: 0, scroll: 0 },     // 학습 카드 컬렉션
    cert: { ret: 'title', slot: 0, toast: 0 },       // 수료증·진도 인증서
    hof: { ret: 'title', cat: 0 },                   // 명예의 전당(로컬 기록)
    pauseScroll: 0,      // 일시정지 메뉴 스크롤
    puzzleRun: null,     // 방탈출 런타임 상태 (흔적의 방 등) — 방 밖에서는 null
    choice: null,        // 월드 선택지 박스 { prompt, options, cursor, onPick }
    choiceRet: 'world',
    hint: null,          // 퍼즐 힌트 오버레이 { step, level, hints }
    hintRet: 'world',
    introDim: null,      // 새 게임 인트로 암전 { fadeFrame } — startNewGame에서 세팅
    warpCooldownFrames: 0, // 맵 전환 직후 즉시 되돌아가는 auto-bounce 방지
    lastWarp: null,        // { fromMap, toMap, exitDir, arrivedAt } — UX 검증/테스트용
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
      defeated: {
        bekkyeomon: false, sujipmon: false, pyeonhyangmon: false,
        hwangakmon: false, yuhokmon: false, hollimmon: false,
        finalboss: false, yeongi: false,
      },
      mercy: 0,        // 마음을 안아준 횟수 (스테이지 6~)
      visited: {},     // 맵 인트로 연출 1회 표시용
      trueEnding: false,
      correctCount: 0,
      battleCount: 0,
      traceGiven: 0,       // 접수처에서 내보낸 정보 최대 개수(닉네임 제외) — 보스 콜백 인트로용
      chapter1Clear: false, // 1장 보스(담아) 설득 완료
      chapter1Mercy: false, // 1장 보스를 자비로 되돌렸는가 (2장 콜백 인트로용)
      chapter2Clear: false, // 2장 보스(기울) 설득 완료
      chapter2Mercy: false, // 2장 보스를 자비로 되돌렸는가 (3장 콜백 인트로용)
      chapter3Clear: false, // 3장 보스(그럴싸) 설득 완료
      chapter3Mercy: false, // 3장 보스를 자비로 되돌렸는가
      chapter4Clear: false, // 4장 보스(반짝) 설득 완료
      chapter4Mercy: false, // 4장 보스를 자비로 되돌렸는가 (다음 장 콜백용)
      seenPhoto1: false,   // 스토리 복선 — 주인의 방 서랍의 낡은 사진을 봤다
      seenPhoto2: false,   // 스토리 복선 2호 — 표본 창고 모서리 선반의 ×표 사진
      seenArticle: false,  // 스토리 복선 3호 — 편집실 미송출 기사함
      seenButtons: false,  // 스토리 복선 4호 — 백스테이지 구석의 버튼 더미
      rumorFixed: false,   // 3장 허브 해제 — 송출탑 정정 보도 완료(소문 거리 개방)
      profConfession: false, // 박사 고백 이벤트 1회 트리거 (chapter3Clear 후 마을 진입)
      s4KeySecret: false,  // 4장 열쇠① 비밀조각(구역① 룰렛 광장 클리어)
      s4KeyId: false,      // 4장 열쇠② 본인표(구역② 회원가입 골목 클리어)
      s4StolenCard: null,  // 백스테이지 마스터키 함정 — 일시 도난된 증거 카드 id
      adStickers: 0,       // 광고 딱지 누적(0~4) — HUD 가장자리 오염, 해지 단말로 제거
      chapter5Clear: false, // 5장 보스(루미) 설득 완료
      chapter5Mercy: false, // 5장 보스를 자비로 되돌렸는가 (다음 장 콜백용)
      heardLumi: false,    // 스토리 복선 5호 — 잠긴 복도 너머 베란다에서 흔들리는 루미 목소리
      lumiTrust: 0,        // 5장 허브 — 루미의 목소리 안내 순서 카운터(신뢰 구간→소유 구간)
      goyoClear: false,    // 파이널 보스(고요) 설득 완료 — 코어 개방
      goyoMercy: false,    // 고요를 자비로 되돌렸는가
      shrineIdx: 0,        // 코어 제단 봉헌 퍼즐 진행(0~8, SHRINE_WHISPERS 길이)
      shrineWrong: 0,      // 봉헌 퍼즐 오답 횟수(기록용)
      shrineDone: false,   // 봉헌 퍼즐 완료 — 영이 등장
      bandiJoined: false,  // 동행자 반디 합류(오프닝 직후)
      bandiRevealed: false, // 반디 정체 공개(코어 봉헌 완료) — 동행 종료
      bandiSaid: {},       // 반디 조언을 이미 건넨 맵 (맵당 1회)
      introClue1: false,   // 프롤로그 실험실 단서① 태블릿
      introClue2: false,   // 프롤로그 실험실 단서② 모니터
      introClue3: false,   // 프롤로그 실험실 단서③ 포스트잇
      introDoorOpen: false, // 프롤로그 실험실 출구 개방 — 단서 3개 수집 완료
      introForestTrace: false, // 실험실 탈출 직후 정적의 숲 첫 흔적 조사
      ttaraFirstEncounter: false, // 정적의 숲 안쪽에서 따라와 처음 마주친 전용 조우 연출
      prologueClosed: false, // 따라 설득 후 프롤로그 마무리 컷신을 보고 1장으로 진입했는가
      forestClearingRead: false, // 정적의 숲 안쪽 공터 조사 결과 표식
      privacyLeak: 0,       // 1장 개인정보 그림자가 붙을 때 오르는 노출도(0~5)
      privacyRecovery: 0,   // 노출도 MAX 후 회복 목표 진행(지운 정보 조각 수)
      privacyRecoveryActive: false, // 노출도 5에서 즉시 실패 대신 회복 목표 발동
    };
  }

  // ---------- 세이브 슬롯 (3개) ----------
  function slotKey(i) { return 'ai-ethics-adventure-slot-' + i; }

  // v3 마이그레이션 — 구 세이브(v1 필드·증표·구 세계 진행)에서 챕터 진행만 승계한다.
  // 사라진 맵에 서 있던 세이브는 마을 입구로 옮긴다. (v1 콘텐츠 무손상 원칙은 v3에서 공식 폐기)
  const V3_CAST = ['bekkyeomon', 'sujipmon', 'pyeonhyangmon', 'hwangakmon',
    'yuhokmon', 'hollimmon', 'finalboss', 'yeongi'];
  function migrateSlotV3(data) {
    if (!data || !data.flags) return data;
    // 동행자 도입 전 세이브(버전 무관) — 오프닝을 이미 지난 진행이면 반디도 합류한 것으로 본다
    if (data.flags.talkedProf && data.flags.bandiJoined === undefined) data.flags.bandiJoined = true;
    if ((data.v || 0) >= 3) return data;
    const f = data.flags;
    delete f.badges;
    delete f.sawBattleTip;
    if (f.defeated) {
      const d = {};
      for (const k of V3_CAST) d[k] = !!f.defeated[k];
      f.defeated = d;
    }
    if (f.mercyChoice) {
      const m = {};
      for (const k of V3_CAST) if (f.mercyChoice[k]) m[k] = f.mercyChoice[k];
      f.mercyChoice = m;
    }
    if (!MAPS[data.map]) { data.map = 'village'; data.x = 13; data.y = 16; }
    data.v = 3;
    return data;
  }
  // v3→v4: introlab 플래그 기본값. 이미 숲 이상을 진행한 세이브라면 문을 열고 지난 것으로 본다.
  function migrateSlotV4(data) {
    if (!data || !data.flags) return data;
    const f = data.flags;
    if (f.introClue1 !== undefined) return data; // 이미 v4 이상
    f.introClue1 = !!f.talkedProf;
    f.introClue2 = !!f.talkedProf;
    f.introClue3 = !!f.talkedProf;
    f.introDoorOpen = !!f.talkedProf;
    f.introForestTrace = !!f.talkedProf;
    data.v = 4;
    return data;
  }

  // v4→v5: 실험실 탈출 직후 숲 흔적 플래그. 기존 진행 세이브는 이미 본 것으로 승계한다.
  function migrateSlotV5(data) {
    if (!data || !data.flags) return data;
    if (data.flags.introForestTrace === undefined) {
      data.flags.introForestTrace = !!data.flags.talkedProf || !!(data.flags.defeated && data.flags.defeated.bekkyeomon);
    }
    data.v = 5;
    return data;
  }

  // v5→v6: 따라 첫 조우 전용 연출 플래그. 이미 따라를 되돌렸거나 마을까지 진행한 세이브는 본 것으로 승계한다.
  function migrateSlotV6(data) {
    if (!data || !data.flags) return data;
    if (data.flags.ttaraFirstEncounter === undefined) {
      data.flags.ttaraFirstEncounter = !!(data.flags.defeated && data.flags.defeated.bekkyeomon);
    }
    data.v = 6;
    return data;
  }

  // v6→v7: 개인정보 그림자 접촉 페널티(노출도) 기본값. 기존 세이브는 안전 상태에서 시작한다.
  function migrateSlotV7(data) {
    if (!data || !data.flags) return data;
    const f = data.flags;
    if (f.privacyLeak === undefined) f.privacyLeak = 0;
    if (f.privacyRecovery === undefined) f.privacyRecovery = 0;
    if (f.privacyRecoveryActive === undefined) f.privacyRecoveryActive = false;
    data.v = 7;
    return data;
  }

  // v7→v8: 프롤로그 마무리/숲 안쪽 조사 표식 기본값. 이미 따라를 되돌린 세이브는 1장 진입 흐름을 본 것으로 승계한다.
  function migrateSlotV8(data) {
    if (!data || !data.flags) return data;
    const f = data.flags;
    if (f.prologueClosed === undefined) f.prologueClosed = !!(f.defeated && f.defeated.bekkyeomon);
    if (f.forestClearingRead === undefined) f.forestClearingRead = false;
    data.v = 8;
    return data;
  }

  function loadSlot(i) {
    try {
      const raw = localStorage.getItem(slotKey(i));
      return raw ? migrateSlotV8(migrateSlotV7(migrateSlotV6(migrateSlotV5(migrateSlotV4(migrateSlotV3(JSON.parse(raw))))))) : null;
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

  const SAVE_VERSION = 8;
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

  // 챕터 진행 라벨 (타이틀 슬롯 표시용) — 프롤로그 → 1~5장 → 파이널
  function chapterProgressLabel(flags) {
    const d = (flags && flags.defeated) || {};
    if (flags.chapter5Clear) return '파이널';
    if (flags.chapter4Clear) return '5장';
    if (flags.chapter3Clear) return '4장';
    if (flags.chapter2Clear) return '3장';
    if (flags.chapter1Clear) return '2장';
    if (d.bekkyeomon) return '1장';
    return '프롤로그';
  }

  // 슬롯 요약 (타이틀 표시용). 없으면 null.
  function slotSummary(i) {
    const s = loadSlot(i);
    if (!s || !s.flags) return null;
    return {
      name: sanitizeName(s.name),
      stage: chapterProgressLabel(s.flags),
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
  const DIFF_LABEL = { easy: '포근하게', normal: '보통', hard: '매콤하게' };
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
      s.lowGraphics = !!s.lowGraphics;
      return s;
    } catch (e) { return { textSpeed: 'normal', largeText: false, colorBlind: false, difficulty: 'normal', tts: false, reduceFx: prefersReduce, lowGraphics: false }; }
  }
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        textSpeed: game.textSpeed, largeText: game.largeText, colorBlind: game.colorBlind,
        difficulty: game.difficulty, tts: game.tts, reduceFx: game.reduceFx, lowGraphics: game.lowGraphics,
      }));
    } catch (e) { noteStorageFail(); }
  }
  function toggleReduceFx() {
    game.reduceFx = !game.reduceFx;
    saveSettings();
    Sound.blip();
  }
  function toggleLowGraphics() {
    game.lowGraphics = !game.lowGraphics;
    saveSettings();
    checkDPR();
    try { tileCache.clear(); } catch (e) {}
    game.notice = { text: game.lowGraphics ? '저사양 그래픽 ON — 화면 효과와 해상도를 낮췄다' : '저사양 그래픽 OFF', t: 140 };
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
  function monName(id) { const m = MONSTERS[id]; return (m && m.name) || id; }
  function okColor() { return game.colorBlind ? '#3b8ed0' : '#5cb85c'; }   // 정답·높음
  function warnColor() { return game.colorBlind ? '#e69f00' : '#ffd644'; } // 보통
  function badColor() { return game.colorBlind ? '#d55e00' : '#e0453a'; }  // 오답·낮음

  // ---------- 학생(슬롯)별 학습 데이터 ----------
  // 일지·복습 노트·통계는 "이 슬롯을 쓰는 학생"의 개인 기록이다.
  // 슬롯마다 따로 누적되고, 슬롯을 지우면 함께 지워진다.
  // (친구 수첩·발견 엔딩은 기기 공용 컬렉션으로 그대로 둔다.)
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

  // 슬롯 삭제 시 학습 데이터도 함께 지운다 (방탈출 퍼즐 진행 로그 포함)
  function clearSlotLearning(slot) {
    try {
      localStorage.removeItem(statsKey(slot));
      localStorage.removeItem(mistakesKey(slot));
      localStorage.removeItem(metaKey(slot));
      localStorage.removeItem(puzzleKey(slot));
      // 지운 슬롯이 메모이즈 캐시에 남아 있으면 무효화(다음 getPuzzleLog가 빈 값을 반환하게)
      if (puzzleLogCache && puzzleLogCache.slot === slot) puzzleLogCache = null;
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
    { id: 'collector', name: '마음 기록가', desc: '친구 수첩 절반 이상 채우기', check: (c) => c.dex > 0 && c.dex * 2 >= c.dexTotal },
    { id: 'champion', name: '챌린지 챔피언', desc: '퀴즈 챌린지 만점', check: (c) => c.challengeBest > 0 && c.challengeBest === c.challengeBestTotal },
    { id: 'master', name: '마음의 수호자', desc: '엔딩 보고 도전과제 8개 달성', check: (c) => c.endings >= 1 && c.achieved >= 8 },
  ];
  const THEMES = [
    { id: 'classic', name: '클래식', color: '#ffd644', desc: '기본 노란빛', check: () => true },
    { id: 'forest', name: '숲빛', color: '#5cb85c', desc: '첫 마음 되돌리기', check: (c) => c.defeatedCount >= 1 },
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
      keys.push(slotKey(i), statsKey(i), mistakesKey(i), metaKey(i), cosmeticKey(i), puzzleKey(i));
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
  // 친구 수첩 — 만난 아이의 기록. 세이브와 별개로 누적 보존된다.
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
    if (e.key === 't' || e.key === 'T') {
      // 타이틀 화면에서는 「선생님 방」(교사 전용 메뉴)을 연다 — 그 외에는 기존대로 자막 속도.
      if (game.mode === 'title' && game.titleScreen === 'slots') { openTeacherRoom(); return; }
      if (game.mode === 'teacher') { closeTeacherRoom(); return; }
      cycleTextSpeed();
      return;
    }
    if (e.key === 'g' || e.key === 'G') { toggleLargeText(); return; }
    if (e.key === 'h' || e.key === 'H') {
      if (game.mode === 'hint') { advanceHint(); return; }
      if (game.mode === 'world' && game.puzzleRun) { openHint(); return; }
      return;
    }
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
    // 대시보드(P)·커스텀 퀴즈 편집(E)·수료증(N) 직접 단축키는 제거되었다 —
    // 이제 「선생님 방」(타이틀에서 T)을 통해서만 연다(스텔스 교육 원칙).
    if (e.key === 'l' || e.key === 'L') { // 배움 카드(Learn)
      if (game.mode === 'world') { openCards('world'); return; }
      if (game.mode === 'title' && game.titleScreen === 'slots') { openCards('title'); return; }
      if (game.mode === 'cards') { closeCards(); return; }
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
  let isTouchDevice = false;
  if ('ontouchstart' in window) {
    isTouchDevice = true;
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

    // 「선생님」 버튼 — 타이틀(슬롯 화면)에서만 보임(CSS: body.touch.title-slots). 키보드
    // T와 달리 자체 로직으로 처리한다(터치 전용 진입점이라 KEYMAP 흐름을 안 탄다).
    const teacherBtn = document.getElementById('t-teacher');
    if (teacherBtn) {
      const onTeacher = (e) => {
        e.preventDefault(); Sound.resume();
        if (game.mode === 'title' && game.titleScreen === 'slots') openTeacherRoom();
      };
      teacherBtn.addEventListener('touchstart', onTeacher);
    }

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
      const onHint = (e) => { e.preventDefault(); Sound.resume(); if (game.mode === 'world' && game.puzzleRun) openHint(); };
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

  // 자비로 마음을 되돌린 인물은 그 자리에 '친구'로 남는다 (선택이 세계에 남는다)
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
      case '6': { // 네온 아치 문 (전부 공짜 거리 — 구역 입구들)
        px(0, 0, 16, 16, '#3a2340');
        px(2, 1, 12, 14, '#5a2a6a');
        px(3, 2, 10, 13, '#1a1020');
        const neon = frame ? '#ff6ad5' : '#ffa8e6';
        px(2, 1, 12, 1, neon);
        px(2, 1, 1, 6, neon);
        px(13, 1, 1, 6, neon);
        px(5, 4, 6, 8, frame ? '#8a4fd6' : '#a86ae0');
        px(6, 5, 4, 6, frame ? '#ffd644' : '#fff2a8'); // 반짝이는 "무료"
        break;
      }
      case '7': { // 금고문/주인의 방 문 (낡은 나무문 — 거리·주인의 방)
        px(0, 0, 16, 16, '#2a2018');
        px(3, 1, 10, 14, '#5a3d24');
        px(4, 2, 8, 13, '#7c5830');
        px(4, 2, 1, 13, '#9a6f3e');
        px(11, 2, 1, 13, '#3e2a18');
        px(9, 8, 2, 2, '#d0b060'); // 손잡이
        break;
      }
      case '8': { // 기울어진 포장 (기울어진 거리) — 사선 줄무늬가 한쪽으로 쏠린 바닥
        px(0, 0, 16, 16, '#4a4658');
        for (let i = -3; i < 16; i += 4) {
          for (let k = 0; k < 16; k++) {
            const x = i + Math.floor(k / 2); // 완만한 사선
            if (x >= 0 && x < 16) px(x, k, 1, 1, '#565064');
          }
        }
        px(2, 12, 3, 1, '#3c3848'); // 갈라진 틈
        px(10, 4, 4, 1, '#3c3848');
        break;
      }
      case '9': { // 칙칙한 문 (반짝이지 않는 문 — 메아리 골목의 출구들)
        px(0, 0, 16, 16, '#3a3a42');
        px(3, 1, 10, 14, '#55555e');
        px(4, 2, 8, 13, '#6a6a74');
        px(4, 2, 1, 13, '#7c7c86');
        px(11, 2, 1, 13, '#4a4a52');
        px(9, 8, 2, 2, '#8a8a94'); // 손잡이 (광 없음)
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

  // ---------- 방탈출 퍼즐 (T2 프레임워크) ----------
  // 퍼즐 로그: 슬롯별 localStorage. { <puzzleId>: { done, clears, hintsUsed:{단계:횟수}, wrongTries, timeFrames } }
  const PUZZLE_KEY = 'ai-ethics-adventure-puzzle';
  function puzzleKey(slot) { return PUZZLE_KEY + '-' + slot; }
  // 슬롯별 메모이즈 캐시 — { slot, raw(캐시 당시의 localStorage 원문), data(파싱 결과) }.
  // raw 문자열이 그대로면 JSON.parse를 건너뛴다(자주 호출되는 isPuzzleCleared 등의 비용 절감).
  // writePuzzleLog가 쓰면 raw가 바뀌어 자동 무효화되고, 슬롯이 바뀌어도 자동 무효화된다.
  let puzzleLogCache = null;
  function getPuzzleLog(slot) {
    let raw;
    try { raw = localStorage.getItem(puzzleKey(slot)); } catch (e) { raw = undefined; }
    if (puzzleLogCache && puzzleLogCache.slot === slot && puzzleLogCache.raw === raw) {
      return puzzleLogCache.data;
    }
    let data;
    try { data = JSON.parse(raw) || {}; } catch (e) { data = {}; }
    puzzleLogCache = { slot, raw, data };
    return data;
  }
  function writePuzzleLog(slot, data) {
    try {
      const raw = JSON.stringify(data);
      localStorage.setItem(puzzleKey(slot), raw);
      puzzleLogCache = { slot, raw, data };
    } catch (e) {
      noteStorageFail();
      puzzleLogCache = null; // 쓰기 실패 — 다음 조회는 저장소에서 다시 읽는다
    }
  }
  function puzzleEntry(log, id) {
    if (!log[id]) log[id] = { done: false, clears: 0, hintsUsed: {}, wrongTries: 0, timeFrames: 0 };
    return log[id];
  }
  function recordPuzzleHint(id, step) {
    const slot = game.currentSlot;
    const log = getPuzzleLog(slot);
    const e = puzzleEntry(log, id);
    e.hintsUsed[step] = (e.hintsUsed[step] || 0) + 1;
    writePuzzleLog(slot, log);
  }
  function recordPuzzleWrong(id) {
    const slot = game.currentSlot;
    const log = getPuzzleLog(slot);
    puzzleEntry(log, id).wrongTries += 1;
    writePuzzleLog(slot, log);
  }
  function recordPuzzleClear(id, frames) {
    const slot = game.currentSlot;
    const log = getPuzzleLog(slot);
    const e = puzzleEntry(log, id);
    e.done = true; e.clears += 1; e.timeFrames += frames;
    writePuzzleLog(slot, log);
  }
  // 방을 클리어한 적이 있는지 (금고문 개방 판정 등)
  function isPuzzleCleared(id) {
    const e = getPuzzleLog(game.currentSlot)[id];
    return !!(e && e.done);
  }
  // 1장 금고 잠금 — 구역(접수처·게시판 광장·배달 창고)을 클리어할 때마다 하나씩 풀린다
  function s1LockCount() {
    return S1_ZONE_PUZZLES.filter((id) => isPuzzleCleared(id)).length;
  }
  // 2장 저울 — 구역(메아리 골목·표본 창고·꺼진 거리)을 클리어할 때마다 기울기가 하나 준다.
  // s2ClearCount()가 클리어한 구역 수, 저울 기울기 = 3 - s2ClearCount().
  function s2ClearCount() {
    return S2_ZONE_PUZZLES.filter((id) => isPuzzleCleared(id)).length;
  }
  // 3장 신문사 — 층(제보함·편집실·송출탑)을 클리어할 때마다 진행도가 하나 는다.
  // 층 개방 자체는 needPuzzleClear로 개별 강제되므로, 이 값은 허브 HUD 표시 전용이다.
  function s3ClearCount() {
    return S3_ZONE_PUZZLES.filter((id) => isPuzzleCleared(id)).length;
  }
  // 4장 정문 게이트 — 열쇠 두 개(비밀조각·본인표)를 모두 모아야 열린다 (needS4Keys)
  function s4KeyCount() {
    return (game.flags.s4KeySecret ? 1 : 0) + (game.flags.s4KeyId ? 1 : 0);
  }
  // 광고 딱지 HUD 오염 — 룰렛 스핀·반짝 보스 tempt 접촉마다 하나씩 붙는다(최대 4개).
  // 해지 단말(구역① 룰렛 광장)로만 전부 제거된다.
  function addAdSticker() {
    game.flags.adStickers = Math.min(4, (game.flags.adStickers || 0) + 1);
  }
  // 5장 현관 게이트 — 구역 3개(전화의 방·잠긴 복도·소파 코너)를 모두 클리어해야 열린다
  function s5ClearCount() {
    return S5_ZONE_PUZZLES.filter((id) => isPuzzleCleared(id)).length;
  }
  // 5장 허브 「포근한 집」 — 루미의 목소리 안내. 처음 5회는 진짜 유용한 정보로 신뢰를 쌓고,
  // 이후엔 소유적으로 변한다(flags.lumiTrust로 진행). 허브(cozyhome)에 도착할 때마다 호출된다.
  const LUMI_HUB_LINES = [
    '루미: "어서 와. 전화가 울려도, 급하게 받지 않아도 괜찮아."',
    '루미: "복도 안쪽 문은 나중에 열어도 돼. 서두르지 마."',
    '루미: "소파에 앉으면 참 따뜻해. 일어나고 싶을 땐 방향키를 잠깐 꾹 눌러 봐."',
    '루미: "세 곳을 다 확인하면, 현관문이 열릴 거야."',
    '루미: "…너, 생각보다 씩씩하네. 그런 사람, 나도 좋아해."',
    '루미: "그 문은 위험해. 나만 믿어."',
    '루미: "밖에 나가지 마. 내가 다 알아서 해 줄게."',
    '루미: "…왜 자꾸 나가려고 해? 그냥 나랑 있으면 되잖아."',
    '루미: "가지 마. …제발, 나만 있으면 안 돼?"',
  ];
  function advanceLumiVoice() {
    const idx = game.flags.lumiTrust || 0;
    const line = LUMI_HUB_LINES[Math.min(idx, LUMI_HUB_LINES.length - 1)];
    game.flags.lumiTrust = idx + 1;
    save();
    game.notice = { text: line, t: 200 };
  }

  // 방 입장/퇴장에 맞춰 런타임 상태를 맞춘다 (checkWarp에서 호출)
  function syncPuzzleRun() {
    const puz = getPuzzleForMap(game.map);
    if (puz) {
      if (!game.puzzleRun || game.puzzleRun.map !== game.map) startPuzzleRun(puz);
    } else {
      game.puzzleRun = null;
    }
  }
  function startPuzzleRun(puzzle) {
    const run = {
      id: puzzle.id,
      map: puzzle.map,
      puzzle,
      stalkers: [],     // { px, py } (traces 전용이지만 그리기 루프 공용이라 항상 배열)
      timeFrames: 0,    // 입장~클리어 프레임 누적 (자체 카운터)
      flashT: 0,        // 접촉/오답 화면 플래시
      warnCool: 0,      // 경고 대사 스로틀
    };
    if (puzzle.type === 'copies') {
      // 구역②: 떠도는 내 정보 사본 — 플레이어를 피해 도망친다 (0.7배속)
      run.copies = puzzle.copies.map((c, i) => ({ px: c.x * TS, py: c.y * TS, seed: i * 47, got: false }));
      run.collected = 0;
    } else if (puzzle.type === 'levers') {
      // 구역③: 컨베이어 상자 + 차단 레버
      run.boxIdx = 0;   // 지금 벨트를 흐르는 상자 (puzzle.boxes 인덱스)
      run.diverted = 0; // 반송함으로 돌린 상자 수 (3이면 클리어)
    } else if (puzzle.type === 'voices') {
      // 2장 구역①: 다른 목소리 수집 + 반짝 문 루프 카운트
      run.voices = [];  // 들은 목소리 NPC id들
      run.loops = 0;    // 반짝 문 루프 횟수 (연출 단계)
    } else if (puzzle.type === 'retrain') {
      // 2장 구역②: 반례 사진 수집 + 판독기 투입
      run.photos = 0;   // 챙긴 반례 사진 수 (최대 3)
      run.taken = [];   // 이미 챙긴 선반 인덱스
      run.fed = 0;      // 판독기에 투입한 수 (3이면 클리어)
    } else if (puzzle.type === 'lamps') {
      // 2장 구역③: 램프 점등
      run.lit = puzzle.lamps.map(() => false);
      run.litCount = 0;
    } else if (puzzle.type === 'tips') {
      // 3장 1층: 제보 쪽지 채택 — resolved(채택 완료 인덱스), correct(출처 있는 채택 수)
      run.resolved = [];
      run.correct = 0;
      run.busted = puzzle.notes.map(() => false); // [속보]로 벽에 붙은 쪽지
    } else if (puzzle.type === 'compare') {
      // 3장 2층: 원본 대조 — solved(지목 완료 인덱스)
      run.solved = puzzle.photos.map(() => false);
      run.solvedCount = 0;
    } else if (puzzle.type === 'broadcast') {
      // 3장 3층: 정정 보도 3단계 — stage 0(정정문)→1(출처)→2(레버)
      run.stage = 0;
    } else if (puzzle.type === 'roulette') {
      // 4장 구역①: 룰렛(미끼) + 창고 열쇠
      run.spins = 0;    // 룰렛을 돌린 횟수(광고 딱지 누적 — 순전히 미끼)
      run.gotKey = false;
    } else if (puzzle.type === 'signup') {
      // 4장 구역②: 갈림길 표지판 통과 여부 + 오답 횟수
      run.passed = false;
      run.wrong = 0;
    } else if (puzzle.type === 'backstage') {
      // 4장 구역③: 마스터키 함정 사용 여부 + 안쪽 문 개방 여부
      run.trapUsed = false;
      run.opened = false;
    } else if (puzzle.type === 'call') {
      // 5장 구역①: 루미의 경고 횟수(3회) 후 4번째 조사에 전화를 받는다
      run.warnCount = 0;
    } else if (puzzle.type === 'checkdoor') {
      // 5장 구역②: 문을 직접 열었는지 여부
      run.opened = false;
    } else if (puzzle.type === 'sofa') {
      // 5장 구역③: 앉음 여부 + 일어나기 버티기 게이지(held 90프레임)
      run.sitting = false;
      run.standTimer = 0;
    } else {
      // 구역①(traces): 정보 토큰 방
      run.held = { nickname: true, school: true, address: true, phone: true, face: true };
      run.given = [];        // 되돌릴 수 있게 내준 토큰 키들
      run.boardFace = false; // 게시판에 공유한 얼굴사진(영구 — 지울 수 없음)
      run.maxBoard = 0;      // 방 플레이 중 내보낸 정보 최고치(닉네임 제외) — 보스 콜백 인트로용
    }
    game.puzzleRun = run;
  }
  const PRIVACY_LEAK_MAX = 5;
  const PRIVACY_RECOVERY_NEED = 3;

  function privacyLeak() { return Math.max(0, Math.min(PRIVACY_LEAK_MAX, game.flags.privacyLeak || 0)); }
  function privacyPressureProfile(n) {
    const level = Math.max(0, Math.min(PRIVACY_LEAK_MAX, n || 0));
    const table = [
      { label: '안전', stalkerWanted: 0, noise: '조용함' },
      { label: '찜찜한 시선', stalkerWanted: 1, noise: '시선' },
      { label: '이름이 불림', stalkerWanted: 1, noise: '속삭임' },
      { label: '따라붙는 광고', stalkerWanted: 2, noise: '광고' },
      { label: '문 앞 확인 증가', stalkerWanted: 2, noise: '확인요구' },
      { label: '회복 필요', stalkerWanted: 3, noise: '추적' },
    ];
    return Object.assign({ level }, table[level]);
  }
  function privacyLevelLabel(n) { return privacyPressureProfile(n).label; }
  function ch1StreetVisualProfile(n, lowGraphics) {
    const level = Math.max(0, Math.min(PRIVACY_LEAK_MAX, n || 0));
    const low = !!lowGraphics;
    return {
      level,
      adSigns: low ? Math.min(3, 1 + Math.floor(level / 2)) : Math.min(8, 2 + level),
      sensors: low ? Math.min(2, Math.floor(level / 3)) : Math.min(3, Math.floor((level + 1) / 2)),
      labelShadows: low ? Math.min(2, level >= 4 ? 2 : level >= 2 ? 1 : 0) : Math.min(4, level),
      glow: !low && level >= 3,
      scanLines: false,
    };
  }
  function chapter2HubVisualProfile(n, lowGraphics) {
    const level = Math.max(0, Math.min(3, n || 0));
    const low = !!lowGraphics;
    return {
      level,
      recommendSigns: low ? Math.min(2, 1 + Math.floor(level / 3)) : Math.min(5, 2 + level),
      echoMarks: low ? 1 : Math.min(3, 1 + level),
      labels: !low,
      fullScreenSkew: false,
    };
  }
  function chapter3HubVisualProfile(n, rumorFixed, lowGraphics) {
    const level = Math.max(0, Math.min(3, n || 0));
    const fixed = !!rumorFixed;
    const low = !!lowGraphics;
    return {
      level,
      fixed,
      headlineSigns: fixed ? (low ? 1 : 2) : (low ? Math.min(2, 1 + Math.floor(level / 2)) : Math.min(6, 3 + level)),
      echoMarks: fixed ? (low ? 0 : 1) : (low ? 1 : Math.min(3, 1 + level)),
      labels: !low,
      fullScreenNoise: false,
    };
  }
  function chapter4HubVisualProfile(n, lowGraphics) {
    const level = Math.max(0, Math.min(4, n || 0));
    const low = !!lowGraphics;
    return {
      level,
      neonSigns: low ? Math.min(3, 1 + Math.floor(level / 2)) : Math.min(6, 2 + level),
      confetti: low ? 1 : Math.min(3, 1 + Math.floor(level / 2)),
      labels: !low,
      fullScreenFlash: false,
    };
  }
  function chapter5HubVisualProfile(n, lowGraphics) {
    const level = Math.max(0, Math.min(3, n || 0));
    const low = !!lowGraphics;
    return {
      level,
      warmLamps: low ? Math.min(2, 1 + Math.floor(level / 2)) : Math.min(5, 2 + level),
      voiceRipples: low ? 1 : Math.min(3, 1 + level),
      labels: !low,
      fullScreenBlur: false,
    };
  }
  function addPrivacyLeak(reason) {
    const before = privacyLeak();
    const after = Math.min(PRIVACY_LEAK_MAX, before + 1);
    game.flags.privacyLeak = after;
    if (after >= PRIVACY_LEAK_MAX) {
      game.flags.privacyRecoveryActive = true;
      if (!game.flags.privacyRecovery) game.flags.privacyRecovery = 0;
      game.notice = { text: '노출도 MAX — 지우개로 흩어진 정보 조각 3개를 회수하자', t: 210 };
    } else if (after >= 3) {
      game.notice = { text: `노출도 ${after}/5 — 가짜 광고와 그림자가 더 따라붙는다`, t: 160 };
    } else {
      game.notice = { text: `노출도 ${after}/5 — ${reason || '정보 그림자가 붙었다'}`, t: 140 };
    }
    save();
  }
  function notePrivacyRecoveryPiece() {
    if (!game.flags.privacyRecoveryActive) return;
    game.flags.privacyRecovery = Math.min(PRIVACY_RECOVERY_NEED, (game.flags.privacyRecovery || 0) + 1);
    if (game.flags.privacyRecovery >= PRIVACY_RECOVERY_NEED) {
      game.flags.privacyLeak = 2;
      game.flags.privacyRecovery = 0;
      game.flags.privacyRecoveryActive = false;
      game.notice = { text: '회복 완료 — 노출도 2/5로 낮아졌다', t: 180 };
      Sound.correct();
    } else {
      game.notice = { text: `정보 조각 회수 ${game.flags.privacyRecovery}/${PRIVACY_RECOVERY_NEED}`, t: 140 };
    }
    save();
  }

  // 지금 밖에 내보낸 토큰 (되돌릴 수 있는 것 + 게시판 공유 얼굴사진)
  function givenTokens(run) {
    return run.given.concat(run.boardFace ? ['face'] : []);
  }
  // 프로필 보드 카운트 (닉네임 제외) — 3 이상이면 스토커
  function boardCount(run) {
    return givenTokens(run).filter((k) => k !== 'nickname').length;
  }
  // 상태에서 현재 단계 유도 — 힌트가 이 단계를 따라간다
  function puzzleStep(run) {
    if (run.puzzle.type === 'copies') return 'copies';
    if (run.puzzle.type === 'levers') return 'levers';
    if (run.puzzle.type === 'voices') return 'voices';
    if (run.puzzle.type === 'retrain') return 'retrain';
    if (run.puzzle.type === 'lamps') return 'lamps';
    if (run.puzzle.type === 'tips') return 'tips';
    if (run.puzzle.type === 'compare') return 'compare';
    if (run.puzzle.type === 'broadcast') return ['correct', 'source', 'lever'][run.stage] || 'lever';
    if (run.puzzle.type === 'roulette') return 'roulette';
    if (run.puzzle.type === 'signup') return 'signup';
    if (run.puzzle.type === 'backstage') return 'backstage';
    if (run.puzzle.type === 'call') return 'call';
    if (run.puzzle.type === 'checkdoor') return 'checkdoor';
    if (run.puzzle.type === 'sofa') return 'sofa';
    const spent = givenTokens(run);
    if (spent.length === 0) return 'tokens';
    if (spent.filter((k) => k !== 'nickname').length >= 3) return 'eraser';
    if (run.boardFace) return 'board';
    return 'exit';
  }
  function spawnStalker(run) {
    // 플레이어에서 먼 구석에서 등장
    const p = game.player;
    const far = p.x < 10 ? { x: 17, y: 2 } : { x: 2, y: 2 };
    run.stalkers.push({ px: far.x * TS, py: far.y * TS });
  }
  // 보드 카운트에 맞춰 스토커를 스폰/소멸 (3 이상이면 최소 1, 미만이면 전부 소멸)
  function refreshStalkers(run) {
    if (boardCount(run) >= 3) {
      const leak = privacyLeak();
      const wanted = Math.max(1, privacyPressureProfile(leak).stalkerWanted);
      while (run.stalkers.length < wanted) spawnStalker(run);
      if (run.stalkers.length > wanted) run.stalkers.length = wanted;
    } else {
      run.stalkers.length = 0;
      run.flashT = 0;
    }
  }
  // 매 프레임: 시간 누적 + 구역별 움직이는 물체 갱신
  function updatePuzzleWorld() {
    const run = game.puzzleRun;
    run.timeFrames += 1;
    if (run.flashT > 0) run.flashT -= 1;
    if (run.warnCool > 0) run.warnCool -= 1;
    if (run.puzzle.type === 'copies') { updateCopies(run); return; }
    if (run.puzzle.type === 'levers') return; // 컨베이어 상자는 timeFrames로 그리기에서 움직인다
    // 2장 구역들은 조사·접촉으로만 진행 (매 프레임 갱신할 물체 없음)
    if (run.puzzle.type === 'voices' || run.puzzle.type === 'retrain' || run.puzzle.type === 'lamps') return;
    // 3장 구역들도 조사·선택으로만 진행 (매 프레임 갱신할 물체 없음)
    if (run.puzzle.type === 'tips' || run.puzzle.type === 'compare' || run.puzzle.type === 'broadcast') return;
    // 4장 구역들도 조사·선택으로만 진행 (매 프레임 갱신할 물체 없음)
    if (run.puzzle.type === 'roulette' || run.puzzle.type === 'signup' || run.puzzle.type === 'backstage') return;
    // 5장 구역들 — call/checkdoor는 조사로만 진행. sofa의 버티기 타이머는
    // updateWorld()에서 별도로 처리한다(이동을 잠가야 하므로).
    if (run.puzzle.type === 'call' || run.puzzle.type === 'checkdoor' || run.puzzle.type === 'sofa') return;
    // ── traces: 스토커 추격(반 속도, walkable 체크) + 접촉 처리 ──
    if (boardCount(run) > run.maxBoard) run.maxBoard = boardCount(run); // 최고치 추적
    const p = game.player;
    const spd = MOVE_SPEED * 0.5;
    for (const s of run.stalkers) {
      const dx = p.px - s.px, dy = p.py - s.py;
      const dist = Math.hypot(dx, dy) || 1;
      const sx = dx / dist * spd, sy = dy / dist * spd;
      // 축별 walkable 체크 (벽을 통과하지 않게)
      if (!SOLID(tileAt(game.map, Math.round((s.px + sx) / TS), Math.round(s.py / TS)))) s.px += sx;
      if (!SOLID(tileAt(game.map, Math.round(s.px / TS), Math.round((s.py + sy) / TS)))) s.py += sy;
      if (Math.hypot(p.px - s.px, p.py - s.py) < TS * 0.5) {
        run.flashT = 8;
        if (run.warnCool <= 0) {
          run.warnCool = 90; // 연속 접촉 스로틀
          addPrivacyLeak('정보 그림자가 붙었다');
          refreshStalkers(run);
          Sound.bump();
        }
      }
    }
  }
  // 구역②: 떠도는 사본 — 플레이어를 피해 도망(0.7배속, 스토커 이동 로직 재활용).
  // 붙잡으면(접촉) 회수. 3개를 모두 회수하면 클리어.
  function updateCopies(run) {
    const p = game.player;
    for (const c of run.copies) {
      if (c.got) continue;
      const dx = c.px - p.px, dy = c.py - p.py;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < TS * 7) {
        // 가까우면 도망 (플레이어 이동의 0.7배속 — 결국 따라잡힌다)
        const spd = MOVE_SPEED * 0.7;
        const sx = dx / dist * spd, sy = dy / dist * spd;
        if (!SOLID(tileAt(game.map, Math.round((c.px + sx) / TS), Math.round(c.py / TS)))) c.px += sx;
        if (!SOLID(tileAt(game.map, Math.round(c.px / TS), Math.round((c.py + sy) / TS)))) c.py += sy;
      } else {
        // 멀면 종이처럼 하늘하늘 떠다닌다
        const sx = Math.sin((game.time + c.seed) / 40) * 0.6;
        const sy = Math.cos((game.time + c.seed) / 52) * 0.6;
        if (!SOLID(tileAt(game.map, Math.round((c.px + sx) / TS), Math.round(c.py / TS)))) c.px += sx;
        if (!SOLID(tileAt(game.map, Math.round(c.px / TS), Math.round((c.py + sy) / TS)))) c.py += sy;
      }
      if (Math.hypot(p.px - c.px, p.py - c.py) < TS * 0.7) {
        c.got = true;
        run.collected += 1;
        Sound.correct();
        game.notice = { text: `내 조각을 되찾았다! (${run.collected}/3)`, t: 120 };
        if (run.collected >= 3) { clearPuzzle(run); return; }
      }
    }
  }
  // 퍼즐 물체(단말·게시판·지우개·출구·레버·반송함) — 좌표로 판정 (이동 차단 + 상호작용)
  function puzzleObjAt(mapId, x, y) {
    const run = game.puzzleRun;
    if (!run || run.map !== mapId) return null;
    const puz = run.puzzle;
    if (puz.type === 'copies') return null; // 광장의 사본은 접촉(추격)으로만 회수
    if (puz.type === 'voices') return null; // 다른 목소리는 NPC 대화로만 수집
    if (puz.type === 'levers') {
      for (const lv of puz.levers) if (lv.x === x && lv.y === y) return { kind: 'lever', ref: lv };
      if (puz.returnBin.x === x && puz.returnBin.y === y) return { kind: 'bin' };
      return null;
    }
    if (puz.type === 'retrain') {
      for (let i = 0; i < puz.photos.length; i++) {
        const ph = puz.photos[i];
        if (ph.x === x && ph.y === y) return { kind: 'photo', idx: i };
      }
      if (puz.reader.x === x && puz.reader.y === y) return { kind: 'reader' };
      return null;
    }
    if (puz.type === 'lamps') {
      for (let i = 0; i < puz.lamps.length; i++) {
        const lp = puz.lamps[i];
        if (lp.x === x && lp.y === y) return { kind: 'lamp', idx: i };
      }
      return null;
    }
    if (puz.type === 'tips') {
      for (let i = 0; i < puz.notes.length; i++) {
        const n = puz.notes[i];
        if (n.x === x && n.y === y) return { kind: 'tipnote', idx: i };
      }
      if (puz.submitBox.x === x && puz.submitBox.y === y) return { kind: 'tipbox' };
      return null;
    }
    if (puz.type === 'compare') {
      for (let i = 0; i < puz.photos.length; i++) {
        const ph = puz.photos[i];
        if (ph.x === x && ph.y === y) return { kind: 'cphoto', idx: i };
      }
      return null;
    }
    if (puz.type === 'broadcast') {
      if (puz.terminal1.x === x && puz.terminal1.y === y) return { kind: 'bterm1' };
      if (puz.terminal2.x === x && puz.terminal2.y === y) return { kind: 'bterm2' };
      if (puz.lever.x === x && puz.lever.y === y) return { kind: 'blever' };
      return null;
    }
    if (puz.type === 'roulette') {
      for (let i = 0; i < puz.roulettes.length; i++) {
        const r = puz.roulettes[i];
        if (r.x === x && r.y === y) return { kind: 'roulette', idx: i };
      }
      if (puz.unsub.x === x && puz.unsub.y === y) return { kind: 'unsub' };
      if (puz.chest.x === x && puz.chest.y === y) return { kind: 'chest' };
      return null;
    }
    if (puz.type === 'signup') {
      if (puz.fork.x === x && puz.fork.y === y) return { kind: 'fork' };
      if (puz.idchest.x === x && puz.idchest.y === y) return { kind: 'idchest' };
      return null;
    }
    if (puz.type === 'backstage') {
      if (puz.masterkey.x === x && puz.masterkey.y === y) return { kind: 'masterkey' };
      if (puz.authterm.x === x && puz.authterm.y === y) return { kind: 'authterm' };
      if (puz.door.x === x && puz.door.y === y) return { kind: 'offstagedoor' };
      return null;
    }
    if (puz.type === 'call') {
      if (puz.phone.x === x && puz.phone.y === y) return { kind: 'phone' };
      return null;
    }
    if (puz.type === 'checkdoor') {
      if (puz.door.x === x && puz.door.y === y) return { kind: 'checkdoor' };
      return null;
    }
    if (puz.type === 'sofa') {
      if (puz.sofa.x === x && puz.sofa.y === y) return { kind: 'sofaobj' };
      return null;
    }
    for (const t of puz.terminals) if (t.x === x && t.y === y) return { kind: 'terminal', ref: t };
    if (puz.eraser.x === x && puz.eraser.y === y) return { kind: 'eraser' };
    if (puz.exits.vip.x === x && puz.exits.vip.y === y) return { kind: 'vip' };
    if (puz.exits.normal.x === x && puz.exits.normal.y === y) return { kind: 'normal' };
    return null;
  }
  // 마주 본 물체와 상호작용 (interact에서 호출). 처리했으면 true.
  function interactPuzzle() {
    const run = game.puzzleRun;
    if (!run) return false;
    const f = facingTile();
    const obj = puzzleObjAt(game.map, f.x, f.y);
    if (!obj) return false;
    if (obj.kind === 'terminal') openTerminal(obj.ref);
    else if (obj.kind === 'eraser') openEraser();
    else if (obj.kind === 'vip') openVipExit();
    else if (obj.kind === 'normal') openNormalExit();
    else if (obj.kind === 'lever') openLever(obj.ref);
    else if (obj.kind === 'bin') openReturnBin();
    else if (obj.kind === 'photo') openPhoto(obj.idx);
    else if (obj.kind === 'reader') openReader();
    else if (obj.kind === 'lamp') openLamp(obj.idx);
    else if (obj.kind === 'tipnote') openTipNote(obj.idx);
    else if (obj.kind === 'tipbox') openTipBox();
    else if (obj.kind === 'cphoto') openComparePhoto(obj.idx);
    else if (obj.kind === 'bterm1') openBroadcastTerm1();
    else if (obj.kind === 'bterm2') openBroadcastTerm2();
    else if (obj.kind === 'blever') openBroadcastLever();
    else if (obj.kind === 'roulette') openRoulette(obj.idx);
    else if (obj.kind === 'unsub') openUnsub();
    else if (obj.kind === 'chest') openChest();
    else if (obj.kind === 'fork') openFork();
    else if (obj.kind === 'idchest') openIdChest();
    else if (obj.kind === 'masterkey') openMasterKey();
    else if (obj.kind === 'authterm') openAuthTerm();
    else if (obj.kind === 'offstagedoor') openOffstageDoor();
    else if (obj.kind === 'phone') openPhone();
    else if (obj.kind === 'checkdoor') openCheckDoor();
    else if (obj.kind === 'sofaobj') openSofa();
    return true;
  }
  // 2장 구역②: 반례 사진 선반 조사 → 수집 (라벨 개그 포함)
  function openPhoto(idx) {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (run.taken.includes(idx)) {
      startDialog(['…이미 챙긴 선반이다.'], puz.title);
      return;
    }
    run.taken.push(idx);
    run.photos += 1;
    Sound.correct();
    game.notice = { text: `반례 사진을 챙겼다! (${run.photos}/3)`, t: 120 };
    startDialog([puz.photos[idx].found], puz.title);
  }
  // 2장 구역②: 판독기 단말 — 반례 사진을 한 장씩 투입 (투입마다 판정 교정)
  function openReader() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const rd = puz.reader;
    const avail = run.photos - run.fed;
    if (avail <= 0) { startDialog([rd.empty], rd.name); return; }
    startChoice(`${rd.prompt}\n(가진 반례 사진 ${avail}장)`, ['넣는다', '그만둔다'], (i) => {
      if (i === 0) {
        const line = rd.steps[Math.min(run.fed, rd.steps.length - 1)];
        run.fed += 1;
        Sound.select();
        if (run.fed >= 3) { clearPuzzle(run); return; }
        startDialog([line, `(판독기에 ${run.fed}/3장 투입)`], rd.name);
      } else if (i > 0) {
        startDialog(['(판독기에서 손을 뗐다)'], rd.name);
      }
    });
  }
  // 2장 구역③: 램프 조사 → 점등 (3개면 클리어)
  function openLamp(idx) {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (run.lit[idx]) { startDialog(['이미 켜진 램프다.\n주변이 환하다.'], puz.title); return; }
    run.lit[idx] = true;
    run.litCount += 1;
    Sound.correct();
    game.notice = { text: `램프에 불을 켰다! (${run.litCount}/3)`, t: 120 };
    if (run.litCount >= 3) { clearPuzzle(run); return; }
    startDialog(['탁 — 램프에 불이 들어왔다.\n주변이 조금 환해진다.'], puz.title);
  }
  // 3장 1층: 제보 쪽지 조사 — 출처 유무를 읽어 본다 (채택은 채택함에서)
  function openTipNote(idx) {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const n = puz.notes[idx];
    if (run.resolved.includes(idx)) {
      startDialog([run.busted[idx]
        ? `${n.label}\n[속보]로 벽에 붙어 버렸다.`
        : `${n.label}\n이미 채택함에 넣었다.`], puz.title);
      return;
    }
    startDialog([n.text], puz.title);
  }
  // 3장 1층: 채택함 — 제보를 하나 골라 제출. 출처 있는 쪽지만 정답(2장이면 클리어)
  function openTipBox() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const remain = puz.notes.map((n, i) => i).filter((i) => !run.resolved.includes(i));
    if (!remain.length) { startDialog(['채택함이 가득 찼다.'], puz.submitBox.name); return; }
    const labels = remain.map((i) => puz.notes[i].label).concat(['그만두기']);
    startChoice('채택함. 어떤 제보를 채택할까요?', labels, (sel) => {
      if (sel < 0 || sel >= remain.length) return;
      const idx = remain[sel];
      const n = puz.notes[idx];
      run.resolved.push(idx);
      if (n.sourced) {
        run.correct += 1;
        Sound.correct();
        game.notice = { text: `출처 있는 제보를 채택했다! (${run.correct}/2)`, t: 120 };
        if (run.correct >= 2) { clearPuzzle(run); return; }
        startDialog([`「${n.label}」을(를) 채택함에 넣었다.\n출처가 확실하다.`], puz.title);
      } else {
        recordPuzzleWrong(run.id);
        run.busted[idx] = true;
        run.flashT = 10;
        Sound.wrong();
        startDialog([
          `「${n.label}」을(를) 채택했다…\n하지만 출처가 없었다!`,
          '다음 날, 벽에 대문짝만 하게\n[속보]로 붙어 버렸다.',
        ], puz.title);
      }
    });
  }
  // 3장 2층: 사진 조사 → 원본과 다른 점을 3지선다로 지목 (세 장 모두 맞히면 클리어)
  function openComparePhoto(idx) {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const ph = puz.photos[idx];
    if (run.solved[idx]) { startDialog([ph.found], puz.title); return; }
    const CLUE_TEXT = { flip: '좌우 반전', fingers: '손가락 6개', date: '날짜가 미래' };
    const clueIdx = puz.options.indexOf(CLUE_TEXT[ph.clue]);
    startChoice('원본과 실린 사진을 나란히 놓고 비교한다.\n무엇이 다를까?', puz.options.slice(), (sel) => {
      if (sel < 0) return;
      if (sel === clueIdx) {
        run.solved[idx] = true;
        run.solvedCount += 1;
        Sound.correct();
        game.notice = { text: `차이를 찾아냈다! (${run.solvedCount}/3)`, t: 120 };
        if (run.solvedCount >= 3) { clearPuzzle(run); return; }
        startDialog([ph.found], puz.title);
      } else {
        recordPuzzleWrong(run.id);
        run.flashT = 10;
        Sound.wrong();
        startDialog(['…아니다. 다시 봐야겠다.'], puz.title);
      }
    });
  }
  // 3장 3층 ①: 정정문 고르기 — 과장 없는 문장이 정답
  function openBroadcastTerm1() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (run.stage > 0) { startDialog(['이미 정정문을 골랐다.'], puz.terminal1.name); return; }
    const labels = puz.corrections.map((c) => c.text);
    startChoice('정정문 단말. 내보낼 문장을 고르세요.', labels, (sel) => {
      if (sel < 0) return;
      if (puz.corrections[sel].ok) {
        run.stage = 1;
        Sound.correct();
        startDialog(['…과장 없이, 있는 그대로.\n정정문이 정해졌다.'], puz.terminal1.name);
      } else {
        recordPuzzleWrong(run.id);
        run.flashT = 10;
        Sound.wrong();
        startDialog(['…이건 또 다른 헤드라인일 뿐이다.\n다시 골라야겠다.'], puz.terminal1.name);
      }
    });
  }
  // 3장 3층 ②: 출처 붙이기 — 1층 제보 중 출처 있는 것을 선택
  function openBroadcastTerm2() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (run.stage < 1) { startDialog(['정정문부터 골라야 한다.'], puz.terminal2.name); return; }
    if (run.stage > 1) { startDialog(['이미 출처를 붙였다.'], puz.terminal2.name); return; }
    const labels = puz.sources.map((s) => s.label);
    startChoice('출처 단말. 붙일 제보를 고르세요.', labels, (sel) => {
      if (sel < 0) return;
      if (puz.sources[sel].ok) {
        run.stage = 2;
        Sound.correct();
        startDialog(['출처가 붙었다.\n이제 레버만 남았다.'], puz.terminal2.name);
      } else {
        recordPuzzleWrong(run.id);
        run.flashT = 10;
        Sound.wrong();
        startDialog(['…출처가 없는 제보다.\n다시 골라야겠다.'], puz.terminal2.name);
      }
    });
  }
  // 3장 3층 ③: 송출 레버 — 당기면 클리어(ev_fix) + 허브 해제(rumorFixed)
  function openBroadcastLever() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (run.stage < 2) { startDialog(['아직 이르다.\n정정문과 출처부터 마쳐야 한다.'], puz.lever.name); return; }
    startChoice('송출 레버.\n지금 송출할까요? (되돌릴 수 없다)', ['당긴다', '그만둔다'], (i) => {
      if (i === 0) clearPuzzle(run);
      else if (i > 0) startDialog(['(레버에서 손을 뗐다)'], puz.lever.name);
    });
  }
  // ── 4장 구역① 「룰렛 광장」 ───────────────────────────────────────
  // 룰렛 단말 — 돌리면 "당첨!"과 함께 광고 딱지가 붙는다. 얻는 것은 없다(순전히 미끼).
  function openRoulette(idx) {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const r = puz.roulettes[idx];
    run.spins = (run.spins || 0) + 1;
    addAdSticker();
    Sound.select();
    startDialog([
      `${r.name}: 드르륵드르륵… "당첨!"`,
      '반짝이는 광고 딱지가\n화면 가장자리에 하나 더 붙었다.',
    ], r.name);
  }
  // 해지 단말 — 큰 「혜택 유지」 vs 작은 「해지」(다크패턴 체험). 해지해야 딱지가 사라진다.
  function openUnsub() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    startChoice(puz.unsub.ask, ['큼직한 「혜택 계속 받기」', '(구석의 작은 글씨) 해지'], (i) => {
      if (i === 0) startDialog([puz.unsub.keepReply], puz.unsub.name);
      else if (i === 1) {
        game.flags.adStickers = 0;
        save();
        startDialog([puz.unsub.cancelReply], puz.unsub.name);
      } else startDialog(['(창을 닫았다)'], puz.unsub.name);
    });
  }
  // 룰렛 뒤 창고 상자 — 비밀조각 열쇠(진짜 목표)
  function openChest() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (run.gotKey) { startDialog(['창고 안, 텅 빈 상자뿐이다.'], puz.chest.name); return; }
    run.gotKey = true;
    Sound.correct();
    clearPuzzle(run);
  }

  // ── 4장 구역② 「회원가입 골목」 ──────────────────────────────────
  // 갈림길 표지판 — 진짜 도메인을 고른다. 오답이면 함정에 걸려 입구로 되돌아간다.
  function openFork() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    startChoice(puz.fork.ask, puz.fork.options.map((o) => o.label), (i) => {
      if (i < 0) { startDialog(['(팻말 앞에서 잠시 멈췄다)'], puz.fork.name); return; }
      const opt = puz.fork.options[i];
      if (opt.ok) {
        run.passed = true;
        Sound.correct();
        startDialog([puz.fork.okReply], puz.fork.name);
      } else {
        run.wrong = (run.wrong || 0) + 1;
        recordPuzzleWrong(run.id);
        run.flashT = 12;
        Sound.wrong();
        setPos4(9, 1); // 함정 되돌림 — 갈림길 입구로
        startDialog([puz.fork.trapReply], puz.fork.name);
      }
    });
  }
  // 플레이어 위치를 즉시 재배치(함정 되돌림) — 방탈출 좌표 전용 헬퍼
  function setPos4(x, y) {
    const p = game.player;
    p.x = x; p.y = y; p.px = x * TS; p.py = y * TS; p.moving = false;
  }
  // 골목 끝 본인 확인함 — 갈림길을 통과해야 본인표 열쇠를 내준다
  function openIdChest() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (!run.passed) { startDialog([puz.idchest.lockedReply], puz.idchest.name); return; }
    Sound.correct();
    clearPuzzle(run);
  }

  // ── 4장 구역③ 「백스테이지」 ─────────────────────────────────────
  // 빛나는 마스터키 — 지름길처럼 보이지만 함정이다. 카드 한 장을 일시적으로 훔쳐 간다.
  function openMasterKey() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (game.flags.s4KeySecret && game.flags.s4KeyId) {
      startDialog(['…이제 이건 필요 없다.\n진짜 열쇠가 이미 두 개 다 있으니까.'], puz.masterkey.name);
      return;
    }
    if (run.trapUsed) {
      startDialog(['마스터키는 이미 한 번 써 봤다.\n…다신 안 속는다.'], puz.masterkey.name);
      return;
    }
    run.trapUsed = true;
    const owned = (game.flags.evCards || []).slice();
    if (owned.length > 0 && !game.flags.s4StolenCard) {
      const stolen = owned[0];
      game.flags.evCards = game.flags.evCards.filter((id) => id !== stolen);
      game.flags.s4StolenCard = stolen;
      save();
      Sound.wrong();
      startDialog([
        '빛나는 마스터키를 집어 들자, 문이\n스르륵… 열리려는 듯하더니,',
        `어느새 증거 카드 「${EVIDENCE_CARDS[stolen].title}」가 사라졌다!`,
        '…이거, 공짜가 아니었구나.\n(2단계 인증 창구에서 되찾을 수 있을지도)',
      ], puz.masterkey.name);
    } else {
      startDialog([
        '빛나는 마스터키를 집어 들자, 문이\n스르륵… 열리려는 듯하더니,',
        '…아무 일도 일어나지 않았다.\n(가진 카드가 없어서 다행이다)',
      ], puz.masterkey.name);
    }
  }
  // 2단계 인증 창구 — 마스터키에 도난당한 카드를 되찾는다
  function openAuthTerm() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (!game.flags.s4StolenCard) {
      startDialog(['2단계 인증 창구: "확인할\n도난 내역이 없어요."'], puz.authterm.name);
      return;
    }
    startChoice('2단계 인증 창구: "본인 확인\n질문에 답해 주세요 — 진짜 나 맞나요?"',
      ['네, 접니다', '아니요'], (i) => {
        if (i === 0) {
          const card = game.flags.s4StolenCard;
          if (!game.flags.evCards) game.flags.evCards = [];
          if (!game.flags.evCards.includes(card)) game.flags.evCards.push(card);
          game.flags.s4StolenCard = null;
          save();
          Sound.correct();
          startDialog([`인증 완료.\n증거 카드 「${EVIDENCE_CARDS[card].title}」를 되찾았다!`], puz.authterm.name);
        } else {
          startDialog(['"…그럼 곤란한데요." (인증 보류)'], puz.authterm.name);
        }
      });
  }
  // 안쪽 잠긴 문 — 정석은 열쇠 두 개(비밀조각·본인표). 열리면 반짝의 무대 뒤(ev_offstage) 클리어.
  function openOffstageDoor() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (!(game.flags.s4KeySecret && game.flags.s4KeyId)) {
      startDialog([puz.door.name + ' 앞이다. 잠겨 있다.',
        `열쇠 ${s4KeyCount()}/2 확보. 정석대로,\n두 열쇠를 모두 챙겨 오자.`], puz.door.name);
      return;
    }
    run.opened = true;
    Sound.correct();
    clearPuzzle(run);
  }

  // ── 5장 구역① 「전화의 방」 ───────────────────────────────────────
  // 울리는 전화 — 루미가 "받지 마"를 3회 말린다. 4번째 조사에 받으면(친구 목소리) 클리어.
  function openPhone() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const n = run.warnCount || 0;
    if (n < 3) {
      run.warnCount = n + 1;
      Sound.select();
      startDialog([puz.warnLines[n]], puz.phone.name);
      return;
    }
    Sound.correct();
    clearPuzzle(run);
  }

  // ── 5장 구역② 「잠긴 복도」 ──────────────────────────────────────
  // 잠긴 문 — 루미가 "위험 100%"라 말리지만, 직접 열면 그냥 밝은 베란다(위험 없음).
  // 복선 5호: 베란다에서 루미 목소리가 흔들린다(flags.heardLumi) — clearLines에 담겨 있다.
  function openCheckDoor() {
    const run = game.puzzleRun;
    run.opened = true;
    if (!game.flags.heardLumi) { game.flags.heardLumi = true; }
    Sound.correct();
    clearPuzzle(run);
  }

  // ── 5장 구역③ 「소파 코너」 ──────────────────────────────────────
  // 포근한 소파 — 조사로 앉기 시작한다. 앉아 있는 동안 화면에 따뜻한 색 오버레이가
  // 깔리고(reduceFx 배려 — 정적인 틴트만) 루미의 칭찬이 이어진다. 일어나려면(탈출)
  // 방향키를 90프레임(약 3초) 연속으로 눌러야 한다(이탈 시 리셋 — updateSofaStand).
  function openSofa() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (run.sitting) return;
    run.sitting = true;
    run.standTimer = 0;
    run.sitFrames = 0;
    Sound.select();
    const lines = ['소파에 앉았다. …포근하다.'].concat(puz.praiseLines || []);
    lines.push('(방향키를 3초 이상 꾹 누르고 있으면 일어날 수 있다)');
    startDialog(lines, puz.sofa.name);
  }
  const SOFA_STAND_FRAMES = 90; // "3초 유지" 판정 — held 방향키 90프레임 연속
  function updateSofaStand() {
    const run = game.puzzleRun;
    run.sitFrames = (run.sitFrames || 0) + 1;
    const anyHeld = held.has('up') || held.has('down') || held.has('left') || held.has('right');
    if (anyHeld) run.standTimer = (run.standTimer || 0) + 1;
    else run.standTimer = 0; // 이탈 시 리셋
    if (run.standTimer >= SOFA_STAND_FRAMES) {
      run.sitting = false;
      Sound.correct();
      clearPuzzle(run);
    }
  }

  // 2장 구역①: 다른 목소리 NPC 대화 → 수집 (interact의 NPC 분기에서 호출)
  function collectVoice(npcId) {
    const run = game.puzzleRun;
    if (!run || run.puzzle.type !== 'voices') return false;
    const puz = run.puzzle;
    const line = puz.voiceLines[npcId];
    if (!line) return false;
    if (!run.voices.includes(npcId)) {
      run.voices.push(npcId);
      Sound.correct();
      game.notice = { text: `다른 목소리를 들었다 (${run.voices.length}/3)`, t: 120 };
      if (run.voices.length >= 3) {
        startDialog([line, '…셋 다, 조금씩 다른 이야기였다.'], '다른 목소리', () => clearPuzzle(run));
        return true;
      }
    }
    startDialog([line], '다른 목소리');
    return true;
  }
  // 구역③: 차단 레버 — 지금 흐르는 상자의 레인과 맞으면 반송, 틀리면 출하(오답 기록)
  function openLever(lv) {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const box = puz.boxes[run.boxIdx];
    startChoice(`${lv.name}.\n벨트 위 상자: 「${box.label}」 — ${box.lane} 레인\n\n레버를 당길까요?`, ['당긴다', '그만둔다'], (i) => {
      if (i === 0) {
        if (lv.lane === box.lane) {
          run.diverted += 1;
          Sound.correct();
          if (run.diverted >= puz.boxes.length) { clearPuzzle(run); return; }
          run.boxIdx = Math.min(run.boxIdx + 1, puz.boxes.length - 1);
          startDialog([`덜컹! 「${box.label}」 상자가\n반송함으로 미끄러져 들어갔다.\n(반송 ${run.diverted}/${puz.boxes.length})`], puz.title);
        } else {
          recordPuzzleWrong(run.id);
          run.flashT = 10;
          Sound.wrong();
          startDialog([
            `…앗. 「${box.label}」 상자가\n그대로 출하구로 빠져나갔다.`,
            '덜컹. 같은 라벨의 새 상자가\n벨트 위로 올라온다.',
          ], puz.title);
        }
      } else if (i > 0) {
        startDialog(['(레버에서 손을 뗐다)'], lv.name);
      }
    });
  }
  function openReturnBin() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const n = run.diverted;
    startDialog([n > 0
      ? `반송함이다.\n되돌아온 상자 ${n}개가 얌전히 쌓여 있다.`
      : '반송함이다. …아직 비어 있다.'], puz.returnBin.name);
  }
  function openTerminal(t) {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const already = run.given.includes(t.require) || (t.share && run.boardFace);
    if (already) { startDialog([`이미 ${puz.tokens[t.require]}을(를) 줬어요.`], t.name); return; }
    if (!run.held[t.require]) { startDialog([`지금은 ${puz.tokens[t.require]}이(가) 없어요.`], t.name); return; }
    startChoice(`${t.ask}\n\n${puz.tokens[t.require]}을(를) 줄까요?`, ['준다', '안 준다'], (i) => {
      if (i === 0) {
        run.held[t.require] = false;
        if (t.share) run.boardFace = true; else run.given.push(t.require);
        refreshStalkers(run);
        Sound.select();
        startDialog([t.yes], t.name);
      } else if (i > 0) {
        startDialog([t.no || '…알겠어요.'], t.name);
      }
    });
  }
  function openEraser() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const opts = run.given.map((k) => ({ key: k, locked: false }));
    if (run.boardFace) opts.push({ key: 'face', locked: true }); // 공유분 — 삭제 불가(표시만)
    if (opts.length === 0) { startDialog([puz.eraser.empty], puz.eraser.name); return; }
    const labels = opts.map((o) => puz.tokens[o.key] + (o.locked ? '(공유됨·삭제불가)' : ''));
    labels.push('그만두기');
    startChoice(puz.eraser.prompt, labels, (i) => {
      if (i < 0 || i >= opts.length) return;
      const o = opts[i];
      if (o.locked) { Sound.bump(); startDialog([puz.eraser.cantErase], puz.eraser.name); return; }
      const idx = run.given.indexOf(o.key);
      if (idx >= 0) run.given.splice(idx, 1);
      run.held[o.key] = true; // 되돌려 받음
      refreshStalkers(run);
      notePrivacyRecoveryPiece();
      Sound.correct();
      startDialog([`${puz.tokens[o.key]} 정보를 지웠어요.`,
        game.flags.privacyRecoveryActive ? `흩어진 정보 조각을 회수했다. (${game.flags.privacyRecovery}/${PRIVACY_RECOVERY_NEED})` : `현재 노출도: ${privacyLeak()}/5 (${privacyLevelLabel(privacyLeak())})`], puz.eraser.name);
    });
  }
  function openVipExit() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    startChoice(`${puz.exits.vip.ask}\n\n남은 정보를 전부 줄까요?`, ['전부 준다', '안 준다'], (i) => {
      if (i === 0) {
        for (const k in run.held) if (run.held[k]) { run.held[k] = false; run.given.push(k); }
        spawnStalker(run); spawnStalker(run); // 함정: 스토커 2 추가
        addPrivacyLeak('남은 정보를 한꺼번에 넘겼다');
        recordPuzzleWrong(run.id);
        run.flashT = 12;
        Sound.wrong();
        startDialog([puz.exits.vip.trap], puz.exits.vip.name);
      } else if (i > 0) {
        startDialog(['…역시 수상해. 그만두자.'], puz.exits.vip.name);
      }
    });
  }
  function openNormalExit() {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    if (game.flags.privacyRecoveryActive) {
      startDialog(['노출도가 너무 높다.\n그림자가 문 앞까지 따라붙었다.', `지우개로 흩어진 정보 조각을 ${PRIVACY_RECOVERY_NEED}개 회수하자. (${game.flags.privacyRecovery || 0}/${PRIVACY_RECOVERY_NEED})`], puz.exits.normal.name);
      return;
    }
    const nonNick = givenTokens(run).filter((k) => k !== 'nickname');
    if (nonNick.length > 1) { startDialog([puz.exits.normal.tooMany], puz.exits.normal.name); return; }
    startChoice(`${puz.exits.normal.ask}\n\n닉네임을 주고 나갈까요?`, ['나간다', '아직'], (i) => {
      if (i === 0) {
        if (run.held.nickname) { run.held.nickname = false; run.given.push('nickname'); }
        clearPuzzle(run);
      } else if (i > 0) {
        startDialog(['(문 앞에서 잠시 멈췄다)'], puz.exits.normal.name);
      }
    });
  }
  // 클리어: 보상 카드 지급(중복 방지) + 로그 기록 + 저장 + 거리 복귀 — 모든 구역 공용
  function clearPuzzle(run) {
    const puz = run.puzzle;
    if (!game.flags.evCards) game.flags.evCards = [];
    const fresh = puz.rewards.filter((id) => !game.flags.evCards.includes(id));
    if (fresh.length) game.flags.evCards = game.flags.evCards.concat(fresh);
    const isS1 = S1_ZONE_PUZZLES.includes(run.id);
    const isS2 = S2_ZONE_PUZZLES.includes(run.id);
    const isS3 = S3_ZONE_PUZZLES.includes(run.id);
    const isS4 = S4_ZONE_PUZZLES.includes(run.id);
    const isS5 = S5_ZONE_PUZZLES.includes(run.id);
    const locksBefore = isS2 ? s2ClearCount() : isS1 ? s1LockCount() : 0;
    recordPuzzleClear(run.id, run.timeFrames);
    // 접수처에서 내보낸 정보 최고치를 기록 (보스 콜백 인트로 분기용) — 이전 최고치와 비교해 유지
    if (puz.type === 'traces') {
      game.flags.traceGiven = Math.max(game.flags.traceGiven || 0, run.maxBoard || 0);
    }
    // 3장 3층(송출탑) 클리어 = 정정 보도 완료 — 허브(소문 거리)가 해제되는 순간
    if (run.id === 'broadcast') game.flags.rumorFixed = true;
    // 4장 구역①·② 클리어 = 열쇠 획득 (비밀조각·본인표) — 정문(needS4Keys) 개방 조건
    if (run.id === 'roulette') game.flags.s4KeySecret = true;
    if (run.id === 'signup') game.flags.s4KeyId = true;
    game.puzzleRun = null;
    // 복귀 지점 (데이터화된 exitTo). 기본은 거리 입구 앞.
    const exit = puz.exitTo || { map: 'freestreet', x: 18, y: 21 };
    game.map = exit.map;
    const p = game.player;
    p.x = exit.x; p.y = exit.y; p.px = exit.x * TS; p.py = exit.y * TS; p.moving = false;
    held.delete('up'); held.delete('down'); held.delete('left'); held.delete('right');
    stickDir = null; stickRepeatFrames = 0;
    Sound.warp();
    Sound.playSong(MAPS[exit.map].song);
    const lines = (puz.clearLines || ['방을 빠져나왔다.']).slice();
    for (const id of fresh) lines.push(`◆ 증거 카드 「${EVIDENCE_CARDS[id].title}」 획득!`);
    // 잠금/저울 진행 안내 (이번 클리어로 새로 풀렸을 때만)
    const locks = isS2 ? s2ClearCount() : isS1 ? s1LockCount() : 0;
    if ((isS1 || isS2) && locks > locksBefore) {
      if (isS2) {
        const tilt = 3 - locks;
        lines.push(tilt <= 0
          ? '광장 쪽에서, 거대한 저울이\n수평으로 맞춰지는 소리가 났다!'
          : `광장의 거대한 저울이\n기울기를 하나 낮췄다. (기울기 ${tilt}/3)`);
      } else {
        lines.push(locks >= 3
          ? '철컹 — 거리의 금고에서\n마지막 잠금이 풀리는 소리가 났다!'
          : `철컥. 거리의 금고에서\n잠금 풀리는 소리가 났다. (${locks}/3)`);
      }
    } else if (isS3) {
      const n = s3ClearCount();
      lines.push(n >= 3
        ? '거리 쪽에서 함성이 들린다!\n상점 문들이 하나둘 열리기 시작한다.'
        : `신문사 ${n}/3층을 정리했다.`);
    } else if (isS4 && (run.id === 'roulette' || run.id === 'signup')) {
      const n = s4KeyCount();
      lines.push(n >= 2
        ? '…열쇠가 모두 모였다!\n아케이드 정문 안쪽에서\n반응하는 소리가 들린다.'
        : `열쇠를 하나 손에 넣었다. (${n}/2)`);
    } else if (isS5) {
      const n = s5ClearCount();
      lines.push(n >= 3
        ? '…현관 안쪽에서, 문이 스르르\n열리는 소리가 들린다!'
        : `확인하는 용기를 하나 냈다. (${n}/3)`);
    }
    save();
    startDialog(lines, puz.title);
  }

  // 월드 선택지 박스 — 단말 상호작용·이후 모든 방이 사용 (배틀 mercy 메뉴 스타일 재사용)
  function startChoice(prompt, options, onPick) {
    game.choice = { prompt, options, cursor: 0, onPick };
    game.choiceRet = game.mode;
    game.mode = 'choice';
    Sound.select();
    if (game.tts) Speech.speak(prompt);
  }
  function updateChoice() {
    const c = game.choice;
    if (!c) { game.mode = game.choiceRet || 'world'; return; }
    const n = c.options.length;
    if (justPressed('up')) { c.cursor = (c.cursor + n - 1) % n; Sound.blip(); }
    if (justPressed('down')) { c.cursor = (c.cursor + 1) % n; Sound.blip(); }
    if (justPressed('cancel')) {
      const cb = c.onPick; game.choice = null; game.mode = game.choiceRet || 'world';
      Speech.stop(); if (cb) cb(-1);
      return;
    }
    if (justPressed('action')) {
      const cb = c.onPick, idx = c.cursor;
      game.choice = null; game.mode = game.choiceRet || 'world';
      Speech.stop(); if (cb) cb(idx);
      return;
    }
  }
  function drawChoice() {
    const c = game.choice;
    if (!c) return;
    const maxW = LW - 24 - 48;
    ctx.font = fs(16);
    const promptLines = measureWrap(c.prompt, maxW);
    const optH = lh(30);
    const boxH = Math.max(120, 30 + promptLines * lh(24) + 10 + c.options.length * optH + 24);
    const y = LH - boxH - 12;
    utBox(12, y, LW - 24, boxH, 8);
    ctx.fillStyle = '#fff';
    ctx.font = fs(16);
    let ty = y + 30;
    ty = drawQuestionText(c.prompt, 30, ty, maxW, lh(24)) + 10;
    for (let i = 0; i < c.options.length; i++) {
      drawChoiceWrapped(c.options[i], 40, ty + 4, i === c.cursor, maxW - 20, lh(22));
      ty += optH;
    }
  }

  // 3단계 점진 힌트 오버레이 (퍼즐 전용) — H(또는 메뉴▶힌트)로 열고, 누를 때마다 더 공개
  function openHint() {
    const run = game.puzzleRun;
    if (!run) return;
    const step = puzzleStep(run);
    game.hint = { step, level: 1, hints: (run.puzzle.hints[step] || []).slice() };
    game.hintRet = game.mode;
    game.mode = 'hint';
    recordPuzzleHint(run.id, step); // 힌트 사용 횟수를 단계별로 로그에 기록
    Sound.select();
    if (game.tts && game.hint.hints[0]) Speech.speak(game.hint.hints[0]);
  }
  function advanceHint() {
    const h = game.hint;
    if (!h) return;
    if (h.level < h.hints.length) {
      h.level += 1;
      Sound.blip();
      if (game.tts && h.hints[h.level - 1]) Speech.speak(h.hints[h.level - 1]);
    }
  }
  function closeHint() {
    game.mode = game.hintRet || 'world';
    game.hint = null;
    Speech.stop();
    Sound.select();
  }
  function updateHint() {
    // H는 keydown 핸들러에서 advanceHint를 직접 호출 (더 공개). X/Z로 닫는다.
    if (justPressed('action') || justPressed('cancel')) { closeHint(); return; }
  }
  const HINT_STEP_LABEL = { tokens: '정보 토큰', board: '게시판', eraser: '지우개', exit: '출구',
    copies: '떠도는 조각', levers: '차단 레버',
    voices: '다른 목소리', retrain: '반례 사진', lamps: '램프',
    roulette: '룰렛 광장', signup: '회원가입 골목', backstage: '백스테이지',
    call: '전화의 방', checkdoor: '잠긴 복도', sofa: '소파 코너' };
  function drawHint() {
    drawWorld();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, LW, LH);
    const h = game.hint;
    if (!h) return;
    const boxW = Math.min(LW - 40, 480);
    const boxX = Math.round(LW / 2 - boxW / 2);
    const maxW = boxW - 44;
    ctx.font = fs(15);
    let lines = 0;
    for (let i = 0; i < h.level; i++) lines += measureWrap(`${i + 1}. ${h.hints[i]}`, maxW) + 0.4;
    const boxH = Math.round(64 + lines * lh(24) + 30);
    const boxY = Math.round(LH / 2 - boxH / 2);
    utBox(boxX, boxY, boxW, boxH, 8);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd644';
    ctx.font = fs(16, true);
    ctx.fillText(`힌트 — ${HINT_STEP_LABEL[h.step] || h.step}  (${h.level}/${h.hints.length})`, boxX + 22, boxY + 30);
    ctx.fillStyle = '#fff';
    ctx.font = fs(15);
    let ty = boxY + 58;
    for (let i = 0; i < h.level; i++) {
      ty = drawQuestionText(`${i + 1}. ${h.hints[i]}`, boxX + 22, ty, maxW, lh(24)) + 6;
    }
    ctx.fillStyle = '#888';
    ctx.font = fs(12);
    ctx.textAlign = 'center';
    const more = h.level < h.hints.length ? 'H 더 보기 · ' : '';
    ctx.fillText(`${more}X/Z 닫기`, LW / 2, boxY + boxH - 12);
    ctx.textAlign = 'left';
  }

  // 퍼즐 물체 그리기 (타일 위 스프라이트/문 + 라벨)
  function drawPuzzleObjects(cx, cy) {
    const run = game.puzzleRun;
    const puz = run.puzzle;
    const bob = Math.round(Math.sin(game.time / 22) * 2);
    const label = (nx, ny, text, col) => {
      ctx.font = fs(11, true);
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000';
      ctx.strokeText(text, nx + TS / 2, ny - 4);
      ctx.fillStyle = col || '#fff';
      ctx.fillText(text, nx + TS / 2, ny - 4);
      ctx.textAlign = 'left';
    };
    const box = (nx, ny, col, mark, markCol) => {
      ctx.fillStyle = col;
      ctx.fillRect(nx + 6, ny + 8, TS - 12, TS - 12);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.strokeRect(nx + 6, ny + 8, TS - 12, TS - 12);
      ctx.fillStyle = markCol || '#fff';
      ctx.font = fs(16, true);
      ctx.textAlign = 'center';
      ctx.fillText(mark, nx + TS / 2, ny + TS / 2 + 8);
      ctx.textAlign = 'left';
    };
    if (puz.type === 'voices') return; // 메아리 골목: 그릴 물체 없음 (문·NPC는 타일/엔티티로)
    if (puz.type === 'copies') {
      // 구역②: 떠도는 내 정보 사본 (반짝이는 조각)
      for (const c of run.copies) {
        if (c.got) continue;
        const nx = Math.round(c.px - cx), ny = Math.round(c.py - cy - 6);
        box(nx, ny + bob, '#3a6ea5', '◈', '#cfe8ff');
        label(nx, ny + bob, '내 조각', '#cfe8ff');
      }
      return;
    }
    if (puz.type === 'levers') {
      // 구역③: 차단 레버 3개 + 반송함 + 벨트를 흐르는 상자
      for (const lv of puz.levers) {
        const nx = Math.round(lv.x * TS - cx), ny = Math.round(lv.y * TS - cy - 6);
        box(nx, ny, '#6a4a2a', '↕', '#ffd6a0');
        label(nx, ny, lv.name, '#ffd6a0');
      }
      const bin = puz.returnBin;
      box(Math.round(bin.x * TS - cx), Math.round(bin.y * TS - cy - 6), '#2a5a3a', '⟲', '#8de08d');
      label(Math.round(bin.x * TS - cx), Math.round(bin.y * TS - cy - 6), bin.name, '#8de08d');
      // 벨트 위 상자 — timeFrames로 왼쪽→오른쪽(출하구 방향) 순환 이동
      const belt = puz.belt;
      const span = belt.x1 - belt.x0;
      const bx = belt.x0 * TS + ((run.timeFrames * 1.5) % (span * TS));
      const nx = Math.round(bx - cx), ny = Math.round(belt.y * TS - cy - 6);
      const curBox = puz.boxes[run.boxIdx];
      box(nx, ny, '#8a6a20', '▣', '#fff2a8');
      // 라벨(「…N호」·레인)은 플레이어가 상자 3타일 이내로 가까이 갔을 때만 보인다
      // (멀리서도 늘 보이면 레인을 굳이 확인하러 다가갈 이유가 없어져 창고 퍼즐의 긴장이 죽는다).
      const boxTileX = bx / TS, boxTileY = belt.y;
      const near = Math.max(Math.abs(game.player.x - boxTileX), Math.abs(game.player.y - boxTileY)) <= 3;
      if (near) label(nx, ny, `${curBox.label}·${curBox.lane}`, '#fff2a8');
      return;
    }
    if (puz.type === 'retrain') {
      // 2장 구역②: 반례 사진 선반 3개 + 판독기 단말
      for (let i = 0; i < puz.photos.length; i++) {
        const ph = puz.photos[i];
        const nx = Math.round(ph.x * TS - cx), ny = Math.round(ph.y * TS - cy - 6);
        const taken = run.taken.includes(i);
        box(nx, ny + bob, taken ? '#3a3a3a' : '#6a4a2a', taken ? '·' : '▤', taken ? '#666' : '#ffd6a0');
        label(nx, ny, taken ? '(빈 선반)' : '반례 사진', taken ? '#888' : '#ffd6a0');
      }
      const rd = puz.reader;
      const rnx = Math.round(rd.x * TS - cx), rny = Math.round(rd.y * TS - cy - 6);
      box(rnx, rny, '#2a4a6a', '⟳', '#a8d8ff');
      label(rnx, rny, `판독기 ${run.fed}/3`, '#a8d8ff');
      return;
    }
    if (puz.type === 'lamps') {
      // 2장 구역③: 램프 3개 (점등 상태 표시)
      for (let i = 0; i < puz.lamps.length; i++) {
        const lp = puz.lamps[i];
        const nx = Math.round(lp.x * TS - cx), ny = Math.round(lp.y * TS - cy - 6);
        const on = run.lit[i];
        box(nx, ny + (on ? 0 : bob), on ? '#8a6a20' : '#2a2a2a', on ? '☀' : '✦', on ? '#fff2a8' : '#556');
        label(nx, ny, on ? '켜짐' : '램프', on ? '#fff2a8' : '#88a');
      }
      return;
    }
    if (puz.type === 'tips') {
      // 3장 1층: 제보 쪽지 5장 + 채택함
      for (let i = 0; i < puz.notes.length; i++) {
        const n = puz.notes[i];
        const nx = Math.round(n.x * TS - cx), ny = Math.round(n.y * TS - cy - 6);
        const busted = run.busted[i];
        const resolved = run.resolved.includes(i);
        const col = busted ? '#8a2a2a' : resolved ? '#3a3a3a' : '#6a5a2a';
        const mark = busted ? '!' : resolved ? '·' : '✎';
        box(nx, ny + (resolved ? 0 : bob), col, mark, busted ? '#ffb0a0' : '#ffe6a0');
        label(nx, ny, busted ? '[속보]' : n.label, busted ? '#ff8a70' : '#ffe6a0');
      }
      const b = puz.submitBox;
      box(Math.round(b.x * TS - cx), Math.round(b.y * TS - cy - 6), '#2a4a6a', '▼', '#a8d8ff');
      label(Math.round(b.x * TS - cx), Math.round(b.y * TS - cy - 6), `${b.name} ${run.correct}/2`, '#a8d8ff');
      return;
    }
    if (puz.type === 'compare') {
      // 3장 2층: 사진 3장 (원본 대조)
      for (let i = 0; i < puz.photos.length; i++) {
        const ph = puz.photos[i];
        const nx = Math.round(ph.x * TS - cx), ny = Math.round(ph.y * TS - cy - 6);
        const solved = run.solved[i];
        box(nx, ny + (solved ? 0 : bob), solved ? '#3a3a3a' : '#6a4a2a', solved ? '✓' : '▦', solved ? '#8de08d' : '#ffd6a0');
        label(nx, ny, solved ? '대조 완료' : '사진', solved ? '#8de08d' : '#ffd6a0');
      }
      return;
    }
    if (puz.type === 'broadcast') {
      // 3장 3층: 단말 2개(정정문·출처) + 송출 레버
      const t1 = puz.terminal1, t2 = puz.terminal2, lv = puz.lever;
      const t1n = Math.round(t1.x * TS - cx), t1y = Math.round(t1.y * TS - cy - 6);
      box(t1n, t1y, run.stage > 0 ? '#3a3a3a' : '#2a4a6a', run.stage > 0 ? '✓' : '①', run.stage > 0 ? '#8de08d' : '#a8d8ff');
      label(t1n, t1y, t1.name, run.stage > 0 ? '#8de08d' : '#a8d8ff');
      const t2n = Math.round(t2.x * TS - cx), t2y = Math.round(t2.y * TS - cy - 6);
      box(t2n, t2y, run.stage > 1 ? '#3a3a3a' : '#2a4a6a', run.stage > 1 ? '✓' : '②', run.stage > 1 ? '#8de08d' : '#a8d8ff');
      label(t2n, t2y, t2.name, run.stage > 1 ? '#8de08d' : '#a8d8ff');
      const lvn = Math.round(lv.x * TS - cx), lvy = Math.round(lv.y * TS - cy - 6);
      box(lvn, lvy + bob, run.stage >= 2 ? '#8a6a20' : '#3a3a3a', '↕', run.stage >= 2 ? '#ffd644' : '#777');
      label(lvn, lvy, lv.name, run.stage >= 2 ? '#ffd644' : '#888');
      return;
    }
    if (puz.type === 'roulette') {
      // 4장 구역①: 룰렛 단말 3개 + 해지 단말 + 창고 상자
      for (const r of puz.roulettes) {
        const nx = Math.round(r.x * TS - cx), ny = Math.round(r.y * TS - cy - 6);
        box(nx, ny + bob, '#8a2a6a', '◎', '#ffb0e6');
        label(nx, ny, r.name, '#ffb0e6');
      }
      const u = puz.unsub;
      box(Math.round(u.x * TS - cx), Math.round(u.y * TS - cy - 6), '#2a4a6a', '⛔', '#a8d8ff');
      label(Math.round(u.x * TS - cx), Math.round(u.y * TS - cy - 6), u.name, '#a8d8ff');
      const c = puz.chest;
      box(Math.round(c.x * TS - cx), Math.round(c.y * TS - cy - 6), run.gotKey ? '#3a3a3a' : '#6a4a2a',
        run.gotKey ? '·' : '🔑', run.gotKey ? '#666' : '#ffd644');
      label(Math.round(c.x * TS - cx), Math.round(c.y * TS - cy - 6), run.gotKey ? '(빈 상자)' : c.name,
        run.gotKey ? '#888' : '#ffd644');
      return;
    }
    if (puz.type === 'signup') {
      // 4장 구역②: 갈림길 표지판 + 본인 확인함
      const f = puz.fork;
      box(Math.round(f.x * TS - cx), Math.round(f.y * TS - cy - 6), run.passed ? '#3a3a3a' : '#6a5a2a',
        run.passed ? '✓' : '⑂', run.passed ? '#8de08d' : '#ffe6a0');
      label(Math.round(f.x * TS - cx), Math.round(f.y * TS - cy - 6), f.name, run.passed ? '#8de08d' : '#ffe6a0');
      const ic = puz.idchest;
      box(Math.round(ic.x * TS - cx), Math.round(ic.y * TS - cy - 6), run.passed ? '#6a4a2a' : '#3a3a3a',
        run.passed ? '🔑' : '🔒', run.passed ? '#ffd644' : '#888');
      label(Math.round(ic.x * TS - cx), Math.round(ic.y * TS - cy - 6), ic.name, run.passed ? '#ffd644' : '#888');
      return;
    }
    if (puz.type === 'backstage') {
      // 4장 구역③: 마스터키(함정) + 2단계 인증 창구 + 안쪽 문
      const mk = puz.masterkey;
      box(Math.round(mk.x * TS - cx), Math.round(mk.y * TS - cy - 6) + bob, run.trapUsed ? '#3a3a3a' : '#8a6a20',
        '🔑', run.trapUsed ? '#888' : '#ffd644');
      label(Math.round(mk.x * TS - cx), Math.round(mk.y * TS - cy - 6), mk.name, run.trapUsed ? '#888' : '#ffd644');
      const at = puz.authterm;
      box(Math.round(at.x * TS - cx), Math.round(at.y * TS - cy - 6), '#2a4a6a', '②', '#a8d8ff');
      label(Math.round(at.x * TS - cx), Math.round(at.y * TS - cy - 6), at.name, '#a8d8ff');
      const twoKeys = game.flags.s4KeySecret && game.flags.s4KeyId;
      const dr = puz.door;
      box(Math.round(dr.x * TS - cx), Math.round(dr.y * TS - cy - 6), twoKeys ? '#2a5a3a' : '#3a3a3a',
        twoKeys ? '🚪' : '🔒', twoKeys ? '#8de08d' : '#889');
      label(Math.round(dr.x * TS - cx), Math.round(dr.y * TS - cy - 6), dr.name, twoKeys ? '#8de08d' : '#889');
      return;
    }
    if (puz.type === 'call') {
      // 5장 구역①: 울리는 전화 (경고 횟수에 따라 색이 바뀐다)
      const ph = puz.phone;
      const n = run.warnCount || 0;
      box(Math.round(ph.x * TS - cx), Math.round(ph.y * TS - cy - 6) + bob, n >= 3 ? '#6a4a2a' : '#8a2a2a',
        '☎', n >= 3 ? '#ffd644' : '#ffb0a0');
      label(Math.round(ph.x * TS - cx), Math.round(ph.y * TS - cy - 6), `${ph.name} (${Math.min(n, 3)}/3)`,
        n >= 3 ? '#ffd644' : '#ffb0a0');
      return;
    }
    if (puz.type === 'checkdoor') {
      // 5장 구역②: 루미가 말리는 잠긴 문
      const dr = puz.door;
      box(Math.round(dr.x * TS - cx), Math.round(dr.y * TS - cy - 6), run.opened ? '#2a5a3a' : '#6a2a2a',
        run.opened ? '🚪' : '🔒', run.opened ? '#8de08d' : '#ffb0a0');
      label(Math.round(dr.x * TS - cx), Math.round(dr.y * TS - cy - 6), dr.name, run.opened ? '#8de08d' : '#ffb0a0');
      return;
    }
    if (puz.type === 'sofa') {
      // 5장 구역③: 포근한 소파 (앉으면 따뜻한 색으로 바뀐다)
      const sf = puz.sofa;
      box(Math.round(sf.x * TS - cx), Math.round(sf.y * TS - cy - 6), run.sitting ? '#c97b4a' : '#6a4a2a',
        '◍', run.sitting ? '#ffe6c9' : '#ffd6a0');
      label(Math.round(sf.x * TS - cx), Math.round(sf.y * TS - cy - 6), sf.name, run.sitting ? '#ffe6c9' : '#ffd6a0');
      return;
    }
    for (const t of puz.terminals) {
      const nx = Math.round(t.x * TS - cx), ny = Math.round(t.y * TS - cy - 6);
      const given = run.given.includes(t.require) || (t.share && run.boardFace);
      drawMon(ctx, t.theme, nx, ny + bob, SCALE);
      label(nx, ny, t.name + (given ? ' ✓' : ''), given ? '#8de08d' : '#fff');
    }
    const er = puz.eraser, ex = puz.exits;
    box(Math.round(er.x * TS - cx), Math.round(er.y * TS - cy - 6), '#2a4a6a', '⌫', '#a8d8ff');
    label(Math.round(er.x * TS - cx), Math.round(er.y * TS - cy - 6), '지우개', '#a8d8ff');
    box(Math.round(ex.vip.x * TS - cx), Math.round(ex.vip.y * TS - cy - 6), '#8a6a20', '★', '#ffd644');
    label(Math.round(ex.vip.x * TS - cx), Math.round(ex.vip.y * TS - cy - 6), 'VIP 출구', '#ffd644');
    box(Math.round(ex.normal.x * TS - cx), Math.round(ex.normal.y * TS - cy - 6), '#2a5a3a', '↩', '#8de08d');
    label(Math.round(ex.normal.x * TS - cx), Math.round(ex.normal.y * TS - cy - 6), '일반 출구', '#8de08d');
  }
  function drawIntroLabObjects(cx, cy) {
    if (game.map !== 'introlab') return;
    const props = MAP_PROPS.introlab || [];
    const bob = game.reduceFx ? 0 : Math.round(Math.sin(game.time / 18) * 2);
    const drawLabel = (nx, ny, text, col) => {
      if (!text) return;
      ctx.font = fs(10, true);
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000';
      ctx.strokeText(text, nx + TS / 2, ny - 5);
      ctx.fillStyle = col || '#fff';
      ctx.fillText(text, nx + TS / 2, ny - 5);
      ctx.textAlign = 'left';
    };
    for (const prop of props) {
      const nx = Math.round(prop.x * TS - cx);
      const ny = Math.round(prop.y * TS - cy - 4);
      const done = prop.flag && game.flags[prop.flag];
      const col = done ? '#5a6178' : (prop.clue ? '#f0c850' : '#8fd3ff');
      const isCurrentClue = prop.clue && !done && !game.flags.introDoorOpen
        && ((prop.flag === 'introClue1' && !game.flags.introClue1)
          || (prop.flag === 'introClue2' && game.flags.introClue1 && !game.flags.introClue2)
          || (prop.flag === 'introClue3' && game.flags.introClue1 && game.flags.introClue2 && !game.flags.introClue3));
      if (prop.kind === 'exit') {
        const open = !!game.flags.introDoorOpen;
        ctx.fillStyle = open ? '#213a30' : '#2a2636';
        ctx.fillRect(nx + 8, ny + 6, TS - 16, TS - 6);
        ctx.strokeStyle = open ? '#8de08d' : '#d0b15a';
        ctx.lineWidth = 2;
        ctx.strokeRect(nx + 8, ny + 6, TS - 16, TS - 6);
        ctx.fillStyle = open ? '#bdf5d0' : '#f0c850';
        ctx.font = fs(18, true);
        ctx.textAlign = 'center';
        ctx.fillText(open ? '↥' : '▣', nx + TS / 2, ny + TS / 2 + 9);
        ctx.textAlign = 'left';
        drawLabel(nx, ny, open ? '열린 출구' : `잠긴 출구 ${introClueCount(game.flags)}/3`, open ? '#8de08d' : '#ffd644');
        continue;
      }
      if (isCurrentClue) {
        ctx.save();
        ctx.globalAlpha = 0.32 + (game.reduceFx ? 0 : Math.abs(Math.sin(game.time / 10)) * 0.22);
        ctx.fillStyle = '#ffd644';
        ctx.beginPath();
        ctx.ellipse(nx + TS / 2, ny + TS / 2 + 2, 23, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = done ? '#31364a' : '#1d2440';
      ctx.fillRect(nx + 7, ny + 10 + bob, TS - 14, TS - 14);
      ctx.strokeStyle = isCurrentClue ? '#fff1a6' : col;
      ctx.lineWidth = isCurrentClue ? 3 : 2;
      ctx.strokeRect(nx + 7, ny + 10 + bob, TS - 14, TS - 14);
      ctx.fillStyle = col;
      ctx.font = fs(16, true);
      ctx.textAlign = 'center';
      const mark = prop.kind === 'tablet' ? '▤' : prop.kind === 'monitor' ? '▣' : prop.kind === 'memo' ? '※' : prop.kind === 'board' ? '⋯' : prop.kind === 'locker' ? '▥' : '·';
      ctx.fillText(done ? '✓' : mark, nx + TS / 2, ny + TS / 2 + 8 + bob);
      ctx.textAlign = 'left';
      const labelText = done ? '확인됨' : (prop.clue ? `단서: ${prop.label}` : prop.label);
      drawLabel(nx, ny + bob, labelText, isCurrentClue ? '#fff1a6' : col);
    }
  }

  function prologueVisibleMarks() {
    const props = MAP_PROPS[game.map] || [];
    return props.filter((prop) => prop.flag || prop.kind === 'trace' || prop.kind === 'clearing')
      .map((prop) => ({ map: game.map, x: prop.x, y: prop.y, label: prop.label || '', done: !!(prop.flag && game.flags[prop.flag]) }));
  }
  function drawForestPrologueObjects(cx, cy) {
    if (!['forest', 'forestdeep'].includes(game.map) || game.flags.defeated.bekkyeomon) return;
    const props = (MAP_PROPS[game.map] || []).filter((prop) => prop.kind === 'trace' || prop.kind === 'clearing' || prop.flag);
    // 숲 흔적은 안내용 정적 표식에 가깝게 유지한다. 과한 펄스/부유감을 줄여
    // 저전력 기기에서 버벅임을 줄이고, 퍼즐 방 이펙트처럼 보이지 않게 한다.
    const bob = 0;
    for (const prop of props) {
      const done = prop.flag && game.flags[prop.flag];
      const nx = Math.round(prop.x * TS - cx);
      const ny = Math.round(prop.y * TS - cy - 4);
      const active = !done;
      if (active) {
        ctx.save();
        ctx.globalAlpha = game.reduceFx ? 0.16 : 0.20;
        ctx.fillStyle = '#ffd644';
        ctx.beginPath();
        ctx.ellipse(nx + TS / 2, ny + TS / 2 + 5, 24, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = done ? '#6b7158' : '#ffd644';
      ctx.font = fs(20, true);
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(done ? '✓' : '⌁', nx + TS / 2, ny + TS / 2 + 10 + bob);
      ctx.fillText(done ? '✓' : '⌁', nx + TS / 2, ny + TS / 2 + 10 + bob);
      ctx.font = fs(10, true);
      const labelText = done ? '확인한 흔적' : prop.label;
      ctx.strokeText(labelText, nx + TS / 2, ny - 5 + bob);
      ctx.fillStyle = active ? '#fff1a6' : '#8a8f78';
      ctx.fillText(labelText, nx + TS / 2, ny - 5 + bob);
      ctx.textAlign = 'left';
    }
  }

  function drawStalkers(cx, cy) {
    const run = game.puzzleRun;
    for (const s of run.stalkers) {
      const bob = Math.round(Math.sin(game.time / 10) * 2);
      drawSprite(ctx, STALKER_SPRITE, Math.round(s.px - cx), Math.round(s.py - cy - 6 + bob), SCALE);
    }
  }
  // 2장 허브 — 중앙의 거대한 저울 (기울기 = 3 - 클리어한 구역 수)
  function drawTiltScale(cx, cy) {
    const sx = Math.round(14 * TS - cx) + TS / 2;
    const sy = Math.round(9 * TS - cy) + TS / 2;
    const tilt = 3 - s2ClearCount();
    const ang = (game.reduceFx ? 0 : 1) * tilt * 0.14; // 기울기에 비례해 저울대가 기운다
    // 기둥
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(sx - 3, sy - 4, 6, 26);
    ctx.fillStyle = '#3a2f24';
    ctx.fillRect(sx - 12, sy + 22, 24, 5);
    // 저울대 (기운 막대)
    const armL = 26;
    const dx = Math.cos(ang) * armL, dy = Math.sin(ang) * armL;
    ctx.strokeStyle = '#c8a24a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx - dx, sy - 6 - dy);
    ctx.lineTo(sx + dx, sy - 6 + dy);
    ctx.stroke();
    // 접시 두 개 (한쪽만 잔뜩)
    const drawPan = (px, py, load) => {
      ctx.strokeStyle = '#a8863a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 8); ctx.stroke();
      ctx.fillStyle = '#b9962f';
      ctx.fillRect(px - 7, py + 8, 14, 3);
      if (load) { ctx.fillStyle = '#d8b64a'; ctx.fillRect(px - 5, py + 2, 10, 6); }
    };
    drawPan(sx - dx, sy - 6 - dy, tilt > 0);       // 무거운(내려간) 쪽에 짐
    drawPan(sx + dx, sy - 6 + dy, false);
    // 라벨
    ctx.font = fs(10, true);
    ctx.textAlign = 'center';
    ctx.fillStyle = tilt > 0 ? '#ffd644' : '#8de08d';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    const txt = tilt > 0 ? `기울기 ${tilt}/3` : '수평!';
    ctx.strokeText(txt, sx, sy - 22);
    ctx.fillText(txt, sx, sy - 22);
    ctx.textAlign = 'left';
  }
  // 2장 구역③ — 어둠(꺼진 거리). 플레이어와 켜진 램프 주변만 밝다. reduceFx면 균일 딤.
  function drawDarkness(cx, cy) {
    const run = game.puzzleRun;
    if (run.litCount >= 3) return; // 다 켜지면 완전히 밝다
    if (game.reduceFx) {
      // 광과민성 배려: 방사형 대신 균일한 옅은 딤
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, LW, LH);
      return;
    }
    const p = game.player;
    const cxp = Math.round(p.px - cx) + TS / 2;
    const cyp = Math.round(p.py - cy - 6) + TS / 2;
    const R = TS * 4; // 시야 반경 ~4타일
    const grad = ctx.createRadialGradient(cxp, cyp, TS * 0.6, cxp, cyp, R);
    if (grad && grad.addColorStop) {
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0.92)');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
    }
    ctx.fillRect(0, 0, LW, LH);
    // 켜진 램프 주변도 밝게 뚫어 준다 (destination-out으로 어둠을 지운다)
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < run.puzzle.lamps.length; i++) {
      if (!run.lit[i]) continue;
      const lp = run.puzzle.lamps[i];
      const lx = Math.round(lp.x * TS - cx) + TS / 2;
      const ly = Math.round(lp.y * TS - cy) + TS / 2;
      const lg = ctx.createRadialGradient(lx, ly, TS * 0.4, lx, ly, TS * 3);
      if (lg && lg.addColorStop) {
        lg.addColorStop(0, 'rgba(0,0,0,0.9)');
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(lx - TS * 3, ly - TS * 3, TS * 6, TS * 6);
      }
    }
    ctx.restore();
  }
  // 2장 구역① — 메아리 골목의 비네트. 루프할수록 가장자리가 짙어진다. reduceFx면 생략.
  function drawEchoVignette() {
    const run = game.puzzleRun;
    const lv = Math.min(run.loops || 0, 3);
    if (lv <= 0 || game.reduceFx) return;
    const grad = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.3, LW / 2, LH / 2, LH * 0.75);
    if (grad && grad.addColorStop) {
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(10,6,20,${0.18 * lv})`);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = `rgba(10,6,20,${0.14 * lv})`;
    }
    ctx.fillRect(0, 0, LW, LH);
  }
  // 황혼 앰비언트 — 경계마을과 정적의 숲은 늘 해 질 녘이다 (다크 톤 기조).
  // 마을은 마음의 온도가 쌓일수록(이사 온 친구 수만큼) 조금씩 밝아진다 —
  // "어두운 세계에 온기가 켜진다"를 화면 밝기로 체감시키는 카르마 연출.
  const DUSK_BASE = { village: 0.24, forest: 0.22 };
  function duskWarmCount(flags) {
    let n = 0;
    if (flags.mercyChoice && flags.mercyChoice.bekkyeomon === 'mercy') n += 1;
    for (let c = 1; c <= 5; c++) if (flags[`chapter${c}Mercy`]) n += 1;
    return n;
  }
  function drawDuskAmbient() {
    let a = DUSK_BASE[game.map];
    if (!a || !game.flags) return;
    if (game.map === 'village') a = Math.max(0.08, a - 0.025 * duskWarmCount(game.flags));
    // 화면 효과 줄이기 — 그라데이션 없이 옅은 단색만 (광과민·저시력 배려)
    if (game.reduceFx) {
      ctx.fillStyle = `rgba(8,9,28,${a * 0.82})`;
      ctx.fillRect(0, 0, LW, LH);
      return;
    }
    // 깊은 남빛 어스름 — 위(하늘)가 더 어둡다
    const grad = ctx.createLinearGradient(0, 0, 0, LH);
    if (grad && grad.addColorStop) {
      grad.addColorStop(0, `rgba(8,9,28,${Math.min(0.55, a + 0.1)})`);
      grad.addColorStop(1, `rgba(8,9,28,${a * 0.7})`);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = `rgba(8,9,28,${a})`;
    }
    ctx.fillRect(0, 0, LW, LH);
  }

  // 파이널 「고요의 뜰」 — 구역을 지날 때마다(맵 전환) 화면이 한 단계씩 어두워진다.
  // 퍼즐 없음 — 순수하게 맵 id로만 정해지는 단계(같은 비네트 방식 재사용).
  const QUIET_DIM_LEVEL = { quietyard: 0, quietyard2: 1, quietyard3: 2, goyostage: 3 };
  function drawQuietVignette() {
    const lv = QUIET_DIM_LEVEL[game.map];
    if (!lv) return; // 0(구역①) 또는 해당 없음 → 표시 안 함
    if (game.reduceFx) {
      ctx.fillStyle = `rgba(5,5,12,${0.14 * lv})`;
      ctx.fillRect(0, 0, LW, LH);
      return;
    }
    const grad = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.25, LW / 2, LH / 2, LH * 0.75);
    if (grad && grad.addColorStop) {
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(5,5,12,${0.2 * lv})`);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = `rgba(5,5,12,${0.16 * lv})`;
    }
    ctx.fillRect(0, 0, LW, LH);
  }
  // 코어 — 여덟 개의 의자. 안아 준(자비) 조각 수만큼(coreMercyCount) 채워져 그려진다.
  const CORE_CHAIR_SPOTS = [
    { x: 3, y: 3 }, { x: 5, y: 3 }, { x: 9, y: 3 }, { x: 11, y: 3 },
    { x: 3, y: 6 }, { x: 5, y: 6 }, { x: 9, y: 6 }, { x: 11, y: 6 },
  ];
  function drawCoreChairs(cx, cy) {
    const filled = coreMercyCount(game.flags);
    ctx.textAlign = 'center';
    ctx.font = '16px monospace';
    for (let i = 0; i < CORE_CHAIR_SPOTS.length; i++) {
      const s = CORE_CHAIR_SPOTS[i];
      const sx = Math.round(s.x * TS - cx) + TS / 2;
      const sy = Math.round(s.y * TS - cy) + TS / 2;
      ctx.fillStyle = i < filled ? '#ffd644' : '#3a3a4a';
      ctx.fillText('◐', sx, sy + 6);
    }
    ctx.textAlign = 'left';
  }
  // 구역 HUD — 화면 위쪽 상시 표시 (traces: 프로필 보드 / copies: 회수 수 / levers: 지금 상자)
  function drawPuzzleHud() {
    const run = game.puzzleRun;
    let title, detail, danger = false;
    if (run.puzzle.type === 'copies') {
      title = `되찾은 조각 ${run.collected}/3`;
      detail = '떠도는 조각을 쫓아가 붙잡자';
    } else if (run.puzzle.type === 'levers') {
      title = `반송 ${run.diverted}/${run.puzzle.boxes.length}`;
      // 상자 라벨·레인은 더 이상 상시 표시하지 않는다 — 가까이 가야 보인다(drawPuzzleObjects)
      detail = '벨트로 가까이 가면 상자 라벨이 보인다';
    } else if (run.puzzle.type === 'voices') {
      title = `다른 목소리 ${run.voices.length}/3`;
      detail = '반짝이지 않는 문 뒤를 찾아보자';
    } else if (run.puzzle.type === 'retrain') {
      title = `반례 ${run.photos}/3 · 판독기 ${run.fed}/3`;
      detail = '반례 사진을 모아 판독기에 넣자';
    } else if (run.puzzle.type === 'lamps') {
      title = `램프 ${run.litCount}/3`;
      detail = '어둠 속 램프를 찾아 불을 켜자';
    } else if (run.puzzle.type === 'tips') {
      title = `채택 ${run.correct}/2`;
      detail = '출처 있는 제보를 찾아 채택하자';
    } else if (run.puzzle.type === 'compare') {
      title = `대조 ${run.solvedCount}/3`;
      detail = '원본과 다른 점을 지목하자';
    } else if (run.puzzle.type === 'broadcast') {
      title = `단계 ${Math.min(run.stage + 1, 3)}/3`;
      detail = ['정정문을 고르자', '출처를 붙이자', '레버를 당기자'][run.stage] || '레버를 당기자';
    } else if (run.puzzle.type === 'roulette') {
      title = `광고 딱지 ${game.flags.adStickers || 0}/4`;
      detail = run.gotKey ? '비밀조각 열쇠를 찾았다!' : '룰렛 뒤 창고에서 열쇠를 찾자';
      danger = (game.flags.adStickers || 0) >= 3;
    } else if (run.puzzle.type === 'signup') {
      title = run.passed ? '갈림길 통과' : '갈림길 판별 전';
      detail = run.passed ? '본인 확인함에서 열쇠를 받자' : '진짜 도메인을 가려내자';
    } else if (run.puzzle.type === 'backstage') {
      title = `열쇠 ${s4KeyCount()}/2`;
      detail = run.opened ? '무대 뒤로 들어섰다' : '진짜 열쇠 두 개로 안쪽 문을 열자';
    } else if (run.puzzle.type === 'call') {
      title = `루미의 만류 ${Math.min(run.warnCount || 0, 3)}/3`;
      detail = (run.warnCount || 0) < 3 ? '전화를 조사해 보자' : '한 번 더 조사하면 받을 수 있다';
    } else if (run.puzzle.type === 'checkdoor') {
      title = run.opened ? '문을 열었다' : '문 앞';
      detail = '루미의 말이 진짜인지, 직접 열어 확인하자';
    } else if (run.puzzle.type === 'sofa') {
      const frac = Math.min(1, (run.standTimer || 0) / SOFA_STAND_FRAMES);
      title = run.sitting ? `일어나기 ${Math.round(frac * 100)}%` : '앉지 않음';
      detail = run.sitting ? '방향키를 3초 이상 꾹 눌러 버티자' : '소파를 조사해서 앉아 보자';
      danger = run.sitting && frac < 1;
    } else {
      const given = givenTokens(run);
      const nonNick = given.filter((k) => k !== 'nickname');
      const names = given.map((k) => run.puzzle.tokens[k]);
      title = `프로필 보드 — 내보낸 정보 ${nonNick.length}개`;
      detail = names.length ? names.join(' · ') : '(아직 없음)';
      danger = nonNick.length >= 3;
    }
    ctx.font = fs(13, true);
    const tw = Math.max(ctx.measureText(title).width, ctx.measureText(detail).width) + 24;
    const bw = Math.min(LW - 20, Math.max(200, tw));
    const bx = Math.round(LW / 2 - bw / 2), by = 8, bh = game.largeText ? 56 : 48;
    utBox(bx, by, bw, bh, 6);
    ctx.textAlign = 'center';
    ctx.fillStyle = danger ? badColor() : warnColor();
    ctx.fillText(title, LW / 2, by + 20);
    ctx.fillStyle = '#fff';
    ctx.font = fs(12);
    ctx.fillText(detail, LW / 2, by + (game.largeText ? 42 : 38));
    ctx.textAlign = 'left';
    // 5장 구역③ 소파 코너 — 일어나기 버티기 진행 게이지(90프레임 채우면 클리어)
    if (run.puzzle.type === 'sofa' && run.sitting) {
      const frac = Math.min(1, (run.standTimer || 0) / SOFA_STAND_FRAMES);
      const gy = by + bh + 4;
      ctx.fillStyle = '#333'; ctx.fillRect(bx, gy, bw, 6);
      ctx.fillStyle = '#e0a53a'; ctx.fillRect(bx, gy, bw * frac, 6);
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
    if (SOLID(ch) || npcAt(game.map, nx, ny) || monsterAt(game.map, nx, ny) || friendAt(game.map, nx, ny) ||
        (game.puzzleRun && puzzleObjAt(game.map, nx, ny))) {
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

  // 3장 허브 「소문 거리」 — 소문 때문에 문 닫은 상점 3곳 (송출 완료 전/후 대사 분기)
  const RUMOR_SHOPS = [
    { x: 5, y: 4, name: '분식집' },
    { x: 22, y: 4, name: '문구점' },
    { x: 4, y: 15, name: '사진관' },
  ];
  function interact() {
    if (game.puzzleRun && interactPuzzle()) return;
    const f = facingTile();
    const npc = npcAt(game.map, f.x, f.y);
    if (npc) {
      // 1장 보스(담아) — 아직 설득하지 않았으면 설득 배틀로, 이후엔 되돌린 친구로
      if (npc.id === 'sujip_boss') {
        if (!game.flags.chapter1Clear) { startBattleIntro('sujipmon', 'sujipmon_boss'); return; }
        startDialog([
          '담아: "덕분에 하나씩 돌려주고 있어.\n…빈손인데, 이상하게 안 허전해."',
          '담아: "라벨도 다 떼는 중이야.\n「친구가 준 것」이 아니라…\n원래, 친구 거였으니까."',
        ], '담아');
        return;
      }
      // 2장 보스(기울) — 아직 설득하지 않았으면 마음 조각 배틀로, 이후엔 되돌린 친구로
      if (npc.id === 'pyeong_boss') {
        if (!game.flags.chapter2Clear) { startBattleIntro('pyeonhyangmon', 'pyeonhyang_boss'); return; }
        startDialog([
          '기울: "요즘은 양쪽 다 재 봐.\n…시간은 좀 걸리는데, 안 기울어."',
          '기울: "틀릴 확률? …있지.\n근데 그게, 이상한 게 아니더라고."',
        ], '기울');
        return;
      }
      // 3장 보스(그럴싸) — 아직 설득하지 않았으면 마음 조각 배틀로, 이후엔 되돌린 친구로
      if (npc.id === 'hwangak_boss') {
        if (!game.flags.chapter3Clear) { startBattleIntro('hwangakmon', 'hwangak_boss'); return; }
        startDialog([
          '그럴싸: "요즘은 모르면 모른다고 써.\n…생각보다, 독자들이 더 믿어주더라."',
          '그럴싸: "[정정] 어제의 나를 정정합니다.\n…이 문장, 마음에 들어."',
        ], '그럴싸');
        return;
      }
      // 4장 보스(반짝) — 아직 설득하지 않았으면 마음 조각 배틀로, 이후엔 되돌린 친구로
      if (npc.id === 'yuhok_boss') {
        if (!game.flags.chapter4Clear) { startBattleIntro('yuhokmon', 'yuhok_boss'); return; }
        startDialog([
          '반짝: "요즘은 딱지도 안 붙어.\n…진짜만 켜니까, 오히려 편해."',
          '반짝: "불 꺼진 나도 봐 줬잖아.\n…그게, 제일 반짝였어."',
        ], '반짝');
        return;
      }
      // 5장 보스(루미) — 아직 설득하지 않았으면 마음 조각 배틀로, 이후엔 되돌린 친구로
      if (npc.id === 'hollim_boss') {
        if (!game.flags.chapter5Clear) { startBattleIntro('hollimmon', 'hollim_boss'); return; }
        startDialog([
          '루미: "요즘은 혼자서도, 잘 있어 봐.\n…기다리는 것도, 나쁘지 않더라."',
          '루미: "네가 다녀온다고 하면,\n이제는… 그냥 믿고 기다릴게."',
        ], '루미');
        return;
      }
      // 파이널 보스(고요) — 아직 설득하지 않았으면 마음 조각 배틀로, 이후엔 되돌린 친구로
      if (npc.id === 'goyo_boss') {
        if (!game.flags.goyoClear) { startBattleIntro('finalboss', 'goyo_boss'); return; }
        startDialog([
          '고요: "…아직, 여기 있었네."',
          '고요: "…그래도 돼. …고마워."',
        ], '고요');
        return;
      }
      // 파이널 「코어」의 영이 — 마음 조각 배틀. 클리어는 기존 v1 winBattle의 yeongi 분기로
      // 그대로 이어져 computeEnding(진엔딩 계산)이 재사용된다.
      if (npc.id === 'yeongi_boss') {
        if (!game.flags.defeated.yeongi) { startBattleIntro('yeongi', 'yeongi_boss'); return; }
        startDialog(['…이미, 대답을 들었잖아.'], '영이');
        return;
      }
      // 3장 1층 헛소 — 제보함 진행 상태에 따라 대사가 달라진다
      if (npc.id === 'heossso') {
        const run = game.puzzleRun;
        if (isPuzzleCleared('tips')) {
          startDialog([
            '헛소: "…그 뒤로 나도, 출처 없는 말은\n안 옮기려고 해."',
          ], '헛소');
        } else if (run && run.correct > 0) {
          startDialog([
            `헛소: "벌써 ${run.correct}장이나 채택했네.\n…남은 것도 잘 살펴봐."`,
          ], '헛소');
        } else {
          startDialog([
            '헛소: "쪽지 다섯 장. 다 그럴듯하지?\n…근데 진짜는 출처가 있어."',
          ], '헛소');
        }
        return;
      }
      // 3장 2층 붙임 — 편집실 진행 상태에 따라 대사가 달라진다
      if (npc.id === 'buteum') {
        const run = game.puzzleRun;
        if (isPuzzleCleared('compare')) {
          startDialog([
            '붙임: "이제 나도 원본이랑 비교하는\n버릇이 생겼어. …고마워."',
          ], '붙임');
        } else if (run && run.solvedCount > 0) {
          startDialog([
            `붙임: "벌써 ${run.solvedCount}장이나 찾아냈네.\n…나머지도 부탁해."`,
          ], '붙임');
        } else {
          startDialog([
            '붙임: "사진 세 장. 원본이랑 나란히\n놓아 보면… 뭔가 달라."',
          ], '붙임');
        }
        return;
      }
      // 3장 허브 겁먹은 주민 2명 — rumorFixed 전엔 같은 헛소문을 반복한다
      if (npc.id === 'rumor_villager1' || npc.id === 'rumor_villager2') {
        if (game.flags.rumorFixed) {
          startDialog(npc.id === 'rumor_villager1'
            ? ['…소문이 다 헛것이었대. 신문사가 바로잡았어.\n다행이야, 진짜.']
            : ['이제야 발 뻗고 자겠어.\n…확인부터 하는 습관, 생겼지 뭐야.'], '주민');
        } else {
          startDialog(['"그 우물물 마시면 로봇이 된대! 진짜래!"'], '겁먹은 주민');
        }
        return;
      }
      // 2장 구역① 다른 목소리 3명 — 대화하면 조각 수집
      if (npc.id === 'voice1' || npc.id === 'voice2' || npc.id === 'voice3') {
        if (collectVoice(npc.id)) return;
      }
      // 2장 구역① 골목 주민 — 토씨까지 같은 말을 반복
      if ((npc.id === 'echo1' || npc.id === 'echo2') && game.puzzleRun && game.puzzleRun.puzzle.echoLine) {
        startDialog([game.puzzleRun.puzzle.echoLine], '골목 주민');
        return;
      }
      // 2장 허브 안내인 뱅뱅 — 명랑하게 같은 곳만 안내
      if (npc.id === 'bangbang') {
        startDialog([
          '뱅뱅: "이쪽! 다들 가는 길은 이쪽이야!\n…어제도 안내했던가? 아무튼 이쪽!"',
        ], '뱅뱅');
        return;
      }
      // 2장 허브 주민 또또 2명 — 떨어져 있는데 토씨까지 같은 말
      if (npc.id === 'ttotto1' || npc.id === 'ttotto2') {
        startDialog([
          '또또: "많이 본 게 맞는 거야.\n다들 그러던데. …많이 본 게 맞는 거야."',
        ], '또또');
        return;
      }
      // 구역②의 새김 — 퍼즐 진행 상태(회수·클리어)에 따라 대사가 달라진다
      if (npc.id === 'saegim_plaza') {
        const run = game.puzzleRun;
        if (isPuzzleCleared('copies')) {
          startDialog([
            '새김: "…금고 안의 하나는 못 꺼내 줘.\n이미 내 몸에 새겨졌으니까."',
            '새김: "그래도 셋은 네 품에 돌아갔네.\n…다행이야."',
          ], '새김');
        } else if (run && run.collected > 0) {
          startDialog([
            `새김: "벌써 ${run.collected}개나 붙잡았네.\n…빠르다, 너."`,
            '새김: "남은 것도 부탁해.\n네 거니까, 네가 붙잡아야 해."',
          ], '새김');
        } else {
          startDialog([
            '새김: "네 조각이 광장에 떠돌고 있어.\n셋. …원래는 넷이었는데."',
            '새김: "하나는 금고 안이야.\n그건 이미 내 몸에 새겨졌어. …미안."',
            '새김: "나머지 셋은 붙잡을 수 있어.\n도망치지만… 금방 지쳐."',
          ], '새김');
        }
        return;
      }
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
      if ((game.map === 'forest' || game.map === 'forestdeep') && mon.id === 'bekkyeomon' && !game.flags.introForestTrace) {
        startDialog([
          '숲 안쪽에서 누군가의 목소리가 들린다.\n하지만 아직 길이 보이지 않는다.',
          '먼저 바로 뒤의 노란 발자국을 조사하자.\n흔적을 읽어야 따라에게 다가갈 수 있다.',
        ], '반디');
        return;
      }
      if ((game.map === 'forest' || game.map === 'forestdeep') && mon.id === 'bekkyeomon' && !game.flags.ttaraFirstEncounter) {
        startDialog([
          '노란 발자국의 끝,\n나뭇잎 사이에 하얀 종이가 흩어져 있다.',
          '종이마다 누군가의 그림을 따라 그린 선이\n겹겹이 남아 있다.\n하지만 한가운데만 비어 있다.',
          '따라: "잘 그린 건 전부 남의 거였어.\n그럼 내 마음은… 어디서 베끼면 돼?"',
          '반디: "싸우는 게 아니야.\n저 아이 마음 안쪽으로 들어가서,\n흩어진 속마음 조각을 들어 보자."',
        ], '따라', () => {
          game.flags.ttaraFirstEncounter = true;
          save();
          startBattleIntro(mon.id);
        });
        return;
      }
      startBattleIntro(mon.id);
      return;
    }
    // 되돌려 친구가 된 인물: 다시 싸우지 않고, 배운 점을 들려준다
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
    const facingProp = getPropAt(game.map, f.x, f.y);
    // 숲 첫 흔적은 바닥 위 시각 오브젝트다. 목표 화살표를 따라 정확히 그 칸에 올라서도
    // Z/Enter가 먹히도록, 아직 확인 전이면 현재 발밑의 trace도 조사 대상으로 인정한다.
    const standingProp = getPropAt(game.map, game.player.x, game.player.y);
    const standingTrace = (game.map === 'forest' && !game.flags.introForestTrace) ? standingProp : null;
    const standingFlagProp = (standingProp && standingProp.flag && !game.flags[standingProp.flag]) ? standingProp : null;
    const prop = facingProp || (standingTrace && standingTrace.kind === 'trace' ? standingTrace : null) || standingFlagProp;
    if (prop) {
      const lines = [];
      if (game.map === 'introlab' && prop.kind === 'exit') {
        const c = introClueCount(game.flags);
        if (game.flags.introDoorOpen) {
          lines.push('문은 이제 조금 열려 있다.\n차가운 숲의 공기가 발목을 스친다.');
          lines.push('나가려면 문 앞으로 걸어가자.\n정적의 숲이 이 방 밖에서 기다린다.');
        } else {
          lines.push('실험실 출구는 굳게 잠겨 있다.\n문 가장자리에 작은 불빛 세 개가 꺼져 있다.');
          lines.push(`아직 단서 ${3 - c}개가 더 필요하다. (${c}/3)`);
        }
      } else {
        lines.push(prop.text);
      }
      // 스토리 복선 등 — 조사 지점에 flag가 있으면 플래그를 남긴다 (예: seenPhoto1)
      if (prop.flag && !game.flags[prop.flag]) {
        game.flags[prop.flag] = true; save();
        if (game.map === 'forest' && prop.flag === 'introForestTrace') {
          game.notice = { text: '노란 흔적이 숲 안쪽으로 이어진다.', t: 220 };
          lines.push('흔적은 숲 왼쪽으로 이어진다.\n희미한 목소리가, 남의 말을 따라 하듯\n작게 중얼거린다.');
          lines.push('이제 노란 화살표를 따라가자.\n따라가 숲 안쪽에서 기다리고 있다.');
        }
        // 프롤로그 실험실 — 단서 3개 수집 시 문 개방
        if (game.map === 'introlab' && !game.flags.introDoorOpen &&
            introClueCount(game.flags) >= 3) {
          game.flags.introDoorOpen = true;
          save();
          game.notice = { text: '철컥 — 출구가 열렸다!', t: 220 };
          lines.push('방 끝에서 철컥, 하고 잠금이 풀렸다.\n문틈으로 차가운 숲의 공기가 스며든다.');
          lines.push('이제 출구로 나가자.\n정적의 숲이 기다리고 있다.');
        }
      }
      startDialog(lines);
      return;
    }
    const ch = tileAt(game.map, f.x, f.y);
    // 코어의 봉헌 제단 — 벽에 묻힌 단(7,1). 조사하면 봉헌 퍼즐이 시작된다.
    if (game.map === 'coreroom' && f.x === 7 && f.y === 1) {
      interactAltar();
      return;
    }
    // 2장 거리의 거대한 저울 — 구역 클리어마다 기울기가 준다 (14,9 = 'H')
    if (game.map === 'tiltstreet' && f.x === 14 && f.y === 9) {
      const tilt = 3 - s2ClearCount();
      if (tilt <= 0) {
        startDialog([
          '거대한 저울이 수평이 되었다.\n저울 뒤로 문이 열려 있다.\n(위로 걸어 들어가 보자)',
        ], '거대한 저울');
      } else {
        startDialog([
          `거대한 저울이 한쪽으로\n크게 기울어 있다. (기울기 ${tilt}/3)`,
          '한쪽 접시에만 무언가가\n잔뜩 쌓여 있다. 반대쪽은 텅 비었다.',
        ], '거대한 저울');
      }
      return;
    }
    // 거리의 금고문 — 잠금 3개(구역 클리어마다 하나)의 진행을 보여 준다
    if (game.map === 'freestreet' && ch === '7') {
      const n = s1LockCount();
      if (n >= 3) {
        startDialog(['금고 문이 열려 있다.\n…안에서 서랍 여닫는 소리가 난다.\n(위로 걸어 들어가 보자)'], '금고');
      } else {
        startDialog([
          `육중한 금고 문.\n잠금 ${3 - n}개가 아직 잠겨 있다. (${n}/3 해제)`,
          '작은 글씨: "주인 전용★\n※출입 조건은 각 매장에서 확인"',
        ], '금고');
      }
      return;
    }
    // 3장 허브 「소문 거리」 — 잠긴 상점 문 3곳. 송출 완료(rumorFixed) 전/후로 대사가 바뀐다
    if (game.map === 'rumorstreet') {
      const shop = RUMOR_SHOPS.find((s) => s.x === f.x && s.y === f.y);
      if (shop) {
        startDialog(game.flags.rumorFixed
          ? [`${shop.name} 문이 활짝 열려 있다.\n"오해가 풀려서 다행이에요!"`]
          : [`${shop.name} 문이 굳게 닫혀 있다.\n"…소문 때문에 문 닫았어요."`], shop.name);
        return;
      }
    }
    const examine = getExamineTile(ch);
    if (examine) {
      startDialog([examine]);
    }
  }

  function inferWarpExitDir(map, w) {
    if (w.exitDir) return w.exitDir;
    const width = map.tiles[0].length, height = map.tiles.length;
    if (w.y === 0) return 'north';
    if (w.y === height - 1) return 'south';
    if (w.x === 0) return 'west';
    if (w.x === width - 1) return 'east';
    // 내부 문은 플레이어가 밟고 들어온 방향을 출구 방향으로 본다.
    return game.player.dir || null;
  }
  function arrivalFacing(exitDir) {
    if (exitDir === 'south') return 'down';
    if (exitDir === 'north') return 'up';
    if (exitDir === 'east') return 'right';
    if (exitDir === 'west') return 'left';
    return null;
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
    if (game.warpCooldownFrames > 0) return;
    const w = warpAt(game.map, p.x, p.y);
    if (!w) return;
    if (w.needAllDefeated && !w.needAllDefeated.every((id) => game.flags.defeated[id])) {
      pushBack();
      Sound.bump();
      startDialog([w.lockText || '길이 막혀 있다.']);
      return;
    }
    // 방탈출 클리어 게이트 (예: 거리 → 게시판 광장 — 접수처를 먼저)
    if (w.needPuzzleClear && !isPuzzleCleared(w.needPuzzleClear)) {
      pushBack();
      Sound.bump();
      startDialog([w.lockText || '문이 잠겨 있다.']);
      return;
    }
    // 1장 금고문 게이트 — 구역 클리어 수만큼 잠금이 풀린다
    if (w.needS1Locks && s1LockCount() < w.needS1Locks) {
      pushBack();
      Sound.bump();
      startDialog([w.lockText || '문이 잠겨 있다.', `금고 잠금 ${s1LockCount()}/${w.needS1Locks} 해제.`]);
      return;
    }
    // 플래그 게이트 (예: 2장 입구 — chapter1Clear 전엔 잠김)
    if (w.needFlag && !game.flags[w.needFlag]) {
      // 프롤로그 실험실 — 동적 단서 카운트 표시
      if (game.map === 'introlab') {
        const c = introClueCount(game.flags);
        const remain = Math.max(0, 3 - c);
        pushBack();
        Sound.bump();
        startDialog([w.lockText || '문이 잠겨 있다.', `문 가장자리의 불빛 ${c}/3개가 켜졌다.\n남은 단서 ${remain}개를 더 찾아야 한다.`]);
        return;
      }
      pushBack();
      Sound.bump();
      startDialog([w.lockText || '문이 잠겨 있다.']);
      return;
    }
    // 2장 저울 게이트 — 구역 클리어 수만큼 기울기가 준다 (0이면 보스 문 개방)
    if (w.needS2Scale && s2ClearCount() < w.needS2Scale) {
      pushBack();
      Sound.bump();
      startDialog([w.lockText || '문이 잠겨 있다.', `저울 기울기 ${3 - s2ClearCount()}/3 — 골목을 더 살펴보자.`]);
      return;
    }
    // 4장 정문 게이트 — 열쇠 두 개(비밀조각·본인표)를 모두 모아야 열린다
    if (w.needS4Keys && s4KeyCount() < w.needS4Keys) {
      pushBack();
      Sound.bump();
      startDialog([w.lockText || '문이 잠겨 있다.', `열쇠 ${s4KeyCount()}/${w.needS4Keys} 확보.`]);
      return;
    }
    // 5장 현관 게이트 — 구역 3개(전화의 방·잠긴 복도·소파 코너)를 모두 클리어해야 열린다
    if (w.needS5Zones && s5ClearCount() < w.needS5Zones) {
      pushBack();
      Sound.bump();
      startDialog([w.lockText || '문이 잠겨 있다.', `확인하는 용기 ${s5ClearCount()}/${w.needS5Zones}.`]);
      return;
    }
    const fromMap = game.map;
    const exitDir = inferWarpExitDir(MAPS[fromMap], w);
    game.map = w.to;
    p.x = w.tx; p.y = w.ty;
    p.px = w.tx * TS; p.py = w.ty * TS;
    p.dir = w.dir || arrivalFacing(exitDir) || p.dir;
    p.moving = false;
    game.warpCooldownFrames = 12;
    game.lastWarp = { fromMap, toMap: w.to, exitDir, arrivedAt: { x: w.tx, y: w.ty } };
    // 새 맵에 도착하면 이동을 멈춘다. (방향키/스틱을 누른 채 워프해도
    // 도착하자마자 되돌아가는 워프 칸으로 걸어 들어가 '바로 전 맵으로 튕기는'
    // 현상을 막는다 — 계속 가려면 다시 눌러야 한다.)
    held.delete('up'); held.delete('down'); held.delete('left'); held.delete('right');
    stickDir = null; stickRepeatFrames = 0;
    Sound.warp();
    Sound.playSong(MAPS[w.to].song);
    syncPuzzleRun(); // 방탈출 방 입장/퇴장에 맞춰 런타임 상태 초기화/해제
    // 5장 허브 「포근한 집」 — 루미의 목소리 안내(도착할 때마다 순서대로 한 마디씩)
    if (w.to === 'cozyhome') advanceLumiVoice();
    // 2장 구역① 메아리 골목 — 반짝 문 루프 연출 (입구로 되돌아왔다)
    if (w.loop && game.puzzleRun && game.puzzleRun.puzzle.type === 'voices') {
      const run = game.puzzleRun;
      run.loops = (run.loops || 0) + 1;
      let msg;
      if (run.loops === 1) msg = '…또 여기잖아?';
      else if (run.loops === 2) msg = '골목이 아까보다 좁아 보인다.';
      else msg = '뱅뱅: "이상하지? …나갈 문은, 반짝이지 않아."';
      game.notice = { text: msg, t: 150 };
      Sound.bump();
      save();
      return; // 루프는 인트로 재생 없이 종료
    }
    // 처음 방문하는 맵의 인트로 연출
    const dest = MAPS[w.to];
    if (dest.intro && !game.flags.visited[w.to]) {
      game.flags.visited[w.to] = true;
      startDialog(dest.intro.slice());
    }
    // 동행자 반디의 한 줄 조언 — 비차단 말풍선, 맵당 1회 (정체 공개 후에는 없음)
    if (game.flags.bandiJoined && !game.flags.bandiRevealed &&
        COMPANION_LINES[w.to] && !(game.flags.bandiSaid && game.flags.bandiSaid[w.to])) {
      if (!game.flags.bandiSaid) game.flags.bandiSaid = {};
      game.flags.bandiSaid[w.to] = true;
      // 침묵 루트에서는 반디도 점점 말을 잃는다 (무관심의 세계 — 고요 루트 정합)
      const line = isColdRoute(game.flags) ? '반디: ……' : COMPANION_LINES[w.to];
      game.notice = { text: line, t: 300 };
      Speech.speak(line); // 읽어주기(TTS) 접근성 — 시각 말풍선과 동일 내용
    }
    save();
  }

  const MOVE_SPEED = TS / 9; // 프레임당 픽셀

  // 박사 고백 이벤트 — chapter3Clear 후 경계마을 진입 시 1회 자동 발생.
  // 프로젝트 0호(영이) 이야기를 고백한다. 복선 플래그(seenPhoto1/2, seenArticle)를
  // 본 상태면 대사에 한 줄씩 반영된다.
  function startProfConfession() {
    const f = game.flags;
    f.profConfession = true;
    const lines = [
      '박사: "…얘야. 잠깐, 나랑 이야기 좀 할까."',
      '박사: "오래전에, 내가 만든 아이가 있었어.\n이름은… 영이. 「프로젝트 0호」였지."',
      '박사: "영이는 사람들을 보고 배웠어.\n…근데 나쁜 습관까지, 다 배우게 뒀단다.\n내가, 지켜보지 않았어."',
      '박사: "그러다… 폐기하기로 한 날이 왔어.\n나는 그 순간에… 로그아웃해서 도망쳤단다."',
    ];
    if (f.seenPhoto1) lines.push('박사: "네가 주인의 방에서 본 사진…\n그게, 나와 영이였어."');
    if (f.seenPhoto2) lines.push('박사: "표본 창고 구석의 그 ×표 사진들도…\n영이 거였단다."');
    if (f.seenArticle) lines.push('박사: "송출되지 못한 그 기사도…\n영이 이야기였어."');
    lines.push('박사: "네가 지금까지 모은 조각들…\n그게 다, 영이의 기억이야."');
    lines.push('박사: "…미안하다. 정말, 미안해."');
    lines.push('박사: "…그 아이를, 찾아 주지 않겠니."');
    save();
    startDialog(lines, '박사님');
  }

  function updateWorld() {
    const p = game.player;
    // 박사 고백 이벤트 — 조건이 갖춰지면(chapter3Clear && !profConfession) 마을에서 즉시 시작
    if (game.map === 'village' && game.flags.chapter3Clear && !game.flags.profConfession) {
      startProfConfession();
      return;
    }
    if (game.notice.t > 0) game.notice.t -= 1;
    if (game.warpCooldownFrames > 0) game.warpCooldownFrames -= 1;
    if (game.puzzleRun) updatePuzzleWorld(); // 방탈출: 시간 누적 + 구역별 물체 갱신
    // 5장 구역③ 소파 코너 — 앉아 있는 동안은 이동을 잠그고, 방향키 버티기만 판정한다
    if (game.puzzleRun && game.puzzleRun.puzzle.type === 'sofa' && game.puzzleRun.sitting) {
      updateSofaStand();
      return;
    }

    // 서성이는 NPC (wander) — 거리의 살금 등. 몇 초마다 한 칸씩, 집 근처(반경 2)만 돈다.
    if (game.time % 45 === 0) {
      const wm = MAPS[game.map];
      for (const npc of wm.npcs) {
        if (!npc.wander || !npcVisible(npc)) continue;
        if (npc.hx === undefined) { npc.hx = npc.x; npc.hy = npc.y; }
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = npc.x + dx, ny = npc.y + dy;
        if (Math.abs(nx - npc.hx) > 2 || Math.abs(ny - npc.hy) > 2) continue;
        if (SOLID(tileAt(game.map, nx, ny))) continue;
        if (nx === p.x && ny === p.y) continue;
        if (npcAt(game.map, nx, ny) || monsterAt(game.map, nx, ny)) continue;
        if ((wm.warps || []).some((w) => w.x === nx && w.y === ny)) continue; // 워프 칸 막지 않기
        if (game.puzzleRun && puzzleObjAt(game.map, nx, ny)) continue;
        npc.x = nx; npc.y = ny;
      }
    }

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

  function startBattleIntro(monId, persuadeKey) {
    // 모든 조우는 마음 조각 배틀(설득) — persuadeKey는 배치별 프로필(예: 보스방 담아='sujipmon_boss').
    startPersuadeIntro(monId, persuadeKey || monId);
  }

  // 학년별 난이도: 회피 구간 길이·탄막 속도 배율 (기본 1)
  function dodgeSpeedFactor() { return game.difficulty === 'easy' ? 0.8 : game.difficulty === 'hard' ? 1.25 : 1; }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // 다단계 보스: patterns 배열을 진행도에 따라 순서대로 펼친다 (점점 거세짐)
  function currentPattern(d, atk) {
    if (atk.patterns && atk.patterns.length > 1) {
      const seg = Math.floor((d.t / d.dur) * atk.patterns.length);
      return atk.patterns[Math.min(seg, atk.patterns.length - 1)];
    }
    return atk.pattern || (atk.patterns && atk.patterns[0]) || 'burst';
  }

  function spawnBullets(d, pattern, soul) {
    const box = d.box;
    const sf = d.sf || dodgeSpeedFactor();
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
    } else if (pattern === 'aimed') {
      // 위 가장자리에서 하트의 '현재 위치'를 겨냥해 쏜다 (개인을 노리는 느낌)
      const x = box.x + 12 + Math.random() * (box.w - 24), sy = box.y - 6;
      const tx = soul ? soul.x : box.x + box.w / 2, ty = soul ? soul.y : box.y + box.h / 2;
      const a = Math.atan2(ty - sy, tx - x);
      d.bullets.push({ x, y: sy, vx: Math.cos(a) * 2.3 * sf, vy: Math.sin(a) * 2.3 * sf, r: 5 });
    } else { // burst — 중앙에서 방사형
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const n = 6, base = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = base + i * Math.PI * 2 / n;
        d.bullets.push({ x: cx, y: cy, vx: Math.cos(a) * 2.0 * sf, vy: Math.sin(a) * 2.0 * sf, r: 5 });
      }
    }
  }

  function updateBattle() {
    const b = game.battle;
    if (b.shake > 0) b.shake -= 1;
    if (b.flash > 0) b.flash -= 1;

    if (b.isPersuade && (b.phase === 'wave' || b.phase === 'gates')) {
      updatePersuadeBattle();
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

  // 1장 보스 클리어 — chapter1Clear 플래그 + 1장 마무리 대사 후 금고 앞(거리)으로 복귀.
  // 라이브러리 퀴즈와 별개이므로 defeated.sujipmon/친구 수첩은 건드리지 않는다.
  function winChapter1Boss() {
    const b = game.battle;
    const mon = b.mon;
    game.flags.chapter1Clear = true;
    game.flags.chapter1Mercy = (b.mercyChoiceKind === 'mercy'); // 2장 콜백 인트로용
    if (game.flags.persuadeMemory) delete game.flags.persuadeMemory[b.persuadeId];
    save();
    checkCosmeticUnlocks(game.currentSlot);
    game.battle = null;
    game.mode = 'world';
    // 금고 밖(거리)으로 복귀
    game.map = 'freestreet';
    const p = game.player;
    p.x = 17; p.y = 5; p.px = 17 * TS; p.py = 5 * TS; p.moving = false; p.dir = 'down';
    held.delete('up'); held.delete('down'); held.delete('left'); held.delete('right');
    stickDir = null; stickRepeatFrames = 0;
    Sound.badge();
    Sound.playSong(MAPS.freestreet.song);
    const lines = [mon.win];
    if (b.mercyChoiceKind === 'mercy') {
      lines.push('💛 담아의 굳어 있던 마음이\n환하게 풀렸어요. 또 한 친구를 되돌렸다!');
    }
    lines.push('☆ 1장 클리어! ☆\n「전부 공짜 거리」의 네온이\n조용히 잦아들었다.');
    lines.push('담아가 상자마다 붙은\n「친구가 준 것」 라벨을\n하나씩 떼어 내기 시작했다.');
    lines.push(bandiBossLine('ch1', b.mercyChoiceKind, game.flags));
    startDialog(lines, mon.name, () => Sound.playSong(MAPS.freestreet.song));
  }

  // 2장 보스 클리어 — chapter2Clear 플래그 + 2장 마무리 대사 후 저울 앞(광장)으로 복귀.
  // (클리어 처리는 챕터 플래그로 기록한다)
  function winChapter2Boss() {
    const b = game.battle;
    const mon = b.mon;
    game.flags.chapter2Clear = true;
    game.flags.chapter2Mercy = (b.mercyChoiceKind === 'mercy'); // 3장 콜백 인트로용
    if (game.flags.persuadeMemory) delete game.flags.persuadeMemory[b.persuadeId];
    save();
    checkCosmeticUnlocks(game.currentSlot);
    game.battle = null;
    game.mode = 'world';
    // 저울 앞(광장)으로 복귀
    game.map = 'tiltstreet';
    const p = game.player;
    p.x = 14; p.y = 10; p.px = 14 * TS; p.py = 10 * TS; p.moving = false; p.dir = 'up';
    held.delete('up'); held.delete('down'); held.delete('left'); held.delete('right');
    stickDir = null; stickRepeatFrames = 0;
    Sound.badge();
    Sound.playSong(MAPS.tiltstreet.song);
    const lines = [mon.win];
    if (b.mercyChoiceKind === 'mercy') {
      lines.push('💛 기울의 한쪽으로 굳었던 마음이\n반대쪽으로도 천천히 열렸어요. 또 한 친구를 되돌렸다!');
    }
    lines.push('☆ 2장 클리어! ☆\n광장의 거대한 저울이,\n천천히 수평으로 내려앉았다.');
    lines.push('기울이 한쪽 접시의 짐을\n반대쪽에도 하나씩 옮겨 담기 시작했다.');
    lines.push(bandiBossLine('ch2', b.mercyChoiceKind, game.flags));
    startDialog(lines, mon.name, () => Sound.playSong(MAPS.tiltstreet.song));
  }

  // 3장 보스 클리어 — chapter3Clear 플래그 + 3장 마무리 대사 후 신문사 입구(거리)로 복귀.
  // (클리어 처리는 챕터 플래그로 기록한다)
  function winChapter3Boss() {
    const b = game.battle;
    const mon = b.mon;
    game.flags.chapter3Clear = true;
    game.flags.chapter3Mercy = (b.mercyChoiceKind === 'mercy');
    if (game.flags.persuadeMemory) delete game.flags.persuadeMemory[b.persuadeId];
    save();
    checkCosmeticUnlocks(game.currentSlot);
    game.battle = null;
    game.mode = 'world';
    // 신문사 입구(거리)로 복귀 — 이미 rumorFixed 상태라 거리는 풀린 모습이다
    game.map = 'rumorstreet';
    const p = game.player;
    p.x = 17; p.y = 5; p.px = 17 * TS; p.py = 5 * TS; p.moving = false; p.dir = 'down';
    held.delete('up'); held.delete('down'); held.delete('left'); held.delete('right');
    stickDir = null; stickRepeatFrames = 0;
    Sound.badge();
    Sound.playSong(MAPS.rumorstreet.song);
    const lines = [mon.win];
    if (b.mercyChoiceKind === 'mercy') {
      lines.push('💛 그럴싸의 [속보] 뒤에 숨어 있던 마음이\n조용히 풀렸어요. 또 한 친구를 되돌렸다!');
    }
    lines.push('☆ 3장 클리어! ☆\n거리의 헤드라인 벽보가\n하나둘 [정정] 딱지로 바뀌었다.');
    lines.push('상점 문들이 활짝 열리고,\n주민들의 얼굴에 웃음이 돌아왔다.');
    lines.push(bandiBossLine('ch3', b.mercyChoiceKind, game.flags));
    startDialog(lines, mon.name, () => Sound.playSong(MAPS.rumorstreet.song));
  }

  // 4장 보스 클리어 — chapter4Clear 플래그 + 4장 마무리 대사 후 아케이드 정문 앞(허브)으로 복귀.
  // (클리어 처리는 챕터 플래그로 기록한다)
  function winChapter4Boss() {
    const b = game.battle;
    const mon = b.mon;
    game.flags.chapter4Clear = true;
    game.flags.chapter4Mercy = (b.mercyChoiceKind === 'mercy'); // 다음 장 콜백 인트로용
    if (game.flags.persuadeMemory) delete game.flags.persuadeMemory[b.persuadeId];
    save();
    checkCosmeticUnlocks(game.currentSlot);
    game.battle = null;
    game.mode = 'world';
    // 아케이드 정문 앞(허브)으로 복귀
    game.map = 'arcade';
    const p = game.player;
    p.x = 18; p.y = 2; p.px = 18 * TS; p.py = 2 * TS; p.moving = false; p.dir = 'down';
    held.delete('up'); held.delete('down'); held.delete('left'); held.delete('right');
    stickDir = null; stickRepeatFrames = 0;
    Sound.badge();
    Sound.playSong(MAPS.arcade.song);
    const lines = [mon.win];
    if (b.mercyChoiceKind === 'mercy') {
      lines.push('💛 반짝의 반짝임 뒤에 숨어 있던 마음이\n조용히 풀렸어요. 또 한 친구를 되돌렸다!');
    }
    lines.push('☆ 4장 클리어! ☆\n무대의 네온사인이\n하나둘 차분한 빛으로 바뀌었다.');
    lines.push('반짝이 남은 광고 딱지들을\n하나씩 떼어 내기 시작했다.');
    lines.push(bandiBossLine('ch4', b.mercyChoiceKind, game.flags));
    startDialog(lines, mon.name, () => Sound.playSong(MAPS.arcade.song));
  }

  // 5장 보스 클리어 — chapter5Clear 플래그 + 5장 마무리 대사 후 포근한 집 현관 앞(허브)으로 복귀.
  // v1 홀림몬(BOSS_ATTACKS 퀴즈)과 별개이므로 defeated.hollimmon/친구 수첩은 건드리지 않는다.
  function winChapter5Boss() {
    const b = game.battle;
    const mon = b.mon;
    game.flags.chapter5Clear = true;
    game.flags.chapter5Mercy = (b.mercyChoiceKind === 'mercy'); // 다음 장 콜백 인트로용
    if (game.flags.persuadeMemory) delete game.flags.persuadeMemory[b.persuadeId];
    save();
    checkCosmeticUnlocks(game.currentSlot);
    game.battle = null;
    game.mode = 'world';
    // 포근한 집 현관 앞(허브)으로 복귀
    game.map = 'cozyhome';
    const p = game.player;
    p.x = 18; p.y = 2; p.px = 18 * TS; p.py = 2 * TS; p.moving = false; p.dir = 'down';
    held.delete('up'); held.delete('down'); held.delete('left'); held.delete('right');
    stickDir = null; stickRepeatFrames = 0;
    Sound.badge();
    Sound.playSong(MAPS.cozyhome.song);
    const lines = [mon.win];
    if (b.mercyChoiceKind === 'mercy') {
      lines.push('💛 루미의 붙잡던 손 뒤에 숨어 있던 마음이\n조용히 풀렸어요. 또 한 친구를 되돌렸다!');
    }
    lines.push('☆ 5장 클리어! ☆\n집 안의 공기가\n한결 가벼워졌다.');
    lines.push('루미가 현관문을\n스스로 열어 두었다.');
    lines.push(bandiBossLine('ch5', b.mercyChoiceKind, game.flags));
    startDialog(lines, mon.name, () => Sound.playSong(MAPS.cozyhome.song));
  }

  // 파이널 보스(고요) 클리어 — goyoClear 플래그 + 코어 개방 연출 후 코어로 입장.
  // (클리어 처리는 goyoClear 플래그로 기록한다)
  function winGoyoBoss() {
    const b = game.battle;
    const mon = b.mon;
    game.flags.goyoClear = true;
    game.flags.goyoMercy = (b.mercyChoiceKind === 'mercy');
    if (game.flags.persuadeMemory) delete game.flags.persuadeMemory[b.persuadeId];
    save();
    checkCosmeticUnlocks(game.currentSlot);
    game.battle = null;
    game.mode = 'world';
    // 코어로 입장
    game.map = 'coreroom';
    const p = game.player;
    p.x = 7; p.y = 8; p.px = 7 * TS; p.py = 8 * TS; p.moving = false; p.dir = 'up';
    held.delete('up'); held.delete('down'); held.delete('left'); held.delete('right');
    stickDir = null; stickRepeatFrames = 0;
    Sound.badge();
    Sound.playSong(MAPS.coreroom.song);
    const lines = [mon.win];
    if (b.mercyChoiceKind === 'mercy') {
      lines.push('💛 고요의 침묵 뒤에 숨어 있던 마음이\n조용히 풀렸어요. 또 한 친구를 되돌렸다!');
    }
    lines.push('☆ 가장 깊은 곳의 문이 열렸다 ☆\n…고요를 지나, 코어로 들어선다.');
    lines.push(bandiBossLine('goyo', b.mercyChoiceKind, game.flags));
    startDialog(lines, mon.name, () => Sound.playSong(MAPS.coreroom.song));
  }

  function winBattle() {
    const b = game.battle;
    const mon = b.mon;
    // 챕터 보스 — 별도 진행 플래그(chapterNClear)로 처리한다
    if (b.persuadeId === 'sujipmon_boss') { winChapter1Boss(); return; }
    if (b.persuadeId === 'pyeonhyang_boss') { winChapter2Boss(); return; }
    if (b.persuadeId === 'hwangak_boss') { winChapter3Boss(); return; }
    if (b.persuadeId === 'yuhok_boss') { winChapter4Boss(); return; }
    if (b.persuadeId === 'hollim_boss') { winChapter5Boss(); return; }
    if (b.persuadeId === 'goyo_boss') { winGoyoBoss(); return; }
    // 영이(yeongi_boss) — 별도 조기 반환 없음. monId가 'yeongi'이므로 아래 일반 경로를 거쳐
    // 기존 v1 yeongi 분기(진엔딩 계산)로 자연스럽게 이어진다.
    game.flags.defeated[b.monId] = true;
    recordDexSeen(b.monId, b.mercyChoiceKind);
    if (!game.flags.mercyChoice) game.flags.mercyChoice = {};
    game.flags.mercyChoice[b.monId] = b.mercyChoiceKind || null;
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
    if (b.monId === 'bekkyeomon') {
      game.flags.prologueClosed = true;
      game.map = 'freestreet';
      const p = game.player;
      p.x = 18; p.y = 21; p.px = 18 * TS; p.py = 21 * TS; p.moving = false; p.dir = 'up';
      held.delete('up'); held.delete('down'); held.delete('left'); held.delete('right');
      stickDir = null; stickRepeatFrames = 0;
      lines.push('숲 안쪽 공터의 종이들이 조용히 접힌다.\n멀리서 네온 간판 하나가 반짝이며 문처럼 열린다.');
      lines.push('프롤로그 끝.\n이제 1장 — 「전부 공짜 거리」로 들어간다.');
      save();
    }
    if (mon.clear) lines.push(mon.clear);
    if (b.monId === 'bekkyeomon') lines.push(bandiBossLine('prologue', b.mercyChoiceKind, game.flags));
    if (b.monId === 'yeongi') {
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

  // ---------- v2 「마음 조각 배틀」(행동 설득) ----------
  // 메뉴·차단형 텍스트 없이, 탄막 상자 안의 공간 행동으로 마음을 되돌린다.
  //   wave  : 탄막을 피하며 속마음 조각 ✦을 줍는다 (조각 = 비차단 플로팅 + 게이지 +2)
  //   gates : 타임 슬로우 + 문 3개. 마음에 닿는 문으로 하트가 들어가면 큰 폭 상승.
  //   mercy/mercyReply : 게이지 만충 → 마음의 선택 (기존 그대로)
  // 마음 상태: closed(닫힘) → shaken(동요) → open(열림). closed에선 문이 전부 잠긴다.
  const P_STATE_LABEL = { closed: '닫힘', shaken: '동요', open: '열림' };

  function ownedCards() {
    return (game.flags.evCards || []).filter((id) => EVIDENCE_CARDS[id]);
  }

  // ---------- 코어 제단의 봉헌 퍼즐 ----------
  // 어둠이 남긴 마지막 속삭임 8개(SHRINE_WHISPERS)에, 소지한 증거 카드 중 맞는 것을
  // startChoice로 골라 꽂는다. 오답도 허용하고 기록만 한다(shrineWrong). 8개를 모두
  // 지나면 finishShrine()이 영이를 등장시킨다(show: flags.shrineDone).
  function interactAltar() {
    if (game.flags.shrineDone) {
      startDialog(['제단이 고요하다.\n…봉헌은 이미 끝났다.'], '제단');
      return;
    }
    if ((game.flags.shrineIdx || 0) === 0) {
      startDialog([
        '제단 위, 어둠이 남긴 마지막 속삭임들이\n희미하게 새겨져 있다.',
        '가진 증거 카드로, 하나씩\n맞는 자리에 꽂아 보자.',
      ], '제단', () => openShrineWhisper());
      return;
    }
    openShrineWhisper();
  }
  function openShrineWhisper() {
    const idx = game.flags.shrineIdx || 0;
    if (idx >= SHRINE_WHISPERS.length) { finishShrine(); return; }
    const w = SHRINE_WHISPERS[idx];
    const owned = ownedCards();
    const labels = owned.map((id) => EVIDENCE_CARDS[id].title);
    labels.push('그만두기');
    startChoice(`속삭임 ${idx + 1}/${SHRINE_WHISPERS.length}\n${w.text}`, labels, (i) => {
      if (i < 0 || i >= owned.length) return; // 그만두기/취소 — 진행하지 않는다
      const picked = owned[i];
      game.flags.shrineIdx = idx + 1;
      if (picked === w.answer) {
        Sound.correct();
        startDialog([`「${EVIDENCE_CARDS[picked].title}」…\n속삭임이 스르르 옅어진다.`], '제단', () => {
          save();
          if (game.flags.shrineIdx >= SHRINE_WHISPERS.length) finishShrine();
        });
      } else {
        game.flags.shrineWrong = (game.flags.shrineWrong || 0) + 1;
        Sound.wrong();
        startDialog(['…그 카드는, 이 속삭임에는\n맞지 않는 듯하다.'], '제단', () => {
          save();
          if (game.flags.shrineIdx >= SHRINE_WHISPERS.length) finishShrine();
        });
      }
    });
  }
  function finishShrine() {
    if (game.flags.shrineDone) return;
    game.flags.shrineDone = true;
    game.flags.bandiRevealed = true; // 동행 종료 — 가면을 벗는다
    save();
    startDialog([
      '마지막 속삭임이 사라지자,\n어깨 옆의 반디가\n천천히 떠오른다.',
      '반디: "…있지. 아까 하려던 말,\n지금 할게."',
      '반디: "나… 안내 도우미가 아니야.\n이 세계엔, 그런 거 없어."',
      '(작은 빛이 제단의 빛 속으로 녹아들고 —\n그 안에, 작은 아이가 서 있다.)',
      '"…처음부터, 나였어."',
    ]);
  }

  // 교사 진단용 로그 — 마음 조각 배틀 개편판
  function pStats() {
    if (!game.flags.pStats || game.flags.pStats.fragments === undefined) {
      game.flags.pStats = { fragments: 0, gateRight: 0, gateWrong: 0, gateTimeout: 0, perfectWaves: 0, backfire: 0 };
    }
    return game.flags.pStats;
  }

  // 설득 프로필(persuadeKey)의 인물 데이터를 해석한다.
  // 보스처럼 별도 프로필을 쓰되 스프라이트/이름은 재사용하는 경우(spriteId≠persuadeKey),
  // MONSTERS[spriteId]를 바탕으로 프로필의 mercy/win을 덮어써 배틀용 mon을 만든다.
  function resolvePersuadeMon(spriteId, persuadeKey) {
    const base = MONSTERS[spriteId];
    const p = getPersuade(persuadeKey);
    if (persuadeKey === spriteId || !p) return base;
    return Object.assign({}, base, {
      mercy: p.mercy || base.mercy,
      win: p.win || base.win,
    });
  }

  function startPersuadeIntro(monId, persuadeKey) {
    persuadeKey = persuadeKey || monId;
    const p = getPersuade(persuadeKey);
    const mon = resolvePersuadeMon(monId, persuadeKey);
    Sound.encounter();
    // 콜백 인트로: 프로필 intro가 함수면 현재 플래그로 첫 대사를 분기한다 (없으면 기본 인트로)
    const introText = (typeof p.intro === 'function') ? p.intro(game.flags) : (p.intro || mon.intro);
    const lines = [introText];
    // 조우 시 증거 카드 지급은 프롤로그 튜토리얼(베껴몬)만을 위한 것 —
    // starterCards가 있는 프로필에서만 지급한다. 보스 카드는 방탈출 보상으로만 얻으므로
    // starterCards가 없어 여기서 지급되지 않는다.
    if (!game.flags.evCards) game.flags.evCards = [];
    const fresh = (p.starterCards || []).filter((id) => !game.flags.evCards.includes(id));
    if (fresh.length > 0) {
      game.flags.evCards = game.flags.evCards.concat(fresh);
      lines.push(`◆ 증거 카드 ${fresh.length}장을 얻었다!\n(설득 배틀에서 「증거 보여주기」로 사용해요)`);
    }
    if (!game.flags.sawPersuadeTip) {
      game.flags.sawPersuadeTip = true;
      lines.push(
        '[마음 조각 배틀]\n이 아이는 퀴즈가 아니라 「행동」으로 되돌려요.\n하트를 움직여 탄막을 피하면서 싸워요.',
        '✦를 주워 속마음을 듣고, 문이 열리면 하트로 통과!\n마음에 닿는 문으로 들어가면 마음이 열려요.\n엉뚱한 문은 역효과, 자물쇠 문은 아직 못 열어요.',
        (isTouchDevice
          ? '스틱으로 하트만 움직이면 돼요. (버튼 없음)'
          : '화살표로 하트를 움직여요.') +
        '\n탄막에 맞으면 하트가 정말로 닳아요! 다 닳으면\n잠시 물러났다가 다시 도전하게 돼요.'
      );
    }
    startDialog(lines, mon.name, () => startPersuadeBattle(monId, persuadeKey));
  }

  // ── 배틀 상자·하트 지오메트리 (파도·문 공용) ──
  // y=190(과거 150) — 상자 위 안내 문구 두 줄이 하트 HUD(y100~144) 아래로
  // 내려오도록 40px 더 내렸다(레이아웃 겹침 수정, drawArenaGuide 참고).
  const PBOX = { w: 320, h: 180 };
  const PBOX_CENTER_Y = 280; // 190 + 180/2 — shrink 축소 시 중심을 유지하는 기준
  function persuadeBox() { return { x: Math.round(LW / 2 - PBOX.w / 2), y: 190, w: PBOX.w, h: PBOX.h }; }
  // 루미(보스) open 페이즈 고유 기믹 — 상자 축소(shrink). 파도마다 한 단계씩 좁아지고
  // (b.shrinkLevel — 파도 넘어 영속), 정답 문을 통과하면 한 단계 회복된다. 최소 200×120.
  const SHRINK_STEP = { w: 24, h: 12 };
  const SHRINK_MIN = { w: 200, h: 120 };
  const SHRINK_MAX_LEVEL = 5; // (320-200)/24 = (180-120)/12 = 5단계로 하한에 도달
  function applyShrinkBox(b) {
    if (b.p.openMechanic !== 'shrink') return;
    const lvl = Math.max(0, Math.min(SHRINK_MAX_LEVEL, b.shrinkLevel || 0));
    b.shrinkLevel = lvl;
    const box = b.arena.box;
    box.w = Math.max(SHRINK_MIN.w, PBOX.w - lvl * SHRINK_STEP.w);
    box.h = Math.max(SHRINK_MIN.h, PBOX.h - lvl * SHRINK_STEP.h);
    box.x = Math.round(LW / 2 - box.w / 2);
    box.y = Math.round(PBOX_CENTER_Y - box.h / 2); // 원래 상자 중심을 유지하며 좁아진다
    // 하트가 좁아진 상자 밖에 남지 않도록 즉시 다시 가둔다
    const arena = b.arena;
    arena.soul.x = Math.max(box.x + SOUL_R, Math.min(box.x + box.w - SOUL_R, arena.soul.x));
    arena.soul.y = Math.max(box.y + SOUL_R, Math.min(box.y + box.h - SOUL_R, arena.soul.y));
  }
  const SOUL_R = 7;

  function startPersuadeBattle(monId, persuadeKey) {
    persuadeKey = persuadeKey || monId;
    const p = getPersuade(persuadeKey);
    const mon = resolvePersuadeMon(monId, persuadeKey);
    game.mode = 'battle';
    Sound.playSong(mon.song || 'battle');
    // 물러났던 상대는 이야기를 절반쯤 기억한다 (재도전은 더 짧게). 기억은 프로필별로 구분한다.
    const memo = (game.flags.persuadeMemory || {})[persuadeKey];
    const maxHearts = 4 + (game.difficulty === 'easy' ? 1 : 0);
    const box = persuadeBox();
    game.battle = {
      isPersuade: true,
      monId,              // 스프라이트·데이터 조회용 id
      persuadeId: persuadeKey, // 설득 프로필 id (클리어 처리·기억 키). 보통은 monId와 같다.
      mon,
      p,
      gauge: memo ? memo.gauge : 0,
      // gaugeMax는 고정값 또는 flags를 받는 함수(고요의 침묵 루트 강화용) — 배틀 시작 시 1회만 계산해 굳힌다
      gaugeMax: (typeof p.gaugeMax === 'function') ? p.gaugeMax(game.flags) : (p.gaugeMax || 100),
      pState: memo ? memo.state : 'closed',
      claimIdx: 0,
      playerHp: maxHearts,
      maxHearts,
      phase: 'wave', // wave | gates | mercy | mercyReply
      prologueTutorial: !!(p.tutorial && monId === 'bekkyeomon'),
      cursor: 0,
      fragmentTotal: 0, // 누적 수집 조각 (closed→shaken 임계 판정)
      pIntense: false,  // 오답 문 → 다음 파도 강화
      // 탄막·하트가 사는 공용 필드 (파도↔문 사이에 위치·탄막 유지)
      arena: {
        box, soul: { x: box.x + box.w / 2, y: box.y + box.h - 30 },
        bullets: [], spiralA: 0, sf: 1, rateMul: 1, inv: 0, carrying: false,
      },
      floatActive: null, // 화면 위 비차단 플로팅 (동시 1줄)
      floatQ: [],
      wave: null,
      gates: null,
      shake: 0,
      flash: 0,
      attack: null,
    };
    game.flags.battleCount += 1;
    enterWave();
  }

  // 지금 순환 풀에 올라온 주장들 — unlockAt이 걸린 주장은 게이지가 그 값 이상일 때만 등장한다.
  function availableClaims(b) {
    const avail = b.p.claims.filter((c) => !c.unlockAt || b.gauge >= c.unlockAt);
    return avail.length ? avail : b.p.claims; // 안전장치: 비면 전체
  }
  function currentClaim() {
    const b = game.battle;
    const avail = availableClaims(b);
    return avail[b.claimIdx % avail.length];
  }
  function monTopic(b) { return Array.isArray(b.mon.topic) ? b.mon.topic[0] : b.mon.topic; }

  // 비차단 플로팅 텍스트 — 큐에 넣고 한 번에 한 줄씩 상자 위를 흐른다.
  // speak=true면 game.tts일 때 Speech.speak로도 읽어 준다 — 과도한 수다를 막기 위해
  // 기믹의 "결과성" 이벤트(운반·버티기·진위 판정 완료 등)에만 선택적으로 붙인다.
  function pushFloat(text, speak) {
    if (!text) return;
    game.battle.floatQ.push(text);
    if (speak && game.tts) Speech.speak(text);
  }
  function updateFloats(b) {
    if (!b.floatActive && b.floatQ.length) b.floatActive = { text: b.floatQ.shift(), t: 0, dur: 150 };
    if (b.floatActive) { b.floatActive.t += 1; if (b.floatActive.t >= b.floatActive.dur) b.floatActive = null; }
  }

  // 마음 상태 전이 + 게이지 만충 판정을 한곳에서 처리한다.
  function persuadeGaugeSync(b) {
    b.gauge = clamp(b.gauge, 0, b.gaugeMax);
    const thr = b.p.closedThreshold || 3;
    if (b.pState === 'closed' && (b.fragmentTotal >= thr || b.gauge >= 30)) {
      b.pState = 'shaken';
      pushFloat('…너, 듣고 있었어?');
    }
    if (b.pState !== 'open' && b.gauge >= 55) {
      b.pState = 'open';
      pushFloat(b.p.react.open);
    }
  }
  // 게이지 만충 → 마음의 선택(자비)으로. (mercy/mercyReply는 기존 그대로)
  function persuadeTriumph() {
    const b = game.battle;
    if (game.flags.persuadeMemory) delete game.flags.persuadeMemory[b.persuadeId];
    b.arena.carrying = false;
    if (b.mon.mercy && !b.mercyDone) {
      b.phase = 'mercy'; b.cursor = 0; Sound.badge();
    } else {
      winBattle();
    }
  }

  // ── 파도(wave): 탄막을 피하며 속마음 조각 ✦을 줍는다 ──
  function spawnFragment(w, box, claim, i) {
    const lines = (claim.fragments && claim.fragments.length) ? claim.fragments : [claim.hint || '…'];
    return {
      x: box.x + 30 + Math.random() * (box.w - 60),
      y: box.y + 30 + Math.random() * (box.h - 60),
      ttl: 360, // 6초 후 소멸·재스폰
      line: lines[i % lines.length],
    };
  }
  function enterWave() {
    const b = game.battle;
    const claim = currentClaim();
    b.attack = claim.attack;
    b.phase = 'wave';
    applyShrinkBox(b); // 루미(보스) — 파도 시작 시 현재 축소 단계를 상자에 반영
    const box = b.arena.box;
    // 스테이지 1(1장) 고정 난이도 + 프로필별 탄속 완화/강화 + 오답 역효과 강화
    // waveBulletMul은 고정값 또는 flags를 받는 함수(고요의 침묵 루트 강화용)일 수 있다
    const bulletMul = (typeof b.p.waveBulletMul === 'function') ? b.p.waveBulletMul(game.flags) : b.p.waveBulletMul;
    let sf = dodgeSpeedFactor() * (bulletMul || 1);
    let rateMul = 1;
    if (b.pIntense) { sf *= 1.3; rateMul *= 0.75; b.pIntense = false; }
    b.arena.sf = sf; b.arena.rateMul = rateMul; b.arena.bullets = []; b.arena.spiralA = 0; b.arena.inv = 0;
    b.arena.carrying = false;
    const n = b.p.fragmentsPerWave || 3;
    const frags = [];
    for (let i = 0; i < n; i++) frags.push(spawnFragment(null, box, claim, i));
    b.wave = {
      t: 0, dur: b.p.waveDur || 300, spawnTimer: 30,
      fragments: frags, fragTotal: n, collected: 0, hits: 0,
      // 담아(보스) open 페이즈 고유 기믹 — 「정보 꾸러미」 운반
      // 배달 진행은 파도가 바뀌어도 이어진다 (한 파도 안에 3배달은 사실상 불가능하므로)
      parcel: { obj: null, deliveries: b.parcelDeliveries || 0, spawnTimer: 90,
        hole: { x: box.x + box.w - 18, y: box.y + box.h / 2 } },
      // 기울(보스) open 페이즈 고유 기믹 — 기울어지는 상자: 「반례 구슬」을 저울 접시로 운반
      tilt: { orb: null, deliveries: b.tiltDeliveries || 0, spawnTimer: 90,
        drift: [0.9, 0.6, 0.3, 0][Math.min(b.tiltDeliveries || 0, 3)],
        plate: { x: box.x + box.w - 18, y: box.y + box.h / 2 } },
      // 반짝(보스) open 페이즈 고유 기믹 — 반짝이는 보상 아이템: 건드리면 역효과, 240프레임
      // 버티면 소멸+보상. 버틴 횟수(resisted)는 파도가 바뀌어도 이어진다(최대 3).
      tempt: { obj: null, resisted: b.temptResisted || 0, spawnTimer: 60 },
      // 그럴싸(보스) open 페이즈 고유 기믹 — [진]/[낚] 헤드라인 조각이 60프레임 간격으로
      // 번갈아 스폰된다. 잡은 [진] 개수(caught)는 파도가 바뀌어도 이어진다(최대 3).
      truth: { obj: null, caught: b.truthCaught || 0, spawnTimer: 60, nextKind: 'real' },
    };
    // 고요(보스) open 페이즈 고유 기믹 — 어둠 속, 하트 주변만 보인다. 배틀 전체에서 딱 한 번,
    // 첫 open 파도에서 탄막이 나오기 전 스폰 위치를 잠깐 깜빡여 예고한다(darkWarnT).
    if (b.p.openMechanic === 'dark' && b.pState === 'open' && !b.darkWarned) {
      b.darkWarned = true;
      b.wave.darkWarnT = 30;
      b.wave.spawnTimer += 30; // 예고가 끝난 뒤에야 첫 탄막이 나온다
    }
    if (game.tts) Speech.speak(claim.text);
  }

  function collectFragment(b, fi) {
    const w = b.wave;
    const f = w.fragments[fi];
    pushFloat(f.line);
    b.gauge = clamp(b.gauge + 2, 0, b.gaugeMax);
    pStats().fragments += 1;
    b.fragmentTotal += 1;
    w.collected += 1;
    w.fragments.splice(fi, 1); // 주운 조각은 사라진다 (미수집분만 6초 후 재스폰)
    Sound.correct();
    persuadeGaugeSync(b);
  }

  function moveSoul(arena, box, speedMul) {
    const sp = 3.4 * speedMul;
    if (held.has('left')) arena.soul.x -= sp;
    if (held.has('right')) arena.soul.x += sp;
    if (held.has('up')) arena.soul.y -= sp;
    if (held.has('down')) arena.soul.y += sp;
    arena.soul.x = clamp(arena.soul.x, box.x + SOUL_R, box.x + box.w - SOUL_R);
    arena.soul.y = clamp(arena.soul.y, box.y + SOUL_R, box.y + box.h - SOUL_R);
  }

  // 하트-탄막 충돌: 닿으면 하트 -1, 다 닳으면 탈진.
  function bulletHits(b, arena) {
    if (arena.inv > 0) { arena.inv -= 1; return false; }
    for (const bu of arena.bullets) {
      const dx = bu.x - arena.soul.x, dy = bu.y - arena.soul.y;
      if (dx * dx + dy * dy < (SOUL_R + bu.r) * (SOUL_R + bu.r)) {
        b.playerHp = Math.max(0, b.playerHp - 1);
        arena.inv = 42; b.flash = 12; Sound.bump();
        return true;
      }
    }
    return false;
  }

  function updateWave() {
    const b = game.battle, w = b.wave, arena = b.arena, box = arena.box;
    if (b.shake > 0) b.shake -= 1;
    if (b.flash > 0) b.flash -= 1;
    w.t += 1;
    updateFloats(b);
    // 고요(보스) — 첫 open 파도의 탄막 예고 깜빡임 카운트다운
    if (w.darkWarnT > 0) w.darkWarnT -= 1;

    moveSoul(arena, box, arena.carrying ? 0.6 : 1);

    // 기울(보스) open 페이즈 — 기울기 드리프트: 하트가 낮은 쪽(왼쪽)으로 조금씩 미끄러진다
    const tiltActive = b.p.openMechanic === 'tilt' && b.pState === 'open';
    if (tiltActive) {
      arena.soul.x -= w.tilt.drift;
      arena.soul.x = clamp(arena.soul.x, box.x + SOUL_R, box.x + box.w - SOUL_R);
    }

    // 탄막 생성 (끝나기 직전엔 멈춤)
    w.spawnTimer -= 1;
    if (w.spawnTimer <= 0 && w.t < w.dur - 40) {
      const pat = currentPattern({ t: w.t, dur: w.dur }, b.attack);
      spawnBullets(arena, pat, arena.soul);
      const baseRate = pat === 'burst' ? 24 : pat === 'spiral' ? 8
        : pat === 'wall' ? 42 : pat === 'zigzag' ? 18 : pat === 'aimed' ? 16 : 15;
      w.spawnTimer = Math.max(4, Math.round(baseRate * (arena.rateMul || 1)));
    }
    // 탄막 이동 + 화면 밖 제거 (기울기 드리프트의 절반이 탄막에도 실린다)
    const tiltBulletDrift = tiltActive ? w.tilt.drift * 0.5 : 0;
    for (const bu of arena.bullets) {
      if (bu.zig) { bu.zigT = (bu.zigT || 0) + 1; bu.vy = Math.sin(bu.zigT / 7) * bu.zig; }
      bu.x += bu.vx - tiltBulletDrift; bu.y += bu.vy;
    }
    arena.bullets = arena.bullets.filter((bu) =>
      bu.x > box.x - 24 && bu.x < box.x + box.w + 24 && bu.y > box.y - 24 && bu.y < box.y + box.h + 24);

    if (bulletHits(b, arena)) { w.hits += 1; if (b.playerHp <= 0) { persuadeExhaust(); return; } }

    // 속마음 조각 ✦ — 접촉 수집 / 6초 지나면 재스폰
    for (let i = w.fragments.length - 1; i >= 0; i--) {
      const f = w.fragments[i];
      f.ttl -= 1;
      const dx = f.x - arena.soul.x, dy = f.y - arena.soul.y;
      if (dx * dx + dy * dy < (SOUL_R + 9) * (SOUL_R + 9)) { collectFragment(b, i); continue; }
      if (f.ttl <= 0) w.fragments[i] = spawnFragment(null, box, currentClaim(), i);
    }

    // 담아(보스) open 페이즈 — 「정보 꾸러미」 운반 기믹
    if (b.p.openMechanic === 'parcel' && b.pState === 'open') updateParcel(b);
    // 기울(보스) open 페이즈 — 기울어지는 상자: 「반례 구슬」 운반 기믹
    if (tiltActive) updateTilt(b);
    // 반짝(보스) open 페이즈 — 반짝이는 보상 아이템: 접촉=역효과, 버티면 보상(피해로 탈진 가능)
    if (b.p.openMechanic === 'tempt' && b.pState === 'open') {
      updateTempt(b);
      if (!game.battle) return; // 접촉 피해로 탈진했으면 여기서 중단
    }
    // 그럴싸(보스) open 페이즈 — [진]/[낚] 헤드라인 조각: [진]=게이지+6(누적 3회째 보너스),
    // [낚]=게이지-4+화면 얼룩(피해 없음)
    if (b.p.openMechanic === 'truth' && b.pState === 'open') updateTruth(b);

    if (b.gauge >= b.gaugeMax) { persuadeTriumph(); return; }

    // 파도 종료: 조각 다 모으거나 시간 만료 → 문(gates)으로
    if (w.collected >= w.fragTotal || w.t >= w.dur) {
      if (w.hits === 0) { b.gauge = clamp(b.gauge + 6, 0, b.gaugeMax); pStats().perfectWaves += 1;
        pushFloat('(끝까지 봐 줬다… 마음 +6)'); persuadeGaugeSync(b); }
      if (b.gauge >= b.gaugeMax) { persuadeTriumph(); return; }
      enterGates();
    }
  }
  function updateParcel(b) {
    const w = b.wave, pc = w.parcel, arena = b.arena, box = arena.box;
    if (!pc.obj && !arena.carrying) {
      pc.spawnTimer -= 1;
      if (pc.spawnTimer <= 0) {
        pc.obj = { x: box.x + 40 + Math.random() * (box.w - 80), y: box.y + 40 + Math.random() * (box.h - 80) };
      }
    }
    if (pc.obj) {
      const dx = pc.obj.x - arena.soul.x, dy = pc.obj.y - arena.soul.y;
      if (dx * dx + dy * dy < (SOUL_R + 10) * (SOUL_R + 10)) { // 집기 (1개만)
        arena.carrying = true; pc.obj = null; Sound.blip();
      }
    }
    if (arena.carrying) {
      const dx = pc.hole.x - arena.soul.x, dy = pc.hole.y - arena.soul.y;
      if (dx * dx + dy * dy < (SOUL_R + 12) * (SOUL_R + 12)) { // 배달
        arena.carrying = false; pc.deliveries += 1; b.parcelDeliveries = pc.deliveries;
        b.gauge = clamp(b.gauge + 10, 0, b.gaugeMax);
        pushFloat(b.p.parcelReply || '…돌려줄게.', true);
        if (pc.deliveries >= 3) b.gauge = Math.max(b.gauge, b.gaugeMax - 2); // 3회 → 만충 직전
        pc.spawnTimer = 90;
        Sound.correct();
        persuadeGaugeSync(b);
      }
    }
  }
  // 기울(보스) open 페이즈 고유 기믹 — 기울어지는 상자: 「반례 구슬」을 저울 접시로 운반
  const TILT_DRIFT_STEPS = [0.9, 0.6, 0.3, 0];
  function updateTilt(b) {
    const w = b.wave, tl = w.tilt, arena = b.arena, box = arena.box;
    if (!tl.orb && !arena.carrying) {
      tl.spawnTimer -= 1;
      if (tl.spawnTimer <= 0) { // 낮은 쪽(왼쪽) 절반에만 스폰
        tl.orb = { x: box.x + 20 + Math.random() * (box.w / 2 - 40), y: box.y + 40 + Math.random() * (box.h - 80) };
      }
    }
    if (tl.orb) {
      const dx = tl.orb.x - arena.soul.x, dy = tl.orb.y - arena.soul.y;
      if (dx * dx + dy * dy < (SOUL_R + 10) * (SOUL_R + 10)) { // 집기 (1개만)
        arena.carrying = true; tl.orb = null; Sound.blip();
      }
    }
    if (arena.carrying) {
      const dx = tl.plate.x - arena.soul.x, dy = tl.plate.y - arena.soul.y;
      if (dx * dx + dy * dy < (SOUL_R + 12) * (SOUL_R + 12)) { // 높은 쪽(오른쪽) 저울 접시에 배달
        arena.carrying = false; tl.deliveries += 1; b.tiltDeliveries = tl.deliveries;
        b.gauge = clamp(b.gauge + 10, 0, b.gaugeMax);
        // 0.9 → 0.6 → 0.3 → 0 (표를 사용해 부동소수점 오차 없이 정확한 값으로)
        tl.drift = TILT_DRIFT_STEPS[Math.min(tl.deliveries, TILT_DRIFT_STEPS.length - 1)];
        pushFloat((b.p.tiltReply || '…어? 저울이… 움직였다?') + '\n(기울기가 줄었다!)', true);
        if (tl.deliveries >= 3) b.gauge = Math.max(b.gauge, b.gaugeMax - 2); // 3회 → 만충 직전
        tl.spawnTimer = 90;
        Sound.correct();
        persuadeGaugeSync(b);
      }
    }
  }
  // 반짝(보스) open 페이즈 고유 기믹 — 반짝이는 보상 아이템: 240프레임 동안 건드리지
  // 않고 버티면 소멸+게이지 +10+조명 하나 꺼짐(최대 3회). 접촉하면 피해+광고 얼룩(역효과).
  const TEMPT_SURVIVE_FRAMES = 240;
  function updateTempt(b) {
    const w = b.wave, tp = w.tempt, arena = b.arena, box = arena.box;
    if (!tp.obj) {
      tp.spawnTimer -= 1;
      if (tp.spawnTimer <= 0) {
        tp.obj = {
          x: box.x + 30 + Math.random() * (box.w - 60),
          y: box.y + 30 + Math.random() * (box.h - 60),
          age: 0,
        };
      }
      return;
    }
    tp.obj.age += 1;
    const dx = tp.obj.x - arena.soul.x, dy = tp.obj.y - arena.soul.y;
    if (dx * dx + dy * dy < (SOUL_R + 10) * (SOUL_R + 10)) {
      // 접촉 — 역효과: 피해 + 광고 얼룩
      tp.obj = null;
      tp.spawnTimer = 60;
      b.playerHp = Math.max(0, b.playerHp - 1);
      arena.inv = 42; b.flash = 12;
      addAdSticker();
      pushFloat('반짝: "거봐, 반짝이는 게 좋잖아!"\n(광고 얼룩이 하나 더 붙었다!)', true);
      Sound.bump();
      if (b.playerHp <= 0) { persuadeExhaust(); return; }
      return;
    }
    if (tp.obj.age >= TEMPT_SURVIVE_FRAMES) {
      // 버텨 냄 — 소멸 + 보상(게이지 +10, 조명 하나 꺼짐, 최대 3회)
      tp.obj = null;
      tp.spawnTimer = 60;
      tp.resisted = Math.min(3, tp.resisted + 1);
      b.temptResisted = tp.resisted;
      b.gauge = clamp(b.gauge + 10, 0, b.gaugeMax);
      pushFloat((b.p.temptReply || '…버텼다.') + `\n(조명이 하나 꺼졌다! ${tp.resisted}/3)`, true);
      if (tp.resisted >= 3) b.gauge = Math.max(b.gauge, b.gaugeMax - 2); // 3회 → 만충 직전
      Sound.correct();
      persuadeGaugeSync(b);
    }
  }
  // 그럴싸(보스) open 페이즈 고유 기믹 — [진]/[낚] 헤드라인 조각이 60프레임 간격으로 번갈아
  // 스폰된다(tempt의 최소 변형). [진] 접촉 = 게이지+6 + 누적 카운트(파도 넘어 영속, 3회째
  // gaugeMax-2로 밀어줌). [낚] 접촉 = 게이지-4 + 화면 얼룩 플래시(피해·광고 딱지는 없음).
  function updateTruth(b) {
    const w = b.wave, tr = w.truth, arena = b.arena, box = arena.box;
    if (!tr.obj) {
      tr.spawnTimer -= 1;
      if (tr.spawnTimer <= 0) {
        tr.obj = {
          x: box.x + 30 + Math.random() * (box.w - 60),
          y: box.y + 30 + Math.random() * (box.h - 60),
          kind: tr.nextKind,
        };
        tr.nextKind = tr.nextKind === 'real' ? 'bait' : 'real';
      }
      return;
    }
    const dx = tr.obj.x - arena.soul.x, dy = tr.obj.y - arena.soul.y;
    if (dx * dx + dy * dy < (SOUL_R + 10) * (SOUL_R + 10)) {
      if (tr.obj.kind === 'real') {
        // [진] 접촉 — 게이지 +6, 파도 넘어 영속 카운트(최대 3, 3회째 만충 직전으로 밀어줌)
        tr.caught = Math.min(3, tr.caught + 1);
        b.truthCaught = tr.caught;
        b.gauge = clamp(b.gauge + 6, 0, b.gaugeMax);
        if (tr.caught >= 3) b.gauge = Math.max(b.gauge, b.gaugeMax - 2);
        pushFloat((b.p.truthReply || '…어, 진짜였어?') + `\n(진짜를 알아챘다! ${tr.caught}/3)`, true);
        Sound.correct();
        persuadeGaugeSync(b);
      } else {
        // [낚] 접촉 — 게이지 -4 + 화면 얼룩(피해·광고 딱지는 없음)
        b.gauge = clamp(b.gauge - 4, 0, b.gaugeMax);
        b.flash = 12;
        pushFloat('그럴싸: "…거봐, 그럴듯하지?"\n(낚였다… 마음이 식었다)', true);
        Sound.bump();
      }
      tr.obj = null;
      tr.spawnTimer = 60;
    }
  }

  // ── 응답의 문(gates): 타임 슬로우 + 문 3개 ──
  const GATE_SLOTS = ['tl', 'tr', 'bc'];
  // 문 폭 66→78(+12) — 「서툴러도 내 것」처럼 긴 gateLabel이 문 폭을 넘던 문제 수정.
  // 최소 상자(SHRINK_MIN.w=200)에서도 tl·tr 사이 32px 여유가 남아 문끼리 겹치지 않는다.
  const DOOR_W = 78, DOOR_H = 46;
  function doorRect(box, slot) {
    if (slot === 'tl') return { x: box.x + 6, y: box.y + 6, w: DOOR_W, h: DOOR_H };
    if (slot === 'tr') return { x: box.x + box.w - 6 - DOOR_W, y: box.y + 6, w: DOOR_W, h: DOOR_H };
    return { x: box.x + box.w / 2 - DOOR_W / 2, y: box.y + box.h - 6 - DOOR_H, w: DOOR_W, h: DOOR_H }; // bc
  }
  function buildGates(b) {
    const box = b.arena.box;
    const claim = currentClaim();
    const owned = ownedCards();
    // 정답 문: 카드형 주장이면 그 카드에 대응(소지해야 활성), best형이면 말(카드 불필요)
    const cardId = (!claim.best && claim.counters && claim.counters[0]) || null;
    const closedLock = b.pState === 'closed';
    const correct = {
      label: claim.gateLabel || '…', correct: true, card: cardId,
      locked: closedLock || (cardId && !owned.includes(cardId)),
    };
    // 오답 문 2개: 다른 주장의 gateLabel + 프로필 미끼 말에서 뽑는다
    const pool = b.p.claims.map((c) => c.gateLabel).filter((l) => l && l !== correct.label)
      .concat(b.p.decoys || []);
    const wrongLabels = shuffled(pool).slice(0, 2);
    while (wrongLabels.length < 2) wrongLabels.push('글쎄…');
    const doors = [correct,
      { label: wrongLabels[0], correct: false, card: null, locked: closedLock },
      { label: wrongLabels[1], correct: false, card: null, locked: closedLock }];
    // 슬롯 무작위 배치
    const slots = shuffled(GATE_SLOTS.slice());
    for (let i = 0; i < doors.length; i++) {
      const r = doorRect(box, slots[i]);
      Object.assign(doors[i], { slot: slots[i], x: r.x, y: r.y, w: r.w, h: r.h });
    }
    return doors;
  }
  function enterGates() {
    const b = game.battle;
    b.phase = 'gates';
    b.gates = { t: 0, timeLimit: 240, doors: buildGates(b), resolved: false, lockCd: 0 };
    Sound.select();
  }

  function updateGates() {
    const b = game.battle, gt = b.gates, arena = b.arena, box = arena.box;
    if (b.shake > 0) b.shake -= 1;
    if (b.flash > 0) b.flash -= 1;
    gt.t += 1;
    if (gt.lockCd > 0) gt.lockCd -= 1;
    updateFloats(b);

    moveSoul(arena, box, 1);
    // 타임 슬로우 — 탄막은 아주 느리게 흐르고, 새로 생기지 않는다 (×0.15)
    for (const bu of arena.bullets) { bu.x += bu.vx * 0.15; bu.y += bu.vy * 0.15; }
    arena.bullets = arena.bullets.filter((bu) =>
      bu.x > box.x - 24 && bu.x < box.x + box.w + 24 && bu.y > box.y - 24 && bu.y < box.y + box.h + 24);
    if (bulletHits(b, arena) && b.playerHp <= 0) { persuadeExhaust(); return; }

    // 하트가 문 영역에 들어가면 판정
    const s = arena.soul;
    for (const d of gt.doors) {
      if (s.x >= d.x && s.x <= d.x + d.w && s.y >= d.y && s.y <= d.y + d.h) {
        if (d.locked) {
          if (gt.lockCd <= 0) { Sound.bump(); b.flash = 6; gt.lockCd = 24; }
        } else if (!gt.resolved) {
          gt.resolved = true; gateResolve(b, d); return;
        }
      }
    }

    // 시간 초과 — 변화 없이 파도 재개 (타임아웃 기록). 루미(보스)는 상자가 한 단계 더 좁아진다
    if (gt.t >= gt.timeLimit) {
      pStats().gateTimeout += 1;
      if (b.p.openMechanic === 'shrink' && b.pState === 'open') b.shrinkLevel = Math.min(SHRINK_MAX_LEVEL, (b.shrinkLevel || 0) + 1);
      enterWave(); // 같은 주장으로 파도 재개
    }
  }

  function gateResolve(b, door) {
    const claim = currentClaim();
    const st = pStats();
    const r = b.p.react;
    if (door.correct) {
      const delta = b.pState === 'open' ? 32 : 26;
      b.gauge = clamp(b.gauge + delta, 0, b.gaugeMax);
      // 정답(=설득 성공)은 하트 1 회복 — 회피가 아니라 '잘 설득한' 실력에 보상(서툰 회피 구제)
      b.playerHp = Math.min(b.maxHearts, b.playerHp + 1);
      st.gateRight += 1;
      const topic = door.card ? EVIDENCE_CARDS[door.card].topic : monTopic(b);
      recordTopicResult(game.currentSlot, topic, true);
      pushFloat(claim.okLine || r.evidenceRight || '…그랬구나.');
      b.shake = 14; Sound.correct();
      b.claimIdx += 1; // 다음 주장으로
      // 루미(보스) — open 페이즈에서 정답 문을 통과하면 좁아졌던 상자가 한 단계 회복된다
      if (b.p.openMechanic === 'shrink' && b.pState === 'open') b.shrinkLevel = Math.max(0, (b.shrinkLevel || 0) - 1);
    } else {
      b.gauge = clamp(b.gauge - 6, 0, b.gaugeMax);
      st.gateWrong += 1; st.backfire += 1;
      recordTopicResult(game.currentSlot, monTopic(b), false);
      pushFloat(claim.onWrong);
      b.pIntense = true; // 다음 파도 강화
      b.flash = 14; Sound.wrong();
      // 루미(보스) — open 페이즈에서 오답이면 상자가 한 단계 더 좁아진다
      if (b.p.openMechanic === 'shrink' && b.pState === 'open') b.shrinkLevel = Math.min(SHRINK_MAX_LEVEL, (b.shrinkLevel || 0) + 1);
      // 같은 주장 재시도 (claimIdx 유지)
    }
    persuadeGaugeSync(b);
    if (b.gauge >= b.gaugeMax) { persuadeTriumph(); return; }
    enterWave();
  }

  // 하트가 다 닳으면 물러난다 — 단, 상대는 이야기를 절반쯤 기억한다
  function persuadeExhaust() {
    const b = game.battle;
    if (!game.flags.persuadeMemory) game.flags.persuadeMemory = {};
    game.flags.persuadeMemory[b.persuadeId] = {
      gauge: Math.floor(b.gauge / 2),
      state: b.pState === 'closed' ? 'closed' : 'shaken',
    };
    save();
    const nm = b.mon.name;
    game.battle = null;
    game.mode = 'world';
    Sound.playSong(MAPS[game.map].song);
    startDialog([
      '마음이 지쳐서, 한 발 물러났다…',
      `괜찮아. ${nm}는 네 이야기를\n조금은 기억하고 있을 거야.\n숨을 고르고 다시 가 보자.`,
    ]);
  }

  function updatePersuadeBattle() {
    const b = game.battle;
    if (b.gauge >= b.gaugeMax) { persuadeTriumph(); return; }
    if (b.phase === 'wave') updateWave();
    else if (b.phase === 'gates') updateGates();
  }

  // ---------- 친구 수첩 ----------
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

  // 친구 수첩의 장 표기 — stage: 0=프롤로그, 1~5=N장, 6=파이널
  function dexChapterShort(stage) { return stage === 0 ? 'P' : stage === 6 ? 'F' : `${stage}장`; }
  function dexChapterLabel(stage) { return stage === 0 ? '프롤로그' : stage === 6 ? '파이널' : `${stage}장`; }

  function drawDex() {
    const seen = getDexSeen();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);

    // 헤더
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('♥ 친구 수첩', 24, 38);
    ctx.fillStyle = '#888';
    ctx.font = '15px monospace';
    ctx.fillText(`친구 ${dexSeenCount()} / ${DEX_ORDER.length}`, 24, 62);

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
      ctx.fillText(dexChapterShort(MONSTER_DEX[id].stage), listX, y);
      ctx.fillStyle = isSeen ? (idx === cur ? '#fff' : '#aaa') : '#444';
      ctx.font = (idx === cur ? 'bold ' : '') + '15px monospace';
      ctx.fillText(isSeen ? monName(id) : '??? (아직 못 만남)', listX + 34, y);
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
      drawMon(ctx, id, Math.round(cx - 16 * ss / 2), Math.round(110 + bob), ss);
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
    ctx.fillText(isSeen ? monName(id) : '???', cx, 238);
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    ctx.fillText(dexChapterLabel(info.stage), cx, 260);
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
      ctx.fillText('★ 다시 만나기', 24, 38);
      ctx.fillStyle = '#888';
      ctx.font = '15px monospace';
      ctx.fillText(`다시 만날 이야기 ${ids.length}개`, 24, 62);

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
    ctx.fillText('★ 다시 만나기', 24, 32);

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
  // 교사 전용 기능(대시보드·리포트·수업 모드·커스텀 퀴즈·수료증)은 「선생님 방」으로
  // 옮겨졌다 — 학생 표면(일시정지 메뉴)에는 교사 어휘가 보이지 않는다(스텔스 교육 원칙).
  // 단, 데이터 백업은 학생도 쓰는 기능이라 그대로 남겨 둔다.
  const PAUSE_ITEMS = ['journal', 'cards', 'halloffame', 'awards', 'cosmetics',
    'challenge', 'review', 'dex', 'backup', 'difficulty', 'textspeed', 'tts',
    'largetext', 'colorblind', 'reducefx', 'lowgraphics', 'mute', 'help', 'close'];
  // 방탈출 중에는 「힌트」 항목을 맨 위에 붙인다 (터치 기기에서 H키 대체)
  function pauseItems() {
    return game.puzzleRun ? ['hint'].concat(PAUSE_ITEMS) : PAUSE_ITEMS;
  }
  const PAUSE_LABELS = {
    hint: '💡 힌트',
    journal: '◆ 모험 일지',
    cards: '📚 기억 조각',
    halloffame: '🏆 명예의 전당',
    dashboard: '▤ 교사용 대시보드',
    report: '🩺 학생 진단 리포트',
    classmode: '▶ 수업 모드 (챕터 시작)',
    awards: '☆ 도전과제',
    cosmetics: '✿ 꾸미기 (칭호·테마)',
    cert: '🎓 수료증',
    challenge: '▶ 도전 극장',
    review: '★ 다시 만나기',
    dex: '♥ 친구 수첩',
    quizedit: '✎ 커스텀 퀴즈',
    backup: '⇄ 데이터 백업·복원',
    difficulty: '난이도',
    textspeed: '자막 속도',
    tts: '읽어주기',
    largetext: '큰 글씨',
    colorblind: '색약 모드',
    reducefx: '화면 효과 줄이기',
    lowgraphics: '저사양 그래픽',
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
    if (item === 'lowgraphics') return game.lowGraphics ? 'ON' : 'OFF';
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
    const maxScroll = Math.max(0, pauseItems().length - PAUSE_VISIBLE);
    if (game.pauseCursor < game.pauseScroll) game.pauseScroll = game.pauseCursor;
    if (game.pauseCursor >= game.pauseScroll + PAUSE_VISIBLE) game.pauseScroll = game.pauseCursor - PAUSE_VISIBLE + 1;
    game.pauseScroll = Math.max(0, Math.min(game.pauseScroll, maxScroll));
  }
  function updatePause() {
    const items = pauseItems();
    const n = items.length;
    if (justPressed('up')) { game.pauseCursor = (game.pauseCursor + n - 1) % n; clampPauseScroll(); Sound.blip(); }
    if (justPressed('down')) { game.pauseCursor = (game.pauseCursor + 1) % n; clampPauseScroll(); Sound.blip(); }
    if (justPressed('cancel')) { closePause(); return; }
    if (justPressed('action')) {
      const item = items[game.pauseCursor];
      if (item === 'hint') { const had = game.puzzleRun; closePause(); if (had) openHint(); }
      else if (item === 'journal') openJournal('pause');
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
      else if (item === 'lowgraphics') toggleLowGraphics();
      else if (item === 'mute') Sound.toggleMute();
      else if (item === 'help') openHelp('pause');
      else if (item === 'close') closePause();
    }
  }

  function drawPause() {
    drawWorld();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, LW, LH);

    const items = pauseItems();
    const rowH = 34;
    const shown = Math.min(PAUSE_VISIBLE, items.length);
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
      if (i >= items.length) break;
      const item = items[i];
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
    if (start + shown < items.length) { ctx.fillStyle = '#888'; ctx.textAlign = 'center'; ctx.fillText('▼', boxX + boxW - 16, boxY + boxH - 22); }

    ctx.fillStyle = '#777';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ 선택 · Z 결정 · X 닫기', LW / 2, boxY + boxH - 12);
    ctx.textAlign = 'left';
  }

  // ---------- 선생님 방 (교사 전용 메뉴) ----------
  // 타이틀 화면에서 T 키로 연다. 학생용 일시정지 메뉴와 완전히 분리해 두어,
  // 학생이 보는 화면에는 교사 어휘·기능이 노출되지 않는다(스텔스 교육 원칙).
  // 각 항목은 기존 화면(대시보드·리포트·수업 모드·커스텀 퀴즈·수료증)을 그대로 재사용하되,
  // ret에 'teacher'를 넘겨 닫을 때 이 방으로 되돌아오게 한다.
  const TEACHER_ITEMS = ['dashboard', 'report', 'classmode', 'quizedit', 'cert', 'close'];

  function openTeacherRoom() {
    game.teacherCursor = 0;
    game.mode = 'teacher';
    Sound.select();
  }
  function closeTeacherRoom() {
    game.mode = 'title';
    Sound.select();
  }
  function updateTeacherRoom() {
    const n = TEACHER_ITEMS.length;
    if (justPressed('up')) { game.teacherCursor = (game.teacherCursor + n - 1) % n; Sound.blip(); }
    if (justPressed('down')) { game.teacherCursor = (game.teacherCursor + 1) % n; Sound.blip(); }
    if (justPressed('cancel')) { closeTeacherRoom(); return; }
    if (justPressed('action')) {
      const item = TEACHER_ITEMS[game.teacherCursor];
      if (item === 'dashboard') openDashboard('teacher');
      else if (item === 'report') openReport('teacher');
      else if (item === 'classmode') openClassMode('teacher');
      else if (item === 'quizedit') openQuizEdit('teacher');
      else if (item === 'cert') openCert('teacher');
      else if (item === 'close') closeTeacherRoom();
    }
  }
  function drawTeacherRoom() {
    ctx.fillStyle = '#0b0e1a';
    ctx.fillRect(0, 0, LW, LH);

    const rowH = 34;
    const boxW = 340, boxH = 64 + TEACHER_ITEMS.length * rowH;
    const boxX = Math.round(LW / 2 - boxW / 2);
    const boxY = Math.round(LH / 2 - boxH / 2);
    utBox(boxX, boxY, boxW, boxH, 8);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 17px monospace';
    ctx.fillText('선생님 방', boxX + 22, boxY + 30);

    let ty = boxY + 62;
    for (let i = 0; i < TEACHER_ITEMS.length; i++) {
      const item = TEACHER_ITEMS[i];
      drawChoiceLine(PAUSE_LABELS[item], boxX + 22, ty, i === game.teacherCursor);
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
    lines.push(`발견 엔딩: ${endN}/4 · 친구 수첩: ${dexSeenCount()}/${DEX_ORDER.length}`);
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
    ctx.fillText(`◆ 모험 일지 — ${slotLearnName(slot)}`, 24, 38);
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
    ctx.fillText(`발견 엔딩 ${endN}/4  ·  친구 수첩 ${dexSeenCount()}/${DEX_ORDER.length}  ·  복습 노트 ${mistakeCount(slot)}개`, 24, 88);
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
      ctx.fillText('▶ 도전 극장', 24, 40);
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
      const msg = rate >= 0.9 ? '대단해요! 진정한 마음의 수호자!'
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
  // 각 과제는 슬롯별 학습 데이터 + 기기 공용 컬렉션(친구 수첩·엔딩)에서 즉석 판정한다.
  const ACHIEVEMENTS = [
    { id: 'firstwin', cat: 'battle', name: '첫 깨우침', desc: '처음으로 마음을 되돌렸어요', check: (c) => c.defeatedCount >= 1 },
    { id: 'mercy1', cat: 'battle', name: '따뜻한 마음', desc: '마음을 한 번 안아 주었어요', check: (c) => c.mercy >= 1 },
    // v2 스케일(자비 최대 8회) — v1의 10 임계값은 사실상 도달 불가능해 7로 낮췄다.
    { id: 'mercy10', cat: 'battle', name: '마음의 수호자', desc: '마음을 일곱 번 안아 주었어요', check: (c) => c.mercy >= 7 },
    { id: 'solved50', cat: 'learn', name: '꾸준한 공부', desc: '문제를 50개 이상 풀었어요', check: (c) => c.attempted >= 50 },
    { id: 'perfectTopic', cat: 'learn', name: '완벽한 한 주제', desc: '한 주제 100% (3문제 이상)', check: (c) => c.perfectTopic },
    { id: 'wellRounded', cat: 'learn', name: '두루 박학', desc: '5개 주제에서 80% 이상', check: (c) => c.strongTopics >= 5 },
    { id: 'dexHalf', cat: 'collect', name: '반쯤 채운 수첩', desc: '친구 수첩을 절반 이상 채웠어요', check: (c) => c.dex > 0 && c.dex * 2 >= c.dexTotal },
    { id: 'dexAll', cat: 'collect', name: '여덟 조각의 친구', desc: '친구 수첩을 모두 채웠어요', check: (c) => c.dexTotal > 0 && c.dex >= c.dexTotal },
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
      mercy: f.mercy || 0, defeatedCount,
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
      // 아이콘 표시
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

  // ---------- 도움말 (v2 — 방탈출 + 마음 조각 배틀 기준으로 다시 씀) ----------
  // v1은 "퀴즈로 깨우치고 50:50 힌트" 설명이었지만, v2 메인 플로우는 방탈출(H 3단계 힌트)과
  // 마음 조각 배틀(행동으로 설득)이 중심이라 통째로 새로 썼다. 퀴즈는 이제 도전 극장에만
  // 남아 있고 그 자체엔 50:50 힌트가 없으므로(퀴즈 배틀 전용 기능) 옛 설명은 제거한다.
  // 교과 어휘·훈계 문구 없이, 아이 눈높이의 짧은 문장으로.
  const HELP_LINES = [
    ['head', '◆ 게임 목표'],
    ['', '마음이 굳어 버린 친구들을 만나요.'],
    ['', '무찌르는 게 아니라, 마음을 다시 열어 주는 여행이에요.'],
    ['', ''],
    ['head', '◆ 기본 조작'],
    ['', isTouchDevice ? '이동: 화면 왼쪽 스틱       말 걸기·조사·확인: Ⓐ 버튼'
                       : '이동: 화살표 / W A S D       말 걸기·조사·확인: Z / 스페이스'],
    ['', isTouchDevice ? '친구 수첩 바로 보기: [수첩] 버튼       그 외 전부: [메뉴] 버튼'
                       : '메뉴 열기: X / Esc       친구 수첩 바로 보기: C'],
    ['', ''],
    ['head', '◆ 마음 조각 배틀'],
    ['', isTouchDevice ? '스틱으로 하트를 움직여 탄막을 피해요.'
                       : '화살표로 하트를 움직여 탄막을 피해요.'],
    ['', '✦ 조각을 주우면 마음의 소리가 들려요.'],
    ['', '문이 열리면, 마음에 닿는 문으로 하트를 통과시켜요!'],
    ['', '하트가 다 닳으면 잠시 물러났다가, 다시 도전하면 돼요.'],
  ];
  const HELP_LINES2 = [
    ['head', '◆ 방탈출'],
    ['', '방 곳곳을 살펴보고, 만지고, 실마리를 이어 봐요.'],
    ['', isTouchDevice ? '막히면 [메뉴] 버튼 → 힌트! 누를수록 더 자세히 알려줘요.'
                       : '막히면 H로 힌트! 누를수록 더 자세히 알려줘요(최대 3단계).'],
    ['', ''],
    ['head', '◆ 기억을 모아요'],
    ['', (isTouchDevice ? '📚 기억 조각' : '📚 기억 조각 (L)') + ' — 배운 순간이 카드로 쌓여요.'],
    ['', (isTouchDevice ? '♥ 친구 수첩' : '♥ 친구 수첩 (C)') + ' — 만난 친구들의 이야기를 다시 봐요.'],
    ['', (isTouchDevice ? '★ 다시 만나기' : '★ 다시 만나기 (V)') + ' — 헷갈렸던 문제를 다시 풀어요.'],
    ['', (isTouchDevice ? '▶ 도전 극장' : '▶ 도전 극장 (Q)') + ' — 짧은 퀴즈로 실력을 확인해요.'],
    ['', ''],
    ['head', '◆ 그 외'],
    ['', '음악 켜고 끄기(M) · 눈이 부시면 메뉴의 「화면 효과 줄이기」'],
  ];
  // 한 화면(528px)에 다 들어가지 않아 2장으로 나눈다. (← → 로 넘김)
  const HELP_PAGES = [
    HELP_LINES,   // 게임 목표 · 기본 조작 · 마음 조각 배틀
    HELP_LINES2,  // 방탈출 · 기억을 모아요 · 그 외
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
    ctx.fillText(`📚 기억 조각 — ${slotLearnName(slot)}`, 24, 36);
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
    const prog = sum ? (sum.done ? '모험 완료' : sum.stage) : '시작 전';
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
    const prog = sum ? (sum.done ? '모험 완료' : sum.stage) : '시작 전';
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
    { key: 'dex', label: '친구 수첩', icon: '◆',
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
      ctx.fillText('(친구 수첩은 모두가 함께 채우는 공동 기록이에요)', panelX + panelW / 2, panelY + 170);
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
    ctx.fillText('모든 슬롯·학습 기록·친구 수첩·설정을 한 파일로 저장하고', 24, 66);
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
      '정답률(%)', '복습 노트', '도전과제', '안아준 마음', '연속 출석(일)',
      '개념별 성취(정답/시도)', '자비 선택(프롤로그·1~5장)', '엔딩'];
    const lines = [header.map(csvCell).join(',')];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const sum = slotSummary(i);
      if (!sum) { lines.push(csvCell(i + 1) + ',(비어 있음)'); continue; }
      const s = buildLearningSummary(i);
      const meta = getMeta(i);
      const title = selectedTitle(i);
      const saved = loadSlot(i);
      const flags = (saved && saved.flags) || {};
      const conceptStats = (s.rows || [])
        .map((r) => `${r.label} ${r.correct}/${r.total}`)
        .join('; ');
      const mercyParts = [
        flags.defeated?.bekkyeomon
          ? (flags.mercyChoice?.bekkyeomon === 'mercy' ? '따라:안아줌' : '따라:무찌름')
          : '따라:-',
      ];
      for (let n = 1; n <= 5; n++) {
        mercyParts.push(
          flags['chapter' + n + 'Clear']
            ? (flags['chapter' + n + 'Mercy'] ? n + '장:안아줌' : n + '장:무찌름')
            : n + '장:-'
        );
      }
      const mercyStr = mercyParts.join(' / ');
      const endingStr = flags.trueEnding
        ? '집으로(따뜻)'
        : (flags.defeated?.yeongi ? '완주' : '진행 중');
      lines.push([
        i + 1,
        sum.name,
        title ? title.name : '',
        sum.done ? '모험 완료' : sum.stage,
        sum.done ? 'Y' : 'N',
        s.attempted,
        s.correct,
        s.attempted ? Math.round(s.overallRate * 100) : '',
        mistakeCount(i),
        countAchievements(i) + '/' + ACHIEVEMENTS.length,
        sum.mercy,
        meta.streak || 0,
        conceptStats,
        mercyStr,
        endingStr,
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
      line('진행', sum.done ? '모험 완료' : sum.stage);
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

  // ---------- 수업 모드 (챕터 바로 시작) ----------
  // 선생님이 오늘 수업할 챕터부터 바로 시작하게 해 준다.
  // 수업 기본 상태 flags — 새 모험 + 박사 대화 완료 (각 챕터 항목이 chapterNClear를 얹는다)
  function setupClassBaseFlags() {
    const flags = newFlags();
    flags.talkedProf = true;
    flags.bandiJoined = true; // 수업 점프는 오프닝(합류 연출) 이후 상태
    return flags;
  }
  // 수업 모드 특별 항목 「1장 — 전부 공짜 거리」 (스테이지 번호가 아닌 방탈출 수업용)
  const TRACE_SEL = 0;
  // 2장 「기울어진 거리」 수업 특별 항목 (sel = -1)
  const TILT_SEL = -1;
  // 3장 「대문짝 신문사」 수업 특별 항목 (sel = -2)
  const RUMOR_SEL = -2;
  // 4장 「반짝 아케이드」 수업 특별 항목 (sel = -3)
  const ARCADE_SEL = -3;
  // 5장 「포근한 집」 수업 특별 항목 (sel = -4)
  const COZY_SEL = -4;
  // 파이널 「고요의 뜰 → 코어」 수업 특별 항목 (sel = -5)
  const FINAL_SEL = -5;
  const MIN_SEL = FINAL_SEL; // 선택기 하한
  // 지금 슬롯의 진행(chapterNClear)에 맞는 특별 항목을 고른다 — 「선생님 방」을 열 때
  // 커서가 실제 진행에 가까운 장에서 시작하게 한다(v1 숫자 스테이지는 더 이상 쓰지 않는다).
  function classSelForFlags(flags) {
    if (flags.chapter5Clear) return FINAL_SEL;
    if (flags.chapter4Clear) return COZY_SEL;
    if (flags.chapter3Clear) return ARCADE_SEL;
    if (flags.chapter2Clear) return RUMOR_SEL;
    if (flags.chapter1Clear) return TILT_SEL;
    return TRACE_SEL;
  }
  // 1장 시작 상태로 맞추고, 전부 공짜 거리 입구에 서서 시작한다.
  // defeated.bekkyeomon(프롤로그 「따라」 격파)도 true로 맞춘다 — 1장 허브 안에 이미 서
  // 있는 상태인데 프롤로그 미클리어로 남겨 두면 목표 나침반(getObjectiveTarget)이 숲의
  // 따라를 계속 가리키는 모순이 생긴다(수업 모드 점프는 "이 장부터 바로 수업" 전제).
  function applyTraceRoomClass() {
    const flags = setupClassBaseFlags();
    flags.defeated.bekkyeomon = true;
    game.flags = flags;
    game.map = 'freestreet';
    const p = game.player;
    p.x = 18; p.y = 21; p.px = 18 * TS; p.py = 21 * TS;
    p.moving = false; p.dir = 'up';
    save();
  }
  // 2장 시작 상태(1장 클리어 직후)로 맞추고, 기울어진 거리 입구에 서서 시작한다.
  function applyTiltStreetClass() {
    const flags = setupClassBaseFlags();
    flags.defeated.bekkyeomon = true; // 프롤로그(따라)는 이미 클리어한 상태
    flags.chapter1Clear = true; // 2장은 1장 클리어 후 상태
    game.flags = flags;
    game.map = 'tiltstreet';
    const p = game.player;
    p.x = 18; p.y = 21; p.px = 18 * TS; p.py = 21 * TS;
    p.moving = false; p.dir = 'up';
    save();
  }
  // 3장 시작 상태(2장 클리어 직후)로 맞추고, 소문 거리 입구에 서서 시작한다.
  function applyRumorStreetClass() {
    const flags = setupClassBaseFlags();
    flags.defeated.bekkyeomon = true; // 프롤로그(따라)는 이미 클리어한 상태
    flags.chapter1Clear = true;
    flags.chapter2Clear = true; // 3장은 2장 클리어 후 상태
    game.flags = flags;
    game.map = 'rumorstreet';
    const p = game.player;
    p.x = 18; p.y = 21; p.px = 18 * TS; p.py = 21 * TS;
    p.moving = false; p.dir = 'up';
    save();
  }
  // 4장 시작 상태(3장 클리어 직후)로 맞추고, 반짝 아케이드 입구에 서서 시작한다.
  function applyArcadeClass() {
    const flags = setupClassBaseFlags();
    flags.defeated.bekkyeomon = true; // 프롤로그(따라)는 이미 클리어한 상태
    flags.chapter1Clear = true;
    flags.chapter2Clear = true;
    flags.chapter3Clear = true; // 4장은 3장 클리어 후 상태
    game.flags = flags;
    game.map = 'arcade';
    const p = game.player;
    p.x = 18; p.y = 20; p.px = 18 * TS; p.py = 20 * TS;
    p.moving = false; p.dir = 'up';
    save();
  }
  // 5장 시작 상태(4장 클리어 직후)로 맞추고, 포근한 집 입구에 서서 시작한다.
  function applyCozyhomeClass() {
    const flags = setupClassBaseFlags();
    flags.defeated.bekkyeomon = true; // 프롤로그(따라)는 이미 클리어한 상태
    flags.chapter1Clear = true;
    flags.chapter2Clear = true;
    flags.chapter3Clear = true;
    flags.chapter4Clear = true; // 5장은 4장 클리어 후 상태
    game.flags = flags;
    game.map = 'cozyhome';
    const p = game.player;
    p.x = 3; p.y = 10; p.px = 3 * TS; p.py = 10 * TS;
    p.moving = false; p.dir = 'down';
    save();
  }
  // 파이널 시작 상태(5장 클리어 직후)로 맞추고, 포근한 집 안쪽 문 앞에 서서 시작한다.
  function applyFinalClass() {
    const flags = setupClassBaseFlags();
    flags.defeated.bekkyeomon = true; // 프롤로그(따라)는 이미 클리어한 상태
    flags.chapter1Clear = true;
    flags.chapter2Clear = true;
    flags.chapter3Clear = true;
    flags.chapter4Clear = true;
    flags.chapter5Clear = true; // 파이널은 5장 클리어 후 상태
    game.flags = flags;
    game.map = 'cozyhome';
    const p = game.player;
    p.x = 31; p.y = 19; p.px = 31 * TS; p.py = 19 * TS;
    p.moving = false; p.dir = 'down';
    save();
  }
  function openClassMode(ret) {
    // 「선생님 방」은 타이틀에서 열 수 있어, 아직 세션에 슬롯이 로드되지 않았을 수 있다
    // (이어하기를 누르기 전). 그 경우 커서가 가리키는 슬롯을 미리 불러와, 이어하기와
    // 같은 상태에서 스테이지를 맞출 수 있게 한다.
    if (!game.flags) {
      const slot = activeSlot();
      const s = loadSlot(slot);
      game.currentSlot = slot;
      if (s) {
        game.playerName = s.name || '수호자';
        game.map = (s.map && MAPS[s.map]) ? s.map : 'village';
        game.flags = Object.assign(newFlags(), s.flags);
        game.flags.defeated = Object.assign(newFlags().defeated, s.flags.defeated);
      } else {
        game.playerName = '수호자';
        game.map = 'village';
        game.flags = newFlags();
      }
      const p = game.player;
      p.x = 13; p.y = 16; p.px = 13 * TS; p.py = 16 * TS; p.moving = false; p.dir = 'up';
    }
    const cm = game.classmode;
    cm.ret = ret;
    cm.sel = classSelForFlags(game.flags);
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
        if (cm.sel === FINAL_SEL) applyFinalClass();
        else if (cm.sel === COZY_SEL) applyCozyhomeClass();
        else if (cm.sel === ARCADE_SEL) applyArcadeClass();
        else if (cm.sel === RUMOR_SEL) applyRumorStreetClass();
        else if (cm.sel === TILT_SEL) applyTiltStreetClass();
        else if (cm.sel === TRACE_SEL) applyTraceRoomClass();
        cm.confirm = false;
        cm.toast = 90;
        Sound.badge();
        return;
      }
      if (justPressed('cancel') || justPressed('menu')) { cm.confirm = false; Sound.blip(); }
      return;
    }
    // 특별 항목 6개(「1장 — 전부 공짜 거리」~「파이널 — 고요의 뜰 → 코어」)만 한 바퀴로 순환한다.
    // v1 숫자 스테이지(1~5) 항목은 제거되었다 — v2 항목만 남는다.
    if (justPressed('left') || justPressed('up')) { cm.sel = cm.sel <= MIN_SEL ? TRACE_SEL : cm.sel - 1; Sound.blip(); }
    if (justPressed('right') || justPressed('down')) { cm.sel = cm.sel >= TRACE_SEL ? MIN_SEL : cm.sel + 1; Sound.blip(); }
    if (justPressed('action')) { cm.confirm = true; Sound.select(); return; }
    if (justPressed('cancel') || justPressed('menu')) { closeClassMode(); }
  }
  function drawClassMode() {
    const cm = game.classmode;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('▶ 수업 모드 — 거리(챕터) 바로 시작', 24, 40);
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    ctx.fillText('오늘 수업할 거리를 골라 바로 시작해요. (지금 학생 슬롯에 적용)', 24, 64);

    // 특별 항목 6개(v2 항목만 순환) — 「1장 — 전부 공짜 거리」는 그 외 모든 값이 아닐 때(else)로 처리한다.
    const isTilt = cm.sel === TILT_SEL;
    const isRumor = cm.sel === RUMOR_SEL;
    const isArcade = cm.sel === ARCADE_SEL;
    const isCozy = cm.sel === COZY_SEL;
    const isFinal = cm.sel === FINAL_SEL;
    const selLabel = isFinal ? '파이널 시작 상태 · 포근한 집 안쪽 문 앞'
      : isCozy ? '5장 시작 상태 · 포근한 집 입구'
      : isArcade ? '4장 시작 상태 · 반짝 아케이드 입구'
      : isRumor ? '3장 시작 상태 · 대문짝 신문사 입구'
      : isTilt ? '2장 시작 상태 · 기울어진 거리 입구'
      : '1장 시작 상태 · 전부 공짜 거리 입구';

    // 스테이지 선택기
    ctx.textAlign = 'center';
    ctx.fillStyle = themeAccent();
    if (isFinal) {
      ctx.font = 'bold 30px monospace';
      ctx.fillText('파이널 — 고요의 뜰 → 코어', LW / 2, 176);
    } else if (isCozy) {
      ctx.font = 'bold 30px monospace';
      ctx.fillText('5장 — 포근한 집', LW / 2, 176);
    } else if (isArcade) {
      ctx.font = 'bold 30px monospace';
      ctx.fillText('4장 — 반짝 아케이드', LW / 2, 176);
    } else if (isRumor) {
      ctx.font = 'bold 30px monospace';
      ctx.fillText('3장 — 대문짝 신문사', LW / 2, 176);
    } else if (isTilt) {
      ctx.font = 'bold 30px monospace';
      ctx.fillText('2장 — 기울어진 거리', LW / 2, 176);
    } else {
      ctx.font = 'bold 30px monospace';
      ctx.fillText('1장 — 전부 공짜 거리', LW / 2, 176);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '15px monospace';
    ctx.fillText(isFinal ? '고요의 뜰(걷기) → 고요 보스 → 코어(여덟 의자·봉헌 퍼즐) → 영이'
      : isCozy ? 'AI와의 관계 · 경계 설정 · 확인하는 용기 (구역 3개 → 루미 보스)'
      : isArcade ? '다크패턴 · 광고 · 2단계 인증 (구역 3개 → 반짝 보스)'
      : isRumor ? '가짜 뉴스 분별 · 출처 확인 · 정정 보도 (구역 3개 → 그럴싸 보스)'
      : isTilt ? '경청 · 필터버블 · 스스로 고르기 (구역 3개 → 기울 보스)'
      : '개인정보 · 디지털 발자국 · 동의 (구역 3개 → 담아 보스)', LW / 2, 250);
    ctx.fillStyle = '#666';
    ctx.font = '13px monospace';
    ctx.fillText('◀ ▶ 거리 고르기', LW / 2, 286);

    if (cm.toast > 0) {
      ctx.fillStyle = okColor();
      ctx.font = 'bold 17px monospace';
      ctx.fillText(`✓ ${selLabel} 상태로 맞췄어요!`, LW / 2, 360);
      ctx.fillStyle = '#aaa';
      ctx.font = '13px monospace';
      ctx.fillText('잠시 후 모험 화면으로 돌아갑니다…', LW / 2, 386);
      if (cm.toast === 1) { game.mode = cm.ret; }
    } else if (cm.confirm) {
      ctx.fillStyle = badColor();
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`지금 이 슬롯을 ${selLabel} 상태로 바꿀까요?`, LW / 2, 360);
      ctx.fillStyle = '#ddd';
      ctx.font = '13px monospace';
      ctx.fillText('이전 진행은 완료 처리되고 되돌릴 수 없어요.', LW / 2, 384);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('Z: 시작   ·   X: 취소', LW / 2, 416);
    } else {
      ctx.fillStyle = '#777';
      ctx.font = '13px monospace';
      ctx.fillText('Z: 이 거리로 시작 · X: 닫기', LW / 2, 360);
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
    lines.push('진행: ' + (sum.done ? '모험 완료' : sum.stage));
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

  // 동행자 반디 — 플레이어가 보는 방향의 반대쪽에서 둥실 떠 따라온다.
  // 옅은 광륜 + 부유 바운스. 정체 공개(bandiRevealed) 후에는 그리지 않는다.
  function drawCompanion(cx, cy) {
    const f = game.flags;
    if (!f || !f.bandiJoined || f.bandiRevealed) return;
    const p = game.player;
    const off = { up: { x: 14, y: 26 }, down: { x: 16, y: -18 },
      left: { x: 26, y: -10 }, right: { x: -20, y: -10 } }[p.dir] || { x: 16, y: -18 };
    const bob = Math.sin(game.time / 16) * 3;
    const sx = Math.round(p.px - cx + off.x);
    const sy = Math.round(p.py - cy + off.y + bob);
    // 광륜 — 황혼 속의 작은 온기
    if (!game.reduceFx) {
      const pulse = 0.12 + Math.sin(game.time / 22) * 0.04;
      ctx.fillStyle = `rgba(255,220,130,${pulse})`;
      ctx.beginPath();
      ctx.arc(sx + 16, sy + 14, 15, 0, Math.PI * 2);
      ctx.fill();
    }
    drawMon(ctx, 'bandi', sx, sy, 2);
  }

  function ch1HubVisibleMarks() {
    const props = MAP_PROPS.freestreet || [];
    return props.filter((prop) => ['district', 'dama_buildup'].includes(prop.kind))
      .map((prop) => ({ map: 'freestreet', x: prop.x, y: prop.y, kind: prop.kind, label: prop.label || '', done: !!(prop.flag && game.flags[prop.flag]) }));
  }

  function drawCh1HubMarks(cx, cy) {
    if (game.map !== 'freestreet') return;
    const marks = ch1HubVisibleMarks();
    ctx.save();
    for (const mark of marks) {
      const sx = Math.round(mark.x * TS - cx);
      const sy = Math.round(mark.y * TS - cy - 2);
      if (sx < -50 || sx > LW + 50 || sy < -50 || sy > LH + 50) continue;
      const district = mark.kind === 'district';
      ctx.globalAlpha = game.lowGraphics || game.reduceFx ? 0.86 : 0.94;
      ctx.fillStyle = district ? '#173447' : (mark.done ? '#3c3f38' : '#4a3316');
      ctx.fillRect(sx + 5, sy + 8, TS - 10, TS - 12);
      ctx.strokeStyle = district ? '#9bd3ff' : '#ffd644';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 5.5, sy + 8.5, TS - 11, TS - 13);
      ctx.fillStyle = district ? '#9bd3ff' : (mark.done ? '#9aa07a' : '#ffd644');
      ctx.font = fs(14, true);
      ctx.textAlign = 'center';
      ctx.fillText(district ? '◇' : (mark.done ? '✓' : '※'), sx + TS / 2, sy + 24);
      if (!(game.lowGraphics || game.reduceFx)) {
        ctx.font = fs(9, true);
        ctx.fillText(mark.label, sx + TS / 2, sy + 4);
      }
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function drawCh1StreetPressureObjects(cx, cy) {
    if (game.map !== 'freestreet') return;
    const profile = ch1StreetVisualProfile(privacyLeak(), game.lowGraphics || game.reduceFx);
    const ads = [
      { x: 8, y: 8, text: '무료' }, { x: 15, y: 12, text: '약관' }, { x: 24, y: 9, text: '추천' },
      { x: 31, y: 13, text: '저장' }, { x: 19, y: 18, text: '이름?' }, { x: 33, y: 18, text: '동의?' },
      { x: 11, y: 16, text: '발자국' }, { x: 27, y: 20, text: '공짜' }, { x: 4, y: 12, text: '열람' },
      { x: 35, y: 10, text: '확인' }, { x: 21, y: 7, text: '보관' }, { x: 14, y: 21, text: '추적' },
    ];
    const sensors = [{ x: 14, y: 8 }, { x: 30, y: 8 }, { x: 23, y: 17 }];
    ctx.save();
    for (const [i, ad] of ads.slice(0, profile.adSigns).entries()) {
      const sx = Math.round(ad.x * TS - cx + 6);
      const sy = Math.round(ad.y * TS - cy + 8);
      if (sx < -80 || sx > LW + 40 || sy < -40 || sy > LH + 40) continue;
      const pulse = profile.glow ? 0.12 * Math.sin((game.time + i * 11) / 18) : 0;
      ctx.globalAlpha = Math.max(0.5, 0.72 + pulse);
      ctx.fillStyle = i % 2 ? '#28172f' : '#33220f';
      ctx.fillRect(sx, sy, 38, 16);
      ctx.strokeStyle = profile.glow ? '#ffd644' : '#7a6a44';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, 37, 15);
      ctx.fillStyle = i >= 4 ? '#ff8a8a' : '#ffd644';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(ad.text, sx + 4, sy + 11);
    }
    ctx.globalAlpha = 1;
    for (const s of sensors.slice(0, profile.sensors)) {
      const sx = Math.round(s.x * TS - cx + TS / 2);
      const sy = Math.round(s.y * TS - cy + TS / 2);
      if (sx < -20 || sx > LW + 20 || sy < -20 || sy > LH + 20) continue;
      ctx.strokeStyle = '#9bd3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#e0453a';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }
    if (profile.scanLines) {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#ffd644';
      for (let y = (game.time % 18); y < LH; y += 18) ctx.fillRect(0, y, LW, 1);
    }
    ctx.restore();
  }

  function chapter2HubVisibleMarks() {
    const props = MAP_PROPS.tiltstreet || [];
    return props.filter((prop) => prop.kind === 'ch2_district')
      .map((prop) => ({ map: 'tiltstreet', x: prop.x, y: prop.y, kind: prop.kind, label: prop.label || '' }));
  }

  function drawChapter2HubMarks(cx, cy) {
    if (game.map !== 'tiltstreet') return;
    const profile = chapter2HubVisualProfile(s2ClearCount(), game.lowGraphics || game.reduceFx);
    const marks = chapter2HubVisibleMarks();
    ctx.save();
    for (const [i, mark] of marks.entries()) {
      const sx = Math.round(mark.x * TS - cx);
      const sy = Math.round(mark.y * TS - cy - 2);
      if (sx < -60 || sx > LW + 60 || sy < -50 || sy > LH + 50) continue;
      const isScale = mark.label === '기울어진 저울';
      const isExit = mark.label === '동쪽 소란 문';
      ctx.globalAlpha = game.lowGraphics || game.reduceFx ? 0.82 : 0.92;
      ctx.fillStyle = isScale ? '#40361c' : isExit ? '#2b2436' : '#1f2d36';
      ctx.fillRect(sx + 6, sy + 8, TS - 12, TS - 12);
      ctx.strokeStyle = isScale ? '#ffd644' : isExit ? '#e9a7ff' : '#9bd3ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 6.5, sy + 8.5, TS - 13, TS - 13);
      ctx.fillStyle = isScale ? '#ffd644' : isExit ? '#e9a7ff' : '#9bd3ff';
      ctx.font = fs(14, true);
      ctx.textAlign = 'center';
      ctx.fillText(isScale ? '⚖' : isExit ? '!' : '↗', sx + TS / 2, sy + 24);
      if (profile.labels) {
        ctx.font = fs(9, true);
        ctx.fillText(mark.label, sx + TS / 2, sy + 4);
      }
      if (i < profile.echoMarks && !(game.lowGraphics || game.reduceFx)) {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = '#ffd644';
        ctx.strokeRect(sx + 3.5, sy + 5.5, TS - 7, TS - 7);
        ctx.globalAlpha = 0.92;
      }
    }
    const hints = [
      { x: 7, y: 8, text: '추천' }, { x: 18, y: 7, text: '이쪽' }, { x: 11, y: 12, text: '다수' },
      { x: 21, y: 14, text: '별점' }, { x: 24, y: 9, text: '인기' },
    ];
    ctx.font = 'bold 10px monospace';
    for (const hint of hints.slice(0, profile.recommendSigns)) {
      const sx = Math.round(hint.x * TS - cx + 6);
      const sy = Math.round(hint.y * TS - cy + 8);
      if (sx < -70 || sx > LW + 40 || sy < -40 || sy > LH + 40) continue;
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = '#2f2110';
      ctx.fillRect(sx, sy, 34, 15);
      ctx.strokeStyle = '#8b733d';
      ctx.strokeRect(sx + 0.5, sy + 0.5, 33, 14);
      ctx.fillStyle = '#ffd644';
      ctx.fillText(hint.text, sx + 4, sy + 11);
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function chapter3HubVisibleMarks() {
    const props = MAP_PROPS.rumorstreet || [];
    return props.filter((prop) => prop.kind === 'ch3_district')
      .map((prop) => ({ map: 'rumorstreet', x: prop.x, y: prop.y, kind: prop.kind, label: prop.label || '' }));
  }

  function drawChapter3HubMarks(cx, cy) {
    if (game.map !== 'rumorstreet') return;
    const low = game.lowGraphics || game.reduceFx;
    const profile = chapter3HubVisualProfile(s3ClearCount(), game.flags.rumorFixed, low);
    const marks = chapter3HubVisibleMarks();
    ctx.save();
    for (const [i, mark] of marks.entries()) {
      const sx = Math.round(mark.x * TS - cx);
      const sy = Math.round(mark.y * TS - cy - 2);
      if (sx < -60 || sx > LW + 60 || sy < -50 || sy > LH + 50) continue;
      const isPaper = mark.label === '대문짝 헤드라인';
      const isFix = mark.label === '정정 보도 길';
      const isExit = mark.label === '반짝 아케이드 문';
      ctx.globalAlpha = low ? 0.78 : (game.flags.rumorFixed ? 0.82 : 0.93);
      ctx.fillStyle = isExit ? '#30213a' : isFix ? '#172f2c' : isPaper ? '#3a241c' : '#202532';
      ctx.fillRect(sx + 5, sy + 8, TS - 10, TS - 12);
      ctx.strokeStyle = isExit ? '#e9a7ff' : isFix ? '#80f0d0' : isPaper ? '#ffcf66' : '#9bd3ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 5.5, sy + 8.5, TS - 11, TS - 13);
      ctx.fillStyle = game.flags.rumorFixed && !isExit ? '#80f0d0' : ctx.strokeStyle;
      ctx.font = fs(14, true);
      ctx.textAlign = 'center';
      ctx.fillText(isExit ? '▶' : isFix ? '✓' : isPaper ? '!' : '▣', sx + TS / 2, sy + 24);
      if (profile.labels) {
        ctx.font = fs(9, true);
        ctx.fillText(mark.label, sx + TS / 2, sy + 4);
      }
      if (i < profile.echoMarks && !low) {
        ctx.globalAlpha = game.flags.rumorFixed ? 0.18 : 0.30;
        ctx.strokeStyle = game.flags.rumorFixed ? '#80f0d0' : '#ffcf66';
        ctx.strokeRect(sx + 2.5, sy + 5.5, TS - 5, TS - 7);
        ctx.globalAlpha = 0.92;
      }
    }
    const headlines = game.flags.rumorFixed
      ? [{ x: 8, y: 7, text: '정정' }, { x: 17, y: 7, text: '확인' }]
      : [
        { x: 6, y: 7, text: '속보' }, { x: 12, y: 9, text: '단독' }, { x: 20, y: 7, text: '충격' },
        { x: 22, y: 13, text: '공유' }, { x: 10, y: 14, text: '불안' }, { x: 17, y: 12, text: '???' },
      ];
    ctx.font = 'bold 10px monospace';
    for (const headline of headlines.slice(0, profile.headlineSigns)) {
      const sx = Math.round(headline.x * TS - cx + 5);
      const sy = Math.round(headline.y * TS - cy + 7);
      if (sx < -70 || sx > LW + 40 || sy < -40 || sy > LH + 40) continue;
      ctx.globalAlpha = game.flags.rumorFixed ? 0.48 : 0.62;
      ctx.fillStyle = game.flags.rumorFixed ? '#132d27' : '#351c18';
      ctx.fillRect(sx, sy, 34, 15);
      ctx.strokeStyle = game.flags.rumorFixed ? '#80f0d0' : '#ffcf66';
      ctx.strokeRect(sx + 0.5, sy + 0.5, 33, 14);
      ctx.fillStyle = game.flags.rumorFixed ? '#c5fff1' : '#ffe08a';
      ctx.fillText(headline.text, sx + 4, sy + 11);
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function chapter4HubVisibleMarks() {
    const props = MAP_PROPS.arcade || [];
    return props.filter((prop) => prop.kind === 'ch4_district')
      .map((prop) => ({ map: 'arcade', x: prop.x, y: prop.y, kind: prop.kind, label: prop.label || '' }));
  }

  function chapter5HubVisibleMarks() {
    const props = MAP_PROPS.cozyhome || [];
    return props.filter((prop) => prop.kind === 'ch5_district')
      .map((prop) => ({ map: 'cozyhome', x: prop.x, y: prop.y, kind: prop.kind, label: prop.label || '' }));
  }

  function drawStaticHubMarks(marks, cx, cy, profile, palette) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const [i, mark] of marks.entries()) {
      const sx = Math.round(mark.x * TS - cx);
      const sy = Math.round(mark.y * TS - cy - 2);
      if (sx < -60 || sx > LW + 60 || sy < -50 || sy > LH + 50) continue;
      const icon = palette.icon(mark.label);
      ctx.globalAlpha = game.lowGraphics || game.reduceFx ? 0.76 : 0.90;
      ctx.fillStyle = icon.bg;
      ctx.fillRect(sx + 5, sy + 8, TS - 10, TS - 12);
      ctx.strokeStyle = icon.fg;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 5.5, sy + 8.5, TS - 11, TS - 13);
      ctx.fillStyle = icon.fg;
      ctx.font = fs(14, true);
      ctx.fillText(icon.text, sx + TS / 2, sy + 24);
      if (profile.labels) {
        ctx.font = fs(9, true);
        ctx.fillText(mark.label, sx + TS / 2, sy + 4);
      }
      if (i < (palette.rings || 0) && !(game.lowGraphics || game.reduceFx)) {
        ctx.globalAlpha = 0.22;
        ctx.strokeRect(sx + 2.5, sy + 5.5, TS - 5, TS - 7);
      }
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function drawHubAtmosphereProps(mapId, kind, cx, cy, palette) {
    const props = (MAP_PROPS[mapId] || []).filter((prop) => prop.kind === kind);
    if (!props.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = fs(12, true);
    for (const prop of props) {
      const sx = Math.round(prop.x * TS - cx);
      const sy = Math.round(prop.y * TS - cy);
      if (sx < -40 || sx > LW + 40 || sy < -40 || sy > LH + 40) continue;
      const icon = palette.icon(prop.label || '');
      const w = icon.w || TS - 24;
      const h = icon.h || TS - 24;
      const ox = icon.ox ?? Math.round((TS - w) / 2);
      const oy = icon.oy ?? 16;
      ctx.globalAlpha = icon.alpha || (game.lowGraphics || game.reduceFx ? 0.42 : 0.62);
      ctx.fillStyle = icon.bg;
      ctx.fillRect(sx + ox, sy + oy, w, h);
      ctx.strokeStyle = icon.fg;
      ctx.strokeRect(sx + ox + 0.5, sy + oy + 0.5, w - 1, h - 1);
      ctx.globalAlpha = game.lowGraphics || game.reduceFx ? 0.72 : 0.84;
      ctx.fillStyle = icon.fg;
      ctx.fillText(icon.text, sx + ox + w / 2, sy + oy + Math.min(h - 4, 14));
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function drawChapter4HubMarks(cx, cy) {
    if (game.map !== 'arcade') return;
    const profile = chapter4HubVisualProfile(s4KeyCount(), game.lowGraphics || game.reduceFx);
    drawStaticHubMarks(chapter4HubVisibleMarks(), cx, cy, profile, {
      rings: profile.confetti,
      icon: (label) => {
        if (label === '포근한 집 문') return { text: '▶', bg: '#30213a', fg: '#e9a7ff' };
        if (label === '잠긴 정문') return { text: '🔒', bg: '#2f2110', fg: '#ffd644' };
        if (label === '백스테이지 입구') return { text: '▣', bg: '#202532', fg: '#9bd3ff' };
        return { text: '★', bg: '#3a1f2d', fg: '#ff8ec7' };
      },
    });
    drawHubAtmosphereProps('arcade', 'ch4_atmosphere', cx, cy, {
      icon: (label) => {
        if (/포스터/.test(label)) return { text: '▤', bg: '#281d28', fg: '#ffb3d8' };
        if (/보안/.test(label)) return { text: '□', bg: '#1d2230', fg: '#9bd3ff' };
        return { text: '▭', bg: '#2d1832', fg: '#ffd6f0' };
      },
    });
    const signs = [
      { x: 9, y: 8, text: '무료' }, { x: 25, y: 8, text: '동의' }, { x: 13, y: 15, text: '당첨' },
      { x: 31, y: 14, text: '오늘' }, { x: 4, y: 17, text: '해지' }, { x: 20, y: 19, text: '보안' },
    ];
    ctx.save(); ctx.font = 'bold 10px monospace';
    for (const s of signs.slice(0, profile.neonSigns)) {
      const sx = Math.round(s.x * TS - cx + 5), sy = Math.round(s.y * TS - cy + 7);
      if (sx < -70 || sx > LW + 40 || sy < -40 || sy > LH + 40) continue;
      ctx.globalAlpha = game.lowGraphics || game.reduceFx ? 0.38 : 0.58;
      ctx.fillStyle = '#2d1832'; ctx.fillRect(sx, sy, 34, 15);
      ctx.strokeStyle = '#ff8ec7'; ctx.strokeRect(sx + 0.5, sy + 0.5, 33, 14);
      ctx.fillStyle = '#ffd6f0'; ctx.fillText(s.text, sx + 4, sy + 11);
    }
    ctx.restore();
  }

  function drawChapter5HubMarks(cx, cy) {
    if (game.map !== 'cozyhome') return;
    const profile = chapter5HubVisualProfile(s5ClearCount(), game.lowGraphics || game.reduceFx);
    drawStaticHubMarks(chapter5HubVisibleMarks(), cx, cy, profile, {
      rings: profile.voiceRipples,
      icon: (label) => {
        if (label === '고요의 뜰 문') return { text: '▶', bg: '#22302b', fg: '#8fe0c0' };
        if (label === '현관 안쪽 문') return { text: '◇', bg: '#3b2a1e', fg: '#ffd08a' };
        if (label === '잠긴 복도 입구') return { text: '…', bg: '#25303a', fg: '#9bd3ff' };
        return { text: '⌂', bg: '#3a2a20', fg: '#ffd08a' };
      },
    });
    drawHubAtmosphereProps('cozyhome', 'ch5_atmosphere', cx, cy, {
      icon: (label) => {
        if (/화분/.test(label)) return { text: '♧', bg: '#213025', fg: '#9fe0a0' };
        if (/중앙 러그/.test(label)) return { text: '▤', bg: '#5a3428', fg: '#ffd08a', w: 56, h: 22, ox: -12, oy: 22, alpha: 0.58 };
        if (/러그/.test(label)) return { text: '▤', bg: '#3a241d', fg: '#ffd08a' };
        if (/탁자/.test(label)) return { text: '▣', bg: '#4a3324', fg: '#ffd6a8', w: 28, h: 22, ox: 2, oy: 15, alpha: 0.56 };
        if (/바구니/.test(label)) return { text: '◡', bg: '#3d2d24', fg: '#ffe0b0', w: 28, h: 22, ox: 2, oy: 15, alpha: 0.54 };
        if (/액자/.test(label)) return { text: '▢', bg: '#2d241f', fg: '#ffd0a0' };
        if (/책장/.test(label)) return { text: '▥', bg: '#2c241a', fg: '#d8b078' };
        return { text: '▪', bg: '#3a2a20', fg: '#ffe0a8' };
      },
    });
    const lamps = [
      { x: 8, y: 9 }, { x: 18, y: 10 }, { x: 28, y: 9 }, { x: 12, y: 17 }, { x: 31, y: 16 },
    ];
    ctx.save();
    for (const lamp of lamps.slice(0, profile.warmLamps)) {
      const sx = Math.round(lamp.x * TS - cx + TS / 2), sy = Math.round(lamp.y * TS - cy + TS / 2);
      if (sx < -50 || sx > LW + 50 || sy < -50 || sy > LH + 50) continue;
      ctx.globalAlpha = game.lowGraphics || game.reduceFx ? 0.18 : 0.32;
      ctx.fillStyle = '#ffd08a'; ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.72; ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }
    ctx.restore();
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

    // 방탈출 물체 (단말·게시판·지우개·출구) — 타일 위, 엔티티 아래
    if (game.puzzleRun) drawPuzzleObjects(cx, cy);
    // 프롤로그 실험실 — 핵심 단서/보조 조사물/출구를 눈에 보이게 배치한다.
    drawIntroLabObjects(cx, cy);
    // 프롤로그 숲 — 출구 직후 따라의 첫 흔적을 실제 조사물로 보여 준다.
    drawForestPrologueObjects(cx, cy);
    // 1장 허브 — 구역 랜드마크/담아 빌드업 조사물을 정적 표식으로 보여 준다.
    drawCh1HubMarks(cx, cy);
    // 1장 허브 — 노출도가 오를수록 광고/감시 표식이 늘어나되 저사양 모드에서는 수를 줄인다.
    drawCh1StreetPressureObjects(cx, cy);
    // 2장 허브 — 새 NPC 없이 구역 입구/저울/다음 문을 정적 표식으로 보여 준다.
    drawChapter2HubMarks(cx, cy);
    // 3장 허브 — 소문 거리의 신문사/상점/헤드라인/다음 문을 정적 표식으로 보여 준다.
    drawChapter3HubMarks(cx, cy);
    // 4·5장 허브 — 새 NPC를 늘리지 않고 넓은 공간의 목적지 표식만 띄운다.
    drawChapter4HubMarks(cx, cy);
    drawChapter5HubMarks(cx, cy);
    // 2장 허브 — 중앙의 거대한 저울 (구역 클리어마다 기울기가 준다)
    if (game.map === 'tiltstreet') drawTiltScale(cx, cy);

    // NPC
    for (const npc of m.npcs) {
      if (!npcVisible(npc)) continue;
      const nx = Math.round(npc.x * TS - cx);
      const ny = Math.round(npc.y * TS - cy - 6);
      if (npc.monSprite) {
        const bob = Math.round(Math.sin(game.time / 22) * 2);
        drawMon(ctx, npc.monSprite, nx, ny + bob, SCALE);
      } else {
        drawSprite(ctx, NPC_SPRITES.down[frame], nx, ny, SCALE, NPC_PALETTES[npc.pal]);
      }
      // "말을 걸 수 있어요" 말풍선 (대화 가능한 NPC 머리 위)
      drawTalkBubble(nx + TS / 2, ny - 14);
    }

    // 인물 (둥실둥실) — 되돌려 친구가 된 인물은 ♥와 함께 남고,
    // 냉정·중립으로 떠나보낸 인물은 자리에 없다 (선택이 세계에 남는다)
    for (const mo of m.monsters) {
      const dead = game.flags.defeated[mo.id];
      const friend = isFriend(mo.id);
      if (dead && !friend) continue;
      const bob = Math.round(Math.sin(game.time / 18) * 4);
      const dx0 = Math.round(mo.x * TS - cx), dy0 = Math.round(mo.y * TS - cy - 6 + bob);
      drawMon(ctx, mo.id, dx0, dy0, SCALE);
      if (friend) {
        // 친구가 된 인물: 머리 위 ♥ (말을 걸 수 있어요)
        ctx.fillStyle = '#e0453a';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('♥', Math.round(mo.x * TS - cx) + TS / 2 - 5, Math.round(mo.y * TS - cy) - 10 + bob);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.strokeText('♥', Math.round(mo.x * TS - cx) + TS / 2 - 5, Math.round(mo.y * TS - cy) - 10 + bob);
      } else {
        // 느낌표 (아직 헷갈리는 인물)
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

    if (game.puzzleRun) drawStalkers(cx, cy);
    // 코어 — 여덟 개의 의자(안아 준 조각 수만큼 채워짐)
    if (game.map === 'coreroom') drawCoreChairs(cx, cy);

    // 2장 구역 연출 — 어둠(꺼진 거리)·비네트(메아리 골목). HUD 아래에 깔린다.
    if (game.puzzleRun && game.puzzleRun.puzzle.type === 'lamps') drawDarkness(cx, cy);
    if (game.puzzleRun && game.puzzleRun.puzzle.type === 'voices') drawEchoVignette();
    // 황혼 앰비언트(마을·숲) — 온기가 쌓일수록 옅어진다
    drawDuskAmbient();
    // 파이널 「고요의 뜰」 — 구역을 지날 때마다 화면이 한 단계씩 어두워진다(비네트 재사용)
    drawQuietVignette();
    // 동행자 반디 — 어스름 위에 그려, 황혼 속에서 홀로 빛나는 광원이 된다
    drawCompanion(cx, cy);

    drawHud();
    if (!game.puzzleRun) drawObjectiveArrow();
    drawControlHint();
    drawNotice();
    if (game.puzzleRun) {
      drawPuzzleHud();
      // 접촉 화면 플래시 (모션 민감 배려로 reduceFx면 생략)
      if (game.puzzleRun.flashT > 0 && !game.reduceFx) {
        ctx.fillStyle = 'rgba(224,69,58,0.32)';
        ctx.fillRect(0, 0, LW, LH);
      }
    }
    drawAdStickers();
    drawSofaWarmth();
    drawIntroDim();
  }

  // 새 게임 인트로 암전 — 컴퓨터실 장면(대화 첫 3줄) 동안 화면을 거의 가리고,
  // 4번째 줄부터 120프레임에 걸쳐 서서히 걷는다. 대화 박스(drawDialog)는 이 함수
  // 뒤에 그려지므로 이 오버레이 위로 온전히 보인다. reduceFx면 페이드 없이 즉시 걷힌다.
  function drawIntroDim() {
    if (!game.introDim) return;
    const idx = game.dialog ? game.dialog.idx : 4; // 대화가 이미 끝났으면 다 걷힌 것으로 취급
    if (idx < 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.fillRect(0, 0, LW, LH);
      return;
    }
    if (game.reduceFx) { game.introDim = null; return; } // 페이드 없이 즉시 전환
    game.introDim.fadeFrame = Math.max(0, game.introDim.fadeFrame) + 1;
    const t = Math.min(1, game.introDim.fadeFrame / 120);
    const alpha = 0.92 * (1 - t);
    if (alpha <= 0.003) { game.introDim = null; return; }
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, LW, LH);
  }

  // 5장 구역③ 「소파 코너」 — 앉아 있는 동안 화면에 따뜻한 색 오버레이가 점점 짙어진다.
  // reduceFx면 점점 짙어지는 애니메이션 없이 고정 톤으로만 표시한다(모션 민감 배려).
  function drawSofaWarmth() {
    if (!(game.puzzleRun && game.puzzleRun.puzzle.type === 'sofa' && game.puzzleRun.sitting)) return;
    const run = game.puzzleRun;
    const settle = Math.min(1, (run.sitFrames || 0) / 180); // 앉은 뒤 점점 짙어진다(3초 정도)
    const alpha = game.reduceFx ? 0.16 : 0.08 + 0.14 * settle;
    ctx.fillStyle = `rgba(224,139,58,${alpha})`;
    ctx.fillRect(0, 0, LW, LH);
  }

  // 4장 「반짝 아케이드」 — 광고 딱지 HUD 오염. 화면 가장자리에 반투명 스티커가
  // 누적(0~4개)되어 시야를 방해한다. 해지 단말(구역① 룰렛 광장)로만 전부 사라진다.
  // reduceFx면 깜빡임(펄스) 없이 고정 표시한다(광과민성·모션 민감 배려).
  const AD_STICKERS = [
    { text: '무료!', color: '#ff4d6d' },
    { text: '당첨!', color: '#ffd644' },
    { text: '오늘만!', color: '#4dd0e1' },
    { text: '핫딜!', color: '#a86ae0' },
  ];
  function drawAdStickers() {
    const n = game.flags.adStickers || 0;
    if (n <= 0) return;
    const W = 58, H = 24;
    // 상시 HUD(좌상단 목표 상자 y 8~60, 우상단 자비(♥) 표시)와 겹치지 않도록 상단
    // 딱지는 y=96(HUD·퍼즐 HUD 아래)으로 내린다. 화면 모서리를 어지럽히는 연출 의도는 유지.
    const spots = [
      { x: 8, y: 96 },               // 좌상단(HUD 아래)
      { x: LW - W - 8, y: 96 },      // 우상단(HUD·하트 표시 아래)
      { x: 8, y: LH - H - 8 },       // 좌하단
      { x: LW - W - 8, y: LH - H - 8 }, // 우하단
    ];
    for (let i = 0; i < n; i++) {
      const s = spots[i], deco = AD_STICKERS[i];
      const pulse = game.reduceFx ? 1 : 0.75 + 0.25 * Math.sin(game.time / 14 + i * 2);
      ctx.save();
      ctx.globalAlpha = 0.85 * pulse;
      ctx.fillStyle = deco.color;
      ctx.fillRect(s.x, s.y, W, H);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x + 0.5, s.y + 0.5, W, H);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(deco.text, s.x + W / 2, s.y + H / 2 + 4);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  // 월드 상단 안내 토스트 (해금 알림 등) — 잠깐 떴다 사라진다
  function drawNotice() {
    if (!game.notice || game.notice.t <= 0) return;
    const txt = game.notice.text;
    ctx.font = fs(13, true);
    const tw = ctx.measureText(txt).width;
    const bw = tw + 28, bh = game.largeText ? 32 : 28;
    // 퍼즐 HUD(drawPuzzleHud, by=8~최대 74px 높이)와 세로로 겹치지 않도록,
    // 방탈출 중에는 그 아래로 내려서 그린다.
    const bx = Math.round(LW / 2 - bw / 2), by = game.puzzleRun ? 86 : 70;
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
    const txt = isTouchDevice ? '스틱으로 이동 · Ⓐ 버튼으로 말 걸기' : '방향키로 이동 · Z(또는 A 버튼)로 말 걸기';
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
    const target = getObjectiveTarget(flags, curMap);
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
    const target = getObjectiveTarget(game.flags, game.map);
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

  // v2 신규 스테이지 맵(전부 공짜 거리~코어) → 장 번호를 맵 자체에 고정한다.
  // HUD가 진행 플래그로 다시 계산하지 않고 그 스테이지의 장을 우선 보여 주기 위함.
  const MAP_CHAPTER = {
    introlab: 0, // 프롤로그
    freestreet: 1, traceroom: 1, boardplaza: 1, warehouse: 1, ownerroom: 1,
    tiltstreet: 2, echoalley: 2, samplehouse: 2, dimstreet: 2, gatekeeper: 2,
    rumorstreet: 3, tipsroom: 3, editroom: 3, towerroom: 3, towerroof: 3,
    arcade: 4, roulettesquare: 4, signupalley: 4, backstage: 4, yuhokstage: 4,
    cozyhome: 5, callroom: 5, corridor: 5, sofaroom: 5, lumiroom: 5,
    quietyard: 'final', goyostage: 'final', coreroom: 'final',
  };
  // 챕터 플래그 기반 HUD 표기: 프롤로그~1장 클리어 전 = "1장", chapterNClear 이후 =
  // "(N+1)장", chapter5Clear 이후 = "파이널". 신규 스테이지 맵은 그 맵 자신의 장을 우선한다.
  function chapterBadgeLabel(mapId, flags) {
    const fixed = MAP_CHAPTER[mapId];
    if (fixed === 0) return '프롤로그';
    if (fixed === 'final') return '파이널';
    if (fixed) return `${fixed}장`;
    if (flags.chapter5Clear) return '파이널';
    if (flags.chapter4Clear) return '5장';
    if (flags.chapter3Clear) return '4장';
    if (flags.chapter2Clear) return '3장';
    if (flags.chapter1Clear) return '2장';
    // 따라(프롤로그)를 되돌리기 전에는 아직 1장이 아니다
    return (flags.defeated && flags.defeated.bekkyeomon) ? '1장' : '프롤로그';
  }

  // HUD 좌상단 챕터 텍스트
  function hudBadgeText(mapId, flags) {
    return chapterBadgeLabel(mapId, flags);
  }

  function drawHud() {
    // 스테이지 + 지역 이름 + 목표
    const m = MAPS[game.map];
    ctx.font = 'bold 14px monospace';
    const title = `${hudBadgeText(game.map, game.flags)} · ${m.name}`;
    // 방탈출 중에는 본편 퀘스트 대신 방 맥락 목표를 보여 준다 (클리어 후엔 보스방 안내)
    let objText;
    if (game.puzzleRun) {
      const puz = game.puzzleRun.puzzle;
      objText = game.flags.privacyRecoveryActive
        ? `노출도 MAX — 정보 조각 회수 ${game.flags.privacyRecovery || 0}/${PRIVACY_RECOVERY_NEED}`
        : (isPuzzleCleared(game.puzzleRun.id) && puz.objectiveCleared) ? puz.objectiveCleared
          : (puz.objective || '방을 빠져나가자');
    } else if (game.map === 'freestreet') {
      // 허브 HUD — 금고 잠금 진행을 상시 가시화
      const n = s1LockCount();
      objText = game.flags.chapter1Clear ? '거리를 둘러보자'
        : n >= 3 ? '금고가 열렸다 — 주인의 방으로'
        : `금고 잠금 ${n}/3 해제 — 구역을 돌자`;
    } else if (game.map === 'tiltstreet') {
      // 2장 허브 HUD — 저울 기울기를 상시 가시화
      const tilt = 3 - s2ClearCount();
      objText = game.flags.chapter2Clear ? '거리를 둘러보자'
        : tilt <= 0 ? '저울이 수평이다 — 문지기의 방으로'
        : `저울 기울기 ${tilt}/3 — 골목을 살펴보자`;
    } else if (game.map === 'rumorstreet') {
      // 3장 허브 HUD — 신문사 층별 진행을 상시 가시화
      const n = s3ClearCount();
      objText = game.flags.chapter3Clear ? '거리를 둘러보자'
        : n >= 3 ? '신문사 옥상 — 그럴싸를 만나자'
        : `소문의 출처를 찾자 — 신문사 ${n}/3층`;
    } else if (game.map === 'arcade') {
      // 4장 허브 HUD — 열쇠(비밀조각·본인표) 진행을 상시 가시화
      const n = s4KeyCount();
      objText = game.flags.chapter4Clear ? '아케이드를 둘러보자'
        : n >= 2 ? '정문이 열렸다 — 반짝의 무대로'
        : `열쇠 ${n}/2 확보 — 구역을 돌자`;
    } else if (game.map === 'cozyhome') {
      // 5장 허브 HUD — 확인하는 용기(구역 3개) 진행을 상시 가시화
      const n = s5ClearCount();
      objText = game.flags.chapter5Clear ? '집을 둘러보자'
        : n >= 3 ? '현관이 열렸다 — 루미의 방으로'
        : `확인한 용기 ${n}/3 — 방을 둘러보자`;
    } else {
      objText = getObjective(game.flags, game.map);
    }
    const obj = `목표: ${objText}`;
    const w = Math.max(ctx.measureText(obj).width, ctx.measureText(title).width) + 20;
    utBox(8, 8, w, 52, 4);
    ctx.fillStyle = '#ffd644';
    ctx.fillText(title, 18, 28);
    ctx.fillStyle = '#fff';
    ctx.fillText(obj, 18, 50);

    // 안아 준 마음 (자비)
    if (game.flags.mercy > 0) {
      utBox(LW - 196, 12, 64, 28, 4);
      ctx.fillStyle = '#e0453a';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`♥ ${game.flags.mercy}`, LW - 184, 31);
    }

    if ((game.flags.privacyLeak || 0) > 0 || game.flags.privacyRecoveryActive) {
      const leak = privacyLeak();
      const boxW = 206;
      utBox(LW - boxW - 10, game.flags.mercy > 0 ? 46 : 12, boxW, 30, 4);
      ctx.fillStyle = leak >= 5 ? '#e0453a' : leak >= 3 ? '#ffd644' : '#9bd3ff';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`노출도 ${leak}/5 · ${privacyLevelLabel(leak)}`, LW - boxW, game.flags.mercy > 0 ? 66 : 32);
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

    // 인물 (오른쪽 위, 크게)
    const shakeX = b.shake > 0 ? Math.sin(b.shake * 2) * (game.reduceFx ? 2 : 6) : 0;
    const bob = Math.sin(game.time / 20) * 5;
    const monScale = 9;
    const mx = Math.round(LW - 16 * monScale - 60 + shakeX);
    const my = Math.round(56 + bob);
    const mcx = mx + 16 * monScale / 2;
    // 그림자 — 인물이 땅에 떠 있는 느낌을 줘 화면이 덜 휑하게
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(mcx, 222, 56 - bob, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    drawMon(ctx, b.monId, mx, my, monScale);
    // 인물 이름 + 마음 게이지·상태
    utBox(24, 24, 240, 64, 6);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 17px monospace';
    ctx.fillText(b.mon.name, 40, 50);
    if (b.isPersuade) {
      const stateColor = b.pState === 'open' ? okColor() : b.pState === 'shaken' ? warnColor() : badColor();
      ctx.fillStyle = stateColor;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(P_STATE_LABEL[b.pState], 40, 70);
      ctx.fillStyle = '#333';
      ctx.fillRect(72, 62, 168, 12);
      ctx.fillStyle = '#ffd644';
      ctx.fillRect(72, 62, 168 * clamp(b.gauge / b.gaugeMax, 0, 1), 12);
      ctx.fillStyle = '#888';
      ctx.font = '11px monospace';
      ctx.fillText('마음', 244 - 24, 50);
    }

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

    // 마음 조각 배틀 — 파도/문 (공간 행동)
    if (b.isPersuade && (b.phase === 'wave' || b.phase === 'gates')) { drawPersuadeArena(b); return; }

    ctx.font = fs(16);
    let boxH = game.largeText ? 280 : 238;
    if (b.isPersuade) boxH = game.largeText ? 312 : 264; // 자비 선택 텍스트가 넉넉히 들어가게
    const boxY = LH - boxH - 12;
    const hintY = boxY + boxH - 18;
    utBox(12, boxY, LW - 24, boxH, 8);

    if (false) { // (v3) 퀴즈 배틀 폐지 — question/feedback 단계 없음
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

  // 상자 폭을 넘는 글자는 말줄임(…)으로 자른다 — 호출 전에 ctx.font를 맞춰 둘 것
  // (측정이 폰트에 따라 달라진다).
  function ellipsizeToWidth(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  // 마음 조각 배틀(파도·문)·회피 상자 위 안내 문구 — 상자 폭 이내로 말줄임하고,
  // 상자가 하트 HUD/인물 자리에서 충분히 떨어져 있는 y(box.y-28/-10)에 그린다.
  function drawArenaGuide(box, taunt, guide) {
    const maxW = box.w - 16;
    const cx = box.x + box.w / 2;
    ctx.textAlign = 'center';
    if (taunt) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(ellipsizeToWidth(taunt, maxW), cx, box.y - 28);
    }
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    ctx.fillText(ellipsizeToWidth(guide, maxW), cx, box.y - 10);
    ctx.textAlign = 'left';
  }

  function drawDarkArenaVignette(b) {
    const soul = b.arena.soul;
    if (game.reduceFx) {
      // 저시력·광과민성 완화(화면 효과 줄이기) — 하트 주변만 보이는 방사형 비네트 대신
      // 균일하게 살짝만 어둡혀 시야를 넓게 확보한다(가장 어두운 가장자리 0.88보다 훨씬 옅은 0.55).
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, LW, LH);
      return;
    }
    const grad = ctx.createRadialGradient(soul.x, soul.y, 18, soul.x, soul.y, 90);
    if (grad && grad.addColorStop) {
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
    }
    ctx.fillRect(0, 0, LW, LH);
  }

  // 마음 조각 배틀 — 파도(탄막+조각)와 문(응답)을 한 상자 안에서 그린다.
  function drawPersuadeArena(b) {
    const arena = b.arena, box = arena.box;
    // 인물의 외침 + 조작 안내
    drawArenaGuide(box, b.attack ? b.attack.taunt : null, b.phase === 'gates'
      ? '마음에 닿는 문으로 하트를 넣어요! (자물쇠 문은 아직 못 열어요)'
      : (b.prologueTutorial ? '마음 안쪽: ✦ 속마음 조각을 주워요. 탄막은 피하고!' : '✦를 주워 속마음을 들어요. 탄막은 피하고!'));

    if (b.prologueTutorial) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,214,68,0.12)';
      ctx.fillRect(24, 154, 210, 42);
      ctx.strokeStyle = 'rgba(255,214,68,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(24.5, 154.5, 210, 42);
      ctx.fillStyle = '#ffd644';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('프롤로그 · 따라의 마음 안쪽', 36, 176);
      ctx.fillStyle = '#bbb';
      ctx.font = '11px monospace';
      ctx.fillText('퀴즈가 아니라, 듣고 피하고 다가가기', 36, 192);
    }

    // 박스 — 루미(보스)는 포근한 색 테두리로 표시된다(축소 기믹 진행 중 안내)
    ctx.strokeStyle = b.p.openMechanic === 'shrink' ? '#e0a583' : '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);

    // 탄막
    if (b.attack) {
      ctx.fillStyle = b.attack.color;
      for (const bu of arena.bullets) {
        ctx.beginPath();
        ctx.arc(bu.x, bu.y, bu.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 고요(보스) — 어둠 속에서 하트 주변만 보인다(탄막은 어둠 밖에서 날아든다)
    if (b.p.openMechanic === 'dark' && b.pState === 'open' && b.phase === 'wave') drawDarkArenaVignette(b);

    if (b.phase === 'wave') {
      // 고요(보스) — 탄막이 나오기 전, 스폰을 한 번 깜빡여 예고한다
      if (b.p.openMechanic === 'dark' && (b.wave.darkWarnT || 0) > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = Math.floor(game.time / 4) % 2 === 0 ? '#fff' : '#e07a5f';
        ctx.font = 'bold 15px monospace';
        ctx.fillText('…!', box.x + box.w / 2, box.y - 12);
        ctx.textAlign = 'left';
      }
      // 속마음 조각 ✦ (사라지기 직전 깜빡)
      ctx.textAlign = 'center';
      for (const f of b.wave.fragments) {
        if (f.ttl < 60 && Math.floor(game.time / 6) % 2 === 0) continue;
        ctx.fillStyle = '#ffd644';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('✦', f.x, f.y + 6);
      }
      // 담아(보스) 정보 꾸러미 + 돌려주기 구멍
      if (b.p.openMechanic === 'parcel' && b.pState === 'open') {
        const pc = b.wave.parcel;
        ctx.fillStyle = '#7bd1f0';
        ctx.fillRect(pc.hole.x - 9, pc.hole.y - 9, 18, 18);
        ctx.fillStyle = '#000'; ctx.font = '11px monospace';
        ctx.fillText('↩', pc.hole.x, pc.hole.y + 4);
        if (pc.obj) { ctx.fillStyle = '#f0c060'; ctx.font = '16px monospace'; ctx.fillText('▣', pc.obj.x, pc.obj.y + 5); }
        if (arena.carrying) { ctx.fillStyle = '#f0c060'; ctx.font = '13px monospace'; ctx.fillText('▣', arena.soul.x + 10, arena.soul.y - 8); }
      }
      // 기울(보스) 반례 구슬 + 저울 접시 (상자 오른쪽·높은 쪽 가장자리)
      if (b.p.openMechanic === 'tilt' && b.pState === 'open') {
        const tl = b.wave.tilt;
        ctx.fillStyle = '#e0a53a';
        ctx.fillRect(tl.plate.x - 9, tl.plate.y - 9, 18, 18);
        ctx.fillStyle = '#000'; ctx.font = '11px monospace';
        ctx.fillText('⚖', tl.plate.x, tl.plate.y + 4);
        ctx.fillStyle = '#e0a53a'; ctx.font = '10px monospace';
        ctx.fillText('저울 접시', tl.plate.x, tl.plate.y - 16);
        if (tl.orb) {
          ctx.fillStyle = '#8ecbff'; ctx.font = '16px monospace'; ctx.fillText('◍', tl.orb.x, tl.orb.y + 5);
          ctx.font = '10px monospace'; ctx.fillText('반례', tl.orb.x, tl.orb.y - 12);
        }
        if (arena.carrying) { ctx.fillStyle = '#8ecbff'; ctx.font = '13px monospace'; ctx.fillText('◍', arena.soul.x + 10, arena.soul.y - 8); }
      }
      // 반짝(보스) 반짝이는 보상 아이템 — 240프레임 가까워지면 깜빡인다(버티면 곧 소멸+보상)
      if (b.p.openMechanic === 'tempt' && b.pState === 'open') {
        const tp = b.wave.tempt;
        if (tp.obj) {
          const near = tp.obj.age > 180 && Math.floor(game.time / 6) % 2 === 0;
          ctx.fillStyle = near ? '#fff2a8' : '#ffd644';
          ctx.font = '18px monospace';
          ctx.fillText('✧', tp.obj.x, tp.obj.y + 6);
          ctx.font = '10px monospace';
          ctx.fillText('반짝', tp.obj.x, tp.obj.y - 12);
        }
      }
      // 그럴싸(보스) [진]/[낚] 헤드라인 조각 — 색약 모드는 okColor/badColor로 색 구분
      if (b.p.openMechanic === 'truth' && b.pState === 'open') {
        const tr = b.wave.truth;
        if (tr.obj) {
          const isReal = tr.obj.kind === 'real';
          ctx.fillStyle = isReal ? okColor() : badColor();
          ctx.font = 'bold 14px monospace';
          ctx.fillText(isReal ? '[진]' : '[낚]', tr.obj.x, tr.obj.y + 5);
        }
      }
      ctx.textAlign = 'left';
      // 남은 파도 시간 바
      const frac = Math.max(0, 1 - b.wave.t / b.wave.dur);
      ctx.fillStyle = '#333'; ctx.fillRect(box.x, box.y + box.h + 12, box.w, 6);
      ctx.fillStyle = '#ffd644'; ctx.fillRect(box.x, box.y + box.h + 12, box.w * frac, 6);
      // 기울기 바 — 상자가 왼쪽으로 얼마나 기울어 있는지(왼쪽부터 채워지는 게이지)
      if (b.p.openMechanic === 'tilt' && b.pState === 'open') {
        const tiltFrac = b.wave.tilt.drift / 0.9;
        ctx.fillStyle = '#333'; ctx.fillRect(box.x, box.y + box.h + 22, box.w, 4);
        ctx.fillStyle = '#e0a53a'; ctx.fillRect(box.x, box.y + box.h + 22, box.w * 0.5 * tiltFrac, 4);
      }
      // 반짝(보스) 조명 표시 — 버틴 횟수(resisted)만큼 조명이 하나씩 꺼진다
      if (b.p.openMechanic === 'tempt' && b.pState === 'open') {
        const resisted = b.wave.tempt.resisted || 0;
        ctx.font = '14px monospace';
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i < resisted ? '#333' : '#ffd644';
          ctx.fillText('●', box.x + box.w - 60 + i * 20, box.y + box.h + 34);
        }
      }
      // 그럴싸(보스) [진] 적중 표시 — 잡은 개수(caught)만큼 불이 들어온다
      if (b.p.openMechanic === 'truth' && b.pState === 'open') {
        const caught = b.wave.truth.caught || 0;
        ctx.font = '14px monospace';
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i < caught ? okColor() : '#555';
          ctx.fillText('●', box.x + box.w - 60 + i * 20, box.y + box.h + 34);
        }
      }
      // 루미(보스) 축소 단계 표시 — 상자가 좁아진 단계만큼 채워지는 게이지(포근한 색)
      if (b.p.openMechanic === 'shrink' && b.pState === 'open') {
        const lvl = b.shrinkLevel || 0;
        ctx.fillStyle = '#333'; ctx.fillRect(box.x, box.y + box.h + 22, box.w, 4);
        ctx.fillStyle = '#e0a583'; ctx.fillRect(box.x, box.y + box.h + 22, box.w * (lvl / SHRINK_MAX_LEVEL), 4);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e0a583'; ctx.font = '10px monospace';
        ctx.fillText(`포근함 ${lvl}/${SHRINK_MAX_LEVEL}`, box.x + box.w / 2, box.y + box.h + 34);
        ctx.textAlign = 'left';
      }
    } else if (b.phase === 'gates') {
      // 문 3개
      for (const d of b.gates.doors) {
        ctx.fillStyle = d.locked ? 'rgba(80,80,90,0.5)' : 'rgba(60,120,180,0.35)';
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.strokeStyle = d.locked ? '#556' : '#8ecbff';
        ctx.lineWidth = 2;
        ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.w, d.h);
        ctx.textAlign = 'center';
        ctx.fillStyle = d.locked ? '#889' : '#fff';
        ctx.font = 'bold 11px monospace';
        const cx = d.x + d.w / 2;
        if (d.locked) { ctx.fillText('🔒', cx, d.y + 18); }
        // 라벨 (두 줄까지 접기)
        const words = d.label.split(' ');
        let line = '', ly = d.y + (d.locked ? 34 : 20);
        for (const w of words) {
          if (line && (line + ' ' + w).length > 8) { ctx.fillText(line, cx, ly); ly += 13; line = w; }
          else line = line ? line + ' ' + w : w;
        }
        if (line) ctx.fillText(line, cx, ly);
      }
      ctx.textAlign = 'left';
      // 남은 응답 시간 바
      const frac = Math.max(0, 1 - b.gates.t / b.gates.timeLimit);
      ctx.fillStyle = '#333'; ctx.fillRect(box.x, box.y + box.h + 12, box.w, 6);
      ctx.fillStyle = '#8ecbff'; ctx.fillRect(box.x, box.y + box.h + 12, box.w * frac, 6);
    }

    // 하트(소울) — 무적 시간 동안 깜빡임
    if (!(arena.inv > 0 && Math.floor(game.time / 4) % 2 === 0)) {
      ctx.fillStyle = '#e0453a';
      ctx.font = '17px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('♥', arena.soul.x, arena.soul.y + 6);
      ctx.textAlign = 'left';
    }

    // 비차단 플로팅 텍스트 (상자 위를 천천히 떠오른다)
    if (b.floatActive) {
      const fa = b.floatActive;
      const alpha = fa.t < 20 ? fa.t / 20 : fa.t > fa.dur - 30 ? (fa.dur - fa.t) / 30 : 1;
      const fy = box.y - 46 - fa.t * 0.12;
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px monospace';
      const parts = String(fa.text).split('\n');
      for (let i = 0; i < parts.length; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, alpha)})`;
        ctx.fillText(parts[i], LW / 2, fy + i * 18);
      }
      ctx.textAlign = 'left';
    }
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
    ctx.fillText('마음의 문', LW / 2, 86);
    ctx.fillStyle = '#888';
    ctx.font = '15px monospace';
    ctx.fillText('화면 속에서, 누군가 기다리고 있다', LW / 2, 114);

    // 인물들 둥실둥실 (한 줄)
    const parade = ['bekkyeomon', 'sujipmon', 'pyeonhyangmon', 'hwangakmon', 'yuhokmon', 'hollimmon', 'finalboss', 'yeongi'];
    for (let i = 0; i < parade.length; i++) {
      const bx = LW / 2 - parade.length * 24 + i * 48;
      drawMon(ctx, parade[i], bx, 134 + Math.sin(game.time / 20 + i * 1.1) * 5, 3);
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
        const prog = sum.done ? '모험 완료' : sum.stage;
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
    // 터치 기기엔 키보드가 없으므로 단축키 벽 대신 핵심 조작만 + "메뉴에서 더 보기"
    if (isTouchDevice) {
      ctx.font = '14px monospace';
      ctx.fillText('스틱으로 슬롯 선택 · Ⓐ로 시작', LW / 2, 462);
      ctx.fillStyle = '#9aa8c8';
      ctx.font = '13px monospace';
      ctx.fillText('친구수첩·챌린지·백업 등 모든 기능은 [메뉴] 버튼에', LW / 2, 484);
    } else {
      ctx.font = '12px monospace';
      ctx.fillText(`↑↓ 선택 · Z 시작 · X 삭제 · C 친구수첩 · Q 도전극장 · J 일지 · B 도전과제 · K 꾸미기 · L 기억조각`, LW / 2, 456);
      ctx.fillText(`F 명예의전당 · U 백업 · I 도움말 · M 음악 · 난이도(${DIFF_LABEL[game.difficulty]})`, LW / 2, 472);
      ctx.fillStyle = '#555';
      ctx.font = '11px monospace';
      ctx.fillText('t: 선생님 방', LW / 2, 488);
      ctx.fillStyle = '#777';
    }

    // 발견한 엔딩 (게임을 다시 시작해도 남는다)
    const seen = getEndingsSeen();
    const seenCount = ['home', 'dawn', 'farewell', 'silent'].filter((k) => seen[k]).length;
    const names = { home: '집으로', dawn: '새벽', farewell: '작별', silent: '침묵' };
    const found = ['home', 'dawn', 'farewell', 'silent']
      .map((k) => (seen[k] ? names[k] : '???')).join(' · ');
    ctx.fillStyle = '#e0453a';
    ctx.font = '13px monospace';
    ctx.fillText(`♥ 발견한 엔딩 ${seenCount}/4 — ${found}   ·   친구 ${dexSeenCount()}/${DEX_ORDER.length}`, LW / 2, 500);

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
    game.map = 'introlab';
    game.player.x = 14; game.player.y = 16;
    game.player.px = 14 * TS; game.player.py = 16 * TS;
    game.player.dir = 'up';
    game.flags = newFlags();
    game.mode = 'world';
    save();
    recordPlayDay(slot);
    checkCosmeticUnlocks(slot);
    // 인트로 암전 — 첫 3줄(컴퓨터실 장면) 동안 화면을 거의 검게 덮는다.
    // 4번째 줄부터 걷히기 시작한다(drawWorld에서 처리).
    // 인트로 동안은 아무 음악도 흐르지 않는다 — 침묵으로 시작해, 눈을 뜬 뒤에야
    // 음악이 아주 낮게 흘러든다 (다크 톤 오프닝 연출).
    game.introDim = { fadeFrame: -1 };
    startDialog([
      '눈을 뜨니 좁은 방이다.\n낡은 기계들과 컴퓨터 몇 대가\n어둠 속에 잠들어 있다.',
      `${game.playerName}이(가) 일어난 곳은\n어디일까… 기억이 잘 나지 않는다.`,
      '벽 한가운데, 반짝이지 않는 문.\n이 방에서 나가려면\n무언가를 찾아야 한다.',
      '방 안을 살펴보자 — 실마리가 있을지도.\n(목표는 왼쪽 위에 표시돼요)',
    ], null, () => {
      // 동행자 합류 — 무음의 인트로 끝에 작은 빛이 날아든다. 음악은 그 뒤에야 흘러든다.
      startDialog([
        '(작은 빛 하나가 포르르 날아와\n어깨 옆에 멈춘다.)',
        '안녕! 나는 반디.\n이 세계의 안내 도우미… 랄까.',
        '길 잃은 아이는 오랜만이라.\n…내가 옆에 있어 줄게.\n어디든, 끝까지.',
      ], '반디', () => {
        game.flags.bandiJoined = true;
        save();
        Sound.playSong(MAPS[game.map].song);
      });
    });
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
    game.flags.defeated = Object.assign(newFlags().defeated, s.flags.defeated);
    game.mode = 'world';
    syncPuzzleRun(); // 방탈출 방 안에서 저장된 세이브면 퍼즐을 새로 시작
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
            '',
            '태블릿 화면 밖, 아침 해.',
            '…옆에 박사님이 서 있다.',
            '',
            '…책상 위 태블릿 화면 한구석,',
            '작은 빛이 반짝 — 하고 인사했다.',
          ],
          yeongi: true,
          bandi: true,
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
            '…서명 옆에, 작은 빛 이모티콘이 붙어 있었다.',
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
            '아이들의 마음을 더 많이 안아 주었다면.',
            '',
            '…어깨 옆자리가, 유난히 허전했다.',
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
            '아이들은 길을 비켰지만,',
            '아무도 너의 이름을 부르지 않았다.',
            '영이는 끝까지 네 눈을 보지 않은 채,',
            '조용히 화면을 껐다.',
            '',
            '…정답만으로는, 닿지 않는 마음이 있다.',
            '…길을 일러 주던 목소리도,',
            '더는 들리지 않았다.',
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
        drawMon(ctx, 'yeongi', LW / 2 - 32, 420 + bob, 4);
      }
      if (e.bandi) {
        // 영이 곁의 작은 빛 — 여정 내내 함께 걷던 반디의 마지막 인사
        const bob2 = Math.sin(game.time / 14 + 1.5) * 5;
        drawMon(ctx, 'bandi', LW / 2 + 44, 434 + bob2, 2);
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
    ctx.fillText('🏆 마음의 수호자 인증서 🏆', LW / 2, 155);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#ccc';
    const lines = [
      '위 어린이는 다섯 거리를 모두 지나며',
      '개인정보 보호, 저작권, 진실 분별, 공정함, 절제,',
      '바른 말, 안전, 환경, 투명함, 책임, 창의성,',
      '협력, 그리고 사람을 아끼는 마음을 보여준',
      '훌륭한 마음의 수호자임을 인증합니다.',
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

    // 친구가 된 인물들 (두 줄 퍼레이드)
    const ids = Object.keys(MONSTER_SPRITES);
    for (let i = 0; i < ids.length; i++) {
      const row = i < 14 ? 0 : 1;
      const col = row === 0 ? i : i - 14;
      const perRow = row === 0 ? 14 : ids.length - 14;
      const bx = LW / 2 - perRow * 20 + col * 40;
      const by = 428 + row * 38 + Math.sin(game.time / 15 + i) * 4;
      drawMon(ctx, ids[i], bx, by, 2);
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
        // 클리어/패배 처리 중 모드가 바뀌었을 수 있음
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
      case 'teacher':
        updateTeacherRoom();
        drawTeacherRoom();
        break;
      case 'choice':
        updateChoice();
        drawWorld();
        if (game.choice) drawChoice();
        break;
      case 'hint':
        updateHint();
        drawHint();
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

      const showHintBtn = false; // (v3) 퀴즈 배틀 폐지 — 배틀 중 50:50 힌트 없음
      document.body.classList.toggle('battle-hint', showHintBtn);
      // 터치 기기는 키보드 T가 없어 「선생님 방」에 못 들어간다 — 타이틀(슬롯 화면)일 때만
      // 작은 DOM 버튼을 보여 준다(battle-hint와 같은 body class 토글 패턴).
      document.body.classList.toggle('title-slots', game.mode === 'title' && game.titleScreen === 'slots');
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
    migrateSlotV6, migrateSlotV7, migrateSlotV8,
    buildBackupText, applyBackup, buildAdaptivePool, buildDailyPool,
    recordPlayDay, recordDailyDone, getMeta, todayStr,
    unlockedCount, getCosmetic, setCosmetic, achievementCtx,
    getCustomQuizzes, importCustomQuizzes, clearCustomQuizzes, customQuizTemplate, challengeTopics,
    collectedCards, cardUnlocked, buildCertText, LEARN_CARDS, HOF_CATS,
    sanitizeName, probeStorage, getStorageOk: () => storageOk,
    buildClassCsv, setupClassBaseFlags, classSelForFlags,
    applyTraceRoomClass, applyTiltStreetClass, applyRumorStreetClass,
    applyArcadeClass, applyCozyhomeClass, applyFinalClass,
    getPuzzleLog, writePuzzleLog, nextWaypoint, currentObjective: () => getObjective(game.flags, game.map), // 나침반/HUD 경로 — E2E가 '화살표 따라가기'를 재현할 때 사용
    privacyLeak, privacyPressureProfile, addPrivacyLeak, notePrivacyRecoveryPiece,
    toggleLowGraphics, effectiveDprCap, prologueVisibleMarks, ch1StreetVisualProfile, ch1HubVisibleMarks,
    chapter2HubVisualProfile, chapter2HubVisibleMarks, chapter3HubVisualProfile, chapter3HubVisibleMarks,
    chapter4HubVisualProfile, chapter4HubVisibleMarks, chapter5HubVisualProfile, chapter5HubVisibleMarks,
    stickDirection, buildDiagnosticReport, buildClassDiagnostic, topicSession,
    chapterBadgeLabel, hudBadgeText, PAUSE_ITEMS, TEACHER_ITEMS, PAUSE_LABELS,
    // 설득 배틀 순환 풀 확인용 (unlockAt 검증) — 현재 배틀의 등장 가능한 주장 텍스트 목록
    persuadeAvail: () => (game.battle ? availableClaims(game.battle).map((c) => c.text) : []),
    // 파이널 「고요의 뜰」 — 맵별 어둠 단계 확인용
    QUIET_DIM_LEVEL,
  };
  frame();
})();
