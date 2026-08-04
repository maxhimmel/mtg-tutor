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
// Mirrors bench-llm's naming: a partial run keeps its own baseline, so the area
// set is part of the filename. Canonical order, so --area frame,coach finds the
// file --area coach,frame wrote.
const AREA_ORDER = ["coach", "verdict", "frame"];
const areaArg = flag("area", null);
const areaTag = (() => {
  if (!areaArg) return "";
  const picked = AREA_ORDER.filter((a) => areaArg.split(",").some((s) => s.trim() === a));
  return picked.length === 0 || picked.length === AREA_ORDER.length ? "" : `.${picked.join("+")}`;
})();
const stem = `${setCode}.${format}.${seed}.${provider}${areaTag}`;

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

const ALL_AREAS = AREA_ORDER;
// Transcripts written before --area existed described a full run.
const runAreas = run.areasRun ?? ALL_AREAS;
const baseAreas = base?.areasRun ?? ALL_AREAS;
const measured = base ? runAreas.filter((a) => baseAreas.includes(a)) : runAreas;

/**
 * Whether a metric means the same thing on both sides -- same areas, same
 * population. A coach-only run against a coach-only baseline compares
 * everything, because both counted over coach answers. A coach-only run against
 * a full baseline compares only the coach-scoped metrics, because the blended
 * ones were counted over different populations.
 */
const covers = (scope) => {
  if (!base) return scope.some((a) => runAreas.includes(a));
  const mine = scope.filter((a) => runAreas.includes(a));
  const theirs = scope.filter((a) => baseAreas.includes(a));
  return mine.length > 0 && mine.length === theirs.length && mine.every((a) => theirs.includes(a));
};

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

function unmeasured(m) {
  const side = (areas) => m.scope.filter((a) => areas.includes(a)).join("+") || "nothing";
  // Two different reasons to skip, and conflating them would send you looking
  // for the wrong fix: either this run never collected the area, or both runs
  // collected different ones and the numbers are not the same measurement.
  const why = !base
    ? `needs ${m.scope.join(" + ")}`
    : `${side(runAreas)} here, ${side(baseAreas)} in baseline`;
  return `<div class="chip skipped">
      <span class="chip-label">${esc(m.label)}</span>
      <span class="chip-val muted">${esc(why)}</span>
      <span class="chip-tag">not measured</span>
    </div>`;
}

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
    <thead><tr><th>area</th><th>calls</th><th>input</th><th>uncached</th><th>output</th><th>truncated</th></tr></thead>
    <tbody>${areas
      .map((k) => {
        const a = run.areas[k] ?? {};
        const b = base?.areas?.[k] ?? {};
        return `<tr><td>${esc(k)}</td><td>${cell(a.calls, b.calls)}</td><td>${cell(
          a.inputTokens,
          b.inputTokens,
        )}</td><td>${cell(a.noCacheInputTokens, b.noCacheInputTokens)}</td><td>${cell(
          a.outputTokens,
          b.outputTokens,
        )}</td><td>${cell(a.truncated, b.truncated)}</td></tr>`;
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
      <span class="slot-cost">${n(cost?.inputTokens)} in / <strong>${n(cost?.outputTokens)}</strong> out${
        trunc ? ' <span class="warn">TRUNCATED</span>' : ""
      }</span>
    </div>
    <div class="prose">${prose(text)}</div>
  </div>`;
}

// ------------------------------------------------------------------ the deck
//
// Advice about a pick is unreadable without the pool it was given for -- "fits
// your Black-Green curve" means nothing next to a name and a win rate. The
// transcript carries the whole draft in take order, so the pool at any pick is
// a prefix of it, and the panel below is that prefix rendered.
//
// Absent on transcripts recorded before `draft` existed; the panel degrades to
// a line telling you which script fills it in rather than disappearing, because
// a missing feature that explains itself costs one sentence and a missing
// feature that stays silent costs a bug report.
const draft = Array.isArray(run.draft) ? run.draft : [];

// Whether the two runs actually drafted the same cards.
//
// The whole comparison rests on the deal being pinned: same seed, same greedy
// policy, so both runs see byte-identical prompts and every difference is the
// prompt change. A scoring change breaks that silently -- `cardValue` decides
// the policy's pick, so moving it re-drafts the whole tail, and the report goes
// on rendering two answers side by side as though they were about one pick.
// Found when a basic-land fix (72a877d) moved 6 of 30 picks and the two decks
// stopped being the same deck.
const divergedPicks = base
  ? (() => {
      const baseBest = new Map((base.picks ?? []).map((p) => [p.pickIndex, p.bestName]));
      return (run.picks ?? []).filter(
        (p) => baseBest.has(p.pickIndex) && baseBest.get(p.pickIndex) !== p.bestName,
      ).length;
    })()
  : 0;

const COLOR_META = {
  W: { name: "White", hex: "#f6e3b4" },
  U: { name: "Blue", hex: "#a8cbe8" },
  B: { name: "Black", hex: "#9c9186" },
  R: { name: "Red", hex: "#eda98c" },
  G: { name: "Green", hex: "#a7ceab" },
};

// Which pick each coached answer belongs to, so the drawer's scrubber and the
// per-answer buttons address the same thing.
const coachedIndices = picks.map((p) => p.pickIndex);

function deckPanel() {
  const empty = draft.length === 0;
  const data = JSON.stringify({ draft, coached: coachedIndices, colors: COLOR_META });

  // One shell either way. The empty case still opens and still says why it is
  // empty; rendering no drawer at all would leave the "deck here" buttons and
  // the D shortcut pointing at nothing.
  const bodyHtml = empty
    ? `<p class="muted">This transcript was recorded before a run stored its draft,
       so there is no deck to show. <code>pnpm bench-backfill-draft</code> replays
       the same deal and fills it in &mdash; it spends no model tokens.</p>`
    : `<div id="deck-step-bar" class="step-bar" hidden>
        <div class="step-nav">
          <button class="step-b" data-step="-1" aria-label="Previous pick">&larr;</button>
          <input id="deck-range" type="range" min="0" max="${draft.length - 1}"
                 value="${draft.length - 1}" aria-label="Pick">
          <button class="step-b" data-step="1" aria-label="Next pick">&rarr;</button>
        </div>
        <div id="deck-step-label" class="step-label"></div>
      </div>
      <div id="deck-curve" class="curve"></div>
      <div id="deck-list"></div>`;

  return `<button id="deck-open" class="deck-fab" data-deck-open="final"
    title="View the drafted deck (D)">
    <span class="fab-pip"></span>Deck${empty ? "" : ` <span class="muted">${draft.length}</span>`}
  </button>
  <div id="deck-scrim" class="scrim" data-deck-close></div>
  <aside id="deck" class="drawer" aria-hidden="true" aria-label="Drafted deck">
    <div class="drawer-head">
      <strong>Deck</strong>
      ${
        empty
          ? ""
          : `<div class="seg" role="tablist">
        <button class="seg-b is-on" data-mode="final" role="tab">Final pool</button>
        <button class="seg-b" data-mode="step" role="tab">Step through</button>
      </div>`
      }
      <span class="spacer"></span>
      <button class="x" data-deck-close aria-label="Close">&times;</button>
    </div>
    <div class="drawer-body">${bodyHtml}</div>
  </aside>
  <script type="application/json" id="deck-data">${data.replace(/</g, "\\u003c")}</script>`;
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

  // The pool AS IT STOOD when this advice was written -- one click from the
  // advice, because the two are only meaningful together.
  const atPick =
    draft.length > 0
      ? `<button class="deck-at" data-deck-open="step" data-pick="${p.pickIndex}"
           title="Show the deck as it stood at this pick">deck here</button>`
      : "";

  return `<section class="pick">
    <h3>
      <span class="pi">pick ${p.pickIndex}</span>
      <span class="muted">${p.cardsInPack} cards · raw best: ${esc(p.bestName)}</span>
      ${atPick}
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
const totalInNow = sumArea(run, "inputTokens");
const totalInThen = base ? sumArea(base, "inputTokens") : null;
const totalUncachedNow = sumArea(run, "noCacheInputTokens");
const totalUncachedThen = base ? sumArea(base, "noCacheInputTokens") : null;

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
  .notpaired { background:var(--warnbg); border:1px solid var(--bad); border-left-width:4px;
    border-radius:9px; padding:.7rem .9rem; font-size:.85rem; margin:0 0 2rem; }
  .notpaired strong { color:var(--bad); }
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

  /* ---- deck drawer ---- */
  .deck-fab { position:fixed; right:1.25rem; bottom:1.25rem; z-index:40;
    display:flex; align-items:center; gap:.5rem; padding:.6rem .95rem;
    font:600 .85rem/1 ui-sans-serif,-apple-system,'Segoe UI',sans-serif; color:var(--fg);
    background:var(--card); border:1px solid var(--line); border-radius:999px; cursor:pointer;
    box-shadow:0 6px 22px rgba(0,0,0,.13); transition:transform .13s, box-shadow .13s; }
  .deck-fab:hover { transform:translateY(-1px); box-shadow:0 9px 26px rgba(0,0,0,.18); }
  .deck-fab .muted { font-family:ui-monospace,monospace; font-weight:500; }
  .fab-pip { width:.62rem; height:.62rem; border-radius:50%; background:var(--live); }

  .deck-at { font:600 .68rem/1 ui-sans-serif,-apple-system,sans-serif; text-transform:uppercase;
    letter-spacing:.06em; color:var(--live); background:transparent; cursor:pointer;
    border:1px solid var(--line); border-radius:999px; padding:.24rem .55rem; }
  .deck-at:hover { border-color:var(--live); background:var(--bg); }

  .scrim { position:fixed; inset:0; z-index:45; background:rgba(10,10,14,.34);
    opacity:0; pointer-events:none; transition:opacity .2s; }
  body.deck-on .scrim { opacity:1; pointer-events:auto; }

  .drawer { position:fixed; top:0; right:0; z-index:50; width:min(30rem,100vw);
    height:100dvh; display:flex; flex-direction:column; background:var(--card);
    border-left:1px solid var(--line); box-shadow:-14px 0 40px rgba(0,0,0,.17);
    transform:translateX(101%); transition:transform .22s cubic-bezier(.4,0,.2,1); }
  body.deck-on .drawer { transform:none; }
  @media (prefers-reduced-motion:reduce) { .drawer,.scrim,.deck-fab { transition:none; } }

  .drawer-head { display:flex; align-items:center; gap:.7rem; padding:.85rem 1rem;
    border-bottom:1px solid var(--line); flex:0 0 auto; }
  .drawer-body { overflow-y:auto; padding:1rem; flex:1 1 auto; }
  .x { font-size:1.35rem; line-height:1; background:none; border:none; cursor:pointer;
    color:var(--muted); padding:0 .2rem; }
  .x:hover { color:var(--fg); }

  .seg { display:flex; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  .seg-b { font:600 .72rem/1 ui-sans-serif,-apple-system,sans-serif; padding:.4rem .65rem;
    background:transparent; color:var(--muted); border:none; cursor:pointer; }
  .seg-b.is-on { background:var(--live); color:#fff; }

  .step-bar { margin-bottom:.9rem; }
  .step-nav { display:flex; align-items:center; gap:.55rem; }
  .step-b { font-size:.9rem; line-height:1; padding:.3rem .55rem; cursor:pointer;
    background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:7px; }
  .step-b:hover { border-color:var(--live); }
  #deck-range { flex:1; accent-color:var(--live); }
  .step-label { margin-top:.5rem; font-size:.8rem; color:var(--muted); }
  .step-label strong { color:var(--fg); }

  .curve { display:flex; align-items:flex-end; gap:3px; height:38px; margin-bottom:1rem; }
  .curve-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; }
  .curve-bar { width:100%; background:var(--live); border-radius:2px 2px 0 0; min-height:2px; opacity:.75; }
  .curve-n { font:500 .6rem/1 ui-monospace,monospace; color:var(--muted); }

  .cgroup { margin-bottom:.85rem; }
  .cgroup-h { display:flex; align-items:center; gap:.45rem; margin-bottom:.35rem;
    font-size:.72rem; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); font-weight:600; }
  .pip { width:.7rem; height:.7rem; border-radius:50%; border:1px solid rgba(0,0,0,.18); flex:0 0 auto; }
  .cgroup-n { font-family:ui-monospace,monospace; font-weight:500; }
  .crow { display:flex; align-items:baseline; gap:.5rem; padding:.2rem .35rem;
    border-radius:6px; font-size:.83rem; }
  .crow:nth-child(odd) { background:var(--bg); }
  .crow.is-new { background:var(--warnbg); box-shadow:inset 2px 0 0 var(--live); }
  .crow-mv { font-family:ui-monospace,monospace; font-size:.72rem; color:var(--muted);
    min-width:1.1rem; text-align:right; flex:0 0 auto; }
  .crow-name { flex:1; min-width:0; overflow-wrap:anywhere; }
  .crow-t { font-size:.7rem; color:var(--muted); white-space:nowrap; }
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
${
  divergedPicks > 0
    ? `<p class="notpaired"><strong>Not a paired comparison.</strong> The two runs took
       different cards at ${divergedPicks} of ${run.picks.length} picks, so from the first
       divergence on they drafted different decks and each pair below is two answers about
       two different pools. Token deltas include that, not just the prompt change. A
       scoring change moves the greedy policy's picks; re-record the baseline against the
       current scorer before reading these numbers as a prompt diff.</p>`
    : ""
}

<h2>Tokens</h2>
<div class="card">
  ${deltaBar("output", totalOutNow, totalOutThen)}
  ${deltaBar("input (total)", totalInNow, totalInThen)}
  ${deltaBar("input (uncached)", totalUncachedNow, totalUncachedThen)}
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

</div>
${deckPanel()}
<script>
(() => {
  const el = document.getElementById("deck-data");
  if (!el) return;
  const { draft, colors } = JSON.parse(el.textContent);
  const body = document.body;
  const drawer = document.getElementById("deck");
  const list = document.getElementById("deck-list");
  const curve = document.getElementById("deck-curve");
  const bar = document.getElementById("deck-step-bar");
  const range = document.getElementById("deck-range");
  const label = document.getElementById("deck-step-label");
  const last = draft.length - 1;
  // Open/close still wires up with no draft -- the drawer explains itself then.
  const hasDraft = draft.length > 0;

  // The whole state: which mode, and how far through the draft. Everything
  // rendered is a function of these two, so opening at a pick and dragging the
  // scrubber cannot disagree.
  let mode = "final";
  let at = last;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // Front face only: a creature that transforms into a land is a creature.
  const isLand = (t) => /\\bLand\\b/.test(String(t).split("//")[0]);
  const shortType = (t) => {
    const front = String(t).split("//")[0];
    const main = front.split("—")[0].trim().split(/\\s+/).pop() || "";
    return main.replace(/^Basic$/, "Land");
  };

  // Colourless and multicolour are their own buckets: a gold card belongs to a
  // pair, not to each half, and bucketing it twice would make the counts lie.
  const bucketOf = (c) => {
    if (isLand(c.typeLine)) return "Land";
    if (!c.colors || c.colors.length === 0) return "Colorless";
    if (c.colors.length > 1) return c.colors.join("");
    return c.colors[0];
  };
  const ORDER = ["W", "U", "B", "R", "G"];
  const rank = (k) => {
    if (k === "Land") return 100;
    if (k === "Colorless") return 90;
    if (k.length > 1) return 50 + k.length;
    return ORDER.indexOf(k);
  };
  const pipOf = (k) => {
    const cs = k === "Land" || k === "Colorless" ? [] : k.split("");
    if (cs.length === 0) return '<span class="pip" style="background:#cfcfd8"></span>';
    if (cs.length === 1) return \`<span class="pip" style="background:\${colors[cs[0]].hex}"></span>\`;
    const stops = cs.map((c, i) =>
      \`\${colors[c].hex} \${(i / cs.length) * 100}% \${((i + 1) / cs.length) * 100}%\`).join(",");
    return \`<span class="pip" style="background:linear-gradient(90deg,\${stops})"></span>\`;
  };
  const groupName = (k) =>
    k === "Land" || k === "Colorless" ? k : k.split("").map((c) => colors[c].name).join("/");

  function render() {
    if (!hasDraft) return;
    const upto = mode === "final" ? draft : draft.slice(0, at + 1);
    const justTook = mode === "step" ? draft[at] : null;

    // Curve over castable spells; lands have no mana value worth plotting.
    const spells = upto.filter((c) => !isLand(c.typeLine));
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const c of spells) buckets[Math.min(7, Math.max(0, Math.round(c.cmc)))]++;
    const peak = Math.max(1, ...buckets);
    curve.innerHTML = buckets
      .map((n, i) =>
        \`<div class="curve-col" title="\${n} at mana value \${i === 7 ? "7+" : i}">
           <div class="curve-bar" style="height:\${(n / peak) * 26}px"></div>
           <span class="curve-n">\${i === 7 ? "7+" : i}</span>
         </div>\`)
      .join("");

    const groups = new Map();
    for (const c of upto) {
      const k = bucketOf(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    list.innerHTML = [...groups.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([k, cards]) => {
        const rows = cards
          .slice()
          .sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name))
          .map((c) => {
            const hot = justTook && c.pickIndex === justTook.pickIndex;
            return \`<div class="crow\${hot ? " is-new" : ""}">
              <span class="crow-mv">\${isLand(c.typeLine) ? "&middot;" : c.cmc}</span>
              <span class="crow-name">\${esc(c.name)}</span>
              <span class="crow-t">\${esc(shortType(c.typeLine))}</span>
            </div>\`;
          })
          .join("");
        return \`<div class="cgroup">
          <div class="cgroup-h">\${pipOf(k)}\${esc(groupName(k))}
            <span class="cgroup-n">\${cards.length}</span></div>\${rows}</div>\`;
      })
      .join("");

    bar.hidden = mode !== "step";
    if (mode === "step") {
      range.value = String(at);
      const d = draft[at];
      label.innerHTML =
        \`P\${d.packNo}P\${d.pickNo} &middot; pick \${d.pickIndex} &middot; took <strong>\${esc(d.name)}</strong>\`
        + \` &middot; \${upto.length} card\${upto.length === 1 ? "" : "s"}\`;
    }
  }

  function open(nextMode, pickIndex) {
    mode = nextMode || "final";
    if (typeof pickIndex === "number") {
      const i = draft.findIndex((d) => d.pickIndex === pickIndex);
      // A pick the draft does not contain would silently render the whole pool;
      // clamping to the end is at least honest about being the end.
      at = i === -1 ? last : i;
    }
    for (const b of document.querySelectorAll(".seg-b")) b.classList.toggle("is-on", b.dataset.mode === mode);
    body.classList.add("deck-on");
    drawer.setAttribute("aria-hidden", "false");
    render();
  }
  function close() {
    body.classList.remove("deck-on");
    drawer.setAttribute("aria-hidden", "true");
  }

  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-deck-open]");
    if (opener) {
      const p = opener.dataset.pick;
      return open(opener.dataset.deckOpen, p === undefined ? undefined : Number(p));
    }
    if (e.target.closest("[data-deck-close]")) return close();
    const seg = e.target.closest(".seg-b");
    if (seg) return open(seg.dataset.mode);
    const step = e.target.closest("[data-step]");
    if (step) {
      at = Math.min(last, Math.max(0, at + Number(step.dataset.step)));
      mode = "step";
      return open("step");
    }
  });

  if (range) {
    range.addEventListener("input", () => { at = Number(range.value); mode = "step"; render(); });
  }

  document.addEventListener("keydown", (e) => {
    const on = body.classList.contains("deck-on");
    if (e.key === "Escape" && on) return close();
    // A bare "d" from anywhere: the panel is meant to be reachable at any point
    // in the page, and reaching for the mouse breaks reading.
    if (!on && (e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      return open("final");
    }
    if (on && mode === "step" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      at = Math.min(last, Math.max(0, at + (e.key === "ArrowRight" ? 1 : -1)));
      render();
    }
  });
})();
</script>
</body></html>
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
