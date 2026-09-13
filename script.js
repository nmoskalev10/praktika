/* ============================================================================
   In stile russo — скрипт страницы.

   Что он делает, по порядку:
   1) берёт тексты из content.js и расставляет их по разметке;
   2) собирает повторяющиеся блоки (форматы, репертуар, отзывы, фото);
   3) показывает видео только после нажатия — страница грузится быстрее;
   4) отправляет форму заявки;
   5) показывает липкую кнопку связи, когда первый экран уехал вверх;
   6) пишет в консоль браузера список незаполненных заглушек.

   Править этот файл для смены текстов не нужно — всё в content.js.
   ============================================================================ */

(function () {
  'use strict';

  /* --- Мелкие помощники --------------------------------------------------- */

  // Заглушка выглядит как {{ЧТО_ТО}}. Такое значение нельзя ставить в ссылку.
  var PLACEHOLDER = /\{\{[^}]+\}\}/;

  function isUnset(value) {
    return typeof value !== 'string' || value === '' || PLACEHOLDER.test(value);
  }

  // Достаёт значение из CONTENT по пути вида 'hero.title'
  function pick(path) {
    return path.split('.').reduce(function (obj, key) {
      return obj == null ? obj : obj[key];
    }, CONTENT);
  }

  // Создаёт элемент: тег, класс, текст. textContent, а не innerHTML —
  // так текст из content.js не может случайно сломать разметку.
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function byId(id) { return document.getElementById(id); }

  // Заполняется, когда струны созданы: форма дёргает их после отправки.
  var playWave = null;

  /* --- 1. Расстановка текстов по разметке --------------------------------- */

  document.querySelectorAll('[data-text]').forEach(function (node) {
    var value = pick(node.dataset.text);
    node.textContent = value == null ? '' : value;
  });

  document.querySelectorAll('[data-attr-aria-label]').forEach(function (node) {
    var value = pick(node.dataset.attrAriaLabel);
    if (value) node.setAttribute('aria-label', value);
  });

  // Заголовок вкладки и описание для поисковиков.
  // В index.html они тоже прописаны — на случай, если скрипты отключены.
  var seo = CONTENT.seo || {};
  if (!isUnset(seo.title)) document.title = seo.title;
  if (!isUnset(seo.description)) {
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', seo.description);
  }
  if (!isUnset(seo.siteUrl)) {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', seo.siteUrl);
  }

  /* --- 2. Меню разделов --------------------------------------------------- */

  var navList = byId('nav-list');
  CONTENT.nav.forEach(function (item) {
    var link = el('a', null, item.label);
    link.href = '#' + item.id;
    var li = el('li');
    li.appendChild(link);
    navList.appendChild(li);
  });

  /* --- 3. Фотографии первого экрана и блока «О дуэте» --------------------- */

  function fillImage(img, data) {
    if (!img || !data) return;
    img.src = data.src;
    img.alt = data.alt;
    img.width = data.width;
    img.height = data.height;
  }

  fillImage(byId('hero-photo'), CONTENT.hero.photo);
  fillImage(byId('about-photo'), CONTENT.about.photo);

  /* --- 4. Форматы выступлений --------------------------------------------- */

  var ui = CONTENT.ui;
  var formatsList = byId('formats-list');

  CONTENT.formats.items.forEach(function (item) {
    var li = el('li', 'format');

    var head = el('div', 'format__head');
    head.appendChild(el('h3', 'format__name', item.name));
    head.appendChild(el('span', 'format__price', item.price));
    li.appendChild(head);

    li.appendChild(el('p', 'format__what', item.what));

    // Длительность и «когда подходит» — отдельными строками с подписями,
    // а не одной слепленной строкой через точки-разделители.
    var meta = el('dl', 'format__meta');
    meta.appendChild(el('dt', null, ui.durationLabel));
    meta.appendChild(el('dd', null, item.duration));
    meta.appendChild(el('dt', null, ui.fitLabel));
    meta.appendChild(el('dd', null, item.fit));
    li.appendChild(meta);

    formatsList.appendChild(li);
  });

  // Точки под лентой форматов. На широких экранах лента превращается
  // в обычный список, и точки прячет CSS.
  var dotsBox = byId('formats-dots');

  CONTENT.formats.items.forEach(function (item, index) {
    var dot = el('button', 'formats__dot');
    dot.type = 'button';
    dot.setAttribute('aria-label', item.name);
    dot.setAttribute('aria-current', index === 0 ? 'true' : 'false');
    dot.addEventListener('click', function () {
      // inline: 'center' повторяет то, как карточка встаёт при
      // обычном пролистывании; block: 'nearest' не даёт странице
      // прыгнуть по вертикали.
      formatsList.children[index].scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
    dotsBox.appendChild(dot);
  });

  // Отмечаем точку той карточки, что сейчас перед глазами.
  // Считаем не на каждый пиксель прокрутки, а раз в кадр.
  var dotTick = false;
  formatsList.addEventListener('scroll', function () {
    if (dotTick) return;
    dotTick = true;
    requestAnimationFrame(function () {
      var card = formatsList.children[0];
      var step = card.getBoundingClientRect().width + 12;
      var index = Math.round(formatsList.scrollLeft / step);
      [].forEach.call(dotsBox.children, function (dot, i) {
        dot.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
      dotTick = false;
    });
  });

  /* --- 5. Репертуар -------------------------------------------------------- */

  var repList = byId('repertoire-list');

  // Один проигрыватель на весь сайт: пока звучит один сэмпл,
  // второй запуститься не может.
  var player = null;
  var playing = null;

  function stopSample() {
    if (!playing) return;
    player.pause();
    playing.button.setAttribute('aria-pressed', 'false');
    playing.button.textContent = ui.playSample;
    playing.bar.style.transform = 'scaleX(0)';
    playing = null;
  }

  function startSample(sample) {
    stopSample();

    if (!player) {
      player = new Audio();
      player.preload = 'none';       // ничего не качается, пока не нажали
      player.addEventListener('timeupdate', function () {
        if (!playing || !player.duration) return;
        playing.bar.style.transform = 'scaleX(' + (player.currentTime / player.duration) + ')';
      });
      player.addEventListener('ended', stopSample);
      player.addEventListener('error', stopSample);
    }

    player.src = sample.src;
    playing = sample;
    sample.button.setAttribute('aria-pressed', 'true');
    sample.button.textContent = ui.stopSample;

    var started = player.play();
    if (started && started.catch) started.catch(stopSample);
  }

  function buildSample(item) {
    var row = el('div', 'sample');
    var button = el('button', 'sample__btn', ui.playSample);
    button.type = 'button';
    row.appendChild(button);

    // Файла ещё нет — кнопка видна, но не работает.
    if (isUnset(item.sample)) {
      button.disabled = true;
      row.appendChild(el('p', 'sample__note', ui.sampleNotSet));
      return row;
    }

    var track = el('div', 'sample__track');
    var bar = el('div', 'sample__bar');
    track.appendChild(bar);
    row.appendChild(track);

    var sample = { src: item.sample, button: button, bar: bar };
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', ui.playSample + ': ' + item.name);
    button.addEventListener('click', function () {
      if (playing === sample) stopSample();
      else startSample(sample);
    });

    return row;
  }

  CONTENT.repertoire.items.forEach(function (item) {
    var block = el('article', 'rep');
    block.appendChild(el('h3', 'rep__name', item.name));
    block.appendChild(el('p', 'rep__text', item.text));

    var examples = el('p', 'rep__examples');
    examples.appendChild(el('b', null, ui.examplesLabel + ': '));
    examples.appendChild(document.createTextNode(item.examples));
    block.appendChild(examples);

    block.appendChild(buildSample(item));
    repList.appendChild(block);
  });

  /* --- 6. Видео: сначала картинка, ролик грузится по нажатию -------------- */

  var PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  function buildVideo(video, isMain) {
    var box = el('div', 'video__item');

    // Ролик не задан — показываем картинку-заглушку без кнопки.
    if (isUnset(video.id)) {
      var stub = el('div', 'video__btn');
      var stubImg = el('img', 'video__poster');
      stubImg.src = video.poster;
      stubImg.alt = '';
      stubImg.width = 1280;
      stubImg.height = 720;
      stubImg.loading = 'lazy';
      stub.appendChild(stubImg);
      box.appendChild(stub);
      box.appendChild(el('p', 'video__caption', ui.videoNotSet));
      return box;
    }

    var button = el('button', 'video__btn');
    button.type = 'button';
    button.setAttribute('aria-label', ui.playVideo + ': ' + video.title);

    var poster = el('img', 'video__poster');
    // Пока своей картинки нет, берём превью прямо с YouTube.
    poster.src = video.poster || 'https://i.ytimg.com/vi/' + video.id + '/hqdefault.jpg';
    poster.alt = '';
    poster.width = 1280;
    poster.height = 720;
    poster.loading = isMain ? 'eager' : 'lazy';
    button.appendChild(poster);

    var play = el('span', 'video__play');
    play.setAttribute('aria-hidden', 'true');
    play.innerHTML = PLAY_ICON;
    button.appendChild(play);

    // Настоящий iframe появляется только здесь, после клика.
    button.addEventListener('click', function () {
      var frame = document.createElement('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/' + video.id + '?autoplay=1&rel=0';
      frame.title = video.title;
      frame.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
      frame.allowFullscreen = true;
      button.replaceWith(frame);
      frame.focus();
    });

    box.appendChild(button);
    box.appendChild(el('p', 'video__caption', video.title));
    return box;
  }

  byId('video-main').appendChild(buildVideo(CONTENT.media.mainVideo, true));

  var videoRow = byId('video-row');
  CONTENT.media.shortVideos.forEach(function (video) {
    videoRow.appendChild(buildVideo(video, false));
  });

  /* --- 7. Аудио: виджет Яндекс.Музыки ------------------------------------- */

  var audioBox = byId('audio');
  if (isUnset(CONTENT.media.audio.embedUrl)) {
    audioBox.appendChild(el('p', 'audio__note', ui.audioNotSet));
  } else {
    var audioFrame = document.createElement('iframe');
    audioFrame.src = CONTENT.media.audio.embedUrl;
    audioFrame.title = CONTENT.media.audio.title;
    audioFrame.height = 180;
    audioFrame.loading = 'lazy';
    audioFrame.setAttribute('frameborder', '0');
    audioBox.appendChild(audioFrame);
    audioBox.appendChild(el('p', 'video__caption', CONTENT.media.audio.note));
  }

  /* --- 8. Фотографии ------------------------------------------------------- */

  var photos = byId('photos');
  CONTENT.media.photos.forEach(function (photo) {
    var img = el('img');
    fillImage(img, photo);
    img.loading = 'lazy';
    img.decoding = 'async';
    var li = el('li');
    li.appendChild(img);
    photos.appendChild(li);
  });

  /* --- 9. Отзывы ----------------------------------------------------------- */

  var reviewsList = byId('reviews-list');
  CONTENT.reviews.items.forEach(function (review) {
    var block = el('blockquote', 'review');
    block.appendChild(el('p', 'review__text', review.text));
    var caption = el('footer');
    caption.appendChild(el('p', 'review__author', review.author));
    caption.appendChild(el('p', 'review__role', review.role));
    block.appendChild(caption);
    reviewsList.appendChild(block);
  });

  /* --- 10. Регалии --------------------------------------------------------- */

  var credentials = byId('credentials');
  CONTENT.about.credentials.forEach(function (row) {
    credentials.appendChild(el('dt', null, row.label));
    credentials.appendChild(el('dd', null, row.value));
  });

  /* --- 11. Кнопки связи ---------------------------------------------------- */

  var contacts = CONTENT.contacts;

  // Собираем только те кнопки, для которых контакт реально вписан:
  // ссылка на {{ЗАГЛУШКУ}} никуда не ведёт и раздражает посетителя.
  function contactLinks() {
    var links = [];
    if (!isUnset(contacts.telegram)) {
      links.push({ key: 'telegram', label: contacts.buttons.telegram, href: 'https://t.me/' + contacts.telegram });
    }
    if (!isUnset(contacts.whatsapp)) {
      links.push({ key: 'whatsapp', label: contacts.buttons.whatsapp, href: 'https://wa.me/' + contacts.whatsapp });
    }
    if (!isUnset(contacts.phoneHref)) {
      // На кнопке показываем сам номер: его видно сразу, без лишнего нажатия.
      var phoneLabel = isUnset(contacts.phone) ? contacts.buttons.phone : contacts.phone;
      links.push({
        key: 'phone',
        label: phoneLabel,
        title: contacts.buttons.phone,
        href: 'tel:' + contacts.phoneHref
      });
    }
    if (!isUnset(contacts.email)) {
      links.push({ key: 'email', label: contacts.buttons.email, href: 'mailto:' + contacts.email });
    }
    return links;
  }

  var links = contactLinks();
  var contactButtons = byId('contact-buttons');

  if (links.length === 0) {
    contactButtons.appendChild(el('p', 'media__empty', ui.contactsNotSet));
  } else {
    links.forEach(function (link, index) {
      var a = el('a', 'btn ' + (index === 0 ? 'btn--primary' : 'btn--outline'), link.label);
      a.href = link.href;
      // У кнопки с номером на месте подписи стоит сам номер — поясняем действие.
      if (link.title) a.setAttribute('aria-label', link.title + ': ' + link.label);
      if (link.key === 'telegram' || link.key === 'whatsapp') a.rel = 'noopener';
      contactButtons.appendChild(a);
    });
  }

  /* --- 12. Соцсети --------------------------------------------------------- */

  var socialList = byId('social-list');
  CONTENT.contacts.social.forEach(function (item) {
    if (isUnset(item.url)) return;
    var a = el('a', 'link-underline', item.name);
    a.href = item.url;
    a.rel = 'noopener';
    var li = el('li');
    li.appendChild(a);
    socialList.appendChild(li);
  });

  // Ни одной ссылки не вписано — прячем весь блок вместе с заголовком,
  // чтобы на странице не висел пустой раздел.
  if (!socialList.children.length) {
    document.querySelector('.social').hidden = true;
  }

  /* --- 13. Форма заявки ---------------------------------------------------- */

  var form = byId('lead-form');
  var status = byId('form-status');
  var submitButton = byId('form-submit');
  var typeSelect = byId('f-type');
  var formText = contacts.form;

  formText.fields.type.options.forEach(function (option) {
    typeSelect.appendChild(el('option', null, option));
  });

  byId('f-name').placeholder = formText.fields.name.placeholder;
  // Переключатель «телефон / Telegram». Телефон выбран сразу: так
  // большинству не приходится делать лишнее движение перед вводом.
  var contactField = byId('f-contact');
  var contactMode = formText.fields.contact.modes[0].id;

  // Приводим набранное к российскому номеру. Человек начинает по-разному:
  // с 8, с 7, с +7 или сразу с кода оператора — результат должен быть один.
  // Кодов операторов, начинающихся с семёрки, в России нет, поэтому
  // ведущую семёрку можно смело считать кодом страны.
  function ruPhone(raw) {
    var digits = raw.replace(/\D/g, '');
    if (!digits) return '';

    if (digits.charAt(0) === '8') {
      digits = '7' + digits.slice(1);       // восьмёрка — та же семёрка, по-старому
    } else if (digits.charAt(0) !== '7') {
      digits = '7' + digits;                // начали с кода оператора — семёрку дописываем сами
    }
    digits = digits.slice(0, 11);           // семёрка и десять цифр, длиннее номеров нет

    // Разделители ставим только перед цифрами, которые уже набраны:
    // иначе после хвостового пробела не сработает удаление.
    var tail = digits.slice(1);
    var out = '+7';
    if (tail.length) out += ' ' + tail.slice(0, 3);
    if (tail.length > 3) out += ' ' + tail.slice(3, 6);
    if (tail.length > 6) out += '-' + tail.slice(6, 8);
    if (tail.length > 8) out += '-' + tail.slice(8, 10);
    return out;
  }

  function digitsOf(value) {
    return value.replace(/\D/g, '').length;
  }

  contactField.addEventListener('input', function () {
    if (contactMode !== 'phone') return;
    var atEnd = this.selectionStart === this.value.length;
    var formatted = ruPhone(this.value);
    if (formatted === this.value) return;
    this.value = formatted;
    // Присвоение value сбрасывает курсор в конец. Если человек правил
    // середину номера, возвращаем курсор примерно туда, где он был.
    if (!atEnd) {
      var at = Math.min(this.selectionStart, formatted.length);
      this.setSelectionRange(at, at);
    }
  });

  (function buildContactModes() {
    var box = byId('contact-modes');

    formText.fields.contact.modes.forEach(function (mode, index) {
      var button = el('button', 'modes__btn', mode.label);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', index === 0 ? 'true' : 'false');

      button.addEventListener('click', function () {
        [].forEach.call(box.children, function (other) {
          other.setAttribute('aria-checked', other === button ? 'true' : 'false');
        });
        contactMode = mode.id;
        contactField.placeholder = mode.placeholder;
        // Набранное не стираем: человек мог начать писать и передумать.
        if (mode.id === 'phone') {
          contactField.setAttribute('inputmode', 'tel');
          contactField.autocomplete = 'tel';
          // Уже набранное приводим к номеру сразу, не дожидаясь правки
          contactField.value = ruPhone(contactField.value);
        } else {
          contactField.removeAttribute('inputmode');   // нужна обычная клавиатура
          contactField.autocomplete = 'off';
        }
        contactField.focus();
      });

      box.appendChild(button);
    });

    contactField.placeholder = formText.fields.contact.modes[0].placeholder;
  })();

  // У каждого поля своё сообщение: оно объясняет, чего не хватает,
  // а не просто красит рамку.
  var required = [
    { input: byId('f-name'), message: ui.errors.name },
    { input: byId('f-date'), message: ui.errors.date },
    { input: byId('f-contact'), message: ui.errors.contact }
  ];

  required.forEach(function (field) {
    field.hint = el('span', 'form__error');
    field.hint.id = field.input.id + '-error';
    field.hint.hidden = true;
    field.input.insertAdjacentElement('afterend', field.hint);
  });

  // Ответ формы показываем с коротким движением, перезапуская его
  // при каждом новом сообщении.
  function showAnswer(text) {
    status.classList.remove('is-answer');
    void status.offsetWidth;          // сброс, иначе анимация не начнётся заново
    status.textContent = text;
    status.classList.add('is-answer');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var firstBad = null;
    required.forEach(function (field) {
      var bad = field.input.value.trim() === '';
      var message = field.message;
      // Недобранный номер хуже пустого поля: заявка уйдёт, а перезвонить
      // будет некуда. Считаем цифры: семёрка и десять после неё.
      if (!bad && field.input === contactField && contactMode === 'phone' && digitsOf(field.input.value) < 11) {
        bad = true;
        message = ui.errors.phone;
      }
      field.input.setAttribute('aria-invalid', bad ? 'true' : 'false');
      field.hint.textContent = bad ? message : '';
      field.hint.hidden = !bad;
      if (bad) {
        field.input.setAttribute('aria-describedby', field.hint.id);
        if (!firstBad) firstBad = field.input;
      } else {
        field.input.removeAttribute('aria-describedby');
      }
    });

    if (firstBad) {
      status.textContent = '';
      firstBad.focus();
      return;
    }

    if (isUnset(formText.formspreeId)) {
      showAnswer(formText.notConfigured);
      return;
    }

    // Кнопка выключается только после старта запроса.
    submitButton.disabled = true;
    status.textContent = formText.sending;

    fetch('https://formspree.io/f/' + formText.formspreeId, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(form)
    })
      .then(function (response) {
        if (!response.ok) throw new Error('formspree');
        form.reset();
        showAnswer(formText.success);
        if (playWave) playWave();       // струны отзываются на отправленную заявку
      })
      .catch(function () {
        showAnswer(formText.error);
      })
      .then(function () {
        submitButton.disabled = false;
      });
  });

  /* --- 13а. Врезка опросника ----------------------------------------------
     Сам опросник — на отдельной странице. Здесь только подставляем,
     сколько в нём вопросов, чтобы число не разъезжалось с content.js,
     если вопрос добавят или уберут. */

  (function briefTeaser() {
    var note = byId('teaser-note');
    if (!note || !CONTENT.brief) return;
    note.textContent = CONTENT.brief.teaser.note
      .replace('{n}', CONTENT.brief.groups.length);
  })();

  /* --- 14. Год в подвале --------------------------------------------------- */

  byId('footer-copy').textContent =
    CONTENT.footer.copyright.replace('{{ГОД}}', new Date().getFullYear());

  /* --- 15. Липкая кнопка связи -------------------------------------------- */

  var TELEGRAM_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.8 4.2 18.9 19c-.2 1-.8 1.2-1.6.8l-4.4-3.2-2.1 2c-.2.3-.4.5-.9.5l.3-4.5 8.1-7.3c.3-.3-.1-.5-.5-.2L7.7 13.3l-4.3-1.4c-.9-.3-1-.9.2-1.4l16.8-6.5c.8-.3 1.5.2 1.4 1.2z"/></svg>';
  var WHATSAPP_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.5 14.1c-.2.7-1.3 1.3-1.9 1.3-.5 0-1.1.2-3.6-.8-3-1.3-4.9-4.4-5-4.6-.2-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.4.8-.4h.6c.2 0 .5-.1.7.5l1 2.4c.1.2.1.4 0 .6l-.4.6c-.1.2-.3.3-.1.6.1.3.7 1.2 1.5 1.9 1 .9 1.8 1.2 2.1 1.3.2.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l2.2 1c.3.1.4.2.5.3.1.2.1.7-.2 1.4z"/></svg>';

  var stickyInner = byId('sticky-inner');

  var mainCta = el('a', 'btn btn--primary', CONTENT.cta);
  mainCta.href = '#contacts';
  stickyInner.appendChild(mainCta);

  // Иконки без подписи обязаны иметь aria-label, иначе скринридер
  // прочитает пустую кнопку.
  links.forEach(function (link) {
    if (link.key !== 'telegram' && link.key !== 'whatsapp') return;
    var a = el('a', 'btn btn--icon');
    a.href = link.href;
    a.rel = 'noopener';
    a.setAttribute('aria-label', link.label);
    a.innerHTML = link.key === 'telegram' ? TELEGRAM_ICON : WHATSAPP_ICON;
    stickyInner.appendChild(a);
  });

  var sticky = byId('sticky');
  var hero = byId('top');

  // Пока человек заполняет форму, липкая кнопка уходит: на телефоне
  // она оказывается ровно над полем, зажатым клавиатурой. В блоке
  // контактов она и не нужна — там своя кнопка отправки.
  // Экранная клавиатура выезжает поверх страницы и часто закрывает то
  // самое поле, в которое человек только что ткнул. visualViewport —
  // это та часть страницы, что осталась видна поверх клавиатуры.
  // Если поле оказалось ниже её нижнего края, подкручиваем страницу
  // ровно на недостающее, не больше.
  var viewport = window.visualViewport;
  var focusedField = null;

  function keepAboveKeyboard(field) {
    if (!field) return;
    var visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    // Тянем не само поле, а строку целиком — вместе с подписью над ним
    var row = field.closest('.form__row') || field;
    var missing = row.getBoundingClientRect().bottom + 16 - visibleBottom;
    if (missing > 0) window.scrollBy({ top: missing, behavior: 'smooth' });
  }

  form.addEventListener('focusin', function (event) {
    sticky.classList.add('is-away');
    focusedField = event.target;
    // Клавиатура выезжает не мгновенно: считать сразу бессмысленно,
    // экран ещё не ужался. 300 мс — обычная длина этой анимации.
    setTimeout(function () { keepAboveKeyboard(focusedField); }, 300);
  });

  form.addEventListener('focusout', function () {
    sticky.classList.remove('is-away');
    focusedField = null;
  });

  // Клавиатура может смениться на ходу: переключили язык, открылся
  // блок эмодзи, появилась строка подсказок. Каждый раз проверяем заново.
  if (viewport) {
    viewport.addEventListener('resize', function () { keepAboveKeyboard(focusedField); });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      sticky.classList.toggle('is-away', entries[0].isIntersecting);
    }, { threshold: .12 }).observe(byId('contacts'));
  }

  function showSticky() {
    sticky.hidden = false;
    document.body.classList.add('has-sticky');
  }

  if ('IntersectionObserver' in window) {
    // Появляется один раз, когда первый экран ушёл вверх,
    // и больше не мигает при прокрутке туда-обратно.
    var stickyWatcher = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) return;
      showSticky();
      stickyWatcher.disconnect();
    }, { rootMargin: '-120px 0px 0px 0px' });
    stickyWatcher.observe(hero);
  } else {
    showSticky();
  }

  /* --- 15a. Инструменты дуэта на первом экране -----------------------------
     Струны гуслей и кнопки баяна. Разметку строим сразу, а отклик
     навешиваем ниже, вместе с остальным движением. */

  var stringRows = [];

  // Половины стоят рядом, поэтому на телефоне каждой достаётся
  // около 150 px: там струн и кнопок меньше, иначе получается каша.
  var narrowPanel = window.matchMedia('(max-width: 699px)').matches;

  (function buildStrings() {
    var box = byId('strings');
    // На настоящих гуслях струн полтора десятка и лежат они плотно.
    // Четыре толстые полосы выглядели как забор, а не как инструмент.
    var count = narrowPanel ? 10 : 14;
    for (var i = 0; i < count; i++) {
      var row = el('div', 'string');
      // В покое струна почти прямая. Нижние струны гудят дольше.
      row.style.setProperty('--ring', (700 + i * 70) + 'ms');
      row.innerHTML = '<svg viewBox="0 0 300 9" preserveAspectRatio="none">' +
        '<path d="M0 8 Q150 7.6 300 8"/></svg>';
      box.appendChild(row);
      stringRows.push(row);
    }
  })();

  (function buildKeys() {
    var box = byId('keys');
    // Три ряда — столько несёт основная клавиатура баяна.
    // Каждый ряд сдвинут вправо, из-за этого ряды читаются наискось.
    // У настоящего баяна кнопки мелкие и рядов пять. Крупные кружки
    // в три ряда читались как калькулятор, а не как клавиатура.
    var perRow = narrowPanel ? 8 : 12;
    var РЯДОВ = 5;
    for (var r = 0; r < РЯДОВ; r++) {
      // Ряды чередуются светлый — тёмный, как на настоящем инструменте
      var row = el('div', 'keys__row ' + (r % 2 ? 'keys__row--dark' : 'keys__row--pearl'));
      row.style.setProperty('--per', perRow);
      // Средний ряд стоит на месте, верхний и нижний уходят в стороны
      // на одинаковую величину: косина остаётся, блок симметричен.
      row.style.transform = 'translateX(' + ((r - (РЯДОВ - 1) / 2) * 4) + 'px)';
      for (var k = 0; k < perRow; k++) {
        var key = el('button', 'keys__btn');
        key.type = 'button';
        key.tabIndex = -1;          // украшение: клавиатурой по нему не ходят
        row.appendChild(key);
      }
      box.appendChild(row);
    }
  })();

  /* --- 15b. Тексты на местах, страницу можно показывать -------------------- */

  document.documentElement.classList.add('ready');

  /* --- 16. Движение: заголовок, струны, появление секций -------------------
     Стартует после DOMContentLoaded, чтобы не задерживать первую отрисовку.
     Двигаются только transform и opacity. */

  document.addEventListener('DOMContentLoaded', function () {
    // Отдельный класс: страница уже видима, и если что-то здесь упадёт,
    // контент не пропадёт.
    document.documentElement.classList.add('animate');

    // Режем заголовок там же, где перенёс браузер: слова на одной
    // высоте — это одна строка.
    (function () {
      var title = document.querySelector('.hero__title');
      var words = title.textContent.split(' ');

      title.textContent = '';
      words.forEach(function (word, i) {
        title.appendChild(el('span', null, word + (i < words.length - 1 ? ' ' : '')));
      });

      var lines = [], top = null;
      [].forEach.call(title.children, function (span) {
        if (span.offsetTop !== top) { lines.push(''); top = span.offsetTop; }
        lines[lines.length - 1] += span.textContent;
      });

      title.textContent = '';
      lines.forEach(function (text, i) {
        var inner = el('span', 'line__in', text);
        inner.style.transitionDelay = i * 55 + 'ms';
        var line = el('span', 'line');
        line.appendChild(inner);
        title.appendChild(line);
      });

      // Через кадр, иначе выезда не будет.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { title.classList.add('is-in'); });
      });
    })();

    var rows = stringRows;

    function pluck(row) {
      if (row.classList.contains('is-plucked')) return;
      row.classList.add('is-plucked');
      setTimeout(function () { row.classList.remove('is-plucked'); }, 900);
    }

    // Ответ на отправленную заявку: волна по струнам, следом пробег
    // по кнопкам — отзываются оба инструмента.
    playWave = function () {
      rows.forEach(function (row, index) {
        setTimeout(function () { pluck(row); }, index * 80);
      });
      [].forEach.call(document.querySelectorAll('.keys__btn'), function (key, index) {
        setTimeout(function () {
          key.classList.add('is-pressed');
          setTimeout(function () { key.classList.remove('is-pressed'); }, 150);
        }, 200 + index * 22);
      });
    };

    // С мышью — отклик на курсор. На телефоне курсора нет:
    // одна волна при загрузке, дальше по касанию.
    var withCursor = window.matchMedia('(hover: hover) and (min-width: 768px)').matches;

    rows.forEach(function (row, index) {
      row.addEventListener('pointerdown', function () { pluck(row); });
      if (withCursor) row.addEventListener('mouseenter', function () { pluck(row); });
      else setTimeout(function () { pluck(row); }, 500 + index * 70);
    });

    // Появление секций: три штуки, каждая один раз.
    var sections = document.querySelectorAll('.reveal');

    if (!('IntersectionObserver' in window)) {
      sections.forEach(function (node) { node.classList.add('is-visible'); });
      return;
    }

    var watcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        watcher.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });

    sections.forEach(function (node) { watcher.observe(node); });
  });

  /* --- 17. Напоминание о незаполненных заглушках -------------------------- */

  // Видно только в консоли браузера (F12). Посетитель этого не увидит.
  (function reportPlaceholders() {
    var found = [];
    (function walk(value) {
      if (typeof value === 'string') {
        var match = value.match(/\{\{[^}]+\}\}/g);
        if (match) found = found.concat(match);
      } else if (value && typeof value === 'object') {
        Object.keys(value).forEach(function (key) { walk(value[key]); });
      }
    })(CONTENT);

    var unique = found.filter(function (item, index) {
      return item !== '{{ГОД}}' && found.indexOf(item) === index;
    });

    if (unique.length) {
      console.warn(
        'Не заполнено в content.js — ' + unique.length + ' шт.:\n' + unique.join('\n') +
        '\nПодробности: README.md'
      );
    }
  })();
})();
