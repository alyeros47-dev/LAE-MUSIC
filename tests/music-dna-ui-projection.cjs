'use strict';
// Existing musical-group contracts inspect the stage-3 selector from each independent
// group view. This is an aggregate of separate views, never a 215-option customer list.
exports.allViews=(ui,catalogue,escape)=>catalogue.categories.map(group=>{
 const html=ui.musicDNAControls(catalogue,escape,{departmentId:group.department_id,categoryId:group.id});
 const match=html.match(/<select name="musicDnaStyle"[^>]*>([\s\S]*?)<\/select>/);
 return match?match[0]:'';
}).join('');
