'use strict';
// These multi-page fixtures verify completed customer steps. In particular,
// WebKit must finish routed pricing/plan requests before the fixture deliberately
// unloads their document. Keep pageerror collection and all assertions intact.
function settledNavigation(page){
 const settle=()=>page.waitForLoadState('networkidle');
 return {
  async goto(url){await settle();await page.goto(url);await settle();},
  async reload(){await settle();await page.reload();await settle();},
  async click(locator){await settle();await locator.click();await settle();},
 };
}
module.exports={settledNavigation};
