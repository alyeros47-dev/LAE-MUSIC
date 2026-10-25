'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const storage=new AsyncLocalStorage();
module.exports={run:(value,action)=>storage.run(value,action),get:()=>storage.getStore()};
