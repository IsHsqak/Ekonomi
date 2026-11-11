/*
  app.js är appens FUNKTION: var datan sparas, hur summorna räknas och vad som
  händer när man trycker på något.

  Filen är uppdelad i fem delar:
    1. Kvartal        – hjälp för att räkna med kvartal
    2. Räkna          – tolka det man skriver i ett fält, och formatera kronor
    3. Summor         – samma uträkningar som Excel-arket gjorde
    4. Spara och läsa – datan i telefonens lagring
    5. Skärmarna      – rita upp och reagera på tryck
*/
'use strict';

/* =====================================================================
   1. KVARTAL
   Ett kvartal sparas som text, t.ex. "2026Q4". För att kunna räkna
   "kvartalet innan" gör vi om det till ett löpnummer: år × 4 + (kvartal − 1).
   ===================================================================== */

var FÖRSTA_KVARTAL = 2020 * 4;            // Q1 2020, där Excel-arket började

function kvNyckel(nr) { return Math.floor(nr / 4) + 'Q' + (nr % 4 + 1); }
function kvNamn(nr)   { return 'Q' + (nr % 4 + 1) + ' ' + Math.floor(nr / 4); }
function kvNummer(nyckel) {
  var delar = nyckel.split('Q');
  return Number(delar[0]) * 4 + Number(delar[1]) - 1;
}
function kvIdag() {
  var d = new Date();
  return d.getFullYear() * 4 + Math.floor(d.getMonth() / 3);
}

/* =====================================================================
   2. RÄKNA
   ===================================================================== */

/*
  Tolkar det man skrivit i ett beloppsfält.
  Klarar vanliga tal ("29587", "29 587,50") och uträkningar ("105593+1015*0,7").
  Ger tillbaka:  ett tal  om det gick bra,
                 null     om fältet var tomt,
                 NaN      om det inte gick att förstå ("inte ett tal").
*/
function räkna(text) {
  var s = String(text)
    .replace(/[\s  ]/g, '')   // ta bort mellanslag
    .replace(/,/g, '.')                 // svenskt decimalkomma -> punkt
    .replace(/−/g, '-')            // långt minustecken -> vanligt
    .replace(/[x×]/gi, '*')
    .replace(/^=/, '');                 // tillåt att man börjar med = som i Excel
  if (s === '') return null;

  var pos = 0;                          // var i texten vi läser just nu

  function tal() {
    var träff = /^(\d+(\.\d+)?|\.\d+)/.exec(s.slice(pos));
    if (!träff) throw new Error('väntade ett tal');
    pos += träff[0].length;
    return parseFloat(träff[0]);
  }
  function faktor() {                   // ett tal, en parentes eller ett minustecken framför
    if (s[pos] === '-') { pos++; return -faktor(); }
    if (s[pos] === '+') { pos++; return faktor(); }
    if (s[pos] === '(') {
      pos++;
      var v = uttryck();
      if (s[pos] !== ')') throw new Error('saknar )');
      pos++;
      return v;
    }
    return tal();
  }
  function term() {                     // gånger och delat räknas före plus och minus
    var v = faktor();
    while (s[pos] === '*' || s[pos] === '/') {
      var op = s[pos++];
      var h = faktor();
      v = op === '*' ? v * h : v / h;
    }
    return v;
  }
  function uttryck() {
    var v = term();
    while (s[pos] === '+' || s[pos] === '-') {
      var op = s[pos++];
      var h = term();
      v = op === '+' ? v + h : v - h;
    }
    return v;
  }

  try {
    var resultat = uttryck();
    if (pos !== s.length || !isFinite(resultat)) return NaN;
    return resultat;
  } catch (fel) {
    return NaN;
  }
}

// Skriver ett tal som kronor på svenskt vis: 1 858 200 kr
function kr(tal, decimaler) {
  if (tal === null || tal === undefined) return '–';
  var d = decimaler || 0;
  var avrundat = Number(tal.toFixed(d));
  if (avrundat === 0) avrundat = 0;     // undvik "−0"
  return avrundat.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' kr';
}
// Som kr(), men visar ören bara när det finns några.
function krExakt(tal) {
  return kr(tal, Math.abs(tal - Math.round(tal)) > 0.004 ? 2 : 0);
}
// Med plus- eller minustecken framför, för förändringar.
function krFörändring(tal) {
  if (tal === null) return '–';
  return (Math.round(tal) > 0 ? '+' : '') + kr(tal);
}
function plusEllerMinus(tal) {
  if (tal === null || Math.round(tal) === 0) return '';
  return tal > 0 ? 'plus' : 'minus';
}

/* =====================================================================
   3. SUMMOR
   Datan ser ut så här:

   data.poster = [ { id, namn, typ, andel, avslutad }, ... ]
       typ är "konto", "lan" eller "hus". andel är 1 för 100 % och 0.5 för 50 %.

   data.varden = { "2026Q4": { ica: { text, belopp, andel }, ... }, ... }
       text   = det man skrev i fältet
       belopp = hela beloppet
       andel  = min andel just det kvartalet
       Det som räknas i summorna är belopp × andel.
   ===================================================================== */

function räknasSom(värde) { return värde ? värde.belopp * värde.andel : 0; }

// Summerar ett kvartal. Motsvarar raderna Summa, Summa lån avdraget och Tillgång inkl. hus i arket.
function summera(data, nr) {
  var värden = data.varden[kvNyckel(nr)] || {};
  var s = { sparande: 0, lån: 0, hus: 0, harData: false };
  data.poster.forEach(function (post) {
    var v = värden[post.id];
    if (!v) return;
    s.harData = true;
    if (post.typ === 'konto') s.sparande += räknasSom(v);
    else if (post.typ === 'lan') s.lån += räknasSom(v);
    else s.hus += räknasSom(v);
  });
  s.netto = s.sparande - s.lån;
  s.inklHus = s.netto + s.hus;
  return s;
}

// Nyckeltalen högst upp. Motsvarar rad 2 i fliken Pengar.
function nyckeltal(data, nr) {
  var nu = summera(data, nr);
  var förra = summera(data, nr - 1);                    // kvartalet innan
  var ettÅrSen = summera(data, nr - 4);                 // samma kvartal förra året
  var förraÅretsQ4 = summera(data, nr - (nr % 4) - 1);  // sista kvartalet förra året

  nu.sedanFörra = nu.harData && förra.harData ? nu.netto - förra.netto : null;
  nu.senasteÅret = nu.harData && ettÅrSen.harData ? nu.netto - ettÅrSen.netto : null;
  // Utveckling i år i procent: förändringen sedan förra årets Q4, delat med det värdet.
  nu.iÅrProcent = nu.harData && förraÅretsQ4.harData && förraÅretsQ4.netto !== 0
    ? (nu.netto - förraÅretsQ4.netto) / Math.abs(förraÅretsQ4.netto) * 100
    : null;
  return nu;
}

// Senaste kvartalet som har några värden alls (eller null om appen är tom).
function senasteKvartalMedData(data, före) {
  var bäst = null;
  Object.keys(data.varden).forEach(function (nyckel) {
    var nr = kvNummer(nyckel);
    if (Object.keys(data.varden[nyckel]).length === 0) return;
    if (före !== undefined && nr >= före) return;
    if (bäst === null || nr > bäst) bäst = nr;
  });
  return bäst;
}

/* =====================================================================
   4. SPARA OCH LÄSA
   localStorage är en liten lagringsplats som webbläsaren ger varje app.
   Den ligger på telefonen och skickas aldrig någonstans.
   Den kan bara spara text, så vi gör om datan till text (JSON) och tillbaka.
   ===================================================================== */

var LAGRINGSNAMN = 'ekonomi-app-v1';

function tomData() { return { format: 'ekonomi-app', version: 1, poster: [], varden: {}, bilar: [] }; }

function läsData() {
  try {
    var text = localStorage.getItem(LAGRINGSNAMN);
    if (text) {
      var läst = JSON.parse(text);
      if (!läst.bilar) läst.bilar = [];              // data som sparades innan Bilar fanns
      return läst;
    }
  } catch (fel) { /* om lagringen inte går att läsa börjar vi tomt */ }
  return tomData();
}

function sparaData() {
  try {
    localStorage.setItem(LAGRINGSNAMN, JSON.stringify(data));
    markeraÄndrat();                                   // så att påminnelsen om säkerhetskopia vet att något är nytt
  } catch (fel) {
    alert('Det gick inte att spara. Ändringen finns bara kvar tills appen stängs.');
  }
}

// Kontrollerar att en inläst fil verkligen är en fil från den här appen.
function giltigData(d) {
  return d && d.format === 'ekonomi-app' && Array.isArray(d.poster) && d.varden && typeof d.varden === 'object';
}

/* =====================================================================
   5. SKÄRMARNA
   "läge" håller reda på vad som visas just nu. Varje gång något ändras
   anropas rita(), som bygger upp skärmen på nytt från data och läge.
   ===================================================================== */

var data;
var läge = {
  vy: 'pengar',        // vilken skärm: pengar, ändra, ny, bilar, installningar
  kvartal: 0,          // vilket kvartal som visas (löpnummer)
  postId: null,        // vilken post som ändras
  nyTyp: null,
  bilId: null, bilÅr: null, fält: null, månad: null, nyBil: false,   // används av bilar.js         // vilken sorts post som läggs till
  visaAlla: false,     // visa även dolda/avslutade poster
  fel: ''              // felmeddelande i formuläret
};

var PIL_VÄNSTER = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"></path></svg>';
var PIL_HÖGER = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg>';

// Gör text ofarlig att stoppa in i sidan (om ett kontonamn t.ex. innehåller < eller &).
function säker(text) {
  return String(text).replace(/[&<>"']/g, function (tecken) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[tecken];
  });
}

function hittaPost(id) {
  return data.poster.filter(function (p) { return p.id === id; })[0];
}

// Ska posten synas i listan för det här kvartalet?
function synlig(post, nr) {
  var v = (data.varden[kvNyckel(nr)] || {})[post.id];
  if (v && v.belopp !== 0) return true;          // har ett värde: visa alltid
  if (läge.visaAlla) return true;
  if (post.avslutad) return false;
  var senaste = senasteKvartalMedData(data);
  return senaste === null || nr >= senaste;      // aktiva poster visas i senaste kvartalet och framåt
}

/* ---------- Skärm: Pengar, översikt ---------- */

function ritaPengar() {
  var nr = läge.kvartal;
  var n = nyckeltal(data, nr);
  var värden = data.varden[kvNyckel(nr)] || {};
  var html = '<h1>Pengar</h1>' + påminnelseHtml();

  // Helt ny app: erbjud att läsa in historiken.
  if (data.poster.length === 0) {
    html += '<section class="kort"><div class="kort-rubrik"><h2>Kom igång</h2></div><div class="kort-innehåll">' +
      '<p class="liten dämpad">Läs in filen historik.json för att få med allt från Excel-arket, eller börja från noll med knapparna längre ner.</p>' +
      '<button type="button" class="knapp" data-gör="välj-fil">Läs in historik</button>' +
      '<input type="file" id="filväljare" accept=".json,application/json" hidden>' +
      '</div></section>';
  }

  html += '<div class="kvartal">' +
    '<button type="button" class="pil" data-gör="förra" aria-label="Föregående kvartal"' + (nr <= FÖRSTA_KVARTAL ? ' disabled' : '') + '>' + PIL_VÄNSTER + '</button>' +
    '<span>' + kvNamn(nr) + '</span>' +
    '<button type="button" class="pil" data-gör="nästa" aria-label="Nästa kvartal"' + (nr >= kvIdag() ? ' disabled' : '') + '>' + PIL_HÖGER + '</button>' +
    '</div>';

  var procent = n.iÅrProcent === null ? '' :
    '<div class="höger"><span class="etikett">I år</span><span class="procent ' + plusEllerMinus(n.iÅrProcent) + '">' +
    (n.iÅrProcent > 0 ? '+' : '') + n.iÅrProcent.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %</span></div>';

  html += '<section class="nyckeltal">' +
    '<div class="topp"><div><span class="etikett">Netto efter lån</span><span class="stor">' + (n.harData ? kr(n.netto) : '–') + '</span></div>' + procent + '</div>' +
    '<div class="rutnät">' +
    '<div><span class="etikett">Sparande</span><b>' + (n.harData ? kr(n.sparande) : '–') + '</b></div>' +
    '<div><span class="etikett">Lån</span><b>' + (n.harData ? kr(n.lån) : '–') + '</b></div>' +
    '<div><span class="etikett">Sedan förra kvartalet</span><b class="' + plusEllerMinus(n.sedanFörra) + '">' + krFörändring(n.sedanFörra) + '</b></div>' +
    '<div><span class="etikett">Senaste året</span><b class="' + plusEllerMinus(n.senasteÅret) + '">' + krFörändring(n.senasteÅret) + '</b></div>' +
    '</div></section>';

  // Nytt kvartal utan värden: erbjud att utgå från det förra.
  var tidigare = senasteKvartalMedData(data, nr);
  if (!n.harData && tidigare !== null) {
    html += '<section class="kort"><div class="kort-rubrik"><h2>Inga värden för ' + kvNamn(nr) + ' ännu</h2></div><div class="kort-innehåll">' +
      '<p class="liten dämpad">Du kan utgå från ' + kvNamn(tidigare) + ' och sedan ändra det som är nytt.</p>' +
      '<button type="button" class="knapp" data-gör="kopiera" data-från="' + tidigare + '">Utgå från ' + kvNamn(tidigare) + '</button>' +
      '</div></section>';
  }

  function lista(rubrik, typ, läggTill, summaText, summa) {
    var rader = data.poster.filter(function (p) { return p.typ === typ && synlig(p, nr); }).map(function (p) {
      var v = värden[p.id];
      var not = v && v.andel !== 1
        ? '<small>Min andel ' + Math.round(v.andel * 100) + ' % av ' + krExakt(v.belopp) + '</small>' : '';
      return '<button type="button" class="rad" data-gör="ändra" data-id="' + säker(p.id) + '">' +
        '<span class="namn">' + säker(p.namn) + not + '</span>' +
        '<span class="värde">' + (v ? kr(räknasSom(v)) : '<span class="dämpad">Fyll i</span>') + PIL_HÖGER + '</span></button>';
    }).join('');
    return '<section class="kort"><div class="kort-rubrik"><h2>' + rubrik + '</h2>' +
      '<button type="button" class="länkknapp" data-gör="ny" data-typ="' + typ + '">' + läggTill + '</button></div>' +
      rader + '<div class="rad summa"><span>' + summaText + '</span><span>' + (n.harData ? kr(summa) : '–') + '</span></div></section>';
  }

  html += lista('Sparande', 'konto', 'Lägg till konto', 'Summa sparande', n.sparande);
  html += lista('Lån', 'lan', 'Lägg till lån', 'Summa lån', n.lån);
  html += lista('Hus', 'hus', 'Lägg till', 'Tillgång inklusive hus', n.inklHus);

  var antalDolda = data.poster.filter(function (p) { return !synlig(p, nr); }).length;
  if (antalDolda > 0 || läge.visaAlla) {
    html += '<button type="button" class="länkknapp" data-gör="visa-alla">' +
      (läge.visaAlla ? 'Dölj poster utan värde' : 'Visa ' + antalDolda + ' dolda poster') + '</button>';
  }
  return html;
}

/* ---------- Skärm: ändra ett saldo ---------- */

function ritaÄndra() {
  var post = hittaPost(läge.postId);
  var nr = läge.kvartal;
  var v = (data.varden[kvNyckel(nr)] || {})[post.id];
  var förra = (data.varden[kvNyckel(nr - 1)] || {})[post.id];
  var andel = v ? v.andel : post.andel;

  var html = '<button type="button" class="tillbaka" data-gör="tillbaka">' + PIL_VÄNSTER + 'Pengar</button>' +
    '<div><h1>' + säker(post.namn) + '</h1><p class="dämpad">' + (post.typ === 'lan' ? 'Skuld' : 'Värde') + ' för ' + kvNamn(nr) + '</p></div>' +
    '<form class="stapel" data-formulär="ändra" style="gap: 16px">' +
    '<div class="fält"><label for="belopp">Hela beloppet</label><div class="ruta">' +
    '<input id="belopp" type="text" inputmode="text" autocomplete="off" value="' + (v ? säker(v.text) : '') + '"><span class="enhet">kr</span></div></div>' +
    '<p class="liten dämpad">Du kan skriva en uträkning precis som i Excel, till exempel 105593+1015*0,7</p>' +
    '<div class="fält"><label for="andel">Min andel</label><div class="ruta">' +
    '<input id="andel" type="text" inputmode="decimal" autocomplete="off" value="' + String(Math.round(andel * 1000) / 10).replace('.', ',') + '"><span class="enhet">%</span></div></div>' +
    '<div class="räknas-som"><span>Räknas som</span><b id="räknas-som"></b></div>' +
    (läge.fel ? '<p class="fel" role="alert">' + säker(läge.fel) + '</p>' : '') +
    '<button type="submit" class="knapp">Spara</button>' +
    '</form>';

  if (förra) {
    html += '<section class="kort"><div class="kort-rubrik"><h2>Förra kvartalet</h2></div>' +
      '<div class="rad fast"><span>' + kvNamn(nr - 1) + '</span><span>' + krExakt(räknasSom(förra)) + '</span></div>' +
      '<div class="rad fast"><span>Förändring</span><b id="förändring"></b></div></section>';
  }

  html += '<div class="stapel"><button type="button" class="knapp varning" data-gör="avsluta">' +
    (post.avslutad ? 'Öppna igen' : 'Avsluta ' + (post.typ === 'lan' ? 'lånet' : 'posten')) + '</button>' +
    '<p class="liten dämpad" style="text-align: center">En avslutad post döljs framåt men finns kvar i historiken.</p></div>';
  return html;
}

// Läser fälten på ändra-skärmen. Används både när man skriver och när man sparar.
function läsÄndraFält() {
  var belopp = räkna(document.getElementById('belopp').value);
  var procent = räkna(document.getElementById('andel').value);
  return {
    text: document.getElementById('belopp').value.trim(),
    belopp: belopp,
    andel: procent === null ? NaN : procent / 100
  };
}

// Uppdaterar "Räknas som" och "Förändring" medan man skriver, utan att rita om hela skärmen.
function uppdateraFörhandsvisning() {
  var ruta = document.getElementById('räknas-som');
  if (!ruta) return;
  var f = läsÄndraFält();
  var ok = f.belopp !== null && !isNaN(f.belopp) && !isNaN(f.andel);
  ruta.textContent = ok ? krExakt(f.belopp * f.andel) : '–';

  var förändring = document.getElementById('förändring');
  if (förändring) {
    var förra = (data.varden[kvNyckel(läge.kvartal - 1)] || {})[läge.postId];
    var skillnad = ok ? f.belopp * f.andel - räknasSom(förra) : null;
    förändring.textContent = krFörändring(skillnad);
    förändring.className = plusEllerMinus(skillnad);
  }
}

function sparaÄndring() {
  var post = hittaPost(läge.postId);
  var nyckel = kvNyckel(läge.kvartal);
  var f = läsÄndraFält();

  if (f.belopp !== null && isNaN(f.belopp)) { läge.fel = 'Jag förstår inte beloppet. Använd siffror och + − * /'; return rita(); }
  if (isNaN(f.andel) || f.andel < 0 || f.andel > 1) { läge.fel = 'Andelen ska vara mellan 0 och 100 %.'; return rita(); }

  if (!data.varden[nyckel]) data.varden[nyckel] = {};
  if (f.belopp === null) {
    delete data.varden[nyckel][post.id];              // tomt fält = inget värde det kvartalet
  } else {
    data.varden[nyckel][post.id] = { text: f.text, belopp: f.belopp, andel: f.andel };
  }
  post.andel = f.andel;                               // kom ihåg andelen till nästa kvartal
  sparaData();
  gåTill('pengar');
}

/* ---------- Skärm: lägg till konto eller lån ---------- */

function ritaNy() {
  var vad = { konto: 'Nytt konto', lan: 'Nytt lån', hus: 'Ny tillgång' }[läge.nyTyp];
  return '<button type="button" class="tillbaka" data-gör="tillbaka">' + PIL_VÄNSTER + 'Pengar</button>' +
    '<h1>' + vad + '</h1>' +
    '<form class="stapel" data-formulär="ny" style="gap: 16px">' +
    '<div class="fält"><label for="namn">Namn</label><div class="ruta"><input id="namn" type="text" autocomplete="off"></div></div>' +
    '<div class="fält"><label for="nyandel">Min andel</label><div class="ruta"><input id="nyandel" type="text" inputmode="decimal" autocomplete="off" value="100"><span class="enhet">%</span></div></div>' +
    '<p class="liten dämpad">Skriv 50 om du delar lika med någon. Då fyller du i hela beloppet och appen räknar ut din halva.</p>' +
    (läge.fel ? '<p class="fel" role="alert">' + säker(läge.fel) + '</p>' : '') +
    '<button type="submit" class="knapp">Lägg till</button></form>';
}

function sparaNy() {
  var namn = document.getElementById('namn').value.trim();
  var procent = räkna(document.getElementById('nyandel').value);
  if (!namn) { läge.fel = 'Skriv ett namn.'; return rita(); }
  if (procent === null || isNaN(procent) || procent < 0 || procent > 100) { läge.fel = 'Andelen ska vara mellan 0 och 100 %.'; return rita(); }

  var id = 'p' + Date.now();                          // ett unikt id; namnet kan ju ändras senare
  data.poster.push({ id: id, namn: namn, typ: läge.nyTyp, andel: procent / 100, avslutad: false });
  sparaData();
  läge.postId = id;
  gåTill('ändra');                                    // gå direkt till att fylla i värdet
}

/* ---------- Rita och navigera ---------- */

function rita() {
  var html;
  if (läge.vy === 'ändra') html = ritaÄndra();
  else if (läge.vy === 'ny') html = ritaNy();
  else if (läge.vy.indexOf('bil') === 0) html = ritaBilVy();        // alla Bilar-skärmar ligger i bilar.js
  else if (läge.vy.indexOf('inst') === 0) html = ritaInstVy();      // alla Inställningar-skärmar ligger i installningar.js
  else html = ritaPengar();

  document.getElementById('app').innerHTML = html;

  // Markera rätt flik. Ändra- och ny-skärmen hör till Pengar.
  var flik = (läge.vy === 'ändra' || läge.vy === 'ny') ? 'pengar' : läge.vy;
  if (läge.vy.indexOf('bil') === 0) flik = 'bilar';
  if (läge.vy.indexOf('inst') === 0) flik = 'installningar';
  Array.prototype.forEach.call(document.querySelectorAll('.flik'), function (knapp) {
    knapp.classList.toggle('vald', knapp.getAttribute('data-vy') === flik);
  });

  uppdateraFörhandsvisning();
}

function gåTill(vy) {
  läge.vy = vy;
  läge.fel = '';
  rita();
  window.scrollTo(0, 0);
}

// Läser in en fil: historik från Excel eller en säkerhetskopia. "efter" körs när det är klart.
function läsInFil(fil, efter) {
  var läsare = new FileReader();
  läsare.onload = function () {
    try {
      var inläst = JSON.parse(läsare.result);
      if (inläst && inläst.format === 'ekonomi-app-bilar' && Array.isArray(inläst.bilar)) {
        data.bilar = inläst.bilar;                    // bilhistorik: byt bara ut bilarna
      } else if (giltigData(inläst)) {
        if (!inläst.bilar) inläst.bilar = data.bilar; // pengahistorik: behåll bilarna som redan finns
        data = inläst;
        läge.kvartal = startKvartal();
      } else {
        throw new Error('fel format');
      }
      sparaData();
      rita();
      if (efter) efter();
    } catch (fel) {
      alert('Filen gick inte att läsa. Kontrollera att du valde rätt fil.');
    }
  };
  läsare.readAsText(fil);
}

// Vilket kvartal som visas när appen öppnas: det innevarande om det har värden, annars det senast ifyllda.
function startKvartal() {
  var idag = kvIdag();
  if (summera(data, idag).harData) return idag;
  var senaste = senasteKvartalMedData(data);
  return senaste === null ? idag : senaste;
}

/* ---------- Vad som händer när man trycker ---------- */

function vidTryck(händelse) {
  var flik = händelse.target.closest('.flik');
  if (flik) return gåTill(flik.getAttribute('data-vy'));

  var knapp = händelse.target.closest('[data-gör]');
  if (!knapp) return;
  var gör = knapp.getAttribute('data-gör');
  if (bilTryck(gör, knapp) || instTryck(gör, knapp)) return;                    // tryck som hör till Bilar sköts i bilar.js

  if (gör === 'förra') { läge.kvartal--; rita(); }
  else if (gör === 'nästa') { läge.kvartal++; rita(); }
  else if (gör === 'visa-alla') { läge.visaAlla = !läge.visaAlla; rita(); }
  else if (gör === 'tillbaka') { gåTill('pengar'); }
  else if (gör === 'ändra') { läge.postId = knapp.getAttribute('data-id'); gåTill('ändra'); }
  else if (gör === 'ny') { läge.nyTyp = knapp.getAttribute('data-typ'); gåTill('ny'); }
  else if (gör === 'välj-fil') { document.getElementById('filväljare').click(); }
  else if (gör === 'kopiera') {
    // Kopiera förra kvartalets värden för alla poster som inte är avslutade.
    var från = data.varden[kvNyckel(Number(knapp.getAttribute('data-från')))];
    var nytt = {};
    data.poster.forEach(function (p) {
      if (!p.avslutad && från[p.id]) nytt[p.id] = { text: från[p.id].text, belopp: från[p.id].belopp, andel: från[p.id].andel };
    });
    data.varden[kvNyckel(läge.kvartal)] = nytt;
    sparaData();
    rita();
  }
  else if (gör === 'avsluta') {
    var post = hittaPost(läge.postId);
    post.avslutad = !post.avslutad;
    sparaData();
    gåTill('pengar');
  }
}

function starta() {
  data = läsData();
  läge.kvartal = startKvartal();

  document.addEventListener('click', vidTryck);
  document.addEventListener('input', function (h) {
    if (h.target.id === 'belopp' || h.target.id === 'andel') uppdateraFörhandsvisning();
  });
  document.addEventListener('submit', function (h) {
    h.preventDefault();                                // hindra webbläsaren från att ladda om sidan
    var formulär = h.target.getAttribute('data-formulär');
    if (bilSpara(formulär) || instSpara(formulär)) return;   // formulär som hör till Bilar och Inställningar sköts i deras filer
    if (formulär === 'ändra') sparaÄndring();
    else sparaNy();
  });
  document.addEventListener('change', function (h) {
    if (h.target.id === 'återställfil' && h.target.files[0]) return återställFrånFil(h.target.files[0]);
    if ((h.target.id === 'filväljare' || h.target.id === 'bilfil') && h.target.files[0]) läsInFil(h.target.files[0]);
  });

  rita();

  // Be webbläsaren att inte rensa appens lagring om telefonen får ont om plats.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

  // Slå på offline-stödet (sw.js). Det fungerar bara när appen ligger på en https-adress,
  // inte när man dubbelklickar på filen på datorn.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js');
  }
}

// Starta bara om vi körs i en webbläsare. (Raden under gör att uträkningarna också går att testa utanför.)
if (typeof document !== 'undefined') starta();
if (typeof module !== 'undefined') module.exports = { räkna: räkna, summera: summera, nyckeltal: nyckeltal, kvNummer: kvNummer, kvNyckel: kvNyckel, kr: kr };
