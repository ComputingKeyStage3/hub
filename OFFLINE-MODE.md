# Running without a server

The site can run entirely from GitHub Pages, with no Vercel and no Turso. Use
this if IT need to look at those services before they are allowed, or if they
are not allowed at all.

## Switching over

Open **`site/config.js`** on GitHub and change one word:

```js
window.HUB = {
  OFFLINE: true,        // was false
  ...
};
```

Commit. Within a minute or so every page is running without a server. Switching
back is the same change in reverse.

There is nothing else to do. No page has to be redeployed, and nothing in the
database is touched — if you switch back later, everything is still there.

## What changes

| | With a server | Without |
|---|---|---|
| Lessons | Files **and** the lesson builder | Files in `lessons/` only |
| Signing in | Username and password | Students type their name |
| Saved work | Their browser, then the database | Their browser only |
| Handing in | Sent to you automatically | They save a PDF |
| Classes and marking | Yes | No |
| Teacher console | Yes | No — the lesson builder still works |
| Assessments | Marked, with feedback | Marked on screen, PDF handed in |
| Task locking | You release tasks as you go | Every task is open |

Every page shows a band across the top saying the site is running without a
server, so nobody has to guess.

## What students see

They open the site and type their name — there is no password, because there
is nobody to check it against. The name only tells work apart if two students
share a computer.

They work exactly as normal. Everything saves as they type, in that browser.
When they finish, the button says **Save my work as a PDF**, which opens the
printable view: from there, "Save as PDF" in the print dialogue.

**Tell them the two things that matter:**

1. Work is saved in that browser, on that computer. A different computer will
   not have it.
2. Nothing reaches you until they hand in the PDF.

## Putting lessons on the site

The lesson builder still works. Build the lesson as usual, then press **Save to
the site** — it downloads a `.json` file and shows you what to do with it.

1. Put the file in `site/lessons/`.
2. Open `site/lessons/index.json` and add the lesson to the right unit. The
   builder shows you the exact lines to paste.
3. Commit.

`index.json` looks like this:

```json
{
  "units": [
    {
      "name": "8.1 Programming",
      "lessons": [
        { "id": "loops", "title": "Loops", "description": "Repeating things" },
        { "id": "py-test", "title": "End of unit test", "assessment": true },
        { "id": "py-hw", "title": "Practice at home", "homework": true }
      ]
    }
  ]
}
```

`assessment` and `homework` are optional — leave them out for an ordinary
lesson. The `id` must match the filename without `.json`.

Everything listed is available to every student, since there are no classes
without a database.

## Going back to normal

Set `OFFLINE` back to `false` and commit.

Anything in the database is exactly as it was. Lessons added to the `lessons`
folder in the meantime stay where they are and keep working — file-based
lessons work in both modes. They will need publishing to classes again, since
that information lives in the database.

**Work done while offline does not move across.** It is in each student's
browser and the PDFs they handed in. If that matters, collect the PDFs before
switching back.

## If you are asked what the site does

Running without a server, the site:

- makes no network requests to anything except GitHub Pages itself,
- stores nothing outside the browser it is used in,
- collects no personal information — students type a first name, which never
  leaves their own computer,
- has no login, no accounts and no database.

With the server, it uses Vercel (which runs the code) and Turso (which stores
names, usernames, hashed passwords and saved work). Passwords are stored as a
PBKDF2 hash with a per-student salt, never as text.
