// What a token saving did to the answers, on one page.
//
//   pnpm --filter @mtg-tutor/backend bench-report [--set fdn] [--seed 42]
//                                                 [--provider anthropic] [--open]
//
// Reads the transcripts bench-llm wrote and renders a single self-contained
// HTML file. No network, no model, no dependencies -- it is free to re-run and
// safe to run in a loop while tuning a prompt.
//
// Two files, when both exist:
//
//   run.<stem>.json           the candidate -- whatever was last measured
//   run.<stem>.baseline.json  the reference -- written by --update-baseline
//
// With only the candidate present it renders single-run mode, ordered by output
// cost, which answers "where does the money go". With both it renders the
// comparison, ordered by how much each answer CHANGED -- because a saving is
// accepted or rejected on the handful of picks it actually moved, and reading
// thirty unchanged ones to find them is what stops this being done at all.
//
// The pass/fail thresholds below mirror bench-llm.mjs exactly. A report that
// called something "held" while the benchmark failed it would be worse than no
// report, so when one moves the other must.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const has = (name) => process.argv.includes(`--${name}`);

const setCode = flag("set", "fdn");
const format = flag("format", "TradDraft");
const seed = flag("seed", "42");
const provider = flag("provider", "anthropic");
const stem = `${setCode}.${format}.${seed}.${provider}`;

const dir = new URL("../bench/", import.meta.url);
const runFile = new URL(flag("run", `run.${stem}.json`), dir);
const baseFile = new URL(flag("vs", `run.${stem}.baseline.json`), dir);
const outFile = new URL(`report.${stem}.html`, dir);

if (!existsSync(runFile)) {
  throw new Error(
    `No transcript at ${runFile.pathname}. Run \`pnpm bench-llm\` first -- ` +
      "a transcript is only written by a full run, never by a --limit one.",
  );
}

const run = JSON.parse(readFileSync(runFile, "utf8"));
const base = existsSync(baseFile) ? JSON.parse(readFileSync(baseFile, "utf8")) : null;

// --------------------------------------------------------------- the verdicts

// Direction and tolerance per metric, lifted from bench-llm's gate.
//
// `worse` answers the only question the report is entitled to answer: would the
// benchmark have failed this? `better` is a separate predicate rather than
// !worse, because the two are not complements. Citation density falling from
// 2.3 to 2.1 fails nothing -- the gate allows a 15% drop -- but it is not an
// improvement either, and a report that called it one would sell every cut as a
// win. Not-failing is "held"; only a move in the good direction is "improved".
// `scope` is which areas the metric is computed from, and it is load-bearing for
// --area runs. Citations and principle ids are counted across coach AND verdict
// answers, so a verdict-only run scores lower on all three blended metrics for no
// reason but the flag. Rendering that as "regressed" would blame the prompt for
// the flag, so those chips report "not measured" instead.
const METRICS = [
  {
    key: "offTopicCardNames",
    label: "off-topic card names",
    scope: ["coach", "verdict"],
    fmt: (n) => String(n),
    worse: (b, a) => a > b,
    better: (b, a) => a < b,
  },
  {
    key: "inventedCitationRate",
    label: "invented citation rate",
    scope: ["coach", "verdict"],
    fmt: (n) => `${(n * 100).toFixed(1)}%`,
    worse: (b, a) => a > b + 0.02,
    better: (b, a) => a < b,
  },
  {
    key: "citationDensity",
    label: "citations per answer",
    scope: ["coach"],
    fmt: (n) => n.toFixed(2),
    worse: (b, a) => a < b * 0.85,
    better: (b, a) => a > b,
  },
  {
    key: "distinctPrinciples",
    label: "distinct principles used",
    scope: ["coach", "verdict"],
    fmt: (n) => String(n),
    worse: (b, a) => a < b * 0.85,
    better: (b, a) => a > b,
  },
  {
    key: "divergenceRate",
    label: "context-best divergence",
    scope: ["verdict"],
    fmt: (n) => `${(n * 100).toFixed(1)}%`,
    // Both directions are degradation -- toward 1 the coach is echoing the data
    // verdict it was handed, toward 0 it is guessing -- so there is no move that
    // counts as an improvement.
    worse: (b, a) => Math.abs(a - b) > 0.15,
    better: () => false,
  },
  {
    key: "unansweredVerdicts",
    label: "unanswered verdicts",
    scope: ["verdict"],
    fmt: (n) => String(n),
    worse: (b, a) => a > b,
    better: (b, a) => a < b,
  },
  {
    key: "emptyAnswers",
    label: "empty answers",
    scope: ["coach"],
    fmt: (n) => String(n),
    // An invariant, not a comparison: non-zero fails whatever the baseline said.
    worse: (_b, a) => a > 0,
    better: (b, a) => a < b,
  },
  {
    key: "emptyFrames",
    label: "empty frames",
    scope: ["frame"],
    fmt: (n) => String(n),
    worse: (_b, a) => a > 0,
    better: (b, a) => a < b,
  },
];

const ALL_AREAS = ["coach", "verdict", "frame"];
// Transcripts written before --area existed described a full run.
const runAreas = run.areasRun ?? ALL_AREAS;
const baseAreas = base?.areasRun ?? ALL_AREAS;
const measured = base ? runAreas.filter((a) => baseAreas.includes(a)) : runAreas;
const covers = (scope) => scope.every((a) => measured.includes(a));

const sumArea = (r, field) => Object.values(r.areas).reduce((n, a) => n + a[field], 0);

function status(metric, before, after) {
  if (metric.worse(before, after)) return "regressed";
  if (metric.better(before, after)) return "improved";
  return "held";
}

// ------------------------------------------------------------ change ranking

const words = (s) =>
  new Set(
    (s ?? "")
      .toLowerCase()
      .split(/[^a-z0-9[\]-]+/)
      .filter(Boolean),
  );

/** 0 = identical wording, 1 = no words in common. */
function drift(a, b) {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 && y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  const union = x.size + y.size - shared;
  return union === 0 ? 0 : 1 - shared / union;
}

const verdictText = (v) =>
  v?.answer ? [v.answer.narrative, v.answer.divergenceLesson].filter(Boolean).join(" ") : "";

const outTokens = (slot) => slot?.cost?.outputTokens ?? 0;

/**
 * How much this pick moved, 0..1. Wording drift dominates because that is what
 * "the answer changed" means; the token term keeps a pick that was merely
 * shortened from ranking as untouched.
 */
function changeScore(cand, prev) {
  if (!prev) return 0;
  const parts = [
    [cand.coach?.text, prev.coach?.text, outTokens(cand.coach), outTokens(prev.coach)],
    [verdictText(cand.verdict), verdictText(prev.verdict), outTokens(cand.verdict), outTokens(prev.verdict)],
  ];
  return Math.max(
    ...parts.map(([a, b, at, bt]) => {
      const tokenTerm = bt === 0 ? (at === 0 ? 0 : 1) : Math.min(1, Math.abs(at - bt) / bt);
      return 0.6 * drift(a, b) + 0.4 * tokenTerm;
    }),
  );
}

const prevByPick = new Map((base?.picks ?? []).map((p) => [p.pickIndex, p]));

const picks = run.picks
  .map((p) => ({ ...p, prev: prevByPick.get(p.pickIndex) ?? null }))
  .map((p) => ({ ...p, change: changeScore(p, p.prev) }))
  .sort((a, b) =>
    base
      ? b.change - a.change
      : outTokens(b.coach) + outTokens(b.verdict) - (outTokens(a.coach) + outTokens(a.verdict)),
  );

// ------------------------------------------------------------------- rendering

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Principle ids are the thing being counted, so they are the thing made visible. */
const prose = (s) =>
  esc(s).replace(/\[([A-Z]+-\d+)\]/g, '<span class="cite">[$1]</span>') || '<em class="muted">empty</em>';

const n = (v) => (v ?? 0).toLocaleString("en-US");

function deltaBar(label, after, before) {
  const max = Math.max(after, before ?? 0) || 1;
  const pctOf = (v) => `${((v / max) * 100).toFixed(1)}%`;
  const delta = before == null ? null : after - before;
  const rel = before ? (delta / before) * 100 : null;
  const dir = delta == null || delta === 0 ? "flat" : delta < 0 ? "down" : "up";
  return `
    <div class="bar-row">
      <div class="bar-label">${esc(label)}</div>
      <div class="bar-track">
        ${before == null ? "" : `<div class="bar ghost" style="width:${pctOf(before)}"></div>`}
        <div class="bar live" style="width:${pctOf(after)}"></div>
      </div>
      <div class="bar-nums">
        ${before == null ? "" : `<span class="muted">${n(before)} &rarr;</span> `}<strong>${n(after)}</strong>
        ${rel == null ? "" : `<span class="delta ${dir}">${rel > 0 ? "+" : ""}${rel.toFixed(1)}%</span>`}
      </div>
    </div>`;
}

const unmeasured = (m) => `<div class="chip skipped">
      <span class="chip-label">${esc(m.label)}</span>
      <span class="chip-val muted">needs ${esc(m.scope.join(" + "))}</span>
      <span class="chip-tag">not measured</span>
    </div>`;

function metricChips() {
  if (!base) {
    return METRICS.map((m) =>
      covers(m.scope)
        ? `<div class="chip"><span class="chip-label">${esc(m.label)}</span><span class="chip-val">${esc(
            m.fmt(run.accuracy[m.key]),
          )}</span></div>`
        : unmeasured(m),
    ).join("");
  }
  const rows = METRICS.map((m) => {
    if (!covers(m.scope)) return unmeasured(m);
    const b = base.accuracy[m.key];
    const a = run.accuracy[m.key];
    const st = status(m, b, a);
    return `<div class="chip ${st}">
      <span class="chip-label">${esc(m.label)}</span>
      <span class="chip-val"><span class="muted">${esc(m.fmt(b))}</span> &rarr; ${esc(m.fmt(a))}</span>
      <span class="chip-tag">${st}</span>
    </div>`;
  });
  // Summed over the areas both runs covered, not over each file's whole map, so
  // a partial run is never charged with truncations it never went looking for.
  const truncIn = (r) => measured.reduce((n, k) => n + (r.areas[k]?.truncated ?? 0), 0);
  const bt = truncIn(base);
  const at = truncIn(run);
  const st = at > bt ? "regressed" : at < bt ? "improved" : "held";
  rows.push(`<div class="chip ${st}">
      <span class="chip-label">truncated answers</span>
      <span class="chip-val"><span class="muted">${bt}</span> &rarr; ${at}</span>
      <span class="chip-tag">${st}</span>
    </div>`);
  return rows.join("");
}

function areaTable() {
  const areas = [...new Set([...Object.keys(run.areas), ...Object.keys(base?.areas ?? {})])];
  const cell = (a, b) =>
    base
      ? `<span class="muted">${n(b)}</span> &rarr; ${n(a)}`
      : n(a);
  return `<table class="areas">
    <thead><tr><th>area</th><th>calls</th><th>input surface</th><th>output</th><th>truncated</th></tr></thead>
    <tbody>${areas
      .map((k) => {
        const a = run.areas[k] ?? {};
        const b = base?.areas?.[k] ?? {};
        return `<tr><td>${esc(k)}</td><td>${cell(a.calls, b.calls)}</td><td>${cell(
          a.inputSurface,
          b.inputSurface,
        )}</td><td>${cell(a.outputTokens, b.outputTokens)}</td><td>${cell(
          a.truncated,
          b.truncated,
        )}</td></tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

function slot(title, text, cost) {
  if (!cost && !text) return `<div class="slot empty"><em class="muted">not generated</em></div>`;
  const trunc = cost?.finishReason === "length";
  return `<div class="slot">
    <div class="slot-head">
      <span class="slot-title">${esc(title)}</span>
      <span class="slot-cost">${n(cost?.surface)} in / <strong>${n(cost?.outputTokens)}</strong> out${
        trunc ? ' <span class="warn">TRUNCATED</span>' : ""
      }</span>
    </div>
    <div class="prose">${prose(text)}</div>
  </div>`;
}

function pickSection(p) {
  const pair = (title, a, b) =>
    base
      ? `<div class="pair">${slot(`${title} · baseline`, b.text, b.cost)}${slot(
          `${title} · candidate`,
          a.text,
          a.cost,
        )}</div>`
      : `<div class="pair single">${slot(title, a.text, a.cost)}</div>`;

  const coachPair = pair(
    "coach",
    { text: p.coach?.text, cost: p.coach?.cost },
    { text: p.prev?.coach?.text, cost: p.prev?.coach?.cost },
  );

  const vText = (v) =>
    v?.answer
      ? `context-best: ${v.answer.contextBestName}\n\n${v.answer.narrative}\n\n${v.answer.divergenceLesson}`
      : v
        ? ""
        : null;

  const verdictPair = pair(
    "verdict",
    { text: vText(p.verdict), cost: p.verdict?.cost },
    { text: vText(p.prev?.verdict), cost: p.prev?.verdict?.cost },
  );

  const outNow = outTokens(p.coach) + outTokens(p.verdict);
  const outThen = p.prev ? outTokens(p.prev.coach) + outTokens(p.prev.verdict) : null;

  return `<section class="pick">
    <h3>
      <span class="pi">pick ${p.pickIndex}</span>
      <span class="muted">${p.cardsInPack} cards · best: ${esc(p.bestName)}</span>
      <span class="spacer"></span>
      ${
        base
          ? `<span class="change" title="wording drift and token change, 0-1">changed ${(p.change * 100).toFixed(0)}%</span>
             <span class="tok"><span class="muted">${n(outThen)} &rarr;</span> ${n(outNow)} out</span>`
          : `<span class="tok">${n(outNow)} out</span>`
      }
    </h3>
    ${coachPair}
    ${verdictPair}
  </section>`;
}

const totalOutNow = sumArea(run, "outputTokens");
const totalOutThen = base ? sumArea(base, "outputTokens") : null;
const totalSurfNow = sumArea(run, "inputSurface");
const totalSurfThen = base ? sumArea(base, "inputSurface") : null;

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bench ${esc(stem)}</title>
<style>
  :root {
    --bg:#fbfbfd; --fg:#16161a; --muted:#6b6b76; --line:#e3e3ea; --card:#fff;
    --live:#4f46e5; --ghost:#c9c9d4; --good:#0f8a4e; --bad:#c2340a; --warnbg:#fdf0e6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#0e0e12; --fg:#e9e9ef; --muted:#8b8b98; --line:#26262f; --card:#16161c;
      --live:#8b85ff; --ghost:#3a3a46; --good:#3ecf8e; --bad:#ff7a59; --warnbg:#2a1a12;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin:0; padding:2rem 1.25rem 6rem; background:var(--bg); color:var(--fg);
    font:15px/1.6 ui-sans-serif,-apple-system,'Segoe UI',sans-serif;
  }
  .wrap { max-width: 1180px; margin: 0 auto; }
  h1 { font-size:1.4rem; margin:0 0 .25rem; letter-spacing:-.01em; }
  h2 { font-size:.8rem; text-transform:uppercase; letter-spacing:.09em; color:var(--muted);
       margin:2.5rem 0 .85rem; font-weight:600; }
  .sub { color:var(--muted); font-size:.9rem; margin:0 0 2rem; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:1.25rem; }
  .muted { color:var(--muted); }
  .mono, .tok, .bar-nums, .chip-val, .areas, .slot-cost { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }

  .bar-row { display:grid; grid-template-columns:9rem 1fr 15rem; gap:.85rem; align-items:center; margin:.55rem 0; }
  .bar-label { font-size:.85rem; color:var(--muted); }
  .bar-track { position:relative; height:26px; }
  .bar { position:absolute; left:0; height:11px; border-radius:3px; }
  .bar.ghost { top:0; background:var(--ghost); }
  .bar.live { top:14px; background:var(--live); }
  .bar-nums { font-size:.82rem; text-align:right; }
  .delta { margin-left:.4rem; font-weight:600; }
  .delta.down { color:var(--good); } .delta.up { color:var(--bad); } .delta.flat { color:var(--muted); }

  .chips { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:.6rem; }
  .chip { border:1px solid var(--line); border-left-width:4px; border-radius:9px; padding:.6rem .75rem;
          background:var(--card); display:flex; flex-direction:column; gap:.15rem; }
  .chip-label { font-size:.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
  .chip-val { font-size:.95rem; }
  .chip-tag { font-size:.7rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
  .chip.held { border-left-color:var(--ghost); } .chip.held .chip-tag { color:var(--muted); }
  .chip.improved { border-left-color:var(--good); } .chip.improved .chip-tag { color:var(--good); }
  .chip.regressed { border-left-color:var(--bad); } .chip.regressed .chip-tag { color:var(--bad); }
  .chip.skipped { border-left-color:transparent; border-style:dashed; opacity:.65; }
  .chip.skipped .chip-tag { color:var(--muted); }

  table.areas { width:100%; border-collapse:collapse; font-size:.85rem; }
  .areas th { text-align:right; color:var(--muted); font-weight:500; padding:.4rem .6rem;
              border-bottom:1px solid var(--line); font-size:.75rem; text-transform:uppercase; letter-spacing:.05em; }
  .areas th:first-child, .areas td:first-child { text-align:left; }
  .areas td { text-align:right; padding:.45rem .6rem; border-bottom:1px solid var(--line); }

  .pick { border:1px solid var(--line); border-radius:12px; background:var(--card);
          padding:1rem 1.1rem; margin:.75rem 0; }
  .pick h3 { display:flex; align-items:center; gap:.7rem; margin:0 0 .8rem; font-size:.9rem; font-weight:600; }
  .pi { font-family:ui-monospace,monospace; background:var(--bg); border:1px solid var(--line);
        border-radius:6px; padding:.1rem .45rem; }
  .spacer { flex:1; }
  .change { font-size:.75rem; font-weight:700; color:var(--live); }
  .tok { font-size:.8rem; }

  .pair { display:grid; grid-template-columns:1fr 1fr; gap:.7rem; margin-bottom:.7rem; }
  .pair.single { grid-template-columns:1fr; }
  @media (max-width:820px) { .pair { grid-template-columns:1fr; } .bar-row { grid-template-columns:1fr; } }
  .slot { border:1px solid var(--line); border-radius:9px; padding:.65rem .75rem; background:var(--bg); min-width:0; }
  .slot.empty { display:flex; align-items:center; justify-content:center; padding:1.5rem; }
  .slot-head { display:flex; justify-content:space-between; gap:.5rem; align-items:baseline;
               margin-bottom:.5rem; padding-bottom:.4rem; border-bottom:1px solid var(--line); }
  .slot-title { font-size:.72rem; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); font-weight:600; }
  .slot-cost { font-size:.72rem; color:var(--muted); white-space:nowrap; }
  .warn { background:var(--warnbg); color:var(--bad); border-radius:4px; padding:0 .3rem; font-weight:700; }
  .prose { white-space:pre-wrap; overflow-wrap:anywhere; font-size:.87rem; }
  .cite { color:var(--live); font-weight:600; }
</style>
</head><body><div class="wrap">

<h1>${esc(run.setCode)}/${esc(run.format)} seed ${esc(String(run.seed))} &middot; ${esc(run.model)}</h1>
<p class="sub">${
  base
    ? "candidate vs baseline &middot; picks ordered by how much the answer changed"
    : "single run &middot; no baseline transcript yet &middot; picks ordered by output cost"
}${
  runAreas.length < ALL_AREAS.length
    ? ` &middot; <span class="warn">partial: ${esc(runAreas.join(", "))} only</span>`
    : ""
}${run.callErrors ? ` &middot; <span class="warn">${run.callErrors} call errors</span>` : ""}</p>

<h2>Tokens</h2>
<div class="card">
  ${deltaBar("output", totalOutNow, totalOutThen)}
  ${deltaBar("input surface", totalSurfNow, totalSurfThen)}
  ${Object.keys(run.areas)
    .map((k) => deltaBar(`${k} output`, run.areas[k].outputTokens, base?.areas?.[k]?.outputTokens ?? null))
    .join("")}
</div>

<h2>Per area</h2>
<div class="card">${areaTable()}</div>

<h2>Did quality hold</h2>
<div class="chips">${metricChips()}</div>

<h2>${base ? "Answers, most-changed first" : "Answers, most expensive first"}</h2>
${picks.map(pickSection).join("")}

<h2>Frames</h2>
${run.frames
  .map((f, i) => {
    const prev = base?.frames?.[i];
    return `<section class="pick"><h3><span class="pi">${esc(f.phase)}</span><span class="spacer"></span>
      <span class="tok">${n(f.cost?.outputTokens)} out</span></h3>
      ${
        base
          ? `<div class="pair">${slot("baseline", prev?.text, prev?.cost)}${slot("candidate", f.text, f.cost)}</div>`
          : `<div class="pair single">${slot(f.phase, f.text, f.cost)}</div>`
      }</section>`;
  })
  .join("")}

</div></body></html>
`;

writeFileSync(outFile, html);
const path = outFile.pathname;
console.log(`wrote ${path}`);
if (!base) {
  console.log(
    "single-run mode: no baseline transcript. Run `pnpm bench-llm --update-baseline` " +
      "once to give this run something to compare against.",
  );
}
if (has("open")) execFileSync("open", [path]);
