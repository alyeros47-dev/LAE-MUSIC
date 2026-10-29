"use strict";
// Load the same validated registry as the existing studio; never print research references.
const c = require("../lib/music-dna").catalogue();
console.log(
  JSON.stringify({
    music_dna_status: c.status,
    revision: c.revision,
    approved_departments: c.departments.length,
    expected_research_groups: c.coverage.expected_research_groups,
    supplied_research_groups: c.coverage.supplied_research_groups,
    published_categories: c.categories.length,
    published_styles: c.styles.length,
  }),
);
