"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { gradeFor } from "@mtg-tutor/core";
import { gradeColor } from "../lib/format";
import { scoreAxis } from "./plot";

// The one plot this page has, drawn three times.
//
// It is one component rather than three because the three questions -- how you
// have gone lately, which pack you are worst in, how deep into a pack you start
// slipping -- are the same quantity cut three ways, and a page that drew them at
// three scales would be asking the reader to re-learn the axis at every panel.
// Same axis rule, same colours, same shape: read it once, then only read the
// columns. That is the glossary's figure rule applied to live numbers.
//
// The colours are the grade scale and nothing else. There is no second series
// anywhere on this page, which is deliberate rather than a gap: gold in this app
// means the card you are holding or the choice you made, and a column of
// averages is neither.

export interface ScoreColumn {
  key: string;
  /** Drawn under the column. A pick number, a pack number, a set symbol. */
  label: ReactNode;
  score: number;
  /** Makes the column a place to go. Omitted, the plot is a picture. */
  href?: string;
  /** The column said in full, for a screen reader and for a hover. */
  title: string;
}

// Tall enough for a point of score to be visible across a zoomed axis, short
// enough that two of these sit side by side without owning the page.
const PLOT_H = "8.5rem";

function Body({ column, height }: { column: ScoreColumn; height: number }) {
  const color = gradeColor(gradeFor(column.score));

  return (
    <>
      {/* Positioned, so it paints over the threshold lines rather than under
          them -- they are the scale this is read against, not marks on it. */}
      <span className="relative flex w-full items-end" style={{ height: PLOT_H }}>
        <span
          className="w-full rounded-t-[3px] border-t-2"
          style={{
            height: `${height * 100}%`,
            borderColor: color,
            // The cap carries the grade at full strength and the body is a wash
            // of it. A solid column in four hues fights the panel around it; the
            // reader wants the height first and the letter second.
            backgroundColor: `color-mix(in oklab, ${color} 20%, transparent)`,
          }}
        />
      </span>

      <span className="w-full truncate text-center text-[0.625rem] leading-none text-base-content/50">
        {column.label}
      </span>
      {/* Under the column rather than above the bar, which is where it wanted to
          go: a figure riding the top of the bar is a second plot of the same
          number, and it also pushes the bar off the axis it is measured on. */}
      <span className="w-full text-center text-[0.625rem] leading-none tabular-nums text-base-content/40">
        {column.score.toFixed(1)}
      </span>
    </>
  );
}

export function ScorePlot({
  columns,
  label,
}: {
  columns: ScoreColumn[];
  /** The whole plot in one sentence, for anyone who cannot see it. */
  label: string;
}) {
  const axis = scoreAxis(columns.map((c) => c.score));
  const navigable = columns.some((c) => c.href);

  return (
    <div className="flex items-start gap-2">
      {/* The gutter states both ends of the range, because the axis does not
          start at zero and a plot that does not say so is the one dishonest
          thing a chart of averages can be. */}
      <div
        className="flex shrink-0 flex-col justify-between text-[0.625rem] leading-none tabular-nums text-base-content/40"
        style={{ height: PLOT_H }}
      >
        <span>100</span>
        <span>{axis.floor}</span>
      </div>

      <div className="relative min-w-0 flex-1">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{ height: PLOT_H }}
        >
          {axis.bands.map((band) => (
            <span
              key={band.grade}
              className="absolute inset-x-0 flex items-center gap-1"
              style={{ bottom: `${axis.at(band.floor) * 100}%` }}
            >
              <span className="h-px flex-1 bg-base-content/10" />
              <span
                className="text-[0.5625rem] font-semibold leading-none"
                style={{ color: `color-mix(in oklab, ${gradeColor(band.grade)} 60%, transparent)` }}
              >
                {band.grade}
              </span>
            </span>
          ))}
        </div>

        <div
          className="flex items-end gap-0.5"
          {...(navigable ? { role: "group" } : { role: "img" })}
          aria-label={label}
        >
          {columns.map((column) => {
            const height = axis.at(column.score);
            return (
              <span key={column.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                {column.href ? (
                  <Link
                    href={column.href}
                    aria-label={column.title}
                    className="flex w-full flex-col items-center gap-1 rounded-sm no-underline transition-colors hover:bg-base-content/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/70"
                  >
                    <Body column={column} height={height} />
                  </Link>
                ) : (
                  <span className="flex w-full flex-col items-center gap-1" title={column.title}>
                    <Body column={column} height={height} />
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
