'use strict';
const config=require('../config/publishing-policy.json');
const {fail}=require('./transactions');
function controlled(){return config.generation_record_required===true;}
function requireCode(code,{externalAllowed=false}={}){if(controlled()&&!externalAllowed&&!String(code||'').trim())throw fail(403,config.publishing_notice+' Use the code from your completed Studio song.');}
function requireGeneration(){throw fail(403,'A valid completed LAE-MUSIC Studio generation linked to your account is required. Use an account-linked external upload code and an active external upload package for recordings made elsewhere.');}
function packages(){return Object.fromEntries(Object.entries(require('./plans')).map(([id,p])=>[id,{name:config.package_names[id],usd:p.usd,directReferralPercent:require('./commerce').quote('artist_subscription',id).direct_referral_percent,externalUploadLimit:0,studioGenerations:p.studioGenerations,uploads:p.uploads,tracksPerGeneration:2,additionalGenerationPrice:require('./membership-terms').additionalPrice(id),allowancesStatus:'annual_memberships'}]));}
function disclosure(){return {...config,packages:packages()};}
module.exports={controlled,requireCode,requireGeneration,packages,disclosure};
