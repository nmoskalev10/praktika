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

  /* --- 5. Репертуар -------------------------------------------------------- */

  var repList = byId('repertoire-list');

  CONTENT.repertoire.items.forEach(function (item) {
    var block = el('article', 'rep');
    block.appendChild(el('h3', 'rep__name', item.name));
    block.appendChild(el('p', 'rep__text', item.text));

    var examples = el('p', 'rep__examples');
    examples.appendChild(el('b', null, ui.examplesLabel + ': '));
    examples.appendChild(document.createTextNode(item.examples));
    block.appendChild(examples);

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
  byId('f-contact').placeholder = formText.fields.contact.placeholder;

  function markInvalid(field, invalid) {
    field.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    // Своя проверка: нужно подсветить поле и увести в него фокус.
    var required = [byId('f-name'), byId('f-date'), byId('f-contact')];
    var firstBad = null;
    required.forEach(function (field) {
      var bad = field.value.trim() === '';
      markInvalid(field, bad);
      if (bad && !firstBad) firstBad = field;
    });

    if (firstBad) {
      status.textContent = ui.required;
      firstBad.focus();
      return;
    }

    if (isUnset(formText.formspreeId)) {
      status.textContent = formText.notConfigured;
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
        status.textContent = formText.success;
      })
      .catch(function () {
        status.textContent = formText.error;
      })
      .then(function () {
        submitButton.disabled = false;
      });
  });

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

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var heroVisible = entries[0].isIntersecting;
      sticky.hidden = heroVisible;
      document.body.classList.toggle('has-sticky', !heroVisible);
    }, { rootMargin: '-120px 0px 0px 0px' }).observe(hero);
  } else {
    sticky.hidden = false;
    document.body.classList.add('has-sticky');
  }

  /* --- 16. Напоминание о незаполненных заглушках -------------------------- */

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
