// ---- Settings -------------------------------------------------------------
// Masjidal IDs (the "masjid_id=" in the masjid's Masjidal / AthanPlus widget).
// Klein Islamic Center's ID comes from the widget on kleinislamiccenter.org.
// Jumu'ah is held at Masjid Ibrahim, so its times come from that masjid's feed.
const MASJIDAL_ID = "zKz3YnLO";        // Klein Islamic Center (this masjid)
const JUMUAH_MASJIDAL_ID = "adJqxqAk"; // Masjid Ibrahim, 5500 FM 2920
const WEEK_DAYS = 7;

const TIMEZONE = "America/Chicago";
const LOCATION = { lat: 30.0443, lng: -95.4908 }; // 18901 Kuykendahl Rd, Spring, TX
// Fallback only (if Masjidal is unreachable): matches Klein Islamic Center's
// settings — Karachi method (Fajr/Isha 18°), Shafi'i (standard) Asr, Dhuhr +1 minute.
const CALC_METHOD = 1;
const CALC_TUNE = "0,0,0,1,0,0,0,0,0"; // imsak,fajr,sunrise,dhuhr,asr,maghrib,sunset,isha,midnight

const PRAYERS = [
  { key: "fajr",    name: "Fajr",    ar: "الفجر" },
  { key: "sunrise", name: "Sunrise", ar: "الشروق", noIqamah: true },
  { key: "zuhr",    name: "Dhuhr",   ar: "الظهر" },
  { key: "asr",     name: "Asr",     ar: "العصر" },
  { key: "maghrib", name: "Maghrib", ar: "المغرب" },
  { key: "isha",    name: "Isha",    ar: "العشاء" },
];
const SALAH = PRAYERS.filter(p => !p.noIqamah);

// ---- Time helpers (everything in the masjid's timezone) --------------------
function nowInZone() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    seconds: (+parts.hour) * 3600 + (+parts.minute) * 60 + (+parts.second),
  };
}

function addDays(ymd, n) {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(ymd, opts) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(ymd + "T12:00:00Z"));
}

// Accepts "5:45AM", "5:45 pm", "17:45", "05:45 (CDT)" -> minutes after midnight
function toMinutes(str) {
  const m = String(str || "").match(/(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
  if (!m) return null;
  let h = +m[1];
  const mer = m[3] && m[3][0].toLowerCase();
  if (mer === "p" && h < 12) h += 12;
  if (mer === "a" && h === 12) h = 0;
  return h * 60 + (+m[2]);
}

function formatMinutes(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Same as formatMinutes, with AM/PM in a span so small screens can hide it
function formatCompact(min) {
  if (min == null) return "—";
  const [time, mer] = formatMinutes(min).split(" ");
  return `${time}<span class="mer"> ${mer}</span>`;
}

// ---- Data sources ----------------------------------------------------------
async function masjidalRange(id, from, to) {
  const res = await fetch(`https://masjidal.com/api/v1/time/range?masjid_id=${encodeURIComponent(id)}` +
                          `&from_date=${from}&to_date=${to}`);
  const json = await res.json();
  if (json.status !== "success" || !json.data?.salah?.length) throw new Error(`Masjidal ${id}: no data`);
  return json.data;
}

async function fromMasjidal(today) {
  const { salah, iqamah = [] } = await masjidalRange(MASJIDAL_ID, today, addDays(today, WEEK_DAYS - 1));
  const days = salah.map((s, i) => ({
    ymd: addDays(today, i),
    adhan: Object.fromEntries(PRAYERS.map(p => [p.key, toMinutes(s[p.key])])),
    iqamah: Object.fromEntries(PRAYERS.map(p => [p.key, toMinutes(iqamah[i]?.[p.key])])),
  }));
  const s0 = salah[0];
  const hijri = s0.hijri_date && s0.hijri_month
    ? `${s0.hijri_date.split(",")[0].trim()} ${s0.hijri_month} ${s0.hijri_date.split(",")[1]?.trim() || ""} AH`.trim()
    : null;
  return { days, hijri, source: "Prayer times from Masjidal · updated by Klein Islamic Center" };
}

async function fromCalculation(today) {
  const get = async ymd => {
    const [y, m, d] = ymd.split("-");
    const res = await fetch(`https://api.aladhan.com/v1/timings/${d}-${m}-${y}` +
      `?latitude=${LOCATION.lat}&longitude=${LOCATION.lng}&method=${CALC_METHOD}&school=0&tune=${CALC_TUNE}`);
    const t = (await res.json()).data.timings;
    return {
      ymd,
      adhan: { fajr: toMinutes(t.Fajr), sunrise: toMinutes(t.Sunrise), zuhr: toMinutes(t.Dhuhr),
               asr: toMinutes(t.Asr), maghrib: toMinutes(t.Maghrib), isha: toMinutes(t.Isha) },
      iqamah: {},
    };
  };
  const days = await Promise.all([get(today), get(addDays(today, 1))]);
  return { days, hijri: null, calculated: true,
           source: "Live times are unavailable, so these adhan times are calculated (Karachi method, standard Asr). Iqamah times are not shown." };
}

// Jumu'ah times for the coming Friday (today, if it is Friday)
async function jumuahTimes(today) {
  const dow = new Date(today + "T12:00:00Z").getUTCDay();
  const friday = addDays(today, (5 - dow + 7) % 7);
  const { iqamah = [] } = await masjidalRange(JUMUAH_MASJIDAL_ID, friday, friday);
  return ["jummah1", "jummah2", "jummah3"].map(k => toMinutes(iqamah[0]?.[k])).filter(v => v != null);
}

// ---- Rendering -------------------------------------------------------------
let schedule = null;
const $ = id => document.getElementById(id);

function render() {
  const today = schedule.days[0];
  const hasIqamah = SALAH.some(p => today.iqamah[p.key] != null);

  $("times-body").innerHTML = PRAYERS.map(p => `
    <tr data-key="${p.key}" class="${p.noIqamah ? "sunrise" : ""}">
      <td><span class="name">${p.name}</span><span class="ar" lang="ar">${p.ar}</span></td>
      <td>${formatMinutes(today.adhan[p.key])}</td>
      <td class="iqamah">${p.noIqamah ? "" : formatMinutes(today.iqamah[p.key])}</td>
    </tr>`).join("");
  document.querySelector(".times").classList.toggle("no-iqamah", !hasIqamah);

  // Hero card: iqamah times when we have them (that's what people come for), else adhan
  $("mini-times").innerHTML = SALAH.map(p => `
    <li data-key="${p.key}"><span>${p.name}</span><span>${formatMinutes(hasIqamah ? today.iqamah[p.key] : today.adhan[p.key])}</span></li>`
  ).join("") + `<li class="hint">${hasIqamah ? "Iqamah times" : "Adhan times"}</li>`;

  if (!schedule.calculated && schedule.days.length > 2) {
    $("week-body").innerHTML = schedule.days.map((d, i) => {
      const dow = new Date(d.ymd + "T12:00:00Z").getUTCDay();
      return `<tr class="${i === 0 ? "is-today" : ""} ${dow === 5 ? "is-friday" : ""}">
        <td>${i === 0 ? "Today" : dayLabel(d.ymd, { weekday: "short", day: "numeric" })}</td>
        ${PRAYERS.map(p => `<td class="${p.noIqamah ? "col-sunrise" : ""}">${formatCompact(d.adhan[p.key])}</td>`).join("")}
      </tr>`;
    }).join("");
    $("week").hidden = false;
  } else {
    $("week").hidden = true;
  }

  if (schedule.hijri) $("hijri-date").textContent = schedule.hijri;
  $("source").textContent = schedule.source;
  tick();
}

function renderJumuah(times) {
  $("jumuah-slots").innerHTML = times.length
    ? times.map((t, i) => `<div class="slot"><span>${times.length > 1 ? ["1st", "2nd", "3rd"][i] + " khutbah" : "Khutbah"}</span><strong>${formatMinutes(t)}</strong></div>`).join("")
    : `<span class="muted">Please call (832) 743-8303 for this week's time.</span>`;
}

function tick() {
  if (!schedule) return;
  const nowMin = nowInZone().seconds / 60;
  const today = schedule.days[0];
  let next = SALAH.map(p => ({ ...p, at: today.adhan[p.key] })).find(p => p.at != null && p.at > nowMin);
  const isToday = !!next;
  let minutesUntil;
  if (isToday) {
    minutesUntil = next.at - nowMin;
  } else { // after Isha: tomorrow's Fajr
    const fajr = (schedule.days[1] || today).adhan.fajr;
    next = { ...PRAYERS[0], at: fajr };
    minutesUntil = 24 * 60 - nowMin + fajr;
  }

  document.querySelectorAll("#times-body tr, #mini-times li").forEach(el =>
    el.classList.toggle("is-next", isToday && el.dataset.key === next.key));

  const total = Math.max(0, Math.round(minutesUntil * 60));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const iq = isToday ? today.iqamah[next.key] : null;
  $("next-name").textContent = `${next.name} · ${formatMinutes(next.at)}`;
  $("next-countdown").textContent =
    `Adhan in ${h ? h + "h " : ""}${m}m ${String(s).padStart(2, "0")}s` + (iq != null ? ` · Iqamah ${formatMinutes(iq)}` : "");
}

function renderDates() {
  const now = new Date();
  $("greg-date").textContent = new Intl.DateTimeFormat("en-US",
    { timeZone: TIMEZONE, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);
  try {
    $("hijri-date").textContent = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura",
      { timeZone: TIMEZONE, day: "numeric", month: "long", year: "numeric" }).format(now);
  } catch { /* older browsers without the Islamic calendar */ }
  $("year").textContent = now.getFullYear();
}

async function load() {
  renderDates();
  const { ymd } = nowInZone();
  jumuahTimes(ymd).then(renderJumuah, err => { console.warn(err); renderJumuah([]); });
  try {
    schedule = await fromMasjidal(ymd);
  } catch (err) {
    console.warn(err);
    try { schedule = await fromCalculation(ymd); }
    catch {
      $("times-body").innerHTML =
        `<tr><td colspan="3" class="loading">Prayer times are unavailable right now. Please call (832) 743-8303.</td></tr>`;
      return;
    }
  }
  render();
}

// ---- Mobile menu -------------------------------------------------------------
const menuBtn = $("menu-btn"), menu = $("menu");
function setMenu(open) {
  menu.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}
menuBtn.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
menu.addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });

load();
setInterval(tick, 1000);
// Reload the schedule once the date changes in the masjid's timezone
let loadedDay = nowInZone().ymd;
setInterval(() => { const d = nowInZone().ymd; if (d !== loadedDay) { loadedDay = d; load(); } }, 60 * 1000);
