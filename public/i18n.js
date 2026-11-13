/* Bura — tarjima (oʻzbekcha ⇄ ruscha).
   Ilova matnlari oʻzbekcha yoziladi; rus tili tanlansa, ekrandagi matnlar shu lugʻat boʻyicha tarjima qilinadi.
   Tanlov shu qurilmada saqlanadi; birinchi ochilishda Telegram tili (ru) hisobga olinadi. */
(function (root) {
  'use strict';

  function pl(n, one, few, many) {
    n = Math.abs(Number(n)) % 100;
    const d = n % 10;
    if (n > 10 && n < 20) return many;
    if (d === 1) return one;
    if (d >= 2 && d <= 4) return few;
    return many;
  }
  const kart = (n) => n + ' ' + pl(n, 'карту', 'карты', 'карт');
  const kartI = (n) => n + ' ' + pl(n, 'картой', 'картами', 'картами');

  // Oʻzgaruvchan matnlar (raqam bilan) — avval shular
  const RULES = [
    [/Tayyorlik · (\d)\/4/g, (m, n) => 'Готовность · ' + n + '/4'],
    [/Hamma (\d+) tadan karta tashlaydi/g, (m, n) => 'Все кладут по ' + n + ' ' + pl(n, 'карте', 'карты', 'карт')],
    [/(\d+) ta karta bilan yurdingiz/g, (m, n) => 'ходите ' + kartI(n)],
    [/(\d+) ta karta bilan yurdi/g, (m, n) => 'ходит ' + kartI(n)],
    [/(\d+) ta kartani oldingiz/g, (m, n) => 'забираете ' + kart(n)],
    [/(\d+) ta kartani oldi/g, (m, n) => 'забирает ' + kart(n)],
    [/(\d+) ta kartani yopiq bering/g, (m, n) => 'Сбросьте ' + kart(n) + ' втёмную'],
    [/(\d+) ta karta tanlang: urish yoki yopiq berish/g, (m, n) => 'Выберите ' + kart(n) + ': побить или сбросить втёмную'],
    [/(\d+) ta karta tanlang/g, (m, n) => 'Выберите ' + kart(n)],
    [/(\d+) ta karta oldi/g, (m, n) => 'взяла ' + kart(n)],
    [/(\d+) ta bilan yurish/g, (m, n) => 'Ход ' + kartI(n)],
    [/(\d+) ta yopiq/g, (m, n) => n + ' втёмную'],
    [/(\d+) ta karta/g, (m, n) => n + ' ' + pl(n, 'карта', 'карты', 'карт')],
    [/(\d+) ta stol/g, (m, n) => n + ' ' + pl(n, 'стол', 'стола', 'столов')],
    [/(\d+) tadan karta tashlaydi/g, (m, n) => 'кладут по ' + n + ' ' + pl(n, 'карте', 'карты', 'карт')],
    [/ ?(\d+) ballga yetdi/g, (m, n) => ': ' + n + ' ' + pl(n, 'очко', 'очка', 'очков')],
    [/(\d+) kuzatmoqda/g, (m, n) => n + ' ' + pl(n, 'наблюдает', 'наблюдают', 'наблюдают')],
    [/(\d+) tadan(?! karta)/g, (m, n) => 'по ' + n],
    [/Hamma (\d+)/g, (m, n) => 'Все: ' + n],
    [/(\d+) kishi gaplashyapti/g, (m, n) => n + ' ' + pl(n, 'человек говорит', 'человека говорят', 'человек говорят')],
    [/yana (\d+) kishi kerak/g, (m, n) => 'нужно ещё ' + n + ' ' + pl(n, 'человек', 'человека', 'человек')],
    [/(\d+) kishi/g, (m, n) => n + ' ' + pl(n, 'человек', 'человека', 'человек')],
    [/\+(\d+) ball(?![a-zʻ])/g, (m, n) => '+' + n + ' ' + pl(n, 'очко', 'очка', 'очков')],
    [/(\d+) ball(?![a-zʻ])/g, (m, n) => n + ' ' + pl(n, 'очко', 'очка', 'очков')],
    [/(\d+) ochko(?![a-zʻ])/g, (m, n) => n + ' ' + pl(n, 'очко', 'очка', 'очков')],
    [/(\d+) soniyadan keyin/g, (m, n) => 'через ' + n + ' ' + pl(n, 'секунду', 'секунды', 'секунд')],
    [/Qolgan (\d+) oʻringa bot qoʻshish/g, (m, n) => 'Ботов на оставшиеся места: ' + n],
    [/Qolgan (\d+) oʻringa bot/g, (m, n) => 'Боты на ' + n + ' ' + pl(n, 'место', 'места', 'мест')],
    [/(\d+)-jamoaga/g, (m, n) => 'команде ' + n],
    [/(\d+)-jamoa/g, (m, n) => 'Команда ' + n],
    [/(\d+)-stol/g, (m, n) => 'Стол ' + n],
    [/(\d+)-raund/g, (m, n) => 'Раунд ' + n],
    [/(\d+)-oʻrin/g, (m, n) => 'место ' + n],
    [/(\d+) dan kam/g, (m, n) => 'меньше ' + n]
  ];

  // Doimiy matnlar va boʻlaklar
  const D = {
    'Mehmon': 'Гость',
    'Aloqa yoʻq. Qayta ulanmoqda…': 'Нет связи. Переподключаемся…',
    'Siz': 'Вы',
    'Stol yopildi: oʻyinchilar uzoq vaqt qaytmadi': 'Стол закрыт: игроки долго не возвращались',
    'Stol yopildi: stolda oʻyinchi qolmadi': 'Стол закрыт: за столом не осталось игроков',
    'Sizning jamoangiz': 'Ваша команда',
    'Raqiblar': 'Соперники',
    'Yopiq karta:': 'Скрытая карта:',
    '— koʻzir endi': '— козырь теперь',
    '— koʻzir oʻzgarmadi': '— козырь не изменился',
    'Ulanmoqda…': 'Подключение…',
    'Aloqa uzildi. Qayta ulanmoqda…': 'Связь прервалась. Переподключаемся…',
    'Bu oʻyin Telegram ichida ishlaydi.': 'Эта игра работает внутри Telegram.',
    'Guruhdagi «Oʻyinga kirish» tugmasi orqali yoki bot menyusidan oching.': 'Откройте через кнопку «Играть» в группе или из меню бота.',
    '2×2 jamoa. Kim 61 ochko yigʻadi?': '2×2 команды. Кто наберёт 61 очко?',
    'Bu stol yopilgan yoki topilmadi. Yangi stol oching.': 'Этот стол закрыт или не найден. Откройте новый.',
    'Yangi stol ochish': 'Открыть новый стол',
    'Guruhda /bura deb yozsangiz, bot hamma uchun stol ochadi.': 'Напишите /bura в группе — бот откроет стол для всех.',
    'Qoidalar': 'Правила',
    'Boʻsh oʻrin:': 'Свободное место:',
    'Boʻsh': 'Свободно',
    'boʻsh': 'свободно',
    'Oʻtirish': 'Сесть',
    'oʻrniga oʻtirish': '— сесть вместо бота',
    'Boshlanmoqda': 'Начинается',
    'Odam kutmoqda': 'Ждём игроков',
    'Match tugadi': 'Матч окончен',
    'raund tugadi': 'раунд окончен',
    'raund ketmoqda': 'раунд идёт',
    'Taklif': 'Пригласить',
    'Stolga qaytish': 'Вернуться за стол',
    'Bot oʻrniga': 'Вместо бота',
    'Kuzatish': 'Смотреть',
    'oʻrin': 'места',
    'Oʻyin 4 kishi toʻlganda boshlanadi': 'Игра начнётся, когда соберутся 4 игрока',
    'Hamma joyida — boshlanmoqda…': 'Все на местах — начинаем…',
    'Stoldan turish': 'Встать из-за стола',
    'sizning stolingiz': 'ваш стол',
    'Oʻyin zali': 'Игровой зал',
    'hozircha stol yoʻq': 'столов пока нет',
    'Hali hech kim oʻynamayapti. Birinchi stolni oching — boshqalar uni shu yerda koʻrib, qoʻshiladi.': 'Пока никто не играет. Откройте первый стол — остальные увидят его здесь и присоединятся.',
    'Istalgan stoldagi boʻsh oʻringa bosing — oʻsha jamoaga oʻtirasiz. Oʻyin ketayotgan stolni kuzatishingiz mumkin.': 'Нажмите на свободное место за любым столом — сядете в эту команду. За идущей игрой можно наблюдать.',
    '+ Yangi stol ochish': '+ Открыть новый стол',
    'Kompyuter': 'Компьютер',
    'Oflayn': 'Офлайн',
    'Stol egasi': 'Хозяин стола',
    'Tayyor': 'Готов',
    '(siz)': '(вы)',
    'Olib tashlash': 'Убрать',
    'Chiqarish': 'Удалить',
    'Sherigingiz oʻrni': 'Место напарника',
    'Raqib oʻrni': 'Место соперника',
    'sherik oʻrni': 'место напарника',
    'raqib oʻrni': 'место соперника',
    'Taklif qilish': 'Пригласить',
    'Bu oʻringa bot qoʻshish': 'Посадить бота на это место',
    'Bot': 'Бот',
    'Boʻsh oʻrin': 'Свободное место',
    '← Barcha stollar': '← Все столы',
    'siz shu jamoadasiz': 'вы в этой команде',
    'Hamma joyida — oʻyin boshlanmoqda…': 'Все на местах — игра начинается…',
    'Oʻyin 4 kishi toʻlganda boshlanadi —': 'Игра начнётся, когда соберутся 4 игрока —',
    'Doʻstlarni taklif qilish': 'Пригласить друзей',
    'Boʻsh oʻringa bot qoʻshish': 'Посадить бота на свободное место',
    'Stol toʻla. Siz tomosha qilyapsiz.': 'Стол заполнен. Вы наблюдаете.',
    'Ochko yordamchisi': 'Подсказка очков',
    'Jamoangiz olgan ochiq kartalar ochkosini koʻrsatadi': 'Показывает очки открытых карт, взятых вашей командой',
    'Demo: sherigingiz va raqiblar — kompyuter. Telegramʼda stolga doʻstlaringiz oʻtiradi.': 'Демо: напарник и соперники — компьютер. В Telegram за стол сядут ваши друзья.',
    'Biz': 'Мы',
    'Ular': 'Они',
    'Hisob:': 'Счёт:',
    'Ikkala jamoa ham': 'Обе команды на',
    'ballda: keyingi raundda yutqazgan jamoa matchni boy beradi.': 'очках: проигравшая следующий раунд команда проигрывает матч.',
    'ballda — shans: yana yutqazsa, matchni boy beradi.': 'очках — шанс: проиграет ещё раз — проиграет матч.',
    'Jamoangiz': 'Ваша команда',
    'ballda — bu shans: yutsangiz, oʻyin davom etadi, yutqazsangiz — match tugaydi.': 'очках — это шанс: выиграете — игра продолжится, проиграете — матч окончен.',
    'ballda — keyingi raundni yutsangiz, match sizniki.': 'очках — выиграете следующий раунд, и матч ваш.',
    'ballga yetgan jamoa yutqazadi': 'очков — команда проигрывает',
    'Menyu': 'Меню',
    'Kuzatmoqda:': 'Наблюдают:',
    'Rasmli kartalar': 'Карты с картинками',
    'Shoh, malika va valetlar kashta uslubidagi rasmlar bilan (faqat sizda)': 'Короли, дамы и валеты с рисунками в стиле вышивки (только у вас)',
    'Olgan:': 'Взято:',
    ', yopiq': ', втёмную',
    'Yopiq karta': 'Скрытая карта',
    'Kolodada': 'В колоде',
    'koʻzir': 'козырь',
    'yangi koʻzir': 'новый козырь',
    'Siz birinchi yurasiz': 'Вы ходите первым',
    'birinchi yuradi': 'ходит первым',
    '. Koʻzir:': '. Козырь:',
    'Bura!': 'Бура!',
    'navbatsiz yurdi': 'ходит вне очереди',
    'navbatsiz yurdingiz': 'ходите вне очереди',
    'yopiq berdi': 'сбрасывает втёмную',
    'yopiq berdingiz': 'сбрасываете втёмную',
    'yurdingiz': 'ходите',
    'yurdi': 'ходит',
    'urdingiz': 'бьёте',
    'urdi': 'бьёт',
    'yopiq kartani oldi:': 'забирает скрытую карту:',
    'yopiq kartani oldingiz:': 'забираете скрытую карту:',
    '. Koʻzir endi': '. Козырь теперь',
    '. Koʻzir oʻzgarmadi': '. Козырь не изменился',
    'yutdi:': 'выиграла:',
    '4 ta tuz!': '4 туза!',
    '4 ta tuzni yigʻdi — mutlaq gʻalaba': 'собрала 4 туза — абсолютная победа',
    'mutlaq yutdi': 'абсолютная победа',
    'mutlaq yutdingiz': 'абсолютная победа — ваша',
    '60:60 — durang': '60:60 — ничья',
    'Oʻyin davom etmoqda': 'Игра продолжается',
    '(vaqt tugadi)': '(время вышло)',
    'Jamoa olgan:': 'Команда взяла:',
    'Jamoangiz hali karta olmadi': 'Ваша команда ещё не брала карт',
    'Jamoa:': 'Команда:',
    'ochiq ochko': 'открытых очков',
    'Qoʻlingizdagi kartalar': 'Карты у вас в руке',
    '60:60 — durang. Keyingi raundda yutqazganga +': '60:60 — ничья. В следующем раунде проигравшим +',
    'Natija': 'Итог',
    'Yangi match': 'Новый матч',
    'Keyingi raund': 'Следующий раунд',
    'Boʻsh oʻringa oʻtirish': 'Сесть на свободное место',
    'Bot oʻrniga oʻtirish': 'Сесть вместо бота',
    'Oʻyin toʻxtatildi:': 'Игра приостановлена:',
    'boʻsh. Boʻsh joyni bosing — oʻtirish, bot qoʻshish yoki doʻstni taklif qilish.': 'свободно. Нажмите на свободное место — сесть, посадить бота или пригласить друга.',
    'Bot qoʻshish': 'Посадить бота',
    'Oʻrin toʻldi. Oʻyinni davom ettirasizmi yoki yangidan boshlaysizmi?': 'Место занято. Продолжить игру или начать заново?',
    'Yangidan': 'Заново',
    'Davom ettirish': 'Продолжить',
    'Stol egasi tanlamoqda: davom ettirish yoki yangidan boshlash…': 'Хозяин стола выбирает: продолжить или начать заново…',
    'Siz kuzatuvchisiz. Boʻsh oʻrin boʻlsa — bosib oʻtiring; raund tugagach, bot oʻrniga ham oʻtirish mumkin.': 'Вы наблюдатель. Если есть свободное место — нажмите и садитесь; после раунда можно сесть вместо бота.',
    'Siz stoldan chiqdingiz — oʻrningizda bot oʻynayapti.': 'Вы вышли из-за стола — вместо вас играет бот.',
    'Oʻyinga qaytish': 'Вернуться в игру',
    'Yurish uchun karta tanlang: 1 ta yoki bir xil mastdagi 2–4 ta': 'Выберите карты для хода: 1 или 2–4 одной масти',
    'Yurish': 'Ходить',
    'yurmoqda…': 'ходит…',
    'Sherigingiz olmoqda.': 'Берёт ваш напарник.',
    'Ura olmaysiz.': 'Побить нечем.',
    '(sherigingiz olmoqda)': '(берёт напарник)',
    'Bu kartalar ura olmaydi': 'Эти карты не бьют',
    'Yopiq berish': 'Сбросить втёмную',
    'Urish': 'Побить',
    'javob bermoqda…': 'отвечает…',
    'Kartalar sizniki!': 'Карты ваши!',
    'Ovozli chatga qoʻshilish:': 'Присоединиться к голосовому чату:',
    'Ovozli chatni yoqish': 'Включить голосовой чат',
    'Ovozli chat qayta ulanmoqda': 'Голосовой чат переподключается',
    'Ovozli chat ulanmoqda. Bekor qilish': 'Голосовой чат подключается. Отменить',
    'Siz faqat eshityapsiz. Mikrofonni yoqish': 'Вы только слушаете. Включить микрофон',
    'Mikrofon oʻchiq. Yoqish': 'Микрофон выключен. Включить',
    'Mikrofon yoqiq. Oʻchirish': 'Микрофон включён. Выключить',
    'va yana': 'и ещё',
    'Ovozli chat': 'Голосовой чат',
    'gaplashyapti — qoʻshiling': 'говорят — присоединяйтесь',
    'Stoldagilar bilan ovozli gaplashing': 'Говорите голосом с игроками за столом',
    'Qayta ulanmoqda…': 'Переподключение…',
    'Aloqa tiklanishini kutyapmiz': 'Ждём восстановления связи',
    'Mikrofonga ruxsat bering': 'Разрешите доступ к микрофону',
    'Siz faqat eshityapsiz': 'Вы только слушаете',
    'Mikrofoningiz oʻchiq': 'Ваш микрофон выключен',
    'Siz ovozli chatdasiz': 'Вы в голосовом чате',
    'ham shu yerda': 'тоже здесь',
    'Hozircha faqat siz': 'Пока только вы',
    'Chiqish': 'Выйти',
    'faqat eshitadi': 'только слушает',
    'mikrofon oʻchiq': 'микрофон выключен',
    'mikrofon yoqiq': 'микрофон включён',
    'toʻgʻridan-toʻgʻri': 'напрямую',
    'server orqali': 'через сервер',
    'ulanib boʻlmadi': 'не удалось подключиться',
    'ulanmoqda…': 'подключается…',
    ': ovozini yoqish': ': включить звук',
    ': ovozini oʻchirish': ': выключить звук',
    'ovozli chatga qoʻshilmagan': 'не в голосовом чате',
    'oflayn': 'офлайн',
    'Hozircha hech kim yoʻq.': 'Пока никого нет.',
    'Qoʻshilish': 'Присоединиться',
    'Mikrofonni oʻchirish': 'Выключить микрофон',
    'Mikrofonni yoqish': 'Включить микрофон',
    'Ovozni eshitish uchun ekranga bir marta bosing': 'Нажмите на экран, чтобы слышать звук',
    'ovozli chatda — eshitish uchun 🎙 tugmasini bosing': 'в голосовом чате — нажмите 🎙, чтобы слышать',
    'Stoldan turasizmi?': 'Встать из-за стола?',
    'Oʻrningiz boʻshaydi, siz kuzatuvchi boʻlib qolasiz. Oʻyin toʻxtaydi — boʻsh joyga boshqa kishi oʻtirishi yoki bot qoʻshilishi kerak. Stolda hech kim qolmasa, stol yopiladi.': 'Ваше место освободится, вы станете наблюдателем. Игра остановится — на свободное место должен сесть другой игрок или бот. Если за столом никого не останется, стол закроется.',
    'Qolish': 'Остаться',
    'Turish': 'Встать',
    'Oʻrin toʻldi': 'Место занято',
    'Oʻyinni toʻxtagan joyidan davom ettirasizmi yoki yangidan (hisob 0:0) boshlaysizmi? Tanlamasangiz,': 'Продолжить игру с места остановки или начать заново (счёт 0:0)? Если не выберете,',
    'oʻyin davom etadi.': 'игра продолжится.',
    'Yangidan boshlash': 'Начать заново',
    'Yopish': 'Закрыть',
    '. Oʻyin toʻxtagan — oʻrin toʻlgach davom etadi.': '. Игра остановлена — продолжится, когда место займут.',
    'Shu oʻringa oʻtirish': 'Сесть на это место',
    'Shu oʻringa oʻtish': 'Пересесть сюда',
    'Doʻstni taklif qilish': 'Пригласить друга',
    'oʻrnida bot oʻynayapti': 'вместо него играет бот',
    'bot': 'бот',
    'Stoldan chiqarish': 'Убрать из-за стола',
    'Botni stolda oʻtirganlar chiqara oladi.': 'Бота могут убрать игроки за столом.',
    'Faqat stol egasi chiqara oladi.': 'Убрать может только хозяин стола.',
    'Chiqarilsa, oʻyin toʻxtaydi — boʻsh joyga kimdir oʻtirishi yoki yangi bot qoʻshilishi kerak.': 'Если убрать, игра остановится — на свободное место должен сесть игрок или новый бот.',
    'Yangi stol': 'Новый стол',
    'Kim bilan oʻynaysiz?': 'С кем будете играть?',
    'Doʻstlar bilan': 'С друзьями',
    'Stol botsiz ochiladi. Doʻstlaringizni taklif qiling, kerak boʻlsa — bot qoʻshing. Oʻyin 4 kishi toʻlganda boshlanadi.': 'Стол откроется без ботов. Пригласите друзей, при необходимости добавьте бота. Игра начнётся, когда соберутся 4 игрока.',
    'Botlar bilan': 'С ботами',
    'Boʻsh oʻrinlarga botlar oʻtiradi — oʻyin darhol boshlanadi.': 'На свободные места сядут боты — игра начнётся сразу.',
    'Hisob': 'Счёт',
    'Raundda yutqazgan jamoaga ball yoziladi;': 'Проигравшей раунд команде записываются очки;',
    'ballga yetgan jamoa matchni boy beradi.': 'очков — команда проигрывает матч.',
    'Oʻyin hali boshlanmadi': 'Игра ещё не началась',
    'Oldingi raund durang: bu raundda yutqazgan jamoaga yana +': 'Прошлый раунд — ничья: проигравшим в этом раунде ещё +',
    'ball qoʻshiladi.': 'очка.',
    'Yutilgan matchlar:': 'Выиграно матчей:',
    'Ovoz imkon boʻlsa toʻgʻridan-toʻgʻri, boʻlmasa server orqali uzatiladi va yozib olinmaydi. Bir-biringizni eshitish uchun hamma 🎙 tugmasini bosishi kerak. Bir xonada oʻtirgan boʻlsangiz, quloqchin taqing — aks holda ovoz qaytadi.': 'Голос передаётся напрямую, а если не получается — через сервер, и не записывается. Чтобы слышать друг друга, всем нужно нажать 🎙. Если сидите в одной комнате, наденьте наушники — иначе будет эхо.',
    'Barcha stollar (zal)': 'Все столы (зал)',
    'Doʻstlarni chaqirish': 'Позвать друзей',
    'Lobbiga qaytish (yangi match)': 'В лобби (новый матч)',
    'birorta ham karta ololmadingiz': 'вы не взяли ни одной карты',
    'birorta ham karta ololmadi': 'не взяла ни одной карты',
    '31 ochkoga yetmadingiz': 'вы не набрали 31 очко',
    '31 ochkoga yetmadi': 'не набрала 31 очко',
    '31 va undan koʻp ochko oldingiz': 'вы набрали 31 очко и больше',
    '31 va undan koʻp ochko oldi': 'набрала 31 очко и больше',
    'Durang': 'Ничья',
    '60:60 — hech kimga ball yozilmaydi. Keyingi raundda yutqazgan jamoaga yana +': '60:60 — очки никому не записываются. В следующем раунде проигравшей команде ещё +',
    'ball qoʻshib yoziladi.': 'очка сверху.',
    'durang uchun)': 'за ничью)',
    '4 ta tuzni yigʻib oldi — mutlaq gʻalaba.': 'собрала 4 туза — абсолютная победа.',
    'mutlaq yutdi.': '— абсолютная победа.',
    'yutdi': 'выиграла',
    'Siz yutdingiz!': 'Вы выиграли!',
    'Raqiblar yutdi': 'Соперники выиграли',
    '— match boy berildi.': '— матч проигран.',
    '— match sizniki!': '— матч ваш!',
    'matchni yutdi.': 'выиграла матч.',
    'Keyingi raund yangi match boʻlib boshlanadi.': 'Следующий раунд начнётся как новый матч.',
    'Lobbiga': 'В лобби',
    'Bura qoidalari': 'Правила Буры',
    '2×2 jamoa. Sherigingiz roʻparangizda oʻtiradi, ochkolar jamoaga qoʻshiladi.': '2×2 команды. Напарник сидит напротив, очки идут в общий зачёт команды.',
    'Kartalar va ochkolar': 'Карты и очки',
    '36 ta karta, jami 120 ochko. Kuch tartibi: T (tuz) › 10 › K › Q › J › 9 › 8 › 7 › 6. 10 korolni bosadi, korol 10 ni bosa olmaydi.': '36 карт, всего 120 очков. Старшинство: Т (туз) › 10 › K › Q › J › 9 › 8 › 7 › 6. Десятка бьёт короля, король десятку — нет.',
    'Tarqatish va koʻzir': 'Раздача и козырь',
    'Har kimga 4 tadan karta. Bitta karta koʻzir qilib ochiladi, yana bittasi yopiq turadi.': 'Каждому по 4 карты. Одна карта открывается козырем, ещё одна лежит закрытой.',
    'Kolodadan avval oddiy kartalar, keyin ochiq koʻzir, eng oxirida yopiq karta olinadi. Yopiq kartani olgan oʻyinchi uni hammaga koʻrsatadi va koʻzir masti shu kartanikiga almashadi.': 'Из колоды сначала берут обычные карты, потом открытый козырь, в самом конце — скрытую карту. Взявший скрытую карту показывает её всем, и козырь меняется на её масть.',
    'Birinchi yurish har raundda navbat bilan keyingi oʻyinchiga oʻtadi.': 'Первый ход в каждом раунде переходит к следующему игроку по очереди.',
    'Yurish va urish': 'Ход и битьё',
    'Yurish: 1 ta karta yoki bir xil mastdagi 2–4 ta karta. Qolganlar ham shuncha karta tashlaydi.': 'Ход: 1 карта или 2–4 карты одной масти. Остальные кладут столько же.',
    'Stoldagi eng kuchli toʻplamning har bir kartasini urgan oʻyinchi oldinga chiqadi: oʻsha mastning kattaroq kartasi yoki koʻzir bilan.': 'Вперёд выходит тот, кто побил каждую карту сильнейшего набора на столе: старшей картой той же масти или козырем.',
    'Oddiy 10 ni faqat koʻzir bosadi. Koʻzirni faqat kattaroq koʻzir bosadi: koʻzir korol koʻzir 10 ni bosa olmaydi.': 'Простую десятку бьёт только козырь. Козырь бьёт только старший козырь: козырный король не бьёт козырную десятку.',
    'Ura olmasangiz yoki xohlamasangiz, kartalar yopiq beriladi. Sherigingiz olayotgan boʻlsa, unga ochkoli karta bering.': 'Если не можете или не хотите бить — сбрасываете карты втёмную. Если берёт напарник, отдайте ему карты с очками.',
    'Eng kuchli toʻplam egasi hamma kartalarni oladi, birinchi boʻlib kolodadan oladi va yuradi.': 'Владелец сильнейшего набора забирает все карты, первым берёт из колоды и ходит.',
    'Kombinatsiyalar': 'Комбинации',
    '— qoʻldagi 4 kartaning hammasi koʻzir: navbatsiz yuradi.': '— все 4 карты в руке козырные: ход вне очереди.',
    '4 ta tuz': '4 туза',
    '— oʻyin davomida qoʻlida 4 ta tuz yigʻilgan oʻyinchining jamoasi mutlaq gʻolib (tarqatishda bitta oʻyinchiga 4 ta tuz tushmaydi): raqib jamoa hisobi 14 boʻladi va match tugaydi.': '— если по ходу игры у игрока на руке собрались 4 туза, его команда побеждает абсолютно (при раздаче 4 туза одному игроку не выпадают): у соперников становится 14 очков, и матч заканчивается.',
    'Kartalar tugagach jamoa ochkolari sanaladi: 61 va undan koʻp — gʻalaba. 60:60 — durang: hech kimga ball yozilmaydi, keyingi raundda yutqazgan jamoaga yana +2 ball qoʻshiladi.': 'Когда карты кончаются, считаются очки команд: 61 и больше — победа. 60:60 — ничья: очки никому не пишутся, в следующем раунде проигравшей команде добавляется ещё +2.',
    'Yurish vaqti tugasa, qoʻlingizdagi chap tarafdagi kartalar avtomatik yuriladi.': 'Если время хода вышло, автоматически ходят крайние левые карты из вашей руки.',
    'Raundda yutqazgan jamoaga ball yoziladi: 31 va undan koʻp ochko olgan boʻlsa — 2, 31 dan kam — 4, birorta ham karta ololmagan boʻlsa — 6.': 'Проигравшей раунд команде пишутся штрафные очки: если она набрала 31 и больше — 2, меньше 31 — 4, если не взяла ни одной карты — 6.',
    'Ball qancha kam boʻlsa, shuncha yaxshi: 14 va undan koʻp ball toʻplagan jamoa matchni yutqazadi.': 'Чем меньше штрафных очков, тем лучше: команда, набравшая 14 и больше, проигрывает матч.',
    'Aynan 12 ballda jamoaga shans beriladi — yana oʻynaydi. Yutsa, 12 da qoladi; yana yutqazsa, matchni boy beradi.': 'Ровно на 12 очках команде даётся шанс — она играет ещё. Выиграет — остаётся на 12; проиграет — проигрывает матч.',
    'Har yurishga vaqt beriladi — tugasa, avtomatik yuriladi.': 'На каждый ход даётся время — когда оно выходит, ход делается автоматически.',
    'Tushunarli': 'Понятно',
    'Havola hali tayyor emas': 'Ссылка ещё не готова',
    'Bura oʻynaymizmi? 🃏 Stolga qoʻshiling!': 'Сыграем в Буру? 🃏 Присоединяйтесь к столу!',
    'Bura oʻynaymizmi? 🃏 Sherigim boʻling — joy sizni kutyapti!': 'Сыграем в Буру? 🃏 Будь моим напарником — место ждёт тебя!',
    'Bura oʻynaymizmi? 🃏 Raqib boʻlib oʻtiring — joy sizni kutyapti!': 'Сыграем в Буру? 🃏 Садись соперником — место ждёт тебя!',
    // ovoz
    'Bu ilovada mikrofon ishlamaydi — siz faqat eshitasiz': 'В этом приложении микрофон не работает — вы только слушаете',
    'Mikrofonga ruxsat berilmadi — siz faqat eshitasiz': 'Доступ к микрофону не разрешён — вы только слушаете',
    'Mikrofon topilmadi — siz faqat eshitasiz': 'Микрофон не найден — вы только слушаете',
    'Mikrofon band (boshqa ilova ishlatyapti) — siz faqat eshitasiz': 'Микрофон занят другим приложением — вы только слушаете',
    'Mikrofon yoqilmadi — siz faqat eshitasiz': 'Микрофон не включился — вы только слушаете',
    'Mikrofon oʻchdi — siz faqat eshitasiz': 'Микрофон отключился — вы только слушаете',
    'Ovozli chat boshqa qurilmangizda ochildi': 'Голосовой чат открыт на другом вашем устройстве',
    'Ovozli chat toʻla — bir vaqtda': 'Голосовой чат заполнен — одновременно',
    'Ovozli chatga ulanib boʻlmadi. Keyinroq qayta urinib koʻring': 'Не удалось подключиться к голосовому чату. Попробуйте позже',
    'Bu qurilmada ovozli chat ishlamaydi': 'На этом устройстве голосовой чат не работает',
    // server xabarlari
    'Avval stolga kiring': 'Сначала зайдите за стол',
    'Avval tizimga kiring': 'Сначала войдите',
    'Ilovani Telegram orqali oching': 'Откройте приложение через Telegram',
    'Notoʻgʻri soʻrov': 'Неверный запрос',
    'Bu oʻrin band': 'Это место занято',
    'Boʻsh oʻrin yoʻq': 'Свободных мест нет',
    'Raund tugashini kuting': 'Дождитесь конца раунда',
    'Hozir tanlash kerak emas': 'Сейчас выбирать не нужно',
    'Faqat stol egasi tanlaydi': 'Выбирает только хозяин стола',
    'Bot qoʻshish uchun stolda oʻtirgan boʻlishingiz kerak': 'Чтобы посадить бота, нужно сидеть за столом',
    'Oʻrin topilmadi': 'Место не найдено',
    'Botni chiqarish uchun stolda oʻtirgan boʻlishingiz kerak': 'Чтобы убрать бота, нужно сидеть за столом',
    'Faqat stol egasi': 'Только хозяин стола',
    'Onlayn oʻyinchini chiqarib boʻlmaydi': 'Игрока онлайн убрать нельзя',
    'Oʻyin allaqachon boshlangan': 'Игра уже началась',
    'Faqat stol egasi boshlay oladi': 'Начать может только хозяин стола',
    '4 kishi kerak — boʻsh oʻrinlarga bot qoʻshing': 'Нужно 4 игрока — посадите ботов на свободные места',
    'Oʻyin ketmayapti': 'Игра не идёт',
    'Oʻyin toʻxtatilgan — boʻsh oʻrin bor': 'Игра остановлена — есть свободное место',
    'Stol egasi tanlamoqda: davom ettirish yoki yangidan': 'Хозяин стола выбирает: продолжить или заново',
    'Siz bu stolda oʻynamayapsiz': 'Вы не играете за этим столом',
    'Notoʻgʻri harakat': 'Недопустимый ход',
    'Faqat oʻyinchilar davom ettira oladi': 'Продолжить могут только игроки',
    'Boʻsh oʻrin bor — avval kimdir oʻtirsin yoki bot qoʻshing': 'Есть свободное место — пусть кто-то сядет или посадите бота',
    'Faqat raund oxirida mumkin': 'Можно только в конце раунда',
    'Oʻyin vaqtida oʻzgartirib boʻlmaydi': 'Во время игры менять нельзя',
    'Raund hali tugamagan': 'Раунд ещё не закончен',
    'Nomaʼlum buyruq': 'Неизвестная команда',
    'Nomaʼlum sozlama': 'Неизвестная настройка',
    'Stol topilmadi': 'Стол не найден',
    'Stol topilmadi — u yopilgan boʻlishi mumkin': 'Стол не найден — возможно, он закрыт',
    'Bu stol yopilgan': 'Этот стол закрыт',
    'Bu zal topilmadi': 'Этот зал не найден',
    'Biroz kuting — stol hozirgina ochildi': 'Подождите немного — стол только что открыт',
    'Zalda stollar toʻla': 'В зале нет мест для новых столов',
    'Raund tugadi': 'Раунд окончен',
    'Notoʻgʻri oʻrin': 'Неверное место',
    'Hozir sizning yurishingiz emas': 'Сейчас не ваш ход',
    'Hozir sizning navbatingiz emas': 'Сейчас не ваша очередь',
    'Bu kartalar qoʻlingizda yoʻq': 'Этих карт нет у вас в руке',
    '1 ta karta yoki bir xil mastdagi 2–4 ta karta bilan yuriladi': 'Ходят 1 картой или 2–4 картами одной масти',
    'Bu kartalar bilan urib boʻlmaydi': 'Этими картами побить нельзя',
    // karta nomlari
    'tuz': 'туз', 'korol': 'король', 'dama': 'дама', 'valet': 'валет', 'oʻnlik': 'десятка', 'toʻqqizlik': 'девятка',
    'sakkizlik': 'восьмёрка', 'yettilik': 'семёрка', 'oltilik': 'шестёрка', 'pika': 'пики', 'chervi': 'черви', 'bubna': 'бубны', 'tref': 'трефы',
    'Tilni tanlash': 'Выбор языка',
    'Hamma oʻtirdi!': 'Все за столом!',
    'Hamma oʻtirdi — «Tayyorman» bosing': 'Все сели — нажмите «Готов»',
    'Tayyorman tugmasini bosing — aks holda mehmon rejimiga oʻtasiz': 'Нажмите «Готов» — иначе станете гостем',
    'Tayyorman': 'Готов',
    'Siz tayyorsiz': 'Вы готовы',
    'Oʻyinchilar tayyorlanmoqda': 'Игроки готовятся',
    'Tayyor:': 'Готовы:',
    'Tayyorlik': 'Готовность',
    'tayyor': 'готов',
    'kutilmoqda': 'ждём',
    'Vaqtida «Tayyorman» bosilmadi — siz mehmonsiz. Qayta oʻtirish uchun boʻsh oʻringa bosing.': 'Вы не нажали «Готов» вовремя — теперь вы гость. Чтобы снова сесть, нажмите на свободное место.',
    'Hali hamma oʻtirmadi': 'Ещё не все сели',
    'ball': 'очков',
    'sherik': 'напарник',
    'sherigingiz': 'напарник',
    'raqib': 'соперник',
    'tomoshabin': 'наблюдатель',
    'oladi': 'берёт',
    'siz': 'вы',
    'ochko': 'очков'
  };

  const KEYS = Object.keys(D).sort((a, b) => b.length - a.length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Soʻz chegarasi: oldida va ortida harf boʻlmasin (lookbehind ishlatilmaydi — eski iOS uchun)
  const FRAG = new RegExp('(^|[^A-Za-zʻʼ’])(' + KEYS.map(esc).join('|') + ')(?![A-Za-zʻʼ’])', 'g');

  function translate(text) {
    if (!text || !/[A-Za-zʻ]/.test(text)) return text;
    const t = text.trim();
    if (D[t]) return text.replace(t, D[t]);
    let out = text;
    for (const r of RULES) out = out.replace(r[0], r[1]);
    out = out.replace(FRAG, (m, pre, key) => pre + D[key]);
    return out;
  }

  let lang = 'uz';
  try {
    const saved = localStorage.getItem('bura.lang');
    if (saved === 'ru' || saved === 'uz') lang = saved;
    else {
      const tg = root.Telegram && root.Telegram.WebApp && root.Telegram.WebApp.initDataUnsafe;
      const code = tg && tg.user && tg.user.language_code;
      if (code === 'ru') lang = 'ru';
    }
  } catch (e) { /* */ }

  const ATTRS = ['aria-label', 'title', 'placeholder'];
  const SKIP = { SCRIPT: 1, STYLE: 1, svg: 1, SVG: 1 };
  function walk(node) {
    if (lang !== 'ru' || !node) return;
    if (node.nodeType === 3) {
      const p = node.parentNode;
      if (p && (SKIP[p.nodeName] || (p.closest && p.closest('[data-noi18n]')))) return;
      const v = translate(node.data);
      if (v !== node.data) node.data = v;
      return;
    }
    if (node.nodeType !== 1 || SKIP[node.nodeName] || node.hasAttribute('data-noi18n')) return;
    for (const a of ATTRS) {
      const v = node.getAttribute(a);
      if (v) { const t = translate(v); if (t !== v) node.setAttribute(a, t); }
    }
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
  }

  let obs = null;
  function start() {
    document.documentElement.lang = lang;
    if (obs || typeof MutationObserver !== 'function') return;
    obs = new MutationObserver(function (list) {
      if (lang !== 'ru') return;
      for (const m of list) {
        if (m.type === 'characterData') walk(m.target);
        else if (m.type === 'attributes') walk(m.target);
        else m.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    walk(document.body);
  }

  root.BuraI18n = {
    get lang() { return lang; },
    set: function (l) {
      lang = l === 'ru' ? 'ru' : 'uz';
      try { localStorage.setItem('bura.lang', lang); } catch (e) { /* */ }
      document.documentElement.lang = lang;
    },
    t: function (s) { return lang === 'ru' ? translate(s) : s; },
    translate: translate,
    start: start,
    apply: function () { walk(document.body); }
  };
})(typeof window !== 'undefined' ? window : this);
