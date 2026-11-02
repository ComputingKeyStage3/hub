/* ---------------------------------------------------------------------
   The order a list of lessons is shown in.

   A lesson's id is a slug of whatever it was called when it was first
   saved, and renaming it afterwards changes the title and not the id. So
   "9.1.1 - Python Essentials", written before it was numbered, is still
   python-essentials, while "9.1.2 - while loops" is 9-1-2-while-loops.
   Every list fell back to id order, which put 9.1.2 above 9.1.1 on the
   class's lessons, in the hub and on the student's home page.

   Lists therefore go in the order of the title a teacher actually reads,
   and the numbers in it are read as numbers: 9.1.10 comes after 9.1.9
   rather than between 9.1.1 and 9.1.2.

   Units go the same way, by name. They used to go by the position column
   first, and a unit made by saving a lesson into it is written with
   position 0, so the new 9.2 Animation & Modelling went in front of 9.1,
   which had been given 1. The order is now always the names, read as
   numbers where they are numbers, and position is not asked at all, for
   units or for lessons: an order dragged into place is a second order to
   keep right, and the numbers in the names already say what it should be.
   --------------------------------------------------------------------- */
(function(){
  "use strict";

  /* Made once, because a comparison is done for every pair in every list.
     The fallback is for a browser with no Intl, where plain text order is
     at least the same order every time. */
  var collator = null;
  function compareText(a, b){
    if (!collator){
      try{ collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }); }
      catch(e){ collator = { compare: function(x, y){ return x < y ? -1 : x > y ? 1 : 0; } }; }
    }
    return collator.compare(a, b);
  }

  /* A lesson row is shaped differently in each place it comes from: the
     catalogue calls it lesson_id, the lessons folder calls it id, and a
     row that never had a title falls back to whichever it has. */
  function titleOf(l){
    return String((l && (l.title || l.lesson_id || l.id)) || "");
  }

  window.lessonOrder = {
    /* The same numbers-as-numbers comparison, for the headings a list of
       lessons is grouped under. A unit's sub-points are 2.2.1, 2.2.2 and
       2.2.10, and sorted as plain text the last of those comes second. */
    compareText: compareText,
    /* titleFor is for the console, where the title on screen comes from
       its own list of lessons rather than from the row being sorted. */
    compare: function(a, b, titleFor){
      var name = titleFor || titleOf;
      return compareText(name(a), name(b));
    },
    sort: function(list, titleFor){
      return (list || []).sort(function(a, b){
        return window.lessonOrder.compare(a, b, titleFor);
      });
    },
    /* In place, because every page keeps the catalogue's units list and
       reads its order straight off it for tiles, headings and pickers. */
    sortUnits: function(units){
      return (units || []).sort(function(a, b){
        return compareText(String((a && a.name) || ""), String((b && b.name) || ""));
      });
    }
  };
})();
