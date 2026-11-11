/*
  sw.js är en "service worker": ett litet program som webbläsaren kör i bakgrunden.
  Dess enda jobb här är att appen ska gå att öppna UTAN internet.

  Så här fungerar den:
    1. Första gången appen öppnas sparar den en kopia av appens filer på telefonen.
    2. Varje gång appen öppnas försöker den hämta färska filer från nätet
       (så att du får nya versioner när vi bygger vidare).
    3. Går det inte, för att du saknar nät, används kopian på telefonen.

  Den rör bara appens KOD. Dina siffror ligger i localStorage och berörs inte.
*/
var KOPIA = 'ekonomi-app-filer';
var FILER = ['./', 'index.html', 'style.css', 'app.js', 'bilar.js', 'manifest.webmanifest', 'ikoner/ikon-180.png'];

self.addEventListener('install', function (händelse) {
  händelse.waitUntil(caches.open(KOPIA).then(function (c) { return c.addAll(FILER); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (händelse) {
  händelse.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (händelse) {
  if (händelse.request.method !== 'GET') return;
  händelse.respondWith(
    fetch(händelse.request)
      .then(function (svar) {
        // Nät finns: spara en färsk kopia och visa den.
        var kopia = svar.clone();
        caches.open(KOPIA).then(function (c) { c.put(händelse.request, kopia); });
        return svar;
      })
      .catch(function () {
        // Inget nät: använd kopian på telefonen.
        return caches.match(händelse.request, { ignoreSearch: true });
      })
  );
});
