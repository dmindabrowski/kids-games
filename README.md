# Kącik Gier Jasia

Tabletowa PWA z trzema minigrami dla trzylatka: puzzle i memo ze zdjęć rodziny oraz nauka cyfr 1–10 z wozami strażackimi. Zdjęcia są przechowywane w IndexedDB na urządzeniu i nigdy nie są wysyłane na serwer.

**Repozytorium:** [github.com/dmindabrowski/kids-games](https://github.com/dmindabrowski/kids-games)
**Wersja live:** [dmindabrowski.github.io/kids-games](https://dmindabrowski.github.io/kids-games/)

## Gry

- **Puzzle** — jedno zdjęcie podzielone na 12 elementów (4 × 3 dla poziomych, 3 × 4 dla pionowych). Rodzic wybiera zdjęcie, dziecko układa kafelki metodą przeciągnij-i-upuść lub dotknij-i-dotknij pola docelowego. Puste pola pokazują wyszarzoną podpowiedź pasującego fragmentu.
- **Memo** — 5 par z pięciu wybranych zdjęć.
- **Liczby** — dziecko liczy wozy strażackie (od 1 do 10) i wybiera właściwą cyfrę z trzech opcji. Trudność rośnie automatycznie: 1–5, 1–7, 1–10. Aplikacja mówi po polsku wynik (np. „Trzy!”) i chwali dziecko — na przemian „Brawo Strażaku Jasiu!” i „Super Jasiu!”.

Po ułożeniu puzzli, znalezieniu wszystkich par lub trafieniu cyfry pojawia się pełnoekranowa celebracja z uśmiechniętą buźką, konfetti i dźwiękiem fanfar.

## Uruchomienie lokalne

Dowolny serwer statyczny wystarczy. Z katalogu repozytorium:

```sh
python3 -m http.server 8001
```

Otwórz `http://localhost:8001`. Aplikację można dodać do ekranu początkowego przez menu **Udostępnij → Dodaj do ekranu początkowego** w Safari na iPadzie.

## Hosting

Projekt jest publikowany przez **GitHub Pages** z gałęzi `main` (katalog główny). Każdy commit do `main` uruchamia automatyczny rebuild w ciągu ~1 minuty. Aby użyć własnego hostingu, wystarczy wgrać zawartość katalogu na dowolny serwer statyczny obsługujący HTTPS (wymagane przez Service Worker).

## Struktura

```
kids-games/
├── index.html              # UI i podstrony gier
├── styles.css              # układ tabletowy, motyw, celebracja
├── app.js                  # logika gier, IndexedDB, dźwięk i mowa
├── sw.js                   # Service Worker — cache offline
├── manifest.webmanifest    # PWA manifest
├── icon.svg                # ikona
└── assets/
    └── woz-strazacki.svg   # ilustracja do gry Liczby
```

## Prywatność

- Zdjęcia zapisują się wyłącznie w IndexedDB przeglądarki na urządzeniu.
- Aplikacja nie łączy się z żadnym serwerem po pierwszym pobraniu.
- Głos syntezowany działa lokalnie przez Web Speech API (bez wysyłania danych).

## Licencja

MIT © Damian Dąbrowski
