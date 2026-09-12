from pathlib import Path

p = Path("scripts/child60_polish_patch.py")
s = p.read_text()

old = '''text = read(path)
if text.count(old_publish) != 2:
    raise SystemExit(f"expected 2 publish translation blocks, got {text.count(old_publish)}")
write(path, text.replace(old_publish, new_publish))'''
new = '''text = read(path)
old_publish_2 = "\\n".join(line[2:] if line.startswith("  ") else line for line in old_publish.splitlines())
new_publish_2 = "\\n".join(line[2:] if line.startswith("  ") else line for line in new_publish.splitlines())
matches = text.count(old_publish) + text.count(old_publish_2)
if matches != 2:
    raise SystemExit(f"expected 2 publish translation blocks, got {matches}")
write(path, text.replace(old_publish, new_publish).replace(old_publish_2, new_publish_2))'''
if old in s:
    s = s.replace(old, new)

old_footer = '''text = read(path)
ending = '      </div>\\n    </section>\\n  );\\n}'
if not text.endswith(ending):
    raise SystemExit("translation footer ending not found")
write(path, text[:-len(ending)] + '      </div>\\n      </div>\\n    </section>\\n  );\\n}')'''
new_footer = '''text = read(path)
ending = '      </div>\\n    </section>\\n  );\\n}'
stripped = text.rstrip()
if not stripped.endswith(ending):
    raise SystemExit("translation footer ending not found")
write(path, stripped[:-len(ending)] + '      </div>\\n      </div>\\n    </section>\\n  );\\n}\\n')'''
if old_footer in s:
    s = s.replace(old_footer, new_footer)

# React ref callbacks must return void.
s = s.replace(
    'ref={(node) => segmentRefs.current.set(segment.id, node)}',
    'ref={(node) => { segmentRefs.current.set(segment.id, node); }}',
)

p.write_text(s)
