# Bura — Telegram Mini App

Telegram guruhida 4 kishi — 2×2 jamoa boʻlib — oʻynaydigan **Bura** karta oʻyini: 4 tadan karta, 61 ochko, yopiq koʻzir.

Guruhda `/bura` deb yoziladi. Bot oʻyin stolini ochib, «🎮 Oʻyinga kirish» tugmasini yuboradi. 4 kishi tugmani bossa, oʻyin oʻzi boshlanadi.

## Nimalar bor

- **Telegram bot** — `/bura` buyrugʻi bilan stol ochadi. Guruhdagi xabar oʻyin davomida yangilanib turadi: jamoalar, raund, hisob.
- **Mini App** — telefonga moslashtirilgan oʻyin stoli (Telegram ichida ochiladi).
- **Server** — 4 kishini real vaqtda bogʻlaydi va qoidalarni tekshiradi. Kartalar serverda saqlanadi, shuning uchun hech kim boshqaning kartasini koʻra olmaydi.
- **Kompyuter oʻyinchilari** — odam yetmasa, stol egasi boʻsh oʻrinlarga bot qoʻshadi. Kimdir chiqib ketsa yoki vaqtida yurmasa, uning oʻrniga avtomatik yuriladi.
- **Hisob** — gʻolib jamoa raundda 2, 4 yoki 6 ball oladi; 12 ballga birinchi yetgan jamoa matchni yutadi.

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
2. Guruhda `/bura` yozing.
3. 4 kishi «🎮 Oʻyinga kirish» tugmasini bosadi — oʻyin oʻzi boshlanadi.
   Jamoalar: 1 va 3-oʻrin, 2 va 4-oʻrin (sherik roʻparada). Lobbida boʻsh oʻrindagi «Oʻtirish» tugmasi bilan jamoani tanlash mumkin.
   Odam kam boʻlsa, stol egasi (birinchi kirgan kishi) boʻsh oʻrinlarga bot qoʻshadi.

Bot bilan shaxsiy chatda ham `/bura` yozish mumkin — bot havolani doʻstlaringizga yuborish tugmasini beradi.

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
- Gʻolib jamoa ball oladi: raqib 31+ ochko olgan boʻlsa — 2, 31 dan kam — 4, birorta ham karta olmagan boʻlsa — 6. 12 ballga birinchi yetgan jamoa matchni yutadi.

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

## Bilish kerak

- Stollar server xotirasida saqlanadi. Server qayta ishga tushsa, ochiq oʻyinlar va match hisobi yangidan boshlanadi.
- Render bepul tarifida server 15 daqiqa ishlatilmasa «uxlaydi». Shundan keyingi birinchi `/bura` ga javob 30–60 soniya kechikishi mumkin.
- Avtomatik testlar: `npm test` (qoidalar, yopiq koʻzir, jamoa hisobi, stol, initData tekshiruvi, 4 kishilik toʻliq oʻyin).
- Demo: `npm run build:demo` → `dist/bura-demo.html`. Kompyuter oʻyinchilariga qarshi, internetsiz ishlaydi.

## Fayllar

```
server.js          HTTP server, WebSocket, botni ishga tushirish
src/engine.js      Qoidalar va kompyuter oʻyinchisi (server va brauzer uchun umumiy)
src/room.js        Stol: 4 oʻrin (2×2), navbat, taymer, match hisobi
src/hub.js         WebSocket ulanishlari
src/bot.js         Telegram buyruqlari va guruhdagi stol xabari
src/auth.js        Telegram initData tekshiruvi
public/            Mini App: index.html, style.css, app.js, shriftlar
assets/            BotFather uchun rasm
test/              Avtomatik testlar
```
