'use strict';
const {fail}=require('./transactions');
const countryData=require('../data/country-currencies.json').countries;
const currencies=new Set(['USD',...Object.values(countryData).flat()]);
const digits=new Map();
function currencyCode(value){if(typeof value!=='string'||!currencies.has(value))throw fail(400,'Choose a supported currency code.');return value;}
function fractionDigits(currency){currencyCode(currency);if(!digits.has(currency))digits.set(currency,new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits);return digits.get(currency);}
function decimal(value){
 const s=String(value);if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/i.test(s))throw fail(400,'Invalid decimal amount.');
 const [base,exponent='0']=s.toLowerCase().split('e'),[whole,frac='']=base.split('.');const exp=Number(exponent);if(Math.abs(exp)>20||frac.length>20||whole.length>20)throw fail(400,'Decimal amount is out of range.');
 let numerator=BigInt(whole+frac),scale=frac.length-exp;if(scale<0){numerator*=10n**BigInt(-scale);scale=0;}return {numerator,denominator:10n**BigInt(scale)};
}
function safeInteger(n){if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw fail(400,'Amount is out of range.');return Number(n);}
function convertUsd(usdMinor,rate,currency){
 if(!Number.isSafeInteger(usdMinor)||usdMinor<0||usdMinor>100000000)throw fail(400,'Invalid USD amount.');
 const r=decimal(rate);if(r.numerator<=0n)throw fail(400,'Invalid exchange rate.');const denominator=100n*r.denominator,numerator=BigInt(usdMinor)*r.numerator*10n**BigInt(fractionDigits(currency));return safeInteger((numerator+denominator/2n)/denominator);
}
function majorToMinor(value,currency){const r=decimal(value),n=r.numerator*10n**BigInt(fractionDigits(currency));if(n%r.denominator!==0n)throw fail(400,'Amount has unsupported currency fractions.');return safeInteger(n/r.denominator);}
function minorToMajor(value,currency){if(!Number.isSafeInteger(value)||value<0)throw fail(400,'Invalid minor-unit amount.');const d=fractionDigits(currency),s=String(value).padStart(d+1,'0');return d?s.slice(0,-d)+'.'+s.slice(-d):s;}
function format(value,currency,locale='en'){return new Intl.NumberFormat(locale,{style:'currency',currency,currencyDisplay:'code'}).format(value/10**fractionDigits(currency));}
function options(){const names=new Intl.DisplayNames(['en'],{type:'region'}),moneyNames=new Intl.DisplayNames(['en'],{type:'currency'});return {base_currency:'USD',countries:Object.entries(countryData).map(([code,list])=>({code,name:names.of(code)||code,currency:list[0]||null,currencies:list})).sort((a,b)=>a.name.localeCompare(b.name)),currencies:[...currencies].sort().map(code=>({code,name:moneyNames.of(code)||code,fraction_digits:fractionDigits(code)}))};}
function selectCurrency(country,currency){if(country!==undefined&&country!==null&&country!==''&&!Object.hasOwn(countryData,country))throw fail(400,'Choose a valid country code.');return currency?currencyCode(currency):countryData[country]?.[0]||'USD';}
module.exports={currencyCode,fractionDigits,decimal,convertUsd,majorToMinor,minorToMajor,format,options,selectCurrency};
