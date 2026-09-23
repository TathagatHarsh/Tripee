import 'dotenv/config';
import { chromium } from 'playwright';
import { db } from '../lib/db';
const cake = await db.cakeProduct.findFirstOrThrow({ include: { variants: true } });
const browser = await chromium.launch();
try {
for (const mode of ['map', 'current-success', 'denied', 'timeout', 'unavailable', 'unsupported', 'api-failure']) {
 const page = await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror', e => console.log('Browser error:', e.message));
 await page.addInitScript(({slug,id,mode})=>{
  localStorage.setItem('makemycake.cart',JSON.stringify({state:{lines:[{id:'qa',slug,variantId:id,qty:1,choices:{delivery:'standard',pincode:'500081'}}]},version:0}));
  Object.defineProperty(navigator,'geolocation',{value:mode==='unsupported'?undefined:{getCurrentPosition(success:(p:unknown)=>void,error:(e:unknown)=>void){if(mode==='current-success')return success({coords:{latitude:17.44,longitude:78.39}});error({code: mode==='denied'?1:mode==='timeout'?3:2});}}});
 },{slug:cake.slug,id:cake.variants[0].id,mode});
 await page.route('**/api/orders',r=>r.abort());
 await page.route('https://maps.googleapis.com/**',async route=>{
  if(mode==='api-failure') return route.abort();
  await route.fulfill({contentType:'application/javascript',body:`
    class PlaceAutocomplete extends HTMLElement { constructor(){ super(); const b=document.createElement('button'); b.type='button'; b.textContent='QA Hyderabad suggestion'; b.onclick=()=>{const e=new Event('gmp-select');e.placePrediction={toPlace:()=>({location:{lat:()=>17.44,lng:()=>78.39},fetchFields:async()=>{}})};this.dispatchEvent(e);};this.append(b);}}
    customElements.define('qa-place-autocomplete', PlaceAutocomplete);
    window.google={maps:{}};
    window.google.maps.places={PlaceAutocompleteElement:PlaceAutocomplete};
    window.google.maps.Map=class{constructor(node){node.textContent='QA map';}panTo(){}addListener(){return {remove(){}}}};
    window.google.maps.marker={AdvancedMarkerElement:class{constructor(o){Object.assign(this,o)}addListener(){return{remove(){}}}}};
    window.google.maps.Geocoder=class{async geocode(){return{results:[{formatted_address:'Madhapur, Hyderabad, Telangana 500081, India',place_id:'qa',geometry:{location:{lat:()=>17.44,lng:()=>78.39}},address_components:[{long_name:'India',types:['country']},{long_name:'Hyderabad',types:['locality']},{long_name:'Telangana',types:['administrative_area_level_1']},{long_name:'500081',types:['postal_code']}]}]}}};window.mmcMapsReady();
  `});
 });
 await page.goto(`${process.env.QA_BASE_URL ?? 'http://localhost:3117'}/checkout`);
 if(mode==='map' || mode==='current-success') {
   if(mode==='map') {await page.getByRole('button',{name:'Search delivery location'}).click();
   await page.getByRole('button',{name:'QA Hyderabad suggestion'}).click();} else await page.getByRole('button',{name:'Use my current location'}).click();
   await page.getByRole('button',{name:'Confirm this location'}).click();
   if(await page.getByLabel('Pincode',{exact:true}).inputValue()!=='500081')throw Error('pincode not filled');
   await page.waitForFunction(expected => JSON.parse(sessionStorage.getItem('makemycake.checkoutDraft.v2') ?? '{}').source === expected, mode === 'map' ? 'map' : 'current_location');
 } else {
   await page.getByRole('button',{name:'Use my current location'}).click();
   const message=mode==='denied'?'Location permission denied':mode==='timeout'?'Location request timed out':mode==='unsupported'?"Your browser doesn't support location":mode==='api-failure'?"The map couldn't load":'Your location is unavailable';
   await page.getByRole('alert').filter({hasText:message}).waitFor();
   await page.getByRole('button',{name:'Enter address manually'}).click();
   await page.getByLabel('Flat / House / Building').fill('12 Manual Street');
 }
 console.log(`${mode}: passed`); await page.close();
}
} finally {await browser.close();await db.$disconnect();}
