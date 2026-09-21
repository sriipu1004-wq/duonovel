# Public Domain ingestion workspace

- `manifests/`: Git-tracked rights manifests. Copy `_template.json` to `<stable-id>.json`.
- `sources/raw/`: local operator source inputs. Contents are gitignored by default.
- `audits/`: Git-tracked read-only snapshots of the current Official shelf.
- prepared normalized text and reports are written to `.public-domain-work/<id>/` and are also gitignored.

Core commands:

```bash
npm run public-domain:validate
npm run public-domain:audit-official
npm run public-domain:aozora-candidates -- --limit=25
npm run public-domain:aozora-candidates -- --limit=25 --write
npm run public-domain:source-sync -- --all-pending --limit=10 --prepare
npm run public-domain:batch -- --all-approved --prepare
```

All candidate generation is pending-only. Database writes require explicit execute/target confirmation and remain Official Draft-only.

See `docs/public-domain-ingestion.md` before approving or importing any work.
