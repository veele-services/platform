#!/usr/bin/env python3
"""Generate the expanded Frame static pages without third-party dependencies."""
from pathlib import Path
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlencode
import re, json, sys, hashlib
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from content import SERVICES, AREAS, SURROUNDINGS
OUT=ROOT/'dist'; BASE=ROOT/'src/base'
ORIGIN='https://veele-website.invalid' # Replaced only by the verified tenant origin at runtime.
E=lambda s:escape(str(s),quote=True)
GROUPS={'schoonmaak':'Schoonmaak','beveiliging':'Beveiliging','facilitair':'Facilitaire diensten'}
PAGES={p.stem:p.read_text() for p in BASE.glob('*.html')}
HOME=PAGES['home']
BY_SLUG={s['slug']:s for s in SERVICES}
PLUS='<span class="plus" aria-hidden="true">+</span>'
TRUSTINDEX_BADGE='4f6ad4d83eab08614126603fe68'
TRUSTINDEX_REVIEWS='9cdda36832a8086095667221b29'
routes=[]
def trustindex_widget(widget_id,placement):
    # Keep the supplied embed at its actual display position; Trustindex owns
    # review content, attribution, ratings and carousel behavior.
    return f'<div class="trustindex-mount trustindex-{placement}"><script defer async src="https://cdn.trustindex.io/loader.js?{widget_id}"></script><noscript><p>Schakel JavaScript in om de Google-recensies te bekijken.</p></noscript></div>'
def review_section():
    return '<section class="section google-reviews-section" id="recensies" aria-labelledby="reviews-heading"><div class="shell"><div class="reviews-heading"><div class="eyebrow">Ervaringen met Veele</div><h2 id="reviews-heading">Wat onze klanten vertellen.</h2></div>'+trustindex_widget(TRUSTINDEX_REVIEWS,'reviews')+'</div></section>'
def footer_reviews():
    return '<div class="footer-reviews" aria-label="Google-beoordelingen van Veele Services"><div class="footer-reviews-copy"><span class="mini">Google-recensies</span><h3>Veele volgens onze klanten.</h3></div>'+trustindex_widget(TRUSTINDEX_BADGE,'badge')+'</div>'
def section(source,cls):
    return re.search(r'<section class="[^"]*\b'+re.escape(cls)+r'\b[^"]*"[^>]*>.*?</section>',source,re.S).group()
def replace_section(source,cls,value):
    return source.replace(section(source,cls),value,1)
def insert_before(source,cls,value):
    return source.replace(section(source,cls),value+section(source,cls),1)
def button(label,href,secondary=False):
    return f'<a class="button {"secondary" if secondary else ""}" href="{E(href)}"><span>{E(label)}</span></a>'
def inquiry(group=None,city=None):
    args={}
    if group:args['dienst']=group
    if city:args['plaats']=city
    return '/aanvragen/'+('?' + urlencode(args) if args else '')
def img(name,eager=False):
    found=re.search(r'<img [^>]*src="/assets/'+re.escape(name)+r'"[^>]*>',HOME+' '.join(PAGES.values()))
    if found:
        markup=found.group()
        markup=re.sub(r'loading="[^"]*"',f'loading="{"eager" if eager else "lazy"}"',markup)
        markup=re.sub(r' fetchpriority="[^"]*"','',markup)
        if eager:markup=markup.replace('<img ','<img fetchpriority="high" ',1)
        return markup
    return f'<img src="/assets/{E(name)}" alt="Veele Services in de praktijk" width="1200" height="900" loading="{"eager" if eager else "lazy"}" decoding="async">'
def heading(kicker,title,deck='',image=None,crumbs=None,actions=''):
    crumbs=crumbs or []
    bc='<a href="/">Home</a>'+''.join(f'<span aria-hidden="true">/</span><a href="{E(url)}">{E(label)}</a>' if url else f'<span aria-hidden="true">/</span><span aria-current="page">{E(label)}</span>' for label,url in crumbs)
    return f'<section class="page-heading"><div class="shell"><nav class="breadcrumb" aria-label="Broodkruimelpad">{bc}</nav><div class="eyebrow">{E(kicker)}</div><h1 class="long-title">{title}</h1>{f"<p class=\"lead\">{E(deck)}</p>" if deck else ""}{actions}</div>{f"<div class=\"page-heading-photo\">{img(image,True)}</div>" if image else ""}</section>'
def editorial(kicker,title,text):
    return f'<div class="editorial-heading"><div><div class="eyebrow">{E(kicker)}</div><h2>{title}</h2></div><p>{E(text)}</p></div>'
def service_card(s,index):
    return f'<a class="expertise-card" data-glow href="/{s["group"]}/{s["slug"]}/"><div class="expertise-meta"><span>{index:02d} / {E(GROUPS[s["group"]])}</span>{PLUS}</div><h3>{E(s["name"])}</h3><p>{E(s["short"])}</p><span class="card-cta">Meer over {E(s["name"].lower())}</span></a>'
def expertise(items,title='AANDACHT VOOR<br><span>ELK ONDERDEEL.</span>',kicker='Onze diensten, van dichtbij',deck='U hoeft nog niet precies te weten wat er nodig is. Bekijk de werkzaamheden per dienst en ontdek welke informatie helpt bij een gerichte aanvraag.',id='verdieping'):
    return f'<section class="section expertise-section" id="{id}"><div class="shell">{editorial(kicker,title,deck)}<div class="expertise-grid">'+''.join(service_card(s,i+1) for i,s in enumerate(items))+'</div></div></section>'
def faq(items,title='Goed om te weten.',kicker='Uw vragen, helder beantwoord'):
    return f'<section class="section faq-section"><div class="shell faq-grid"><div><div class="eyebrow">{E(kicker)}</div><h2>{E(title)}</h2></div><div class="faq-list">'+''.join(f'<details><summary>{E(q)}<span aria-hidden="true">+</span></summary><p>{E(a)}</p></details>' for q,a in items)+'</div></div></section>'
def planning(items,title='GOEDE AFSPRAKEN.<br><span>VÓÓR WE BEGINNEN.</span>'):
    return '<section class="section planning-section"><div class="shell">'+editorial('Van wens naar werkafspraak',title,'Een duidelijke aanvraag maakt het gesprek eenvoudiger. Deze punten helpen om de werkzaamheden, planning en verwachtingen op elkaar af te stemmen.')+'<div class="planning-grid">'+''.join(f'<article class="planning-item"><span>0{i+1}</span><h3>{E(h)}</h3><p>{E(p)}</p></article>' for i,(h,p) in enumerate(items))+'</div></div></section>'
def regional_browser():
    links=''.join(f'<a data-city="{E(a["name"])}" href="/werkgebied/{a["slug"]}/">{E(a["name"])} {PLUS}</a>' for a in AREAS)
    links+=''.join(f'<a data-city="{E(n)}" href="/werkgebied/#omgeving">{E(n)} {PLUS}</a>' for n,_ in SURROUNDINGS if n!='Overige Randstad')
    return '<section class="section region-section"><div class="shell region-grid"><div><div class="eyebrow">Den Haag & de regio</div><h2>HAAGS HART.<br><span>DICHTBIJ UW WERK.</span></h2><p>Schoonmaak, beveiliging en facilitaire ondersteuning vanuit Den Haag. Ontdek wat u voor uw locatie kunt bespreken en hoe u een gerichte aanvraag voorbereidt.</p><a class="text-link" href="/werkgebied/">Ontdek alle werkgebieden</a></div><div class="region-browser"><label for="city-search">Waar ligt uw locatie?</label><input id="city-search" type="search" placeholder="Bijvoorbeeld Delft of Rijswijk" autocomplete="off" aria-describedby="city-result"><div class="city-options">'+links+'</div><p class="city-result" id="city-result" role="status">Kies uw plaats voor informatie en mogelijkheden.</p><p class="local-note">Een locatie in de omgeving? We bespreken de mogelijkheden en planning per aanvraag.</p></div></div></section>'
def area_cards():
    cards=''.join(f'<a class="expertise-card region-card" href="/werkgebied/{a["slug"]}/"><div class="expertise-meta"><span>REGIO / 0{i+1}</span>{PLUS}</div><h3>{E(a["name"])}</h3><p>{E(a["focus"])}</p><span class="card-cta">Bekijk de mogelijkheden</span></a>' for i,a in enumerate(AREAS))
    return '<section class="section"><div class="shell">'+editorial('Van Den Haag tot de Randstad','UW PLAATS.<br><span>UW MOGELIJKHEDEN.</span>','Iedere locatie heeft eigen aandachtspunten. De regiopagina’s helpen u om uw werkzaamheden, ruimtes en gewenste planning concreet te maken.')+f'<div class="expertise-grid">{cards}</div></div></section>'
def surroundings():
    cards=''.join(f'<article class="expertise-card region-card"><span class="locality-tag">Mogelijkheden op aanvraag</span><h3>{E(n)}</h3><p>{E(t)}</p><a class="card-cta" href="{E(inquiry(city=n if n!="Overige Randstad" else None))}">Bespreek uw locatie</a></article>' for n,t in SURROUNDINGS)
    return '<section class="section expertise-section" id="omgeving"><div class="shell">'+editorial('Ook een locatie in de omgeving?','DICHT OM<br><span>DEN HAAG HEEN.</span>','Heeft u een locatie in Rijswijk, Leidschendam-Voorburg, Wassenaar, het Westland of Pijnacker-Nootdorp? Geef uw plaats en gewenste inzet door. We bespreken per aanvraag welke mogelijkheden en planning passen.')+f'<div class="expertise-grid">{cards}</div></div></section>'
def local_links():
    return '<div class="regional-links">'+''.join(f'<a href="/werkgebied/{a["slug"]}/">{E(a["name"])}</a>' for a in AREAS)+'<a href="/werkgebied/#omgeving">De omgeving van Den Haag</a></div>'
def aside(group=None,city=None):
    number='0624291576' if group=='schoonmaak' else '0634108400'
    display='06 24291576' if group=='schoonmaak' else '06 34108400'
    return f'<aside class="inquiry-aside"><span class="mini">Persoonlijk begint hier</span><h2>Vertel ons wat u nodig heeft.</h2><p>Kies uw dienst, omschrijf de locatie en geef uw wensen door. Nog niet alles bekend? Dat bespreken we samen.</p>{button("Stel uw aanvraag samen",inquiry(group,city))}<a href="tel:+31{number[1:]}">Bel {display}</a><a href="mailto:info@veeleservices.nl">info@veeleservices.nl</a><hr><p>Via het controlescherm stuurt u uw aanvraag rechtstreeks naar Veele Services. Uw inzet is pas definitief na bevestiging.</p></aside>'
def closing(group=None,city=None):
    s=section(HOME,'closing')
    s=s.replace('href="/aanvragen/"',f'href="{E(inquiry(group,city))}"')
    return s
def replace_main(source,body):
    return re.sub(r'<main id="main">.*?</main>',f'<main id="main">{body}</main>',source,flags=re.S)
def page_meta(source,path,title,desc,crumbs=None,service=None):
    canonical=ORIGIN+path
    source=re.sub(r'<title>.*?</title>',f'<title>{E(title)}</title>',source)
    source=re.sub(r'<link rel="canonical"[^>]*>',f'<link rel="canonical" href="{canonical}">',source)
    for k,v in [('description',desc),('og:title',title),('og:description',desc),('og:url',canonical),('twitter:title',title),('twitter:description',desc)]:
        source=re.sub(r'<meta (name|property)="'+k+r'" content="[^"]*">',lambda m:f'<meta {m.group(1)}="{k}" content="{E(v)}">',source)
    base_schema=json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>',HOME,re.S).group(1))
    base_schema.pop('@context',None);base_schema['@id']=ORIGIN+'/#organization';base_schema['url']=ORIGIN+'/';base_schema['logo']=ORIGIN+'/assets/veele-services-logo.png'
    graph=[base_schema,{'@type':'WebSite','@id':ORIGIN+'/#website','url':ORIGIN+'/','name':'Veele Services','inLanguage':'nl-NL'}, {'@type':'WebPage','@id':canonical+'#webpage','url':canonical,'name':title,'description':desc,'inLanguage':'nl-NL','isPartOf':{'@id':ORIGIN+'/#website'},'about':{'@id':ORIGIN+'/#organization'}}]
    if crumbs:
        graph.append({'@type':'BreadcrumbList','@id':canonical+'#breadcrumb','itemListElement':[{'@type':'ListItem','position':i+1,'name':name,'item':ORIGIN+url} for i,(name,url) in enumerate([('Home','/')]+crumbs)]})
    if service:graph.append({'@type':'Service','@id':canonical+'#service','name':service,'serviceType':service,'url':canonical,'description':desc,'provider':{'@id':ORIGIN+'/#organization'},'areaServed':[{'@type':'City','name':a['name']} for a in AREAS if a['slug']!='scheveningen']})
    # FAQ data is derived from the visible answers; never invent review/rating schema.
    qa=[]
    faq_source=section(source,'faq-section') if 'class="section faq-section"' in source else ''
    for d in re.findall(r'<details>(.*?)</details>',faq_source,re.S):
        q=re.search(r'<summary>(.*?)</summary>',d,re.S);a=re.search(r'<p>(.*?)</p>',d,re.S)
        if q and a:
            from html import unescape
            clean=lambda t:unescape(re.sub('<[^>]+>','',re.sub(r'<span aria-hidden="true">.*?</span>','',t))).strip()
            qa.append({'@type':'Question','name':clean(q.group(1)),'acceptedAnswer':{'@type':'Answer','text':clean(a.group(1))}})
    if qa:graph.append({'@type':'FAQPage','@id':canonical+'#faq','mainEntity':qa})
    source=re.sub(r'<script type="application/ld\+json">.*?</script>','',source,flags=re.S)
    source=source.replace('</head>','<script type="application/ld+json">'+json.dumps({'@context':'https://schema.org','@graph':graph},ensure_ascii=False).replace('</',r'<\/')+'</script></head>')
    return source
def common(source,path):
    css_version=hashlib.sha256(OUT.joinpath('assets/frame-premium.css').read_bytes()).hexdigest()[:10]
    source=source.replace('<link rel="stylesheet" href="/assets/site.css">','<link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/frame-premium.css?v='+css_version+'">')
    # Load the unchanged inquiry module only where the form actually exists.
    if path!='/aanvragen/':source=source.replace('<script type="module" src="/assets/request.js"></script>','')
    if 'proof-section' in source:source=replace_section(source,'proof-section',review_section())
    source=source.replace('id="navigation"','id="navigation"')
    for prefix in ['diensten','werkgebied','over-ons','contact']:
        source=re.sub(r'(<a href="/'+prefix+r'/")[^>]*>',lambda m:m.group(1)+(' aria-current="page"' if path=='/'+prefix+'/' else ' aria-current="true"' if path.startswith('/'+prefix+'/') else '')+'>',source,count=1)
    # A useful, crawlable service index in the footer.
    foot='<div class="footer-service-links">'+''.join('<div><h3>'+E(label)+'</h3>'+''.join(f'<a href="/{g}/{s["slug"]}/">{E(s["name"])}</a>' for s in SERVICES if s['group']==g)+'</div>' for g,label in GROUPS.items())+'</div>'
    source=source.replace('<div class="footer-word"',foot+footer_reviews()+'<div class="footer-word"',1)
    source=source.replace('<a href="/privacy/">Privacy</a>', '<a href="/privacy/">Privacy</a><a href="/login?next=%2Fklant">Klantportaal</a><a href="/login?next=%2Fstaff">Personeel</a><a href="/login?next=%2Fapp">Management</a>')
    return source
def write(path,source,title,desc,crumbs=None,service=None):
    source=common(page_meta(source,path,title,desc,crumbs,service),path)
    target=OUT/path.strip('/')/'index.html' if path!='/' else OUT/'index.html'
    target.parent.mkdir(parents=True,exist_ok=True);target.write_text(source)
    routes.append(path)

# Home: keep Frame's identity, original photography, family story and inquiry.
home=HOME
intro='<div class="hero-intro"><p>Schoonmaak, beveiliging en facilitaire ondersteuning in Den Haag en de Randstad. Een Haags familiebedrijf dat met u meedenkt over uw pand, uw mensen en uw dagelijkse praktijk.</p><div class="hero-actions">'+button('Bespreek uw aanvraag','/aanvragen/')+'<a class="text-link" href="/diensten/">Ontdek onze diensten</a></div></div>'
home=home.replace('<div class="frame-collage">',intro+'<div class="frame-collage">',1)
home=home.replace('<div class="frame-note"><p>Schoonmaak.<br>Beveiliging.<br>Facilitaire diensten.</p>','<div class="frame-note"><span class="mini">Sinds 2017 / Den Haag</span><p>Voor de plekken waar mensen werken, wonen en samenkomen. Met aandacht voor wat er op uw locatie nodig is.</p>',1)
home=home.replace('<figure class="frame-photo one">','<figure class="frame-photo one" data-parallax="0.035">').replace('<figure class="frame-photo two">','<figure class="frame-photo two" data-parallax="-0.025">')
band='<div class="frame-band"><div class="shell"><span><strong>3 disciplines.</strong> Eén gesprek.</span><span><strong>Sinds 2017.</strong> Een Haags familiebedrijf.</span><span><strong>Uw pand. Uw planning.</strong> Onze aandacht.</span></div></div>'
home=insert_before(home,'frame-services',band)
home=insert_before(home,'family-section',expertise([BY_SLUG[x] for x in ['kantoorschoonmaak','vve-schoonmaak','glasbewassing','objectbeveiliging','evenementenbeveiliging','evenementenondersteuning']]))
home=replace_section(home,'region-section',regional_browser())
home=home.replace('<div class="frame-service-list">','<p class="section-deck">Van een frisse werkplek tot een gastvrije ontvangst. Ontdek de werkzaamheden, mogelijkheden en aandachtspunten per dienst.</p><div class="frame-service-list">')
write('/',home,'Veele Services | Schoonmaak, beveiliging & facilitair','Veele Services: Haags familiebedrijf voor schoonmaak, beveiliging en facilitaire diensten. Ontdek ons werk in Den Haag, Delft en de Randstad.')

MAIN_FAQS={
 'schoonmaak':[('Welke schoonmaak past bij mijn locatie?','Dat begint bij het type pand en het dagelijks gebruik. Kies kantoorschoonmaak, VvE-schoonmaak, glasbewassing, horeca of een oplevering om de werkzaamheden te bekijken. Combinaties zijn bespreekbaar.'),('Hoe wordt een schoonmaakvoorstel bepaald?','Onder meer ruimtes, oppervlakte, gebruik, bereikbaarheid, frequentie en extra taken spelen een rol. Geef uw wensen door; het voorstel volgt uit de besproken werkzaamheden.'),('Is een eenmalige schoonmaak mogelijk?','Ja. U kunt eenmalige of terugkerende schoonmaak aanvragen. Geef de staat van de locatie, de gewenste taken en het moment waarop het pand beschikbaar is aan.'),('Werken jullie ook rondom Den Haag?','Naast Den Haag noemt Veele Services onder meer Delft, Zoetermeer, Leiden en Rotterdam als werkgebied. Locaties in Rijswijk, Voorburg, Wassenaar en andere omliggende plaatsen kunt u op aanvraag bespreken.')],
 'beveiliging':[('Welke beveiligingsdienst heb ik nodig?','Objectbeveiliging, mobiele rondes, evenementenbeveiliging en receptiediensten hebben verschillende doelen. Beschrijf de locatie en gewenste aanwezigheid; u hoeft vooraf nog geen definitieve vorm te kiezen.'),('Kan ontvangst met toezicht worden gecombineerd?','Dat is bespreekbaar. Geef bezoekersaantallen, balietaken en de gewenste toegangscontrole door. De rolverdeling en inzet worden afgestemd op uw gebouw.'),('Welke gegevens horen in de aanvraag?','Type locatie, plaats, globale taken en gewenste tijdvensters zijn voldoende om te beginnen. Deel geen alarmcodes, toegangscodes of gevoelige persoonlijke informatie in de openbare aanvraag.'),('Is mijn gewenste datum direct gereserveerd?','Nee. De aanvraag brengt uw wensen in beeld. De planning en inzet zijn pas afgesproken nadat deze zijn bevestigd.')],
 'facilitair':[('Waarmee kunnen facilitaire medewerkers helpen?','U kunt horecaondersteuning, praktische evenemententaken, bardiensten en toiletschoonmaak bespreken. Benoem taken per fase van uw programma: voorbereiding, uitvoering en afronding.'),('Kan ik verschillende diensten combineren?','Ja. De aanvraaghulp laat u meerdere diensten kiezen. Schoonmaak, beveiliging en facilitaire taken worden ieder met hun eigen scope en planning besproken.'),('Worden materialen en producten automatisch geleverd?','Nee, neem dit niet automatisch aan. Bespreek wie middelen, apparatuur, voorraad en verbruiksartikelen beschikbaar stelt.'),('Moet het aantal medewerkers al bekend zijn?','Nee. Geef een schatting als u die heeft. Een programma, concrete taken en verwachte bezoekers zijn een goed begin om de gewenste inzet te bespreken.')]
}
for group,label in GROUPS.items():
    source=PAGES[group]
    relevant=[s for s in SERVICES if s['group']==group]
    # Link the existing overview entries to their deeper service page.
    for s in relevant:
        source=source.replace('<h3>'+s['name']+'</h3>',f'<h3><a href="/{group}/{s["slug"]}/">{E(s["name"])}</a></h3>')
    source=insert_before(source,'detail-section',expertise(relevant))
    source=replace_section(source,'faq-section',faq(MAIN_FAQS[group],f'Vragen over {label.lower()}.'))
    source=insert_before(source,'faq-section','<section class="section"><div class="shell">'+editorial('Dichtbij uw locatie',label.upper()+' IN<br><span>DEN HAAG & DE REGIO.</span>','Bekijk de regiopagina voor uw plaats. U vindt er praktische aandachtspunten om uw aanvraag voor te bereiden. De concrete inzet wordt afgestemd op uw pand en planning.')+local_links()+'</div></section>')
    source=source.replace('</h1></div><div class="page-heading-photo">','</h1><p class="lead">'+E({'schoonmaak':'Schoonmaak voor uw kantoor, VvE, winkel, woning of horecalocatie in Den Haag en de Randstad. Bekijk de werkzaamheden en bespreek wat uw pand nodig heeft.','beveiliging':'Van toezicht op een pand tot gastgerichte ontvangst bij een evenement. Ontdek beveiligingsdiensten voor uw locatie in Den Haag en de Randstad.','facilitair':'Praktische ondersteuning voor horeca en evenementen. Van opbouw en gastontvangst tot bar en sanitair: bespreek de handen die u nodig heeft.'}[group])+'</p><div class="service-jump"><a href="#verdieping">Bekijk alle mogelijkheden</a><a href="'+E(inquiry(group))+'">Bespreek uw aanvraag</a></div></div><div class="page-heading-photo">')
    write('/'+group+'/',source,label+' Den Haag & Randstad | Veele Services',{'schoonmaak':'Schoonmaak in Den Haag en de Randstad: kantoren, VvE’s, glas, horeca en oplevering. Bekijk onze diensten en bespreek uw schoonmaakwensen.','beveiliging':'Beveiliging in Den Haag en de Randstad. Ontdek objectbeveiliging, mobiele surveillance, evenementenbeveiliging en receptiediensten.','facilitair':'Facilitaire diensten in Den Haag en de Randstad. Evenementenondersteuning, bardiensten en toiletschoonmaak afgestemd op uw programma.'}[group],[(label,'/'+group+'/')],label)

for s in SERVICES:
    group=s['group'];path=f'/{group}/{s["slug"]}/'
    actions='<div class="service-jump"><a href="#werkzaamheden">Werkzaamheden</a><a href="#voorbereiding">Uw aanvraag voorbereiden</a></div>'
    body=heading(GROUPS[group]+' / '+s['name'],E(s['name'])+'<br><span>Met aandacht geregeld.</span>',s['short'],s['image'],[(GROUPS[group],'/'+group+'/'),(s['name'],None)],actions)
    body+='<section class="section" id="werkzaamheden"><div class="shell reading-layout"><div class="reading-content"><div class="eyebrow">'+E(s['name'])+' in Den Haag & de Randstad</div><h2>'+E(s['headline'])+'</h2><p>'+E(s['intro'])+'</p><p>'+E(s['second'])+'</p>'
    body+=''.join('<h3>'+E(h)+'</h3><p>'+E(p)+'</p>' for h,p in s['scope'])+'</div>'+aside(group)+'</div></section>'
    body+='<section class="section planning-section" id="voorbereiding"><div class="shell reading-layout"><div class="reading-content"><div class="eyebrow">Goed voorbereid in gesprek</div><h2>Een duidelijke vraag.<br><span>Een gerichter voorstel.</span></h2><p>'+E(s['planning'])+'</p><h3>Dit helpt bij uw aanvraag</h3><ul>'+''.join('<li>'+E(c)+'</li>' for c in s['checklist'])+'</ul><p>U hoeft nog niet ieder detail te kennen. Vermeld wat al vaststaat en wat u samen wilt bespreken. De werkzaamheden, prijs en planning worden pas definitief na afstemming en bevestiging.</p>'+button('Bespreek '+s['name'].lower(),inquiry(group))+'</div><div class="reading-content"><div class="eyebrow">Ons werkgebied</div><h2>Den Haag.<br>En verder.</h2><p>Vanuit Den Haag bespreken we uw locatie in de Randstad. Bekijk praktische aandachtspunten voor uw plaats of vraag naar de mogelijkheden in de omgeving.</p>'+local_links()+'</div></div></section>'
    body+=faq(s['faq'],'Vragen over '+s['name'].lower()+'.')
    siblings=[x for x in SERVICES if x['group']==group and x['slug']!=s['slug']][:3]
    body+=expertise(siblings,'OOK HANDIG<br><span>VOOR UW LOCATIE.</span>','Gerelateerde diensten','Bekijk werkzaamheden die u naast deze dienst kunt bespreken. U bepaalt zelf welke onderdelen u aan uw aanvraag toevoegt.',id='gerelateerd')+closing(group)
    source=replace_main(HOME,body).replace('class="frame homepage route-home"','class="frame subpage service-detail"')
    write(path,source,s['name']+' Den Haag & Randstad | Veele Services',s['short']+' Bespreek uw locatie in Den Haag of de Randstad.',[(GROUPS[group],'/'+group+'/'),(s['name'],path)],s['name'])

region=heading('Ons werkgebied','VAN DEN HAAG.<br><span>NAAR UW LOCATIE.</span>','Schoonmaak, beveiliging en facilitaire ondersteuning vanuit een Haagse thuisbasis. Bekijk onze diensten in Den Haag en de Randstad, of bespreek uw locatie in de directe omgeving.','bedrijfsbus.webp',[('Werkgebied',None)])+area_cards()+surroundings()
region+=planning([('Uw locatie','Geef de plaats, het type pand en de bereikbaarheid door. Bij meerdere locaties is een overzicht per adres handig.'),('Uw werkzaamheden','Omschrijf de taken per dienst. Maak onderscheid tussen terugkerende werkzaamheden en eenmalige ondersteuning.'),('Uw planning','Geef gewenste dagen, tijdvensters en eventuele vaste momenten door. De mogelijkheden worden per aanvraag besproken.')])+faq([('Heeft Veele Services een vestiging in iedere plaats?','Nee. Veele Services heeft zijn thuisbasis in Den Haag. De genoemde plaatsen beschrijven het werkgebied en de locaties waarvoor u een aanvraag kunt bespreken, niet afzonderlijke vestigingen.'),('Mijn plaats staat er niet bij. Kan ik toch contact opnemen?','Ja. Geef de plaats en de gewenste werkzaamheden door. We bespreken de mogelijkheden en planning voor uw locatie.'),('Is inzet in omliggende plaatsen gegarandeerd?','Nee. Voor locaties in de omgeving worden werkzaamheden en planning per aanvraag besproken. Een vermelding of aanvraag is geen bevestigde afspraak.')],'Vragen over ons werkgebied.')+closing()
write('/werkgebied/',replace_main(PAGES['werkgebied'],region),'Werkgebied Den Haag & omgeving | Veele Services','Schoonmaak, beveiliging en facilitair in Den Haag, Scheveningen, Delft, Zoetermeer, Leiden en Rotterdam. Bespreek ook uw locatie in de omgeving.',[('Werkgebied','/werkgebied/')])

for a in AREAS:
    name=a['name'];path='/werkgebied/'+a['slug']+'/'
    body=heading('Werkgebied / '+name,'GOED GEREGELD.<br><span>IN '+E(name.upper())+'.</span>','Schoonmaak, beveiliging en facilitaire ondersteuning voor uw locatie. Bekijk praktische aandachtspunten en bereid uw aanvraag voor.','bedrijfsbus.webp',[('Werkgebied','/werkgebied/'),(name,None)],button('Bespreek uw locatie',inquiry(city=name)))
    body+='<section class="section"><div class="shell reading-layout"><div class="reading-content"><div class="eyebrow">Veele Services / '+E(name)+'</div><h2>'+E(a['focus'])+'</h2><p>'+E(a['intro'])+'</p><p>'+E(a['detail'])+'</p>'
    body+=''.join('<h3>'+E(h)+'</h3><p>'+E(p)+'</p>' for h,p in a['contexts'])+'<div class="local-focus"><h3>Dit helpt bij uw aanvraag</h3><p>'+E(a['ask'])+'</p></div><p>Vermeld wat al bekend is en welke keuzes nog openstaan. De plaats is een startpunt; de werkzaamheden en het gebruik van uw pand bepalen samen met de planning de verdere afstemming.</p></div>'+aside(city=name)+'</div></section>'
    body+=expertise([BY_SLUG[x] for x in a['related']],'PASSEND BIJ<br><span>UW LOCATIE.</span>','Diensten om verder te bekijken','Verdiep u in de werkzaamheden voordat u uw aanvraag samenstelt. U kunt meerdere diensten kiezen en uw wensen in één overzicht verzamelen.')
    body+=faq([(a['question'],a['answer']),('Hoe vraag ik een voorstel voor mijn locatie aan?','Kies de gewenste diensten in de aanvraaghulp. De plaats is alvast ingevuld; u kunt deze aanpassen. Voeg werkzaamheden, planning en contactgegevens toe om uw aanvraag na controle rechtstreeks te versturen.'),('Is er een aparte vestiging in '+name+'?','Veele Services heeft zijn thuisbasis in Den Haag. Deze pagina gaat over dienstverlening voor uw locatie; er wordt geen afzonderlijke vestiging in deze plaats aangeboden.')],'Praktisch voor '+name+'.')
    body+='<section class="section planning-section"><div class="shell"><div class="eyebrow">Ook een andere locatie?</div><h2>De regio in beeld.</h2>'+local_links()+'</div></section>'+closing(city=name)
    source=replace_main(HOME,body).replace('class="frame homepage route-home"','class="frame subpage region-detail"')
    write(path,source,'Schoonmaak & beveiliging '+name+' | Veele Services','Veele Services in '+name+': ontdek schoonmaak, beveiliging en facilitaire ondersteuning. Praktische informatie en een aanvraag voor uw locatie.',[('Werkgebied','/werkgebied/'),(name,path)])

services=PAGES['diensten']
services=insert_before(services,'contexts-section',expertise(SERVICES,'ELKE DIENST.<br><span>HELDER IN BEELD.</span>'))
services=insert_before(services,'closing',planning([('Eén locatie, meer taken','Bij een kantoor kunt u schoonmaak, receptie en toezicht samen bespreken. Geef per onderdeel aan wat u nodig heeft.'),('Eén evenement, meerdere fases','Van opbouw en ontvangst tot bar, toezicht en schoonmaak: verdeel uw wensen over het programma.'),('Eén aanvraag, duidelijke keuzes','U kiest zelf de diensten en werkzaamheden. De aanvraaghulp brengt ze samen in een overzicht voor het verdere gesprek.')]))
write('/diensten/',services,'Onze diensten in Den Haag & Randstad | Veele Services','Alle diensten van Veele Services: schoonmaak, beveiliging en facilitaire ondersteuning. Bekijk werkzaamheden, praktische informatie en combinaties.',[('Diensten','/diensten/')])
for key in ['over-ons','contact','privacy','aanvragen']:
    source=PAGES[key]
    oldtitle=re.search(r'<title>(.*?)</title>',source).group(1)
    olddesc=re.search(r'<meta name="description" content="(.*?)">',source).group(1)
    from html import unescape
    write('/'+key+'/',source,unescape(oldtitle),unescape(olddesc),[(key.replace('-',' ').capitalize(),'/'+key+'/')])

# Runtime supplies the verified tenant origin and staging robots policy.
OUT.joinpath("404.html").write_text(common(page_meta(PAGES["404"],"/404/","Pagina niet gevonden | Veele Services","Bekijk onze diensten of start uw aanvraag bij Veele Services."),"/404/"))
OUT.joinpath('sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+ORIGIN+p+'</loc></url>' for p in routes)+'</urlset>\n')
OUT.joinpath('robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: '+ORIGIN+'/sitemap.xml\n')
print(json.dumps({'pages':len(routes),'services':len(SERVICES),'area_pages':len(AREAS),'routes':routes},ensure_ascii=False))
