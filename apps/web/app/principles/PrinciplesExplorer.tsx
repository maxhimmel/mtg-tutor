"use client";

import { useMemo, useState } from "react";
import type { Principle, PrincipleSource, PrinciplesDoc } from "@mtg-tutor/core";
import { AppHeader } from "../components/AppHeader";

const label = (category: string) => category.replace(/-/g, " ");

function groupByCategory(principles: Principle[]): [string, Principle[]][] {
  const groups = new Map<string, Principle[]>();
  for (const p of principles) {
    const list = groups.get(p.category) ?? [];
    list.push(p);
    groups.set(p.category, list);
  }
  // Map iteration order is first-appearance order, which is the order the
  // categories were authored in the YAML.
  return [...groups];
}

export function PrinciplesExplorer({
  doc,
  sources,
}: {
  doc: PrinciplesDoc;
  sources: PrincipleSource[];
}) {
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const categories = useMemo(() => groupByCategory(doc.principles), [doc.principles]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return doc.principles.filter((p) => {
      if (tags.length && !tags.every((t) => p.tags.includes(t))) return false;
      if (!needle) return true;
      return (
        p.id.toLowerCase().includes(needle) ||
        p.text.toLowerCase().includes(needle) ||
        p.category.includes(needle) ||
        p.tags.some((t) => t.includes(needle))
      );
    });
  }, [doc.principles, query, tags]);

  const groups = useMemo(() => groupByCategory(visible), [visible]);
  const filtered = query.trim() !== "" || tags.length > 0;

  const toggleTag = (tag: string) =>
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );

  const clear = () => {
    setQuery("");
    setTags([]);
  };

  return (
    <main className="mx-auto max-w-[1500px] px-6 pb-16 pt-5">
      <AppHeader />

      <div className="max-w-3xl">
        <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight">
          {doc.meta.title}
        </h1>
        {doc.meta.note && <p className="mb-2 text-base-content/70">{doc.meta.note}</p>}
        <p className="text-base-content/60">
          These {doc.principles.length} principles are the coach&apos;s fact-check reference.
          When it grades a pick it cites the ones it leaned on by id, so you can trace any
          claim it makes back to a source below.
        </p>
      </div>

      <div className="my-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search principles…"
          aria-label="Search principles"
          className="input input-sm input-bordered w-full max-w-xs"
        />
        <span className="text-sm text-base-content/60">
          {visible.length} of {doc.principles.length}
        </span>
        {filtered && (
          <button type="button" className="btn btn-ghost btn-xs" onClick={clear}>
            Clear
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-base-content/50">filtered by</span>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="badge badge-primary badge-sm gap-1 font-normal"
              onClick={() => toggleTag(tag)}
              aria-label={`Remove the ${tag} filter`}
            >
              {tag} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}

      <nav className="mb-8 flex flex-wrap gap-x-4 gap-y-1 border-y border-base-300 py-2 text-sm">
        {categories.map(([category, list]) => (
          <a
            key={category}
            href={`#${category}`}
            className="capitalize text-base-content/60 hover:text-primary"
          >
            {label(category)}{" "}
            <span className="tabular-nums text-base-content/40">{list.length}</span>
          </a>
        ))}
      </nav>

      {groups.length === 0 && (
        <p className="text-base-content/60">
          No principles match that. <button className="link" onClick={clear}>Clear the filters</button>
          .
        </p>
      )}

      <div className="flex flex-col gap-8">
        {groups.map(([category, list]) => (
          <section key={category} id={category} className="scroll-mt-6">
            <h2 className="eyebrow mb-3">{label(category)}</h2>
            <div className="flex flex-col gap-3">
              {list.map((p) => (
                <article
                  key={p.id}
                  id={p.id}
                  className="card scroll-mt-6 border border-base-300 bg-base-200 target:border-primary"
                >
                  <div className="card-body gap-2 p-4">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs font-semibold text-primary">{p.id}</span>
                      <p className="flex-1 leading-snug">{p.text}</p>
                    </div>
                    {p.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={`badge badge-sm font-normal ${
                              tags.includes(tag) ? "badge-primary" : "badge-ghost"
                            }`}
                            onClick={() => toggleTag(tag)}
                            aria-pressed={tags.includes(tag)}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section id="sources" className="mt-12 scroll-mt-6 border-t border-base-300 pt-6">
        <h2 className="eyebrow mb-3">Sources</h2>
        <p className="mb-3 max-w-3xl text-sm text-base-content/60">
          These principles are distilled from published Limited strategy writing rather than
          invented. Nothing here is set-specific.
        </p>
        <ol className="flex list-inside list-decimal flex-col gap-1 text-sm">
          {sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="link link-hover text-base-content/80"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
