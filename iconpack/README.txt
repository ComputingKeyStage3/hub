icons.json holds 1,992 icons from IconPark 1.4.2 by ByteDance.
https://github.com/bytedance/IconPark  Licence: Apache 2.0 (LICENSE.txt).

Taken from the npm packages @iconify-json/icon-park 1.2.4 and
@icon-park/svg 1.4.2. Changed from the originals: about 670 icons were left
out (other companies' logos, page layout controls, and anything that does
not belong in a school), and coordinates were rounded to two decimal places.
The two blues are swapped for other colours when an icon is drawn.

Shape: { pack, size, cats: [names], icons: { name: [category number, svg] } }
Read by ../iconpack.js, and fetched only when a page first wants an icon.
