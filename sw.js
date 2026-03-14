/* ══════════════════════════════════════
   Service Worker — 성경읽기 일일 알림
   매일 오전 8시 알림 발송
══════════════════════════════════════ */

const CACHE_NAME = "bible-2026-v1";
const ALARM_TAG  = "bible-daily";

/* ── 설치 & 캐시 ── */
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(["./index.html", "./manifest.json"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── 오프라인 대응 ── */
self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

/* ══════════════════════════════════════
   알림 스케줄링
   - 앱에서 postMessage({type:"SCHEDULE_ALARM"}) 를 받아 실행
   - 오전 8시까지 남은 ms 계산 → setTimeout → showNotification
══════════════════════════════════════ */

/* 오늘 읽을 말씀 계산 (sw 내부용) */
const BOOKS = [
  {name:"창세기",ch:50},{name:"출애굽기",ch:40},{name:"레위기",ch:27},
  {name:"민수기",ch:36},{name:"신명기",ch:34},{name:"여호수아",ch:24},
  {name:"사사기",ch:21},{name:"룻기",ch:4},{name:"사무엘상",ch:31},
  {name:"사무엘하",ch:24},{name:"열왕기상",ch:22},{name:"열왕기하",ch:25},
  {name:"역대상",ch:29},{name:"역대하",ch:36},{name:"에스라",ch:10},
  {name:"느헤미야",ch:13},{name:"에스더",ch:10},{name:"욥기",ch:42},
  {name:"시편",ch:150},{name:"잠언",ch:31},{name:"전도서",ch:12},
  {name:"아가",ch:8},{name:"이사야",ch:66},{name:"예레미야",ch:52},
  {name:"예레미야애가",ch:5},{name:"에스겔",ch:48},{name:"다니엘",ch:12},
  {name:"호세아",ch:14},{name:"요엘",ch:3},{name:"아모스",ch:9},
  {name:"오바댜",ch:1},{name:"요나",ch:4},{name:"미가",ch:7},
  {name:"나훔",ch:3},{name:"하박국",ch:3},{name:"스바냐",ch:3},
  {name:"학개",ch:2},{name:"스가랴",ch:14},{name:"말라기",ch:4},
  {name:"마태복음",ch:28},{name:"마가복음",ch:16},{name:"누가복음",ch:24},
  {name:"요한복음",ch:21},{name:"사도행전",ch:28},{name:"로마서",ch:16},
  {name:"고린도전서",ch:16},{name:"고린도후서",ch:13},{name:"갈라디아서",ch:6},
  {name:"에베소서",ch:6},{name:"빌립보서",ch:4},{name:"골로새서",ch:4},
  {name:"데살로니가전서",ch:5},{name:"데살로니가후서",ch:3},{name:"디모데전서",ch:6},
  {name:"디모데후서",ch:4},{name:"디도서",ch:3},{name:"빌레몬서",ch:1},
  {name:"히브리서",ch:13},{name:"야고보서",ch:5},{name:"베드로전서",ch:5},
  {name:"베드로후서",ch:3},{name:"요한1서",ch:5},{name:"요한2서",ch:1},
  {name:"요한3서",ch:1},{name:"유다서",ch:1},{name:"요한계시록",ch:22},
];

const ALL_CH = [];
BOOKS.forEach((b, bi) => {
  for (let ci = 0; ci < b.ch; ci++) ALL_CH.push({bi, ci, name: b.name, num: ci+1});
});
const TOTAL = ALL_CH.length;
const YEAR  = 2026;
const DAYS  = 365;

const DAY_PLAN = (() => {
  const plan = [];
  const base = Math.floor(TOTAL / DAYS);
  const extra = TOTAL % DAYS;
  let cur = 0;
  for (let d = 0; d < DAYS; d++) {
    const cnt = base + (d < extra ? 1 : 0);
    plan.push(ALL_CH.slice(cur, cur + cnt));
    cur += cnt;
  }
  return plan;
})();

function getDayIndex(date) {
  return Math.floor((date - new Date(date.getFullYear(), 0, 1)) / 86400000);
}

function getTodayReading(date) {
  const di = getDayIndex(date);
  if (di < 0 || di >= DAYS) return null;
  const chapters = DAY_PLAN[di];
  if (!chapters.length) return null;
  const groups = [];
  let cur = null;
  chapters.forEach(c => {
    if (cur && cur.bi === c.bi && c.ci === cur.endCi + 1) {
      cur.endCi = c.ci; cur.endNum = c.num;
    } else {
      cur = {name: c.name, startNum: c.num, endCi: c.ci, endNum: c.num};
      groups.push(cur);
    }
  });
  const text = groups.map(g =>
    g.startNum === g.endNum ? `${g.name} ${g.startNum}장` : `${g.name} ${g.startNum}~${g.endNum}장`
  ).join(" / ");
  return {text, count: chapters.length, day: di + 1};
}

/* ── 알림 발송 ── */
function showDailyNotification() {
  const now  = new Date();
  const info = getTodayReading(now);
  if (!info) return;

  const WD = ["일","월","화","수","목","금","토"];
  const dateStr = `${now.getMonth()+1}월 ${now.getDate()}일 (${WD[now.getDay()]})`;

  self.registration.showNotification("📖 오늘의 성경읽기", {
    body: `${dateStr} · 연중 ${info.day}일째\n${info.text}  (${info.count}장)`,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: ALARM_TAG,
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: {url: "./index.html"}
  });
}

/* ── 다음 오전 8시까지 ms 계산 ── */
function msUntilNext8am() {
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1); // 이미 지났으면 내일
  return next - now;
}

/* ── 재귀 타이머 (페이지 열려 있는 동안) ── */
let alarmTimer = null;

function scheduleNext() {
  clearTimeout(alarmTimer);
  const ms = msUntilNext8am();
  alarmTimer = setTimeout(() => {
    showDailyNotification();
    scheduleNext(); // 내일을 위해 재예약
  }, ms);
}

/* ── 앱에서 메시지 수신 ── */
self.addEventListener("message", e => {
  if (e.data && e.data.type === "SCHEDULE_ALARM") {
    scheduleNext();
    // 즉시 테스트 알림 (옵션)
    if (e.data.test) showDailyNotification();
  }
  if (e.data && e.data.type === "CANCEL_ALARM") {
    clearTimeout(alarmTimer);
  }
});

/* ── 알림 클릭 시 앱 열기 ── */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type: "window", includeUncontrolled: true}).then(list => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow(e.notification.data?.url || "./index.html");
    })
  );
});

/* SW 시작 시 자동 스케줄 */
scheduleNext();
