'use strict';
const config=require('../config/publishing-policy.json');
const {fail}=require('./transactions');
function controlled(){return config.external_uploads_enabled===false;}
function requireCode(code){if(controlled()&&!String(code||'').trim())throw fail(403,config.publishing_notice+' Use the code from your completed Studio song.');}
function requireGeneration(){throw fail(403,'A valid completed LAE-MUSIC Studio generation linked to your account is required. External music uploads are temporarily suspended.');}
function packages(){return Object.fromEntries(Object.entries(require('./plans')).map(([id,p])=>[id,{name:config.package_names[id],usd:p.usd,directReferralPercent:p.directReferralPercent,externalUploadLimit:0,studioGenerations:p.studioGenerations,uploads:p.uploads,tracksPerGeneration:2,additionalGenerationPrice:require('./membership-terms').additionalPrice(id),allowancesStatus:'annual_memberships'}]));}
function disclosure(){return {...config,packages:packages()};}
module.exports={controlled,requireCode,requireGeneration,packages,disclosure};
