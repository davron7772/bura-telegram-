# Bura — Telegram Mini App

Telegram guruhida 4 kishi — 2×2 jamoa boʻlib — oʻynaydigan **Bura** karta oʻyini: 4 tadan karta, 61 ochko, yopiq koʻzir.

Guruhda `/bura` deb yoziladi. Bot oʻyin stolini ochib, «🎮 Oʻyinga kirish» tugmasini yuboradi. 4 kishi tugmani bossa, oʻyin oʻzi boshlanadi.

## Nimalar bor

- **Telegram bot** — `/bura` buyrugʻi bilan stol ochadi. Guruhdagi xabar oʻyin davomida yangilanib turadi: jamoalar, raund, hisob.
- **Mini App** — telefonga moslashtirilgan oʻyin stoli (Telegram ichida ochiladi).
- **Ovozli chat** — stoldagilar Mini App ichida bir-biri bilan gaplashadi; kim gapirayotgani avatarida koʻrinib turadi.
- **Oʻyin zali** — guruhdagi barcha stollar bitta ekranda (poker zali kabi): kim qaysi stolda oʻtirgani, hisob, boʻsh oʻrinlar. Keyin kelgan kishi stol tanlaydi, kuzatadi yoki yangi stol ochadi.
- **Server** — 4 kishini real vaqtda bogʻlaydi va qoidalarni tekshiradi. Kartalar serverda saqlanadi, shuning uchun hech kim boshqaning kartasini koʻra olmaydi.
- **Kompyuter oʻyinchilari** — odam yetmasa, stol egasi boʻsh oʻrinlarga bot qoʻshadi. Kimdir chiqib ketsa yoki vaqtida yurmasa, uning oʻrniga avtomatik yuriladi.
- **Hisob** — raundda yutqazgan jamoaga 2, 4 yoki 6 ball yoziladi; 14 ballga yetgan jamoa matchni yutqazadi, aynan 12 ballda esa shans beriladi.

## 1-qadam. Bot yaratish

1. Telegramʼda **@BotFather** ni oching va `/newbot` yuboring.
2. Bot nomini va username kiriting (masalan, `BuraOyinBot`).
3. BotFather bergan **token**ni saqlab qoʻying (koʻrinishi: `1234567890:AAH...`). Uni hech kimga bermang.

## 2-qadam. Serverga joylash

Mini App faqat **HTTPS** manzilda ishlaydi. Eng oson yoʻl — [Render.com](https://render.com) (bepul tarif bor).

1. Kodni GitHubʼdagi repozitoriyga joylang (`node_modules` papkasi kerak emas).
2. Render → **New → Blueprint** → repozitoriyni tanlang. Render `render.yaml` faylini oʻqiydi va faqat `BOT_TOKEN` ni soʻraydi — BotFather bergan tokenni kiriting.
3. Deploy tugagach, Render bergan manzilni oching va oxiriga `/health` qoʻshing (masalan `https://bura-abcd.onrender.com/health`) — `ok` chiqishi kerak.

`PUBLIC_URL` Renderʼda shart emas: server oʻz manzilini `RENDER_EXTERNAL_URL` orqali oʻzi aniqlaydi.

Bepul tarifda server 15 daqiqa ishlatilmasa «uxlaydi» va keyingi soʻrovda taxminan bir daqiqada uygʻonadi. Doim yoqiq turishi uchun Starter tarifiga (oyiga 7 $) oʻtkazish mumkin.

**Oʻz serveringiz (VPS) boʻlsa:**

```bash
cp .env.example .env        # ichini toʻldiring
docker build -t bura .
docker run -d --restart=always -p 3000:3000 --env-file .env bura
```

HTTPS uchun oldiga Caddy yoki Nginx qoʻying (domen kerak).

**Faqat kompyuterda sinash uchun:** `npm install`, keyin `npx cloudflared tunnel --url http://localhost:3000` bergan `https://…trycloudflare.com` manzilini `PUBLIC_URL` ga yozib, `npm start`.

## 3-qadam. Mini App ni botga ulash

1. @BotFather → `/newapp` → botingizni tanlang.
2. Sarlavha: `Bura`. Tavsif: `Guruhda 4 kishilik Bura karta oʻyini`.
3. Rasm (640×360) soʻralganda `assets/bura-cover-640x360.png` faylini yuboring.
4. GIF soʻralsa: `/empty`.
5. Web App URL: `PUBLIC_URL` dagi manzil.
6. Short name: `bura` — bu `APP_SHORT_NAME` bilan bir xil boʻlishi kerak.

## 4-qadam. Oʻynash

1. Botni guruhga qoʻshing.
2. Guruhda `/bura` yozing — bot guruhga **oʻyin zali** xabarini yuboradi.
3. «🎮 Oʻyin zaliga kirish» tugmasini bosing. Zalda guruhdagi barcha stollar koʻrinadi:
   - boʻsh oʻrinni (+) bossangiz, oʻsha jamoaga oʻtirasiz; 4 kishi yigʻilsa, oʻyin oʻzi boshlanadi;
   - oʻyin ketayotgan stolni kuzatish mumkin; raund tugagach, bot oʻrniga oʻtirasiz;
   - «Yangi stol ochish» — tanlov chiqadi: **«Doʻstlar bilan»** (stol botsiz ochiladi, bot guruhga «… 2-stolni ochdi» deb xabar beradi) yoki **«Botlar bilan»** (boʻsh oʻrinlarga darhol botlar oʻtiradi).
   Jamoalar: 1 va 3-oʻrin, 2 va 4-oʻrin (sherik roʻparada).
   Lobbida har bir boʻsh oʻrin yonida: **«Taklif qilish»** — doʻstingizga aynan shu oʻringa havola (sherik yoki raqib oʻrni), **«Bot»** — stol egasi shu oʻringa bot qoʻyadi, **«Oʻtirish»** — oʻzingiz oʻtirasiz. Oʻyin faqat 4 oʻrin toʻlganda boshlanadi.
   Oʻyin vaqtida:
   - botni (avatarini) bossangiz — «Stoldan chiqarish»; oʻyin toʻxtaydi, boʻsh joyga odam oʻtirishi yoki yangi bot qoʻshilishi kerak;
   - ☰ → «Stoldan turish»: oʻrin boʻshaydi, siz kuzatuvchi boʻlib qolasiz; boʻsh joyga bot qoʻshish yoki doʻstni taklif qilish mumkin;
   - kuzatuvchi boʻsh oʻrinni bosib oʻtiradi va oʻsha oʻrindagi kartalarni oladi;
   - oʻrin toʻlgach, stol egasi tanlaydi: «Davom ettirish» yoki «Yangidan boshlash» (hisob 0:0); tanlamasa, 30 soniyadan keyin oʻyin davom etadi;
   - stolda birorta ham odam qolmasa, stol yopiladi; hamma odam oflayn boʻlib, 90 soniya qaytmasa ham yopiladi.
4. Stoldan zalga qaytish: lobbidagi «← Barcha stollar», menyudagi «Barcha stollar (zal)» yoki Telegram'ning «Orqaga» tugmasi.

Guruhda bitta zal xabari turadi va stollar oʻzgarganda yangilanadi; `/bura` uni chat pastiga qayta chiqaradi (eskisi oʻchadi). Kutayotgan boʻsh stol boʻlmasa, `/bura` yangi stol ham ochadi.

Ilovani botdan (shaxsiy chatdan) ochganda **umumiy zal** chiqadi: guruhsiz ochilgan barcha stollar, istalganiga kirib, boʻsh oʻringa oʻtirish mumkin. Alohida lobbi ekrani yoʻq — stol ochgan kishi zalda oʻz stoli atrofida koʻrinadi, boʻsh oʻrinni bosib bot qoʻshadi yoki doʻstini taklif qiladi; 4 kishi toʻlganda hamma oʻyin ekraniga oʻtadi.

Bot bilan shaxsiy chatda ham `/bura` yozish mumkin — bot havolani doʻstlaringizga yuborish tugmasini beradi.

## Ovozli chat

- Lobbida «Ovozli chat» qatoridagi, oʻyin paytida esa yuqoridagi mikrofon tugmasini bosing. Telegram mikrofonga ruxsat soʻraydi.
- Tugmani yana bossangiz, mikrofon oʻchadi yoki yoqiladi. Kimlar ulangani va «Chiqish» tugmasi — ☰ menyusida.
- Gapirayotgan kishining avatarida yashil halqa chiqadi. Kichik mikrofon belgisi u ovozli chatda ekanini bildiradi.
- Mikrofonga ruxsat berilmasa ham, oʻyinchi boshqalarni eshitadi (faqat tinglaydi). Keyinroq tugmani bosib, mikrofonni yoqishi mumkin.
- Menyuda istalgan kishining ovozini faqat oʻzingiz uchun oʻchirib qoʻyish mumkin.
- Bir stolda bir vaqtda 6 kishigacha (4 oʻyinchi va 2 tomoshabin).

- Ovozli chatga qoʻshilmagan oʻyinchilar menyuda «ovozli chatga qoʻshilmagan» deb koʻrinadi; kimdir qoʻshilsa, qolganlarga eslatma chiqadi va mikrofon tugmasi yonib-oʻchadi.

Ovoz imkon boʻlsa telefonlar oʻrtasida toʻgʻridan-toʻgʻri (WebRTC) uzatiladi. Mobil internetda (operator NAT) toʻgʻridan-toʻgʻri ulanish koʻpincha boʻlmaydi — shunda oʻsha juftlik ovozi **server orqali** uzatiladi (16 kHz, siqilgan; bir gapirayotgan kishi ~65 kbit/s). Shuning uchun stoldagilar har doim bir-birini eshitadi. Menyuda har bir kishi yonida «toʻgʻridan-toʻgʻri» yoki «server orqali» yozuvi chiqadi. Ovoz yozib olinmaydi. Render loglarida `[ovoz] stol …` qatorlari kim kim bilan qanday ulanganini koʻrsatadi (ismlarsiz).

**TURN server (ixtiyoriy, sifat uchun).** TURN boʻlsa, server orqali oʻtadigan juftliklar ham WebRTC'ning toʻliq sifati va kam kechikishi bilan gaplashadi. Kalitni API orqali olish eng qulayi — server uni oʻzi yangilab turadi:

- **Cloudflare Realtime TURN** (oyiga 1000 GB bepul): Cloudflare panelida Realtime → TURN Server → yangi kalit yarating va Render → **Environment** ga `CF_TURN_KEY_ID` va `CF_TURN_API_TOKEN` qoʻshing.
- **Metered Open Relay** (oyiga 20 GB bepul): metered.ca da roʻyxatdan oʻtib, ilova nomi va API kalitni `METERED_APP` va `METERED_API_KEY` ga yozing.
- Yoki doimiy login-parol: `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` (yoki `ICE_SERVERS`).

Saqlang — server qayta ishga tushadi va logda «Ovozli chat: STUN + TURN (…)» deb yozadi.

**Maxfiylik.** Toʻgʻridan-toʻgʻri ulanishda qatnashchilar bir-birining IP manzilini koʻra oladi (WebRTC shunday ishlaydi). Buni yashirish uchun TURN sozlab, `VOICE_RELAY_ONLY=1` qiling — ovoz faqat TURN orqali oʻtadi.

**Qurilmalar.** iPhone'da iOS 14.3 yoki yangiroq kerak. Hammangiz bir xonada boʻlsangiz, quloqchin taqing yoki ovozli chatni yoqmang — aks holda ovoz qaytib, shovqin chiqadi.

## Qoidalar (qisqacha)

- 4 oʻyinchi, 2×2 jamoa. Sherigingiz roʻparangizda oʻtiradi, ochkolar jamoaga qoʻshiladi.
- 36 ta karta. Kuch tartibi: Tuz › 10 › Korol › Dama › Valet › 9 › 8 › 7 › 6. Kartada: **T**, **K**, **D**, **V**.
- Ochkolar: Tuz 11, 10 — 10, Korol 4, Dama 3, Valet 2, qolganlari 0. Jami 120.
- Har kimga 4 tadan karta. Bitta karta koʻzir qilib ochiladi, yana bittasi yopiq turadi. Kolodadan avval oddiy kartalar, keyin ochiq koʻzir, eng oxirida yopiq karta olinadi. Yopiq kartani olgan oʻyinchi uni hammaga koʻrsatadi va **koʻzir masti shu kartanikiga almashadi**.
- Birinchi yurish har raundda navbat bilan keyingi oʻyinchiga oʻtadi.
- Yurish: 1 ta karta yoki bir xil mastdagi 2–4 ta karta. Qolganlar shuncha karta tashlaydi.
- Stoldagi eng kuchli toʻplamning har bir kartasini urgan oʻyinchi oldinga chiqadi. 10 korolni bosadi, korol 10 ni bosa olmaydi. Oddiy 10 ni faqat koʻzir bosadi; koʻzir korol koʻzir 10 ni bosa olmaydi.
- Ura olmasangiz yoki xohlamasangiz, kartalar yopiq beriladi.
- Eng kuchli toʻplam egasi hamma kartalarni oladi, birinchi boʻlib kolodadan oladi va yuradi.
- **Bura** — qoʻldagi 4 kartaning hammasi koʻzir: navbatsiz yuradi (dastur buni avtomatik qiladi).
- **4 ta tuz** — mutlaq gʻalaba (6 ball).
- Kartalar tugagach jamoa ochkolari sanaladi: 61 va undan koʻp — gʻalaba. 60:60 — durang: hech kimga ball yozilmaydi, keyingi raundda yutqazgan jamoaga yana +2 ball qoʻshiladi (ketma-ket duranglarda — har biri uchun +2).
- Yurish vaqti tugasa, qoʻldagi chap tarafdagi kartalar avtomatik yuriladi (javobda — chapdan kerakli sondagi kartalar; ura olsa — ochiq, aks holda yopiq).
- Stolni kuzatayotganlar (mehmonlar) oʻynayotganlarga ham koʻrinadi — stol oʻrtasida, oʻng tomonda.
- Raundda yutqazgan jamoaga ball yoziladi: 31 va undan koʻp ochko olgan boʻlsa — 2, 31 dan kam — 4, birorta ham karta ololmagan boʻlsa yoki raqibda 4 ta tuz chiqsa — 6.
- Ball qancha kam boʻlsa, shuncha yaxshi: 14 va undan koʻp ball toʻplagan jamoa matchni yutqazadi.
- Aynan 12 ballda jamoaga shans beriladi — yana oʻynaydi. Yutsa, 12 da qoladi va keyingi raund ham shans boʻladi; yana yutqazsa, 14+ ball boʻlib matchni boy beradi.

Qoidalar `src/engine.js` faylida jamlangan; boshqa mahalliy variant kerak boʻlsa, oʻsha yerda oʻzgartiriladi.

## Sozlamalar (.env)

| Oʻzgaruvchi | Maʼnosi |
|---|---|
| `BOT_TOKEN` | BotFather bergan token |
| `PUBLIC_URL` | Serverning HTTPS manzili |
| `APP_SHORT_NAME` | `/newapp` dagi qisqa nom. Boʻsh qoldirilsa, «asosiy Mini App» havolasi ishlatiladi (BotFather → Bot Settings → Configure Mini App) |
| `TURN_SECONDS` | Har yurishga beriladigan vaqt, soniya (standart 30) |
| `BOT_MODE` | `webhook` yoki `polling`. Boʻsh boʻlsa: `PUBLIC_URL` https boʻlsa — webhook |
| `PORT` | Server porti (standart 3000) |
| `DEV_MODE` | `1` — Telegramsiz brauzerda sinash: `http://localhost:3000/?dev=1&uid=1&name=Ali`. Ochiq serverda yoqmang! |
| `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` | Cloudflare Realtime TURN kaliti — server vaqtinchalik TURN parollarini oʻzi oladi (ixtiyoriy) |
| `METERED_APP`, `METERED_API_KEY` | Metered / Open Relay — ilova nomi va API kalit (ixtiyoriy) |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Doimiy TURN server login-paroli (ixtiyoriy) |
| `ICE_SERVERS` | STUN/TURN roʻyxati JSON koʻrinishida. Berilsa, `STUN_URLS` va `TURN_*` oʻrniga ishlatiladi |
| `STUN_URLS` | STUN serverlar (standart: Google va Cloudflare) |
| `VOICE_RELAY_ONLY` | `1` — ovoz faqat TURN orqali oʻtadi, IP manzillar yashirin qoladi (TURN shart) |
| `VOICE_FWD` | `0` — toʻgʻridan-toʻgʻri ulanmaganlar ovozini server orqali uzatishni oʻchirish (standart yoqiq) |

## Bilish kerak

- Stollar server xotirasida saqlanadi. Server qayta ishga tushsa, ochiq oʻyinlar va match hisobi yangidan boshlanadi.
- Render bepul tarifida server 15 daqiqa ishlatilmasa «uxlaydi». Shundan keyingi birinchi `/bura` ga javob 30–60 soniya kechikishi mumkin.
- Avtomatik testlar: `npm test` (qoidalar, yopiq koʻzir, jamoa hisobi, stol, botsiz/botli stol va oʻringa taklif, oʻyin zali, initData tekshiruvi, ovozli chat signallari, server orqali ovoz va kodek, TURN API, 4 kishilik toʻliq oʻyin).
- Demo: `npm run build:demo` → `dist/bura-demo.html`. Kompyuter oʻyinchilariga qarshi, internetsiz ishlaydi.

## Fayllar

```
server.js          HTTP server, WebSocket, botni ishga tushirish
src/engine.js      Qoidalar va kompyuter oʻyinchisi (server va brauzer uchun umumiy)
src/room.js        Stol: 4 oʻrin (2×2), navbat, taymer, match hisobi
src/hub.js         WebSocket ulanishlari, guruh zali va ovozli chat signallari
src/ice.js         Ovozli chat uchun STUN/TURN sozlamalari
src/turn.js        TURN kalitlarini API orqali olish (Cloudflare / Metered)
src/adpcm.js       Server orqali ovoz uchun kodek (server va brauzer uchun umumiy)
src/bot.js         Telegram buyruqlari va guruhdagi stol xabari
src/auth.js        Telegram initData tekshiruvi
public/            Mini App: index.html, style.css, app.js, voice.js va voice-worklet.js (ovozli chat), shriftlar
assets/            BotFather uchun rasm
test/              Avtomatik testlar
```
