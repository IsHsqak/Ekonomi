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
    '<section class="kort"><div class="kort-rubrik"><h2>Bilar</h2></div>' +
    '<button type="button" class="rad" data-gör="bil-gå" data-till="bil-lista"><span class="namn">Mina bilar<small>Byt eller lägg till bil</small></span>' +
    '<span class="värde">' + data.bilar.length + ' st' + PIL_HÖGER + '</span></button></section>';
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
function instTryck(gör) {
  if (gör.indexOf('inst-') !== 0) return false;
  if (gör === 'inst-kopiera') säkerhetskopiera();
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
