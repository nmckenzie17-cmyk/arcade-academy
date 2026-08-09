/**
 * CLASS_OPTIONS
 * ================================================================
 * Single source of truth for the classes students can pick from on
 * the profile setup screen, grouped by year level.
 *
 * This is the ONLY place class names live — app.js just reads from
 * this list to build the Class dropdown, so adding, renaming, or
 * removing a class is a one-line edit here and needs no changes to
 * the profile setup logic itself.
 *
 * Years 9 and 10 use tree-based class names (e.g. "9 Tanekaha").
 * Years 11-13 use subject-based class names (e.g. "12 Chemistry").
 *
 * If a year level has an empty array (or is missing entirely), the
 * Class dropdown will show a single disabled "No classes configured"
 * option instead of failing.
 * ================================================================
 */
window.CLASS_OPTIONS = {

  9: [
    "9 Tanekaha",
    "9 Matai",
    "9 Kauri",
    "9 Rimu"
  ],

  10: [
    "10 Tanekaha",
    "10 Matai",
    "10 Kauri",
    "10 Rimu"
  ],

  11: [
    "11 Science",
    "11 English",
    "11 Maths"
  ],

  12: [
    "12 Biology",
    "12 Chemistry",
    "12 Physics",
    "12 English",
    "12 Maths"
  ],

  13: [
    "13 Biology",
    "13 Chemistry",
    "13 Physics",
    "13 English",
    "13 Maths"
  ]

};
