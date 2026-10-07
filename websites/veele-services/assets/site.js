(() => {
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');let paused=reduced.matches;const animations=[];
const menu=$('.menu-button'),navigation=$('#navigation');
function closeMenu(){menu?.setAttribute('aria-expanded','false');menu?.setAttribute('aria-label','Menu openen');navigation?.classList.remove('is-open');}
menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Menu sluiten':'Menu openen');navigation.classList.toggle('is-open',open);});
navigation?.addEventListener('click',e=>{if(e.target.closest('a'))closeMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu?.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
addEventListener('resize',()=>{if(innerWidth>960)closeMenu();});
const pausedSliders=new WeakSet();
function widgetMotion(){
 $$('.ti-widget').forEach(widget=>{
  const slider=widget.TrustindexSliderWidget;if(!slider)return;
  if(paused&&slider.autoPlayInterval!==undefined){clearInterval(slider.autoPlayInterval);delete slider.autoPlayInterval;pausedSliders.add(slider);widget.dataset.websiteMotionPaused='true';}
  else if(!paused&&pausedSliders.has(slider)){pausedSliders.delete(slider);delete widget.dataset.websiteMotionPaused;if(typeof slider.setAutoplay==='function'&&slider.autoPlayTimeout)slider.setAutoplay();}
 });
}
let widgetCheck;
new MutationObserver(()=>{widgetMotion();clearTimeout(widgetCheck);widgetCheck=setTimeout(widgetMotion,1000);}).observe(document.body,{childList:true,subtree:true});
function motionState(){document.documentElement.classList.toggle('motion-paused',paused);const toggle=$('.motion-toggle');if(toggle){toggle.textContent=paused?'Beweging inschakelen':'Beweging pauzeren';toggle.setAttribute('aria-pressed',String(paused));}if(paused){animations.forEach(a=>{try{a.finish();}catch{a.cancel();}});$$('[data-parallax]').forEach(el=>el.style.removeProperty('translate'));}widgetMotion();}
$('.motion-toggle')?.addEventListener('click',()=>{paused=!paused;motionState();});reduced.addEventListener('change',e=>{paused=e.matches;motionState();});motionState();
function animate(element,frames,options){if(paused||!element.animate)return;const a=element.animate(frames,{duration:750,easing:'cubic-bezier(.2,.8,.2,1)',...options});animations.push(a);a.addEventListener('finish',()=>{const i=animations.indexOf(a);if(i>=0)animations.splice(i,1);},{once:true});}
// Progressive motion: every heading and link is visible without JavaScript.
if('IntersectionObserver' in window){
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(!entry.isIntersecting)return;
  observer.unobserve(entry.target);entry.target.classList.add('is-seen');
  const photo=entry.target.matches('.family-photo,.frame-photo,.documentary-photo,.page-heading-photo');
  const card=entry.target.matches('.expertise-card,.planning-item');
  const siblings=card?[...entry.target.parentElement.children]:[];
  const delay=card?Math.min(siblings.indexOf(entry.target)%3*75,150):0;
  animate(entry.target,photo?
   [{clipPath:'inset(0 0 12% 0)',opacity:.55,translate:'0 20px'},{clipPath:'inset(0)',opacity:1,translate:'0 0'}]:
   [{opacity:.2,translate:'0 25px'},{opacity:1,translate:'0 0'}],{duration:photo?1050:800,delay});
 }),{threshold:.1});
 $$('.section-heading,.editorial-heading,.family-heading,.family-photo,.frame-photo,.documentary-photo,.page-heading-photo,.process-steps article,.contexts>a,.review-attribution,.expertise-card,.planning-item,.reading-content>h2').forEach(e=>observer.observe(e));
}
$$('.hero h1,.page-heading h1').forEach(e=>animate(e,[{clipPath:'inset(0 0 15% 0)',opacity:.1,translate:'0 24px'},{clipPath:'inset(0)',opacity:1,translate:'0 0'}],{duration:950,delay:50}));
$$('.hero-intro,.frame-stamp').forEach((e,i)=>animate(e,[{opacity:0,translate:'0 16px'},{opacity:1,translate:'0 0'}],{duration:950,delay:120+i*100}));
const header=$('.site-header'),progress=$('.scroll-meter'),depths=$$('[data-depth]'),parallax=$$('[data-parallax]');
let scheduled=false;
function scroll(){
 scheduled=false;const full=document.documentElement.scrollHeight-innerHeight;
 progress?.style.setProperty('transform',`scaleX(${full>0?scrollY/full:0})`);
 header?.classList.toggle('is-scrolled',scrollY>20);
 if(paused)return;
 depths.forEach(e=>e.style.translate=`0 ${Math.min(23,scrollY*Number(e.dataset.depth))}px`);
 if(innerWidth>960)parallax.forEach(e=>{
  const r=e.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;
  e.style.translate=`0 ${Math.max(-16,Math.min(16,scrollY*Number(e.dataset.parallax)))}px`;
 });
}
addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(scroll);}},{passive:true});
addEventListener('resize',()=>{if(innerWidth<=960)parallax.forEach(e=>e.style.removeProperty('translate'));scroll();});scroll();
$$('[data-glow]').forEach(card=>{
 card.addEventListener('pointermove',event=>{if(paused||event.pointerType!=='mouse')return;const r=card.getBoundingClientRect();card.style.setProperty('--px',`${event.clientX-r.left}px`);card.style.setProperty('--py',`${event.clientY-r.top}px`);});
});
document.addEventListener('click',e=>{if(!e.target.closest('.site-header'))closeMenu();});
function selectGate(index){const selected=$(`[data-gate-panel="${index}"]`);if(!selected)return;$$('[data-gate-panel]').forEach(p=>{const active=p===selected;p.classList.toggle('is-active',active);$('.gate-toggle',p).setAttribute('aria-expanded',String(active));$('.gate-content',p).inert=!active;});}
$$('[data-gate]').forEach((button,index,buttons)=>{button.addEventListener('click',()=>selectGate(button.dataset.gate));button.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+buttons.length)%buttons.length;selectGate(buttons[next].dataset.gate);buttons[next].focus();});});
$$('[data-tilt]').forEach(card=>{card.addEventListener('pointermove',event=>{if(paused||event.pointerType!=='mouse'||innerWidth<960)return;const r=card.getBoundingClientRect(),x=(event.clientX-r.left)/r.width-.5,y=(event.clientY-r.top)/r.height-.5;card.style.transform=`rotateX(${-y*4}deg) rotateY(${x*5}deg) translateY(-3px)`;});card.addEventListener('pointerleave',()=>card.style.transform='');});
const citySearch=$('#city-search');citySearch?.addEventListener('input',()=>{const q=citySearch.value.toLocaleLowerCase('nl').trim();let matches=0;$$('[data-city]').forEach(a=>{const match=a.dataset.city.toLocaleLowerCase('nl').includes(q);a.hidden=!match;if(match)matches++;});$('#city-result').textContent=matches?`${matches} ${matches===1?'plaats':'plaatsen'} gevonden. Kies uw plaats voor informatie en mogelijkheden.`:'Uw plaats staat er niet bij. Bespreek uw locatie via de aanvraaghulp.';});
// Agent actions stage the same visible flow; this tool does not submit anything.
if(!$('#request-form')&&document.modelContext?.registerTool){const lifecycle=new AbortController();addEventListener('pagehide',()=>lifecycle.abort(),{once:true});try{Promise.resolve(document.modelContext.registerTool({name:'start_service_inquiry',title:'Start een Veele-aanvraag',description:'Open de aanvraagwizard met optionele diensten en plaats. Verstuurt niets.',inputSchema:{type:'object',properties:{services:{type:'array',items:{type:'string',enum:['schoonmaak','beveiliging','facilitair']},uniqueItems:true,maxItems:3},city:{type:'string',maxLength:100}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['services','city'].includes(k)))throw new Error('Ongeldige aanvraag');if(input.services!==undefined&&(!Array.isArray(input.services)||input.services.some(s=>!['schoonmaak','beveiliging','facilitair'].includes(s))||input.services.length>3))throw new Error('Onbekende dienst');if(input.city!==undefined&&(typeof input.city!=='string'||input.city.length>100))throw new Error('Ongeldige plaats');const q=new URLSearchParams();if(input.services?.length)q.set('dienst',[...new Set(input.services)].join(','));if(input.city)q.set('plaats',input.city);const url='/aanvragen/?'+q.toString();location.assign(url);return{status:'opening',url,submitted:false};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
})();
