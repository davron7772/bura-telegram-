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
   - «Yangi stol ochish» — shu guruhda yana bir stol. Bot guruhga «… 2-stolni ochdi» deb xabar beradi.
   Jamoalar: 1 va 3-oʻrin, 2 va 4-oʻrin (sherik roʻparada). Odam kam boʻlsa, stol egasi boʻsh oʻrinlarga bot qoʻshadi.
4. Stoldan zalga qaytish: lobbidagi «← Barcha stollar», menyudagi «Barcha stollar (zal)» yoki Telegram'ning «Orqaga» tugmasi.

Guruhda bitta zal xabari turadi va stollar oʻzgarganda yangilanadi; `/bura` uni chat pastiga qayta chiqaradi (eskisi oʻchadi). Kutayotgan boʻsh stol boʻlmasa, `/bura` yangi stol ham ochadi.

Bot bilan shaxsiy chatda ham `/bura` yozish mumkin — bot havolani doʻstlaringizga yuborish tugmasini beradi.

## Ovozli chat

- Lobbida «Ovozli chat» qatoridagi, oʻyin paytida esa yuqoridagi mikrofon tugmasini bosing. Telegram mikrofonga ruxsat soʻraydi.
- Tugmani yana bossangiz, mikrofon oʻchadi yoki yoqiladi. Kimlar ulangani va «Chiqish» tugmasi — ☰ menyusida.
- Gapirayotgan kishining avatarida yashil halqa chiqadi. Kichik mikrofon belgisi u ovozli chatda ekanini bildiradi.
- Mikrofonga ruxsat berilmasa ham, oʻyinchi boshqalarni eshitadi (faqat tinglaydi). Keyinroq tugmani bosib, mikrofonni yoqishi mumkin.
- Menyuda istalgan kishining ovozini faqat oʻzingiz uchun oʻchirib qoʻyish mumkin.
- Bir stolda bir vaqtda 6 kishigacha (4 oʻyinchi va 2 tomoshabin).

Ovoz telefonlar oʻrtasida toʻgʻridan-toʻgʻri (WebRTC) uzatiladi. Server faqat ulanishga yordam beradi: ovoz serverdan oʻtmaydi va yozib olinmaydi.

**TURN server (tavsiya etiladi).** Baʼzi mobil tarmoqlarda telefonlar bir-biriga toʻgʻridan-toʻgʻri ulana olmaydi — bunday paytda ovoz TURN server orqali oʻtadi. TURN boʻlmasa ham ovozli chat ishlaydi, faqat ayrim oʻyinchilar ulana olmasligi mumkin (menyuda «ulanib boʻlmadi» deb chiqadi). Bepul variant — Metered Open Relay (yozilish paytida bepul tarifi oyiga 20 GB edi; bir kishining ovozi soatiga taxminan 25 MB):

1. metered.ca saytida roʻyxatdan oʻting va TURN server login-parolini oling.
2. Render → xizmatingiz → **Environment** boʻlimiga `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` qoʻshing (namuna `.env.example` faylida). Yoki Metered koʻrsatgan `iceServers` roʻyxatini butunligicha `ICE_SERVERS` ga qoʻying.
3. Saqlang — server qayta ishga tushadi.

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
- Kartalar tugagach jamoa ochkolari sanaladi: 61 va undan koʻp — gʻalaba, 60:60 — durang.
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
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Ovozli chat uchun TURN server (ixtiyoriy, tavsiya etiladi) |
| `ICE_SERVERS` | STUN/TURN roʻyxati JSON koʻrinishida. Berilsa, `STUN_URLS` va `TURN_*` oʻrniga ishlatiladi |
| `STUN_URLS` | STUN serverlar (standart: Google va Cloudflare) |
| `VOICE_RELAY_ONLY` | `1` — ovoz faqat TURN orqali oʻtadi, IP manzillar yashirin qoladi (TURN shart) |

## Bilish kerak

- Stollar server xotirasida saqlanadi. Server qayta ishga tushsa, ochiq oʻyinlar va match hisobi yangidan boshlanadi.
- Render bepul tarifida server 15 daqiqa ishlatilmasa «uxlaydi». Shundan keyingi birinchi `/bura` ga javob 30–60 soniya kechikishi mumkin.
- Avtomatik testlar: `npm test` (qoidalar, yopiq koʻzir, jamoa hisobi, stol, oʻyin zali, initData tekshiruvi, ovozli chat signallari, 4 kishilik toʻliq oʻyin).
- Demo: `npm run build:demo` → `dist/bura-demo.html`. Kompyuter oʻyinchilariga qarshi, internetsiz ishlaydi.

## Fayllar

```
server.js          HTTP server, WebSocket, botni ishga tushirish
src/engine.js      Qoidalar va kompyuter oʻyinchisi (server va brauzer uchun umumiy)
src/room.js        Stol: 4 oʻrin (2×2), navbat, taymer, match hisobi
src/hub.js         WebSocket ulanishlari, guruh zali va ovozli chat signallari
src/ice.js         Ovozli chat uchun STUN/TURN sozlamalari
src/bot.js         Telegram buyruqlari va guruhdagi stol xabari
src/auth.js        Telegram initData tekshiruvi
public/            Mini App: index.html, style.css, app.js, voice.js (ovozli chat), shriftlar
assets/            BotFather uchun rasm
test/              Avtomatik testlar
```
