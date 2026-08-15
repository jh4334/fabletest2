// 효과음 — 방과 후: 그림자 학교. 에셋 파일 0: WebAudio 오실레이터로만 만든다.
// 화면 문자열 없음. AudioContext가 없거나(스모크 샌드박스·구형) 꺼져 있으면 조용히 무시.
(function (g) {
  'use strict';
  var AC = g.AudioContext || g.webkitAudioContext;
  var ctx = null, on = true, KEY = 'shadow-school-sound';
  try { on = g.localStorage.getItem(KEY) !== '0'; } catch (e) { /* 설정 못 읽어도 기본 켬 */ }

  // 브라우저 자동재생 정책: 첫 사용자 입력 안에서 컨텍스트를 만들거나 깨운다.
  function ensure() {
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch (e) { return null; } }
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { } }
    return ctx;
  }

  // f0→f1 로 미끄러지는 짧은 단음. delay(초)로 간단한 멜로디를 잇는다.
  function tone(f0, f1, dur, type, vol, delay) {
    var c = ensure(); if (!c || !on) return;
    var o = c.createOscillator(), ga = c.createGain();
    var t0 = c.currentTime + (delay || 0);
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    ga.gain.setValueAtTime(vol || 0.07, t0);
    ga.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(ga); ga.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  var FX = {
    cursor: function () { tone(660, 0, 0.05, 'square', 0.045); },
    ok: function () { tone(523, 784, 0.09, 'square', 0.06); },
    cancel: function () { tone(392, 262, 0.09, 'square', 0.05); },
    pick: function () { tone(659, 0, 0.07, 'square', 0.06); tone(988, 0, 0.09, 'square', 0.06, 0.07); },
    warn: function () { tone(740, 0, 0.07, 'square', 0.06); tone(740, 0, 0.07, 'square', 0.06, 0.12); },
    steal: function () { tone(620, 180, 0.3, 'sawtooth', 0.07); },
    hit: function () { tone(150, 70, 0.18, 'triangle', 0.12); },
    listen: function () { tone(440, 330, 0.35, 'sine', 0.06); },
    off: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0, 0.14, 'triangle', 0.07, i * 0.09); }); },
    clear: function () { [523, 659, 784].forEach(function (f, i) { tone(f, 0, 0.12, 'square', 0.06, i * 0.1); }); tone(1047, 0, 0.3, 'square', 0.07, 0.3); }
  };

  g.SFX = {
    play: function (name) { var f = FX[name]; if (f) f(); },
    toggle: function () {
      on = !on;
      try { g.localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { }
      return on;
    },
    isOn: function () { return on; },
    unlock: ensure
  };
})(typeof window !== 'undefined' ? window : this);
