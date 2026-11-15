# Bura — mobil ilova (iPhone va Android)

Expo (React Native) ilovasi. Dizayn Figma'dagi «Bura — Mobil ilova dizayni» fayli asosida qilingan.
O‘yin qoidalari Telegram versiyasi bilan **bitta kod**: `../src/engine.js` va `../src/room.js`.
Qoidani o‘zgartirsangiz, ikkala versiyada ham o‘zgaradi.

## Hozir nima ishlaydi

- **Bosh sahifa** — profil, tanga, «Tezkor o‘yin», «Do‘stlar bilan xona», kunlik sovg‘a, pastki menyu.
- **Xona** — jamoalar, qoidalar, «Botlar bilan boshlash».
- **O‘yin stoli** — 3 ta kompyuter o‘yinchisiga qarshi to‘liq o‘yin: yurish, urish, yopiq berish,
  bir nechta karta bilan yurish, yopiq ko‘zir, Bura, 4 tuz, yurish taymeri.
- **Natija** — raund ochkolari, match hisobi (14 — mag‘lubiyat, 12 — imkoniyat), keyingi raund.

Hali yo‘q: onlayn o‘yin (do‘stlar bilan), xona kodi, reyting, do‘kon, profil. Tangalar hozircha faqat ko‘rinish uchun.

## Telefonda sinash

```bash
cd mobile
npm install
npx expo start
```

Telefoningizga **Expo Go** ilovasini o‘rnating va terminaldagi QR kodni skanerlang
(iPhone'da — Kamera, Android'da — Expo Go ichidan).

## Tekshiruvlar

```bash
npx tsc --noEmit     # turlar
npx expo lint        # kod uslubi
npx expo export --platform web   # brauzer uchun yig'ish (dist/)
```

## Do'konlarga chiqarish (EAS)

1. expo.dev'da akkaunt oching.
2. `npx eas-cli@latest login`, so‘ng `npx eas-cli@latest init` — loyiha yaratiladi va `app.json` ga `projectId` yoziladi.
3. Sinov uchun: `npx eas-cli@latest build --profile preview --platform android` (APK).
4. Do‘kon uchun: `--profile production`, keyin `eas submit`.

`app.json` dagi `com.sabirovvisuals.bura` — vaqtinchalik ilova identifikatori. Do‘konga birinchi marta chiqarishdan oldin
o‘zingiz xohlagan nomga almashtiring: keyin uni o‘zgartirib bo‘lmaydi.
