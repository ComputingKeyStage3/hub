# Prince Henry's Computing KS3 Hub

A teaching site for KS3 Computing. Students work through lessons a page at a
time; teachers build those lessons, hand them out to classes, and mark what
comes back.

Roughly 810 students a year across 27 classes.

---

## How it is put together

| Part | Where it runs | What it does |
|---|---|---|
| The site | GitHub Pages | Everything students and teachers see |
| The API | Vercel | 8 serverless functions |
| The database | Turso (SQLite) | Names, work, results, lessons |

Students only ever talk to GitHub Pages and Vercel. The database is never
reachable from a browser.

It also runs with **no server at all**. One word in `config.js` switches the
whole site to running from GitHub Pages alone, with work saved in the browser
and handed in as a PDF. See `OFFLINE-MODE.md`.

## What is in here

```
site/            everything served to a browser
  index.html       student home
  lesson.html      the lesson engine, where every task type is drawn
  admin.html       teacher console
  author.html      lesson builder
  work.html        seating plans and marking a class's work
  style.css        the whole look, including every theme
  lessons/         lessons kept as files rather than in the database
backend/api/     the Vercel functions
tools/           checks you can run over the code (see tools/README.md)
```

The four documents worth knowing:

- **`PROJECT-NOTES.md`** — the full picture: schema, lesson format, every task
  type, and the conventions the code follows.
- **`OFFLINE-MODE.md`** — running without Vercel or Turso.
- **`BACKUPS.md`** — the weekly backup, and the end-of-year clear-out.
- **`NEW-DATABASE.md`** — setting up a fresh database.

## Running it locally

There is no build step. Serve the `site` folder with anything:

```bash
cd site
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Set `OFFLINE: true` in `config.js` and it
works entirely on its own, with no backend needed.

## Checking your work

```bash
node tools/boot-check.js     # every page starts up, with and without a server
node tools/check-mobile.js   # nothing is wider than a phone screen
node tools/check-design.js   # components that should match each other do
node tools/find-unused.js    # code and CSS nothing uses
```

Run these before committing anything that touches more than one file.

## Deploying

1. Any new `ALTER TABLE` lines go into Turso first.
2. Changed files in `backend/api/` go to Vercel.
3. Changed files in `site/` are just committed here.

Order matters less than it used to: the API copes with a database that has not
had its columns added yet, and falls back rather than failing.

## A note on what is public

**This repository holds no secrets, and that is deliberate.**

The Vercel address in `config.js` is not a secret. It cannot be one: the site is
served to browsers, so anyone can read it from the network tab whatever the
repository is set to. The same is true of every line of HTML, CSS and
JavaScript here.

What actually protects the data lives in Vercel's environment variables and is
never committed:

| Variable | What it protects |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Reaching the database at all |
| `SESSION_SECRET` | Signing student sign-in tokens |
| `TEACHER_KEY` | The teacher console |
| `ALLOWED_ORIGIN` | Which site may call the API |

Passwords are never stored. They are hashed with PBKDF2-HMAC-SHA256, 100,000
iterations, with a random 16-byte salt per student.

## Licence

Written for one school. No licence is offered, and none of it is supported for
use elsewhere.
