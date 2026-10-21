# LIB read — agent and chat recovery entrypoint

**Every new parent or specialist conversation starts with [PROJECT_MASTER.md](PROJECT_MASTER.md).**
This is a permanent discovery contract. The previous parent chat may have ended without a handoff.

1. Read [PROJECT_MASTER.md](PROJECT_MASTER.md) and [docs/chat-operations.md](docs/chat-operations.md).
2. Read the canonical product documents: [project-state](docs/project-state.md), [ordered roadmap](docs/roadmap.md), [decisions](docs/decisions.md), and [development workflow](docs/development-workflow.md).
3. Independently verify the live GitHub main, open PRs (including HEAD and status), Production deployment SHA/READY, and relevant Supabase state. The last-observed SHA in any file is **not** the current SHA by itself.
4. If files, prior chats and live evidence disagree, report the conflict; distinguish historical snapshots from current decisions. Never infer a successful test/merge/restore from a label alone.
5. Parent controls roadmap, specialist assignments, cross-cutting decisions, acceptance, approvals and Production release. **CONTROL-R2 exception (2026-10-21): all OLD child conversations retired; create four NEW S1–S4 chats from [docs/chat-launch-2026-10-21.md](docs/chat-launch-2026-10-21.md).** Thereafter new specialist conversations persist across related workstreams; Child84, Child85, etc. are **roadmap work IDs, not disposable chat identities**.
6. Preserve the existing workflow: latest main → separate branch → implementation → tests/build → Draft PR → matching-HEAD Preview → user review → **explicit merge approval** → merge → Production READY/smoke. Data writes and high-risk release decisions have separate approvals. Do not merge because a PR is merely green.
7. Persist **accepted durable** priority, ownership, risk, or release decisions in [PROJECT_MASTER.md](PROJECT_MASTER.md) and relevant canonical docs at a parent checkpoint. Routine PR HEAD/CI/Preview changes belong in their PR threads and are always re-queried live; do not force every specialist PR to edit the shared parent file. If the parent crashes first, the next parent reconstructs drift from live evidence rather than assuming snapshots are self-updating.

Stable product invariants: AI story generation is retired; AI reading/translation support remains. Human vs AI translation use separate provenance, permissions and allowances (Human never calls OpenAI or consumes AI credits). Reader modes are Original, Bilingual, Translation only. Keep UI locale, source language, target language distinct; Search filters source language. Preserve R18, authorization, publication/owner isolation, rights evidence, and Human narration vs TTS. "LIB read Official" is not Public Domain proof. Do not fabricate rights, provider, edition, hashes, translations, recordings or usage.

No chat assignment, GitHub comment, Issue or file edit launches asynchronous child execution. Follow the user's actual scope and established review/merge approvals.
