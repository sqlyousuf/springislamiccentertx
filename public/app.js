// ---- Settings -------------------------------------------------------------
// Klein Islamic Center's Masjidal ID (shown in the Masjidal admin portal, or in
// the "masjid_id=" part of any Masjidal widget / display link for the masjid).
// While it is empty, the page shows calculated adhan times instead.
const MASJIDAL_ID = "";

const TIMEZONE = "America/Chicago";
const LOCATION = { lat: 30.0426, lng: -95.5181 }; // 18901 Kuykendahl Rd, Spring, TX
const CALC_METHOD = 2; // ISNA, used only for the fallback

const PRAYERS = [
  { key: "fajr",    name: "Fajr",    ar: "الفجر" },
  { key: "sunrise", name: "Sunrise", ar: "الشروق", noIqamah: true },
  { key: "zuhr",    name: "Dhuhr",   ar: "الظهر" },
  { key: "asr",     name: "Asr",     ar: "العصر" },
  { key: "maghrib", name: "Maghrib", ar: "المغرب" },
  { key: "isha",    name: "Isha",    ar: "العشاء" },
];

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

// ---- Data sources ----------------------------------------------------------
async function fromMasjidal(today) {
  const url = `https://masjidal.com/api/v1/time/range?masjid_id=${encodeURIComponent(MASJIDAL_ID)}` +
              `&from_date=${today}&to_date=${addDays(today, 1)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "success" || !json.data?.salah?.length) throw new Error("Masjidal: no data");
  const { salah, iqamah = [] } = json.data;
  const day = i => ({
    adhan: Object.fromEntries(PRAYERS.map(p => [p.key, toMinutes(salah[i]?.[p.key])])),
    iqamah: Object.fromEntries(PRAYERS.map(p => [p.key, toMinutes(iqamah[i]?.[p.key])])),
  });
  const jumuah = ["jummah1", "jummah2", "jummah3"]
    .map(k => toMinutes(iqamah[0]?.[k])).filter(v => v != null);
  return { today: day(0), tomorrow: salah[1] ? day(1) : null, jumuah, source: "Times from Masjidal · Klein Islamic Center" };
}

async function fromCalculation(today) {
  const get = async ymd => {
    const [y, m, d] = ymd.split("-");
    const res = await fetch(`https://api.aladhan.com/v1/timings/${d}-${m}-${y}` +
      `?latitude=${LOCATION.lat}&longitude=${LOCATION.lng}&method=${CALC_METHOD}`);
    const t = (await res.json()).data.timings;
    return {
      adhan: { fajr: toMinutes(t.Fajr), sunrise: toMinutes(t.Sunrise), zuhr: toMinutes(t.Dhuhr),
               asr: toMinutes(t.Asr), maghrib: toMinutes(t.Maghrib), isha: toMinutes(t.Isha) },
      iqamah: {},
    };
  };
  const [t, tm] = await Promise.all([get(today), get(addDays(today, 1))]);
  return { today: t, tomorrow: tm, jumuah: [], source: "Calculated adhan times (ISNA). Iqamah times coming soon." };
}

// ---- Rendering -------------------------------------------------------------
let schedule = null;

function render() {
  const body = document.getElementById("times-body");
  body.innerHTML = PRAYERS.map(p => `
    <tr data-key="${p.key}" class="${p.noIqamah ? "sunrise" : ""}">
      <td><span class="name">${p.name}</span><span class="ar" lang="ar">${p.ar}</span></td>
      <td>${formatMinutes(schedule.today.adhan[p.key])}</td>
      <td class="iqamah">${p.noIqamah ? "" : formatMinutes(schedule.today.iqamah[p.key])}</td>
    </tr>`).join("");

  const hasIqamah = Object.values(schedule.today.iqamah).some(v => v != null);
  document.querySelector(".times").classList.toggle("no-iqamah", !hasIqamah);

  if (schedule.jumuah.length) {
    document.getElementById("jumuah-slots").innerHTML = schedule.jumuah
      .map((t, i) => `<span>${schedule.jumuah.length > 1 ? `${["1st", "2nd", "3rd"][i]} · ` : ""}${formatMinutes(t)}</span>`)
      .join("");
    document.getElementById("jumuah").hidden = false;
  }
  document.getElementById("source").textContent = schedule.source;
  tick();
}

function tick() {
  if (!schedule) return;
  const { seconds } = nowInZone();
  const nowMin = seconds / 60;
  let next = PRAYERS.filter(p => !p.noIqamah)
    .map(p => ({ ...p, at: schedule.today.adhan[p.key] }))
    .find(p => p.at != null && p.at > nowMin);
  const isToday = !!next;
  let minutesUntil;
  if (isToday) {
    minutesUntil = next.at - nowMin;
  } else { // after Isha: tomorrow's Fajr
    const fajr = (schedule.tomorrow || schedule.today).adhan.fajr;
    next = { ...PRAYERS[0], at: fajr };
    minutesUntil = 24 * 60 - nowMin + fajr;
  }

  document.querySelectorAll("#times-body tr").forEach(tr =>
    tr.classList.toggle("is-next", isToday && tr.dataset.key === next.key));

  const total = Math.max(0, Math.round(minutesUntil * 60));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  document.getElementById("next-name").textContent = `${next.name} · ${formatMinutes(next.at)}`;
  document.getElementById("next-countdown").textContent =
    `in ${h ? h + "h " : ""}${m}m ${String(s).padStart(2, "0")}s`;
}

function renderDates() {
  const now = new Date();
  document.getElementById("greg-date").textContent = new Intl.DateTimeFormat("en-US",
    { timeZone: TIMEZONE, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);
  try {
    document.getElementById("hijri-date").textContent = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura",
      { timeZone: TIMEZONE, day: "numeric", month: "long", year: "numeric" }).format(now);
  } catch { /* older browsers without the Islamic calendar */ }
  document.getElementById("year").textContent = now.getFullYear();
}

async function load() {
  renderDates();
  const { ymd } = nowInZone();
  try {
    schedule = MASJIDAL_ID ? await fromMasjidal(ymd) : await fromCalculation(ymd);
  } catch (err) {
    console.warn(err);
    try { schedule = await fromCalculation(ymd); }
    catch {
      document.getElementById("times-body").innerHTML =
        `<tr><td colspan="3" class="loading">Prayer times are unavailable right now. Please call (832) 743-8303.</td></tr>`;
      return;
    }
  }
  render();
}

load();
setInterval(tick, 1000);
// Reload the schedule once the date changes in the masjid's timezone
let loadedDay = nowInZone().ymd;
setInterval(() => { const d = nowInZone().ymd; if (d !== loadedDay) { loadedDay = d; load(); } }, 60 * 1000);
