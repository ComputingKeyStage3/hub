# Tools

Run these from the project root with `node tools/<name>.js`.

**`find-unused.js`** — lists functions that are defined but never called, and
CSS classes nothing uses. It understands classes built at runtime from a
prefix (`"con-" + kind`), so it does not report those as dead. **Always check what it flags before deleting.** It reads the code with patterns
rather than parsing it properly, so it can be fooled: a `/*` inside a string
starts what looks like a comment and can hide real code after it. `shrinkImage`
in lesson.html is a known example — it is reported as dead and is not. A quick
`grep -c` on the name settles it in a second.

**`check-design.js`** — checks that components which ought to match each other
do: search boxes the same height, buttons the same shape, cards the same
corners. Also flags colours hardcoded instead of taken from the theme, which
is what stops something following light and dark mode.

**`boot-check.js`** — starts every page against its own markup, with and
without a server, and reports anything that throws, any element wired but
missing, and any page that contacts a server when it should not.
