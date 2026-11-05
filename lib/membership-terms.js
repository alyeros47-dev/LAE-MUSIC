'use strict';
// Existing extra-generation prices remain effective until the proposal is approved.
const config=require('../config/artist-membership.json');
function terms(plan){const t=config.plans[plan];if(!t)throw Error('Unknown membership plan');return {included_generations:t.generations,publish_track_limit:t.tracks,revision:config.revision};}
function allowance(subscription){return {generations:subscription.included_generations??terms(subscription.plan).included_generations,tracks:subscription.publish_track_limit??terms(subscription.plan).publish_track_limit};}
function additionalPrice(plan){const p=config.additional_generation_prices;if(!Object.hasOwn(p.usd,plan))throw Error('Unknown membership plan');const proposed=p.usd[plan];if(!Number.isFinite(proposed)||!Number.isSafeInteger(Math.round(proposed*100))||Math.round(proposed*100)<1||Math.abs(proposed*100-Math.round(proposed*100))>0.000001)throw Error('Invalid additional generation price');return {approved:p.approved===true,proposed_usd:proposed,effective_usd:p.approved===true?proposed:require('./plans')[plan].additionalGenerationUsd};}
module.exports={terms,allowance,additionalPrice};
