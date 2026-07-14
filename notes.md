# Issues:

1. I'm getting this in the console after I've made like 6 picks or so:

```
(node:44277) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 uncaughtExceptionMonitor listeners added to [process]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(node:44277) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 unhandledRejection listeners added to [process]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(node:44277) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 exit listeners added to [process]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
```

2. The suggested decks have incorrect spell counts when including the Evolving Wilds/multi-colored lands. Those 2 card types should detract from the 17-lands count.

# Ideas:

1. A quiz on what card a certain mono-colored card could/should belong to.

- Ex. This Red card belongs in a Boros deck because ... <x,y,z>.
- The important bit is that it'd teach me what the archetypes even are, and what monocolored cards fit the type to belong in that archetype.

2. Can you parse the web for 10 - 30 credible blog posts about how to draft good and best practices in deck construction and what archetypes are supposed to do (agnostic of the set). THEN, can you consolidate that info into 30 - 75 concise bullet points.

- I wanna use this bullet-pointed list to be the foundation/fact-check-center for an AI chatbot that can think more dynamically about card evaluation/judgments.
