# Backups, and clearing out at the end of the year

Both live behind the **floppy disk button** in the top bar of the teacher
console.

---

## The weekly backup

Press **Download a backup**. You get one file — `computing-hub-backup-2026-08-21.json`
— holding every row of every table: students, work, results, lessons, units,
classes, seating plans, the lot.

Keep it somewhere that is not the school network's only copy. OneDrive, or a
folder on your own machine that syncs. A backup stored only in the place that
might fail is not a backup.

The button shows an amber dot once a week has passed since the last one, and
the screen tells you how long it has been. That is the only nudge — it never
gets in your way.

**This is a read-only operation.** Taking a backup changes nothing, so there is
no risk in pressing it whenever you are unsure.

### Putting one back

Only if something has gone badly wrong. The steps are written inside every
backup file as well, so they cannot be lost.

1. Make an empty database and run `DATABASE-SETUP.sql` on it to create the
   tables.
2. Put each row back with `INSERT OR REPLACE INTO <table> ...`.

`OR REPLACE` matters: the setup file seeds three rows into `teachers`, and a
plain `INSERT` collides with them. Restore into an **empty** database, not on
top of a working one.

If you would rather not do that by hand, send me the file and say what happened.

---

## End of year

Two buttons, in order. The second stays greyed out until the first has been
done, so work cannot be deleted before it has been saved.

### 1. Save it to a file

Pick a date — it defaults to 31 August of the school year just finished — and
press **Save it to a file**. You get everything saved before that date, with
each student's name, username and class attached to their work, so it is
readable on its own in years to come.

**Open the file before going on.** Check it is not empty and looks like what you
expect.

### 2. Remove it from the database

Tick any classes that have left the school — their students, work and seating
plans go too. Leave them all unticked to keep every student and remove only old
work.

You then have to type `DELETE` to confirm. Nothing happens otherwise.

**What is kept:** every lesson, unit and year group. Those are next year's
teaching and are never touched. Classes you did not tick keep their students.

**What goes:** work and results saved before your date, and the whole of any
class you ticked.

This cannot be undone, which is why the export comes first.

---

## Keeping an eye on space

**Check** on the same screen shows how much of the 5GB is used and which lessons
account for most of it.

It will nearly always be screenshot tasks. A pasted screenshot can be over a
megabyte where a whole lesson of typed answers is a few kilobytes. If one lesson
dominates the list, that is why — and if space ever gets tight, that is the
lesson to change rather than deleting more work.

Roughly 810 students a year against 5GB total means the end-of-year clear-out is
what keeps you inside it. Once a year, in the summer holiday, is enough.
