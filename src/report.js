'use strict';
// Bitta oʻyinchi boʻyicha batafsil tahlil (bot egasi uchun /tahlil buyrugʻi)

const ST = require('./stats');

function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

function report(S, u) {
  const an = u.an || {};
  const L = [];
  const list = S.list ? S.list(1000) : [];
  const rank = list.findIndex(function (x) { return x.id === u.id; });
  const name = esc(u.name || 'Oʻyinchi') + (u.un ? ' (@' + esc(u.un) + ')' : '');
  L.push('🎓 <b>Oʻyin tahlili: ' + name + '</b>', '');
  L.push('<b>Umumiy koʻrsatkichlar</b>');
  L.push('🃏 ' + u.rounds + ' raund · ⏱ ' + Math.round((u.playMs || 0) / 360000) / 10 + ' soat · ' + (u.days || 0) + ' kun');
  L.push('⭐ Reyting: ' + ST.ratingOf(u) + ' ball (mahorat ' + Math.round(ST.skillOf(u)) + '%, tajriba +' + ST.xpOf(u) + ', magʻlubiyat −' + ST.lossOf(u) + ')' + (rank >= 0 ? ' — ' + (rank + 1) + '-oʻrin' : ''));
  L.push('✅ Toʻgʻri yurishlar: ' + pct(u.good, u.moves) + '% (' + u.moves + ' yurishdan)');
  L.push('🏆 Yutgan raundlar: ' + pct(u.wins + u.draws * 0.5, u.rounds) + '%');
  const fairAvg = u.fair && u.rounds ? u.fair / u.rounds : 0;
  L.push('🎯 Oʻrtacha ochko: ' + (u.rounds ? Math.round(u.points / u.rounds) : 0) + (fairAvg ? ' (adolatli ulush ≈ ' + Math.round(fairAvg) + ')' : ''));
  if (u.auto) L.push('⌛ Vaqti tugab, kompyuter yurgan: ' + u.auto + ' marta (' + pct(u.auto, u.moves) + '%)');

  const moves = (an.lead || 0) + (an.beatOpp || 0) + (an.beatPartner || 0) + (an.discPartner || 0) + (an.discOpp || 0);
  if (moves < 40) {
    L.push('', '⏳ <i>Batafsil tahlil uchun maʼlumot hali kam (' + moves + ' yurish yozilgan). Har bir yurish turi boʻyicha hisob 21-noyabrdan yuritilmoqda — 50–100 raunddan keyin aniq xulosa chiqadi.</i>');
    return L.join('\n');
  }

  // ---- raund natijalari ----
  L.push('', '<b>Raund natijalari</b> (batafsil hisob boshlangandan beri)');
  if (an.r2) L.push('• 2 kishilik: ' + an.r2 + ' raund, yutish ' + pct(an.w2 || 0, an.r2) + '%, oʻrtacha ' + Math.round((an.pts2 || 0) / an.r2) + ' ochko (adolatli 60)');
  if (an.r4) L.push('• 4 kishilik: ' + an.r4 + ' raund, yutish ' + pct(an.w4 || 0, an.r4) + '%, oʻrtacha ' + Math.round((an.pts4 || 0) / an.r4) + ' ochko (adolatli 30)');
  if (an.rHum) L.push('• Odamlarga qarshi: yutish ' + pct(an.wHum || 0, an.rHum) + '% (' + an.rHum + ' raund)');
  if (an.rBot) L.push('• Faqat botlarga qarshi: yutish ' + pct(an.wBot || 0, an.rBot) + '% (' + an.rBot + ' raund)');
  const rr = (an.r2 || 0) + (an.r4 || 0);
  if (an.dry) L.push('• Quruq qolgan (birorta karta ololmagan): ' + an.dry + ' marta (' + pct(an.dry, rr) + '%)');
  if (an.lostBig) L.push('• 31 dan kam ochko bilan yutqazgan: ' + an.lostBig + ' marta');
  if (an.aces) L.push('• 4 ta tuz yigʻgan: ' + an.aces + ' marta');

  // ---- yurishlar ----
  L.push('', '<b>Yurishlar</b>');
  L.push('• Boshlab yurish: ' + (an.lead || 0) + ' (koʻzir bilan ' + pct(an.leadTrump || 0, an.lead) + '%, tuz/10 bilan ' + pct(an.leadHigh || 0, an.lead) + '%, bir nechta karta bilan ' + pct(an.leadMulti || 0, an.lead) + '%)');
  L.push('• Raqibni urish: ' + (an.beatOpp || 0) + ' (koʻzir bilan ' + pct(an.beatTrump || 0, an.beatOpp) + '%, oʻrtacha ' + (an.beatOpp ? Math.round((an.takenPts || 0) / an.beatOpp) : 0) + ' ochko olgan)');
  L.push('• Sherik olayotganda: tashlagan ' + (an.discPartner || 0) + ' (oʻrtacha ' + (an.discPartner ? ((an.fedPts || 0) / an.discPartner).toFixed(1) : 0) + ' ochko bergan), sherigini urgan ' + (an.beatPartner || 0));
  L.push('• Raqib olayotganda tashlagan: ' + (an.discOpp || 0) + ' (oʻrtacha ' + (an.discOpp ? ((an.gavePts || 0) / an.discOpp).toFixed(1) : 0) + ' ochko bergan)');

  // ---- xulosa ----
  const good = [], bad = [], tips = [];
  const acc = pct(u.good, u.moves);
  if (acc >= 90) good.push('Yurishlarning ' + acc + '% i toʻgʻri — juda yuqori aniqlik.');
  else if (acc < 80) bad.push('Toʻgʻri yurishlar ' + acc + '% — oʻrtachadan past.');

  const waste = pct(an.trumpWaste || 0, an.beatTrump || 0);
  if ((an.beatTrump || 0) >= 10) {
    if (waste >= 25) { bad.push('Koʻzirni isrof qiladi: koʻzir bilan urgan holatlarning ' + waste + '% ida oddiy karta bilan ham urish mumkin edi (' + an.trumpWaste + ' marta).'); tips.push('Raqibni avval oʻsha masti katta kartasi bilan uring, koʻzirni tuz va 10 lik uchun saqlang.'); }
    else good.push('Koʻzirni tejab ishlatadi (isrof atigi ' + waste + '%).');
  }
  if (an.cheapBigTrump >= 3) { bad.push('Kam ochkoli kartalarni katta koʻzir (tuz/10) bilan urgan: ' + an.cheapBigTrump + ' marta.'); tips.push('Kichik ochkoli yurishni katta koʻzir bilan urmang — oxirida u koʻzir raqibning tuzini olishga kerak boʻladi.'); }
  if (an.beatPartnerTrump >= 2) { bad.push('Sherigining olayotgan kartasini koʻzir bilan urgan: ' + an.beatPartnerTrump + ' marta.'); tips.push('Sherik olayotganda urmang — unga ochkoli karta tashlang.'); }
  const miss = pct(an.missedTake || 0, an.discOpp || 0);
  if ((an.discOpp || 0) >= 10) {
    if (miss >= 15) { bad.push('Olish mumkin boʻlgan ochkoli yurishlarni raqibga berib yuborgan: ' + an.missedTake + ' marta (' + miss + '%).'); tips.push('Stolda 10 va undan koʻp ochko boʻlsa va urish imkoni boʻlsa — albatta uring.'); }
    else good.push('Ochkoli yurishlarni deyarli qoʻldan boy bermaydi.');
  }
  if (an.gaveHighAvoidable >= 2) { bad.push('Urish imkoni boʻla turib raqibga tuz/10 tashlagan: ' + an.gaveHighAvoidable + ' marta.'); tips.push('Raqib olayotganda eng kichik (ochkosiz) kartani tashlang.'); }
  if ((an.discPartner || 0) >= 10) {
    const feed = (an.fedPts || 0) / an.discPartner;
    if (feed >= 6) good.push('Sherigi olayotganda unga ochkoli kartalar tashlaydi (oʻrtacha ' + feed.toFixed(1) + ').');
    else if (feed < 3) { bad.push('Sherigi olayotganda koʻpincha ochkosiz karta tashlaydi (oʻrtacha ' + feed.toFixed(1) + ').'); tips.push('Sherik aniq olayotgan boʻlsa — unga 10 yoki shoh tashlab, jamoa ochkosini oshiring.'); }
  }
  if ((an.lead || 0) >= 15) {
    const lh = pct(an.leadHigh || 0, an.lead), lt = pct(an.leadTrump || 0, an.lead);
    if (lh >= 45) { bad.push('Juda tez-tez tuz/10 bilan boshlaydi (' + lh + '%) — raqib koʻzir bilan urib olishi mumkin.'); tips.push('Boshlashda kichik kartalar bilan raqibning koʻzirlarini chiqarib oling, tuz va 10 likni keyinga saqlang.'); }
    if (lt >= 40) { bad.push('Koʻzir bilan koʻp boshlaydi (' + lt + '%) — oxirida himoyasiz qoladi.'); }
    if (pct(an.leadMulti || 0, an.lead) >= 25) good.push('Bir xil mastdagi bir nechta karta bilan yurishni yaxshi ishlatadi.');
  }
  if (u.moves >= 50 && pct(u.auto, u.moves) >= 5) { bad.push('Vaqtni tez-tez oʻtkazib yuboradi — yurishlarining ' + pct(u.auto, u.moves) + '% ini kompyuter qilgan.'); tips.push('Vaqt tugashidan oldin yuring: kompyuter yurishi baʼzan zarar keltiradi.'); }
  if (rr >= 20 && pct(an.dry || 0, rr) >= 10) bad.push('Raundlarning ' + pct(an.dry, rr) + '% ida quruq qolgan — bu 6 ball jarima.');
  if (an.rHum >= 10 && an.rBot >= 10) {
    const h = pct(an.wHum || 0, an.rHum), b = pct(an.wBot || 0, an.rBot);
    if (b - h >= 20) bad.push('Botlarga qarshi yaxshi (' + b + '%), lekin odamlarga qarshi ancha past (' + h + '%).');
    else if (h >= 55) good.push('Odamlarga qarshi ham ishonchli yutadi (' + h + '%).');
  }

  L.push('', '💪 <b>Kuchli tomonlari</b>');
  L.push(good.length ? good.map(function (x) { return '• ' + x; }).join('\n') : '• Hali aniq ajralib turgan kuchli tomon yoʻq.');
  L.push('', '⚠️ <b>Xato va kamchiliklari</b>');
  L.push(bad.length ? bad.map(function (x) { return '• ' + x; }).join('\n') : '• Jiddiy takrorlanadigan xato topilmadi.');
  if (tips.length) { L.push('', '📘 <b>Tavsiyalar</b>'); tips.forEach(function (x) { L.push('• ' + x); }); }
  return L.join('\n');
}

module.exports = { report: report };
