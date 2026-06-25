// 칩튠 BGM + 효과음 (Web Audio API)
// 곡 형식: tracks[] -> { wave, vol, notes: [[midi(0=쉼표), 박자수], ...] }

const SONGS = {
  // 타이틀: 잔잔하고 설레는 느낌
  title: {
    bpm: 96,
    tracks: [
      { wave: 'square', vol: 0.10, notes: [
        [72,1],[76,1],[79,2],[81,1],[79,1],[76,2],
        [74,1],[77,1],[81,2],[79,1],[77,1],[76,2],
        [72,1],[76,1],[79,2],[84,2],[83,1],[81,1],
        [79,1],[77,1],[76,1],[74,1],[72,4],
      ]},
      { wave: 'triangle', vol: 0.16, notes: [
        [48,4],[45,4],[50,4],[43,4],[48,4],[53,4],[55,4],[48,4],
      ]},
      // 영이 테마 라이트모티프 — 코어·엔딩과 같은 악구를 아주 조용히 (여정의 실마리)
      { wave: 'triangle', vol: 0.05, notes: [
        [76,2],[72,1],[69,1],[71,2],[67,2],[0,24],
      ]},
    ],
  },
  // 마을: 밝고 통통 튀는 느낌
  village: {
    bpm: 124,
    tracks: [
      { wave: 'square', vol: 0.10, notes: [
        [72,1],[76,1],[79,1],[76,1],[81,1],[79,1],[76,1],[72,1],
        [74,1],[77,1],[81,1],[77,1],[79,1],[77,1],[76,1],[74,1],
        [72,1],[76,1],[79,1],[76,1],[81,1],[79,1],[76,1],[79,1],
        [81,1],[83,1],[84,1],[81,1],[79,1],[76,1],[72,2],
      ]},
      { wave: 'triangle', vol: 0.17, notes: [
        [48,2],[48,2],[45,2],[45,2],[50,2],[50,2],[55,2],[55,2],
        [48,2],[48,2],[45,2],[45,2],[53,2],[53,2],[55,2],[55,2],
      ]},
    ],
  },
  // 필드(숲/호수): 모험을 떠나는 느낌
  field: {
    bpm: 136,
    tracks: [
      { wave: 'square', vol: 0.10, notes: [
        [69,1],[72,1],[76,1],[72,1],[77,1],[76,1],[72,1],[69,1],
        [67,1],[71,1],[74,1],[71,1],[76,1],[74,1],[71,1],[67,1],
        [69,1],[72,1],[76,1],[79,1],[81,2],[79,1],[76,1],
        [77,1],[76,1],[74,1],[72,1],[69,2],[0,2],
      ]},
      { wave: 'triangle', vol: 0.17, notes: [
        [45,2],[45,2],[43,2],[43,2],[41,2],[41,2],[40,2],[40,2],
        [45,2],[45,2],[50,2],[50,2],[41,2],[43,2],[45,2],[45,2],
      ]},
    ],
  },
  // 동굴: 으스스한 느낌
  cave: {
    bpm: 92,
    tracks: [
      { wave: 'square', vol: 0.07, notes: [
        [63,2],[66,2],[63,2],[61,2],
        [63,2],[68,2],[66,2],[0,2],
        [63,2],[66,2],[70,2],[68,2],
        [66,2],[63,2],[61,2],[0,2],
      ]},
      { wave: 'triangle', vol: 0.16, notes: [
        [39,4],[39,4],[37,4],[37,4],[39,4],[39,4],[36,4],[37,4],
      ]},
    ],
  },
  // 배틀: 긴장감 있게 달리는 느낌
  battle: {
    bpm: 152,
    tracks: [
      { wave: 'square', vol: 0.10, notes: [
        [69,0.5],[69,0.5],[72,1],[74,1],[76,1],[74,0.5],[72,0.5],[71,1],[0,0.5],[71,0.5],[0,1],
        [67,0.5],[67,0.5],[71,1],[72,1],[74,1],[72,0.5],[71,0.5],[69,1],[0,0.5],[69,0.5],[0,1],
        [69,0.5],[69,0.5],[72,1],[76,1],[81,1],[79,0.5],[77,0.5],[76,1],[74,1],[0,1],
        [72,1],[71,1],[69,1],[67,1],[69,2],[0,1.5],[64,0.5],
      ]},
      { wave: 'triangle', vol: 0.18, notes: [
        [45,0.5],[45,0.5],[57,0.5],[45,0.5],[45,0.5],[45,0.5],[57,0.5],[45,0.5],
        [43,0.5],[43,0.5],[55,0.5],[43,0.5],[43,0.5],[43,0.5],[55,0.5],[43,0.5],
        [41,0.5],[41,0.5],[53,0.5],[41,0.5],[41,0.5],[41,0.5],[53,0.5],[41,0.5],
        [40,0.5],[40,0.5],[52,0.5],[40,0.5],[40,0.5],[40,0.5],[52,0.5],[40,0.5],
        [45,0.5],[45,0.5],[57,0.5],[45,0.5],[45,0.5],[45,0.5],[57,0.5],[45,0.5],
        [43,0.5],[43,0.5],[55,0.5],[43,0.5],[43,0.5],[43,0.5],[55,0.5],[43,0.5],
        [41,0.5],[41,0.5],[53,0.5],[41,0.5],[43,0.5],[43,0.5],[55,0.5],[43,0.5],
        [45,0.5],[45,0.5],[57,0.5],[45,0.5],[45,0.5],[45,0.5],[57,0.5],[45,0.5],
      ]},
    ],
  },
  // 사막: 이국적이고 신비한 느낌
  desert: {
    bpm: 112,
    tracks: [
      { wave: 'square', vol: 0.09, notes: [
        [69,1],[70,1],[73,1],[70,1],[69,1],[67,1],[69,2],
        [72,1],[73,1],[76,1],[73,1],[72,1],[70,1],[72,2],
        [69,1],[70,1],[73,1],[76,1],[77,1],[76,1],[73,1],[70,1],
        [69,1],[70,1],[69,1],[67,1],[69,4],
      ]},
      { wave: 'triangle', vol: 0.17, notes: [
        [45,2],[45,2],[41,2],[41,2],[43,2],[43,2],[45,2],[45,2],
        [45,2],[45,2],[41,2],[41,2],[43,2],[43,2],[45,2],[45,2],
      ]},
    ],
  },
  // 설원: 포근하고 반짝이는 느낌
  snow: {
    bpm: 100,
    tracks: [
      { wave: 'square', vol: 0.09, notes: [
        [79,1],[76,1],[72,1],[74,1],[76,1],[77,1],[76,2],
        [74,1],[72,1],[69,1],[72,1],[74,1],[76,1],[74,2],
        [72,1],[74,1],[76,1],[79,1],[81,1],[79,1],[77,2],
        [76,1],[74,1],[72,1],[74,1],[72,4],
      ]},
      { wave: 'triangle', vol: 0.16, notes: [
        [48,2],[48,2],[45,2],[45,2],[41,2],[41,2],[43,2],[43,2],
        [48,2],[48,2],[45,2],[45,2],[43,2],[43,2],[48,2],[48,2],
      ]},
    ],
  },
  // 글리치: 어딘가 고장난 듯 불안한 느낌 (스테이지 6~)
  glitch: {
    bpm: 140,
    tracks: [
      { wave: 'square', vol: 0.07, notes: [
        [72,0.5],[0,0.5],[75,0.5],[0,0.5],[71,0.5],[0,1.5],
        [68,0.5],[0,0.5],[72,0.5],[0,0.5],[66,0.5],[0,1.5],
        [74,0.5],[0,0.5],[70,0.5],[0,0.5],[65,0.5],[0,1.5],
        [69,0.5],[0,0.5],[63,0.5],[0,0.5],[68,0.5],[0,1.5],
      ]},
      { wave: 'triangle', vol: 0.15, notes: [
        [33,1],[0,1],[36,1],[0,1],[33,1],[0,1],[31,1],[0,1],
        [33,1],[0,1],[36,1],[0,1],[38,1],[0,1],[31,1],[0,1],
      ]},
    ],
  },
  // 코어: 쓸쓸하고 아름다운 기억의 멜로디 (영이의 테마)
  core: {
    bpm: 88,
    tracks: [
      { wave: 'square', vol: 0.08, notes: [
        [76,2],[72,1],[69,1],[71,2],[67,2],
        [69,2],[72,1],[76,1],[74,2],[71,2],
        [76,2],[72,1],[69,1],[71,2],[74,2],
        [72,2],[71,1],[67,1],[69,4],
      ]},
      { wave: 'triangle', vol: 0.15, notes: [
        [45,4],[43,4],[41,4],[40,4],
        [45,4],[43,4],[41,4],[40,4],
      ]},
    ],
  },
  // 미래연구소(보너스): 호기심 가득, 통통 튀는 미래 느낌
  lab: {
    bpm: 132,
    tracks: [
      { wave: 'square', vol: 0.09, notes: [
        [74,1],[78,1],[81,1],[78,1],[83,1],[81,1],[78,1],[74,1],
        [76,1],[79,1],[83,1],[79,1],[81,1],[79,1],[78,1],[76,1],
        [74,1],[78,1],[81,1],[85,1],[86,1],[85,1],[81,1],[78,1],
        [76,1],[78,1],[79,1],[81,1],[74,2],[0,2],
      ]},
      { wave: 'triangle', vol: 0.16, notes: [
        [50,2],[50,2],[47,2],[47,2],[52,2],[52,2],[55,2],[55,2],
        [50,2],[50,2],[47,2],[47,2],[53,2],[53,2],[55,2],[55,2],
      ]},
    ],
  },
  // 엔딩: 따뜻한 마무리
  ending: {
    bpm: 104,
    tracks: [
      { wave: 'square', vol: 0.10, notes: [
        [76,2],[74,1],[72,1],[74,2],[76,2],
        [77,2],[76,1],[74,1],[76,4],
        [79,2],[77,1],[76,1],[77,2],[79,2],
        [81,2],[79,1],[77,1],[72,4],
      ]},
      { wave: 'triangle', vol: 0.17, notes: [
        [48,4],[43,4],[45,4],[48,4],[53,4],[48,4],[50,4],[48,4],
      ]},
      // 영이 테마 라이트모티프 — 타이틀·코어에서 들렸던 악구가 여기서 두 번 피어난다 (감정의 회수)
      { wave: 'triangle', vol: 0.07, notes: [
        [76,2],[72,1],[69,1],[71,2],[67,2],[0,8],
        [76,2],[72,1],[69,1],[71,2],[67,2],[0,8],
      ]},
    ],
  },
};

const Sound = {
  ctx: null,
  master: null,
  muted: false,
  songName: null,
  _timers: [],

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    this.ctx.addEventListener('statechange', () => {
      if (this.ctx.state === 'interrupted') {
        try { this.ctx.resume(); } catch (e) {}
      }
    });
  },

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch (e) {}
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
  },

  _freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  },

  _clearTimers() {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
  },

  stopSong() {
    this.songName = null;
    this._clearTimers();
  },

  playSong(name) {
    if (this.songName === name) return;
    this.init();
    if (!this.ctx) return;
    this.stopSong();
    this.songName = name;
    this._scheduleLoop(name);
  },

  _scheduleLoop(name) {
    if (this.songName !== name || !this.ctx) return;
    const song = SONGS[name];
    if (!song) return;
    const beat = 60 / song.bpm;
    const t0 = this.ctx.currentTime + 0.06;
    let loopLen = 0;
    for (const track of song.tracks) {
      let t = t0;
      for (const [midi, dur] of track.notes) {
        const d = dur * beat;
        if (midi > 0) this._tone(track.wave, this._freq(midi), t, d * 0.92, track.vol);
        t += d;
      }
      loopLen = Math.max(loopLen, t - t0);
    }
    const timer = setTimeout(() => this._scheduleLoop(name), (loopLen - 0.05) * 1000);
    this._timers = [timer];
  },

  _tone(wave, freq, t, dur, vol) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
  },

  _sfxTone(freqs, durEach, wave, vol) {
    this.init();
    if (!this.ctx || this.muted) return;
    let t = this.ctx.currentTime;
    for (const f of freqs) {
      if (f > 0) this._tone(wave, f, t, durEach, vol);
      t += durEach;
    }
  },

  blip()    { this._sfxTone([880], 0.05, 'square', 0.06); },
  select()  { this._sfxTone([660, 880], 0.06, 'square', 0.07); },
  correct() { this._sfxTone([523, 659, 784, 1047], 0.09, 'square', 0.09); },
  wrong()   { this._sfxTone([330, 247, 196], 0.12, 'sawtooth', 0.07); },
  badge()   { this._sfxTone([523, 659, 784, 1047, 784, 1047, 1319], 0.1, 'square', 0.09); },
  bump()    { this._sfxTone([130], 0.05, 'triangle', 0.08); },
  encounter(){ this._sfxTone([440, 415, 392, 370], 0.07, 'square', 0.09); },
  warp()    { this._sfxTone([392, 523, 659, 784], 0.05, 'square', 0.07); },     // 지역 이동
  unlock()  { this._sfxTone([659, 784, 988, 784, 988, 1319], 0.08, 'square', 0.09); }, // 칭호·테마 해금
  streak()  { this._sfxTone([523, 587, 659, 698, 784], 0.07, 'triangle', 0.09); },     // 연속 출석
};
