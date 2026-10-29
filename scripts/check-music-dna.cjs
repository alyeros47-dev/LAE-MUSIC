"use strict";
// Load the same validated registry as the existing studio; never print research references.
const c = require("../lib/music-dna").catalogue();
console.log(
  JSON.stringify({
    music_dna_status: c.status,
    revision: c.revision,
    approved_departments: c.departments.length,
    research_groups: c.departments.reduce((n, x) => n + x.research_groups, 0),
    published_categories: c.categories.length,
    published_styles: c.styles.length,
  }),
);
