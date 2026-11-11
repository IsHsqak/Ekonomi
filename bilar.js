/*
  bilar.js är allt som hör till fliken Bilar.
  Den använder hjälpfunktionerna i app.js (räkna, kr, säker, sparaData, gåTill ...),
  på samma sätt som Bilar-fliken i Excel kunde använda celler från andra flikar.

  Datan för en bil ser ut så här:

  bil = {
    id, namn, regnr,
    inkopsvarde:    269900,      // vad bilen var värd första året
    vardeminskning: 0.15,        // 15 % per år
    forstaAr:       2025,
    ar: {
      "2026": {
        varden:  { skatt: {text, belopp}, forsakring: ..., matareStart: ..., matareSlut: ... },
        manader: { "1": { kwh: {text, belopp}, kr: {...}, ranta: {...} }, "2": ..., }
                 // månad "0" är en klumpsumma som förts över från Excel
      }
    }
  }
*/
'use strict';

var MÅNADER = ['Överfört från Excel', 'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];

// Raderna som fylls i en gång per år: [nyckel i datan, text på skärmen, enhet]
var FASTA_RADER = [['skatt', 'Skatt', 'kr'], ['forsakring', 'Försäkring', 'kr'], ['besiktning', 'Besiktning', 'kr']];
var RÖRLIGA_RADER = [['laddBorta', 'Laddning borta', 'kr'], ['dack', 'Däck', 'kr'], ['reservdelar', 'Reservdelar', 'kr'], ['service', 'Service', 'kr']];
var MÄTAR_RADER = [['matareStart', 'Vid årets början', 'mil'], ['matareSlut', 'Vid årets slut', 'mil']];

/* =====================================================================
   UTRÄKNINGAR – samma som i Excel-fliken Bilar
   ===================================================================== */

// Bilens värde vid början av ett år: varje år försvinner en viss procent av det som är kvar.
function bilVärdeVidÅretsBörjan(bil, år) {
  var värde = bil.inkopsvarde;
  for (var y = bil.forstaAr; y < år; y++) värde -= värde * bil.vardeminskning;
  return värde;
}

// Räknar ihop ett år för en bil.
function räknaBilÅr(bil, år) {
  var d = bil.ar[år];
  function v(namn) { return d.varden[namn] ? d.varden[namn].belopp : 0; }

  var r = { kwh: 0, laddHemma: 0, ränta: 0 };
  Object.keys(d.manader).forEach(function (m) {
    var månad = d.manader[m];
    if (månad.kwh) r.kwh += månad.kwh.belopp;
    if (månad.kr) r.laddHemma += månad.kr.belopp;
    if (månad.ranta) r.ränta += månad.ranta.belopp;
  });

  r.värdeVidStart = bilVärdeVidÅretsBörjan(bil, Number(år));
  r.värdeminskning = r.värdeVidStart * bil.vardeminskning;
  r.skatt = v('skatt'); r.forsakring = v('forsakring'); r.besiktning = v('besiktning');
  r.fasta = r.värdeminskning + r.ränta + r.skatt + r.forsakring + r.besiktning;

  r.laddBorta = v('laddBorta'); r.dack = v('dack'); r.reservdelar = v('reservdelar'); r.service = v('service');
  r.rörliga = r.laddHemma + r.laddBorta + r.dack + r.reservdelar + r.service;

  r.totalt = r.fasta + r.rörliga;
  r.mil = d.varden.matareSlut && d.varden.matareStart ? v('matareSlut') - v('matareStart') : 0;
  r.månader = 12;
  return r;
}

// Räknar ihop hela ägandetiden: summan av alla år.
function räknaBilTotalt(bil) {
  var summa = null;
  Object.keys(bil.ar).forEach(function (år) {
    var r = räknaBilÅr(bil, år);
    if (!summa) { summa = r; return; }
    Object.keys(r).forEach(function (nyckel) { if (nyckel !== 'värdeVidStart') summa[nyckel] += r[nyckel]; });
  });
  return summa;
}

/* =====================================================================
   HJÄLP FÖR SKÄRMARNA
   ===================================================================== */

function tal(n, decimaler) {
  var d = decimaler || 0;
  return Number(n.toFixed(d)).toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function aktuellBil() {
  var träff = data.bilar.filter(function (b) { return b.id === läge.bilId; })[0];
  return träff || data.bilar[0] || null;
}

function bilensÅr(bil) { return Object.keys(bil.ar).sort(); }

// Vilket år som visas: det valda, annars innevarande år, annars bilens senaste.
function aktuelltBilÅr(bil) {
  if (läge.bilÅr === 'alla' || bil.ar[läge.bilÅr]) return läge.bilÅr;
  var iÅr = String(new Date().getFullYear());
  var alla = bilensÅr(bil);
  return bil.ar[iÅr] ? iÅr : alla[alla.length - 1];
}

function fältHtml(id, etikett, värde, enhet, tangentbord) {
  return '<div class="fält"><label for="' + id + '">' + etikett + '</label><div class="ruta">' +
    '<input id="' + id + '" type="text" inputmode="' + (tangentbord || 'text') + '" autocomplete="off" value="' + säker(värde) + '">' +
    (enhet ? '<span class="enhet">' + enhet + '</span>' : '') + '</div></div>';
}

function tillbakaKnapp(till, text) {
  return '<button type="button" class="tillbaka" data-gör="bil-gå" data-till="' + till + '">' + PIL_VÄNSTER + text + '</button>';
}

function felRad() { return läge.fel ? '<p class="fel" role="alert">' + säker(läge.fel) + '</p>' : ''; }

var RÄKNETIPS = '<p class="liten dämpad">Du kan skriva en uträkning, till exempel 10000/3 eller 129+111*0,66</p>';

/* =====================================================================
   SKÄRM: Bilar, översikt
   ===================================================================== */

function ritaBilar() {
  var html = '<h1>Bilar</h1>';
  var bil = aktuellBil();

  if (!bil) {
    return html + '<section class="kort"><div class="kort-rubrik"><h2>Kom igång</h2></div><div class="kort-innehåll">' +
      '<p class="liten dämpad">Läs in filen bilhistorik.json för att få med bilen från Excel-arket, eller lägg till en bil själv.</p>' +
      '<button type="button" class="knapp" data-gör="bil-välj-fil">Läs in bilhistorik</button>' +
      '<input type="file" id="bilfil" accept=".json,application/json" hidden>' +
      '<button type="button" class="knapp ljus" data-gör="bil-ny">Lägg till bil</button>' +
      '</div></section>';
  }

  var år = aktuelltBilÅr(bil);
  var hela = år === 'alla';
  var r = hela ? räknaBilTotalt(bil) : räknaBilÅr(bil, år);
  var d = hela ? null : bil.ar[år];

  // Vilken bil
  html += '<button type="button" class="bilväljare" data-gör="bil-gå" data-till="bil-lista">' +
    '<span class="namn">' + säker(bil.namn) + '<small>' + säker(bil.regnr || '') + '</small></span>' +
    '<span class="byt">Byt bil</span></button>';

  // Vilket år
  html += '<div class="segment">' + bilensÅr(bil).map(function (y) {
    return '<button type="button" data-gör="bil-år" data-år="' + y + '" aria-pressed="' + (y === år) + '">' + y + '</button>';
  }).join('') + '<button type="button" data-gör="bil-år" data-år="alla" aria-pressed="' + hela + '">Hela tiden</button></div>';

  // Nyckeltal
  function ruta(etikett, värde, enhet) {
    return '<div><span class="etikett">' + etikett + '</span><b>' + värde + '</b><span class="etikett">' + enhet + '</span></div>';
  }
  html += '<div class="rutor">' +
    ruta('Kostnad per månad', tal(r.totalt / r.månader), 'kr') +
    ruta('Kostnad per mil', r.mil > 0 ? tal(r.totalt / r.mil, 2) : '–', 'kr') +
    ruta('Körda mil', tal(r.mil), hela ? 'mil totalt' : 'mil under året') +
    ruta('Förbrukning', r.mil > 0 ? tal(r.kwh / r.mil, 2) : '–', 'kWh per mil') +
    '</div>';

  // En rad i ett kort. Med "gör" blir den tryckbar, annars är den bara text.
  function rad(namn, not, värde, gör, extra) {
    var innehåll = '<span class="namn">' + namn + (not ? '<small>' + not + '</small>' : '') + '</span>';
    if (hela || !gör) return '<div class="rad fast">' + innehåll + '<span class="värde">' + värde + '</span></div>';
    return '<button type="button" class="rad" data-gör="' + gör + '"' + (extra || '') + '>' + innehåll +
      '<span class="värde">' + värde + PIL_HÖGER + '</span></button>';
  }
  function årsrader(rader) {
    return rader.map(function (x) {
      var finns = hela || d.varden[x[0]];
      var värde = finns ? (x[2] === 'kr' ? kr(r[x[0]]) : tal(d.varden[x[0]].belopp) + ' ' + x[2]) : '<span class="dämpad">Fyll i</span>';
      return rad(x[1], '', värde, 'bil-värde', ' data-fält="' + x[0] + '"');
    }).join('');
  }
  function kort(rubrik, rader, summaText, summa) {
    return '<section class="kort"><div class="kort-rubrik"><h2>' + rubrik + '</h2></div>' + rader +
      (summaText ? '<div class="rad summa"><span>' + summaText + '</span><span>' + kr(summa) + '</span></div>' : '') + '</section>';
  }

  var procent = tal(bil.vardeminskning * 100, 1).replace(',0', '') + ' %';
  html += kort('Fasta kostnader',
    rad('Värdeminskning', hela ? procent + ' per år' : procent + ' av ' + kr(r.värdeVidStart), kr(r.värdeminskning), 'bil-ändra') +
    rad('Ränta', hela ? '' : 'Fylls i per månad', kr(r.ränta), 'bil-gå', ' data-till="bil-månader"') +
    årsrader(FASTA_RADER),
    'Summa fasta', r.fasta);

  html += kort('Rörliga kostnader',
    rad('Laddning hemma', tal(r.kwh) + ' kWh' + (hela ? '' : ', fylls i per månad'), kr(r.laddHemma), 'bil-gå', ' data-till="bil-månader"') +
    årsrader(RÖRLIGA_RADER),
    'Summa rörliga', r.rörliga);

  html += '<div class="total"><span>Totalt ' + (hela ? 'hela tiden' : år) + '</span><b>' + kr(r.totalt) + '</b></div>';

  if (!hela) {
    html += kort('Mätarställning', årsrader(MÄTAR_RADER));
    var nästa = Number(bilensÅr(bil).pop()) + 1;
    html += '<button type="button" class="länkknapp" data-gör="bil-nytt-år" data-år="' + nästa + '">Lägg till år ' + nästa + '</button>';
  }
  return html;
}

/* =====================================================================
   SKÄRM: ändra ett årsvärde (skatt, däck, mätarställning ...)
   ===================================================================== */

function ritaBilVärde() {
  var bil = aktuellBil(), år = aktuelltBilÅr(bil);
  var x = FASTA_RADER.concat(RÖRLIGA_RADER, MÄTAR_RADER).filter(function (rad) { return rad[0] === läge.fält; })[0];
  var nu = bil.ar[år].varden[x[0]];
  return tillbakaKnapp('bilar', 'Bilar') +
    '<div><h1>' + x[1] + '</h1><p class="dämpad">' + säker(bil.namn) + ' under ' + år + '</p></div>' +
    '<form class="stapel" data-formulär="bil-värde" style="gap: 16px">' +
    fältHtml('bilvärde', x[2] === 'mil' ? 'Mätarställning' : 'Kostnad för hela året', nu ? nu.text : '', x[2]) +
    RÄKNETIPS + felRad() +
    '<button type="submit" class="knapp">Spara</button></form>';
}

/* =====================================================================
   SKÄRM: månaderna för ett år
   ===================================================================== */

function ritaBilMånader() {
  var bil = aktuellBil(), år = aktuelltBilÅr(bil), d = bil.ar[år], r = räknaBilÅr(bil, år);
  function cell(värde, enhet) {
    return värde ? '<span>' + tal(värde.belopp) + enhet + '</span>' : '<span class="dämpad">–</span>';
  }
  var rader = MÅNADER.map(function (namn, m) {
    var månad = d.manader[m];
    if (m === 0 && !månad) return '';            // raden "Överfört från Excel" visas bara om den finns
    månad = månad || {};
    return '<button type="button" class="rad månadsrad" data-gör="bil-månad" data-månad="' + m + '">' +
      '<span class="namn">' + (m === 0 ? 'Från Excel' : namn) + '</span>' + cell(månad.kwh, '') + cell(månad.kr, ' kr') + cell(månad.ranta, ' kr') + '</button>';
  }).join('');

  return tillbakaKnapp('bilar', 'Bilar') +
    '<div><h1>' + säker(bil.namn) + ' under ' + år + '</h1><p class="dämpad">Tryck på en månad för att fylla i den</p></div>' +
    '<section class="kort">' +
    '<div class="månadsrad rubrikrad"><span>Månad</span><span>kWh</span><span>Laddning</span><span>Ränta</span></div>' +
    rader +
    '<div class="rad summa månadsrad"><span>Summa</span><span>' + tal(r.kwh) + '</span><span>' + kr(r.laddHemma) + '</span><span>' + kr(r.ränta) + '</span></div>' +
    '</section>';
}

/* =====================================================================
   SKÄRM: fyll i en månad
   ===================================================================== */

function ritaBilMånad() {
  var bil = aktuellBil(), år = aktuelltBilÅr(bil);
  var månad = bil.ar[år].manader[läge.månad] || {};
  function text(v) { return v ? v.text : ''; }
  return tillbakaKnapp('bil-månader', år) +
    '<div><h1>' + MÅNADER[läge.månad] + '</h1><p class="dämpad">' + säker(bil.namn) + ' under ' + år + '</p></div>' +
    '<form class="stapel" data-formulär="bil-månad" style="gap: 16px">' +
    fältHtml('mkwh', 'Laddat hemma', text(månad.kwh), 'kWh') +
    fältHtml('mkr', 'Kostnad för laddningen', text(månad.kr), 'kr') +
    fältHtml('mranta', 'Ränta', text(månad.ranta), 'kr') +
    RÄKNETIPS + felRad() +
    '<button type="submit" class="knapp">Spara</button></form>';
}

/* =====================================================================
   SKÄRM: lista med bilar, och formulär för en bil
   ===================================================================== */

function ritaBilLista() {
  var vald = aktuellBil();
  return tillbakaKnapp('bilar', 'Bilar') + '<h1>Mina bilar</h1><section class="kort">' +
    data.bilar.map(function (b, i) {
      return '<button type="button" class="rad" data-gör="bil-välj" data-id="' + säker(b.id) + '"' + (i === 0 ? ' style="border-top: 0"' : '') + '>' +
        '<span class="namn">' + säker(b.namn) + '<small>' + säker(b.regnr || '') + '</small></span>' +
        '<span class="värde">' + (b === vald ? '<span class="dämpad">Visas nu</span>' : '') + PIL_HÖGER + '</span></button>';
    }).join('') + '</section>' +
    '<button type="button" class="knapp ljus" data-gör="bil-ny">Lägg till bil</button>';
}

function ritaBilFormulär() {
  var bil = läge.nyBil ? null : aktuellBil();
  return tillbakaKnapp(läge.nyBil ? (data.bilar.length ? 'bil-lista' : 'bilar') : 'bilar', 'Tillbaka') +
    '<h1>' + (bil ? säker(bil.namn) : 'Ny bil') + '</h1>' +
    '<form class="stapel" data-formulär="bil-formulär" style="gap: 16px">' +
    fältHtml('bnamn', 'Namn', bil ? bil.namn : '') +
    fältHtml('bregnr', 'Registreringsnummer', bil ? bil.regnr : '') +
    fältHtml('bvärde', 'Bilens värde första året', bil ? String(bil.inkopsvarde).replace('.', ',') : '', 'kr') +
    fältHtml('bprocent', 'Värdeminskning per år', bil ? String(Math.round(bil.vardeminskning * 1000) / 10).replace('.', ',') : '15', '%', 'decimal') +
    (bil ? '' : fältHtml('bår', 'Första året', String(new Date().getFullYear()), '', 'numeric')) +
    '<p class="liten dämpad">Värdeminskningen räknas varje år på det värde som är kvar, precis som i Excel-arket.</p>' +
    felRad() + '<button type="submit" class="knapp">Spara</button></form>' +
    (bil ? '<button type="button" class="knapp varning" data-gör="bil-ta-bort">Ta bort bilen och all dess historik</button>' : '');
}

/* =====================================================================
   VAD SOM HÄNDER NÄR MAN TRYCKER ELLER SPARAR
   De här två funktionerna anropas från app.js.
   ===================================================================== */

function ritaBilVy() {
  if (läge.vy === 'bil-värde') return ritaBilVärde();
  if (läge.vy === 'bil-månader') return ritaBilMånader();
  if (läge.vy === 'bil-månad') return ritaBilMånad();
  if (läge.vy === 'bil-lista') return ritaBilLista();
  if (läge.vy === 'bil-formulär') return ritaBilFormulär();
  return ritaBilar();
}

// Ger tillbaka true om trycket hörde till Bilar.
function bilTryck(gör, knapp) {
  if (gör.indexOf('bil-') !== 0) return false;
  var bil = aktuellBil();

  if (gör === 'bil-gå') gåTill(knapp.getAttribute('data-till'));
  else if (gör === 'bil-år') { läge.bilÅr = knapp.getAttribute('data-år'); rita(); }
  else if (gör === 'bil-värde') { läge.fält = knapp.getAttribute('data-fält'); gåTill('bil-värde'); }
  else if (gör === 'bil-månad') { läge.månad = Number(knapp.getAttribute('data-månad')); gåTill('bil-månad'); }
  else if (gör === 'bil-välj') { läge.bilId = knapp.getAttribute('data-id'); läge.bilÅr = null; gåTill('bilar'); }
  else if (gör === 'bil-ny') { läge.nyBil = true; gåTill('bil-formulär'); }
  else if (gör === 'bil-ändra') { läge.nyBil = false; gåTill('bil-formulär'); }
  else if (gör === 'bil-ta-bort') {
    if (confirm('Ta bort "' + bil.namn + '" och allt som fyllts i för den? Det går inte att ångra.')) {
      data.bilar.splice(data.bilar.indexOf(bil), 1);
      läge.bilId = null; läge.bilÅr = null;
      sparaData();
      gåTill('bilar');
    }
  }
  else if (gör === 'bil-välj-fil') document.getElementById('bilfil').click();
  else if (gör === 'bil-nytt-år') {
    // Nytt år börjar med förra årets slutmätarställning.
    var nytt = knapp.getAttribute('data-år');
    var förra = bil.ar[String(Number(nytt) - 1)];
    bil.ar[nytt] = { varden: {}, manader: {} };
    if (förra && förra.varden.matareSlut) bil.ar[nytt].varden.matareStart = { text: förra.varden.matareSlut.text, belopp: förra.varden.matareSlut.belopp };
    sparaData();
    läge.bilÅr = nytt;
    rita();
  }
  return true;
}

// Läser ett fält med en uträkning. Ger { text, belopp }, null om det är tomt, eller false om det är fel.
function läsFält(id) {
  var text = document.getElementById(id).value.trim();
  var belopp = räkna(text);
  if (belopp === null) return null;
  if (isNaN(belopp)) return false;
  return { text: text, belopp: belopp };
}

// Ger tillbaka true om formuläret hörde till Bilar.
function bilSpara(formulär) {
  if (formulär.indexOf('bil-') !== 0) return false;
  var bil = aktuellBil();
  var FEL = 'Jag förstår inte värdet. Använd siffror och + − * /';

  if (formulär === 'bil-värde') {
    var värde = läsFält('bilvärde');
    if (värde === false) { läge.fel = FEL; rita(); return true; }
    var värden = bil.ar[aktuelltBilÅr(bil)].varden;
    if (värde === null) delete värden[läge.fält]; else värden[läge.fält] = värde;
    sparaData();
    gåTill('bilar');
  }

  else if (formulär === 'bil-månad') {
    var kwh = läsFält('mkwh'), kronor = läsFält('mkr'), ränta = läsFält('mranta');
    if (kwh === false || kronor === false || ränta === false) { läge.fel = FEL; rita(); return true; }
    var månad = {};
    if (kwh) månad.kwh = kwh;
    if (kronor) månad.kr = kronor;
    if (ränta) månad.ranta = ränta;
    var månader = bil.ar[aktuelltBilÅr(bil)].manader;
    if (kwh || kronor || ränta) månader[läge.månad] = månad; else delete månader[läge.månad];
    sparaData();
    gåTill('bil-månader');
  }

  else if (formulär === 'bil-formulär') {
    var namn = document.getElementById('bnamn').value.trim();
    var pris = räkna(document.getElementById('bvärde').value);
    var procent = räkna(document.getElementById('bprocent').value);
    if (!namn) { läge.fel = 'Skriv ett namn.'; rita(); return true; }
    if (pris === null || isNaN(pris) || pris < 0) { läge.fel = 'Skriv bilens värde i kronor.'; rita(); return true; }
    if (procent === null || isNaN(procent) || procent < 0 || procent > 100) { läge.fel = 'Värdeminskningen ska vara mellan 0 och 100 %.'; rita(); return true; }

    if (läge.nyBil) {
      var år = Math.round(räkna(document.getElementById('bår').value));
      if (!(år >= 1980 && år <= 2100)) { läge.fel = 'Skriv ett årtal, till exempel 2026.'; rita(); return true; }
      bil = { id: 'b' + Date.now(), forstaAr: år, ar: {} };
      bil.ar[år] = { varden: {}, manader: {} };
      data.bilar.push(bil);
      läge.bilId = bil.id;
      läge.bilÅr = null;
    }
    bil.namn = namn;
    bil.regnr = document.getElementById('bregnr').value.trim();
    bil.inkopsvarde = pris;
    bil.vardeminskning = procent / 100;
    sparaData();
    gåTill('bilar');
  }
  return true;
}

if (typeof module !== 'undefined') module.exports = { räknaBilÅr: räknaBilÅr, räknaBilTotalt: räknaBilTotalt };
