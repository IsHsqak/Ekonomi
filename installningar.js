/*
  installningar.js är fliken Inställningar: säkerhetskopiera, återställa och påminnelsen.

  En säkerhetskopia är helt enkelt all appens data nedskriven i en fil.
  På telefonen öppnas dela-menyn, och där väljer du "Spara till Filer" och en mapp i iCloud Drive.
  Appen kan inte spara dit på egen hand – en webbapp får bara lämna ifrån sig filer
  när du själv trycker på en knapp.
*/
'use strict';

/* Inställningarna sparas för sig, så att de inte skrivs över när man återställer en kopia. */
var INST_NAMN = 'ekonomi-app-installningar';
var PÅMINN_VAL = [7, 14, 30, 0];          // dagar mellan påminnelser. 0 betyder avstängd.

function läsInst() {
  var inst = { senasteKopia: null, ändratSedan: false, påminnDagar: 7 };
  try {
    var sparat = JSON.parse(localStorage.getItem(INST_NAMN) || '{}');
    Object.keys(sparat).forEach(function (nyckel) { inst[nyckel] = sparat[nyckel]; });
  } catch (fel) { /* börja med standardvärdena */ }
  return inst;
}
function sparaInst(inst) {
  try { localStorage.setItem(INST_NAMN, JSON.stringify(inst)); } catch (fel) { /* inget att göra */ }
}

// Anropas från sparaData() i app.js varje gång något ändras.
function markeraÄndrat() {
  var inst = läsInst();
  if (!inst.ändratSedan) { inst.ändratSedan = true; sparaInst(inst); }
}

function dagarSedan(tid) { return Math.floor((Date.now() - tid) / (24 * 60 * 60 * 1000)); }

function datumText(tid) {
  return new Date(tid).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' kl. ' + new Date(tid).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function harData() { return data.poster.length > 0 || data.bilar.length > 0; }

/* ---------- Påminnelsen som visas överst på Pengar ---------- */

function påminnelseHtml() {
  var inst = läsInst();
  if (!inst.påminnDagar || !inst.ändratSedan || !harData()) return '';
  var text;
  if (inst.senasteKopia === null) text = 'Du har ingen säkerhetskopia ännu.';
  else if (dagarSedan(inst.senasteKopia) >= inst.påminnDagar) text = 'Det är ' + dagarSedan(inst.senasteKopia) + ' dagar sedan du säkerhetskopierade.';
  else return '';
  return '<section class="påminnelse"><p>' + text + '</p>' +
    '<button type="button" class="knapp" data-gör="inst-kopiera">Säkerhetskopiera nu</button></section>';
}

/* ---------- Skärmen ---------- */

function ritaInställningar() {
  var inst = läsInst();
  var status = inst.senasteKopia === null
    ? 'Ingen säkerhetskopia har sparats ännu.'
    : 'Senast sparad ' + datumText(inst.senasteKopia) + '.' + (inst.ändratSedan ? ' Du har ändrat sedan dess.' : ' Inget har ändrats sedan dess.');

  return '<h1>Inställningar</h1>' +
    '<section class="kort"><div class="kort-rubrik"><h2>Säkerhetskopia</h2></div><div class="kort-innehåll">' +
    '<p class="liten dämpad">' + status + '</p>' +
    '<button type="button" class="knapp" data-gör="inst-kopiera">Säkerhetskopiera nu</button>' +
    '<p class="liten dämpad">Välj "Spara till Filer" och en mapp i iCloud Drive när dela-menyn öppnas.</p>' +
    '<button type="button" class="knapp ljus" data-gör="inst-återställ">Återställ från fil</button>' +
    '<input type="file" id="återställfil" accept=".json,.txt,application/json,text/plain" hidden>' +
    '</div>' +
    '<button type="button" class="rad" data-gör="inst-påminn"><span class="namn">Påminnelse<small>Tryck för att ändra</small></span>' +
    '<span class="värde">' + (inst.påminnDagar ? 'Efter ' + inst.påminnDagar + ' dagar' : 'Avstängd') + '</span></button>' +
    '</section>' +
    '<section class="kort"><div class="kort-rubrik"><h2>Pengar</h2></div>' +
    '<button type="button" class="rad" data-gör="inst-gå" data-till="inst-poster"><span class="namn">Konton, lån och andelar<small>Byt namn, ändra andel, flytta, avsluta</small></span>' +
    '<span class="värde">' + data.poster.length + ' st' + PIL_HÖGER + '</span></button></section>' +
    '<section class="kort"><div class="kort-rubrik"><h2>Bilar</h2></div>' +
    '<button type="button" class="rad" data-gör="bil-gå" data-till="bil-lista"><span class="namn">Mina bilar<small>Byt eller lägg till bil</small></span>' +
    '<span class="värde">' + data.bilar.length + ' st' + PIL_HÖGER + '</span></button></section>';
}

/* ---------- Skärm: lista med alla konton och lån ---------- */

var TYPNAMN = [['konto', 'Sparande'], ['lan', 'Lån'], ['hus', 'Hus']];

function ritaInstPoster() {
  var html = '<button type="button" class="tillbaka" data-gör="inst-gå" data-till="installningar">' + PIL_VÄNSTER + 'Inställningar</button>' +
    '<div><h1>Konton och lån</h1><p class="dämpad">Tryck på en rad för att ändra den</p></div>';
  TYPNAMN.forEach(function (typ) {
    var poster = data.poster.filter(function (p) { return p.typ === typ[0]; });
    if (poster.length === 0) return;
    html += '<section class="kort"><div class="kort-rubrik"><h2>' + typ[1] + '</h2></div>' + poster.map(function (p) {
      var not = [];
      if (p.andel !== 1) not.push('Min andel ' + Math.round(p.andel * 100) + ' %');
      if (p.avslutad) not.push('Avslutad');
      return '<button type="button" class="rad" data-gör="inst-post" data-id="' + säker(p.id) + '">' +
        '<span class="namn">' + säker(p.namn) + (not.length ? '<small>' + not.join(' · ') + '</small>' : '') + '</span>' +
        '<span class="värde">' + PIL_HÖGER + '</span></button>';
    }).join('') + '</section>';
  });
  return html + '<p class="liten dämpad" style="text-align: center">Nya konton och lån lägger du till på fliken Pengar.</p>';
}

/* ---------- Skärm: ändra ett konto eller lån ---------- */

function ritaInstPost() {
  var post = hittaPost(läge.postId);
  return '<button type="button" class="tillbaka" data-gör="inst-gå" data-till="inst-poster">' + PIL_VÄNSTER + 'Konton och lån</button>' +
    '<h1>' + säker(post.namn) + '</h1>' +
    '<form class="stapel" data-formulär="inst-post" style="gap: 16px">' +
    '<div class="fält"><label for="pnamn">Namn</label><div class="ruta"><input id="pnamn" type="text" autocomplete="off" value="' + säker(post.namn) + '"></div></div>' +
    '<div class="fält"><label for="pandel">Min andel framåt</label><div class="ruta"><input id="pandel" type="text" inputmode="decimal" autocomplete="off" value="' +
    String(Math.round(post.andel * 1000) / 10).replace('.', ',') + '"><span class="enhet">%</span></div></div>' +
    '<p class="liten dämpad">Andelen gäller för kvartal du fyller i från och med nu. Det som redan är ifyllt ändras inte.</p>' +
    (läge.fel ? '<p class="fel" role="alert">' + säker(läge.fel) + '</p>' : '') +
    '<button type="submit" class="knapp">Spara</button></form>' +
    '<section class="kort">' +
    '<button type="button" class="rad fast" data-gör="inst-flytta" data-håll="-1" style="border-top: 0"><span class="namn">Flytta upp i listan</span></button>' +
    '<button type="button" class="rad fast" data-gör="inst-flytta" data-håll="1"><span class="namn">Flytta ner i listan</span></button>' +
    '<button type="button" class="rad fast" data-gör="inst-avsluta"><span class="namn">' + (post.avslutad ? 'Öppna igen' : 'Avsluta') +
    '<small>' + (post.avslutad ? 'Visas igen i nya kvartal' : 'Döljs framåt, historiken finns kvar') + '</small></span></button>' +
    '</section>' +
    '<button type="button" class="knapp varning" data-gör="inst-ta-bort">Ta bort helt, även historiken</button>';
}

function ritaInstVy() {
  if (läge.vy === 'inst-poster') return ritaInstPoster();
  if (läge.vy === 'inst-post') return ritaInstPost();
  return ritaInställningar();
}

// Ger tillbaka true om formuläret hörde till Inställningar.
function instSpara(formulär) {
  if (formulär !== 'inst-post') return false;
  var post = hittaPost(läge.postId);
  var namn = document.getElementById('pnamn').value.trim();
  var procent = räkna(document.getElementById('pandel').value);
  if (!namn) { läge.fel = 'Skriv ett namn.'; rita(); return true; }
  if (procent === null || isNaN(procent) || procent < 0 || procent > 100) { läge.fel = 'Andelen ska vara mellan 0 och 100 %.'; rita(); return true; }
  post.namn = namn;
  post.andel = procent / 100;
  sparaData();
  gåTill('inst-poster');
  return true;
}

/* ---------- Säkerhetskopiera ---------- */

function säkerhetskopiera() {
  var nu = new Date();
  var kopia = JSON.parse(JSON.stringify(data));       // en fristående kopia av all data
  kopia.sparad = nu.toISOString();
  var text = JSON.stringify(kopia, null, 1);
  var datum = nu.getFullYear() + '-' + ('0' + (nu.getMonth() + 1)).slice(-2) + '-' + ('0' + nu.getDate()).slice(-2);
  var filnamn = 'ekonomi-backup-' + datum + '.json';

  function klart() {
    var inst = läsInst();
    inst.senasteKopia = Date.now();
    inst.ändratSedan = false;
    sparaInst(inst);
    rita();
  }

  // Sätt 1 (telefonen): öppna dela-menyn med filen. Vi provar två filtyper eftersom
  // alla webbläsare inte tillåter att man delar .json.
  var filer = [];
  try {
    filer.push(new File([text], filnamn, { type: 'application/json' }));
    filer.push(new File([text], filnamn.replace('.json', '.txt'), { type: 'text/plain' }));
  } catch (fel) { /* mycket gamla webbläsare saknar File */ }

  for (var i = 0; i < filer.length; i++) {
    if (navigator.canShare && navigator.canShare({ files: [filer[i]] })) {
      navigator.share({ files: [filer[i]] }).then(klart).catch(function (fel) {
        // AbortError betyder att du stängde dela-menyn utan att spara. Då räknas det inte som en kopia.
        if (fel && fel.name !== 'AbortError') alert('Det gick inte att dela filen: ' + fel.message);
      });
      return;
    }
  }

  // Sätt 2 (datorn): ladda ner filen som vanligt.
  var länk = document.createElement('a');
  länk.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  länk.download = filnamn;
  document.body.appendChild(länk);
  länk.click();
  document.body.removeChild(länk);
  klart();
}

/* ---------- Tryck ---------- */

// Ger tillbaka true om trycket hörde till Inställningar.
function instTryck(gör, knapp) {
  if (gör.indexOf('inst-') !== 0) return false;
  var post = hittaPost(läge.postId);

  if (gör === 'inst-gå') gåTill(knapp.getAttribute('data-till'));
  else if (gör === 'inst-post') { läge.postId = knapp.getAttribute('data-id'); gåTill('inst-post'); }
  else if (gör === 'inst-avsluta') { post.avslutad = !post.avslutad; sparaData(); rita(); }
  else if (gör === 'inst-flytta') {
    // Byt plats med närmaste post av samma sort, uppåt (-1) eller neråt (+1).
    var håll = Number(knapp.getAttribute('data-håll'));
    var här = data.poster.indexOf(post);
    for (var i = här + håll; i >= 0 && i < data.poster.length; i += håll) {
      if (data.poster[i].typ === post.typ) {
        data.poster[här] = data.poster[i];
        data.poster[i] = post;
        sparaData();
        break;
      }
    }
    gåTill('inst-poster');
  }
  else if (gör === 'inst-ta-bort') {
    if (!confirm('Ta bort "' + post.namn + '" och alla värden som fyllts i för den, i alla kvartal? Summorna bakåt i tiden ändras. Det går inte att ångra.')) return true;
    data.poster.splice(data.poster.indexOf(post), 1);
    Object.keys(data.varden).forEach(function (kvartal) { delete data.varden[kvartal][post.id]; });
    sparaData();
    gåTill('inst-poster');
  }
  else if (gör === 'inst-kopiera') säkerhetskopiera();
  else if (gör === 'inst-återställ') document.getElementById('återställfil').click();
  else if (gör === 'inst-påminn') {
    var inst = läsInst();
    inst.påminnDagar = PÅMINN_VAL[(PÅMINN_VAL.indexOf(inst.påminnDagar) + 1) % PÅMINN_VAL.length];
    sparaInst(inst);
    rita();
  }
  return true;
}

// Anropas från app.js när man valt en fil att återställa från.
function återställFrånFil(fil) {
  if (harData() && !confirm('Återställningen ersätter allt som finns i appen nu med innehållet i filen. Vill du fortsätta?')) return;
  läsInFil(fil, function () {
    var inst = läsInst();
    inst.ändratSedan = false;                          // appen är nu lika med filen
    if (inst.senasteKopia === null) inst.senasteKopia = Date.now();
    sparaInst(inst);
    alert('Klart. Appen är återställd från filen.');
    gåTill('pengar');
  });
}
