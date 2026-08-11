/**
 * CLASS_OPTIONS
 * ================================================================
 * Single source of truth for the classes shown during profile setup
 * and the senior hourly class picker.
 *
 * Every class has:
 *   name:       the class name saved on student profiles/tracking
 *   yearLevels: every year level allowed to select that class
 *
 * To create another combined class, duplicate the Senior Dance row
 * and change its name/yearLevels. For example:
 *
 *   { name: "Senior Drama", yearLevels: [11, 12, 13] }
 *
 * A student's own year level is still stored separately on their
 * profile, so a combined class can be filtered by year in reporting.
 * ================================================================
 */
window.CLASS_OPTIONS = [
    { name: "9 Tānekaha", yearLevels: [9] },
  { name: "9 Matai", yearLevels: [9] },
  { name: "9 Kauri", yearLevels: [9] },
  { name: "9 Rimu", yearLevels: [9] },
  { name: "9 Kanuka", yearLevels: [9] },
  { name: "9 Kōwhai", yearLevels: [9] },
  { name: "9 Rātā", yearLevels: [9] },
  { name: "9 Nīkau", yearLevels: [9] },
  { name: "9 Manuka", yearLevels: [9] },
  { name: "9 Kahikatea", yearLevels: [9] },
  { name: "9 Maire", yearLevels: [9] },


  { name: "10 Tānekaha", yearLevels: [10] },
  { name: "10 Matai", yearLevels: [10] },
  { name: "10 Kauri", yearLevels: [10] },
  { name: "10 Rimu", yearLevels: [10] },
  { name: "10 Kanuka", yearLevels: [10] },
  { name: "10 Kōwhai", yearLevels: [10] },
  { name: "10 Rātā", yearLevels: [10] },
  { name: "10 Nīkau", yearLevels: [10] },
  { name: "10 Manuka", yearLevels: [10] },
  { name: "10 Kahikatea", yearLevels: [10] },
  { name: "10 Maire", yearLevels: [10] },

  { name: "11 Science", yearLevels: [11] },
   { name: "11 Supported Science", yearLevels: [11] },
  { name: "11 English", yearLevels: [11] },
  { name: "11 Maths", yearLevels: [11] },

  { name: "12 Biology", yearLevels: [12] },
  { name: "12 Chemistry", yearLevels: [12] },
  { name: "12 Physics", yearLevels: [12] },
  { name: "12 English", yearLevels: [12] },
  { name: "12 Maths", yearLevels: [12] },

  { name: "13 Biology", yearLevels: [13] },
  { name: "13 Chemistry", yearLevels: [13] },
  { name: "13 Physics", yearLevels: [13] },
  { name: "13 English", yearLevels: [13] },
  { name: "13 Maths", yearLevels: [13] },

  // Combined class template: this same option appears for Years 11, 12 and 13.
  { name: "Senior Dance", yearLevels: [11, 12, 13] },
  { name: "Teacher", yearLevels: [11, 12, 13, 9, 10] }
];

window.getClassOptionsForYear = function getClassOptionsForYear(yearLevel) {
  const year = Number(yearLevel);
  if (!Number.isInteger(year)) return [];

  return window.CLASS_OPTIONS
    .filter(classOption => Array.isArray(classOption.yearLevels)
      && classOption.yearLevels.map(Number).includes(year))
    .map(classOption => classOption.name)
    .filter(className => typeof className === "string" && className.trim());
};
