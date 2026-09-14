/* ============================================================================
   In stile russo — опросник на отдельной странице.

   Вопросы идут по одному: на телефоне список из семидесяти с лишним
   кнопок разом читать невозможно. Скрипт складывает ответы, считает
   вилку бюджета и собирает готовый текст заявки, который человек
   отправляет сам — поэтому странице не нужен сервер.

   Вопросы, ответы и цены править здесь не нужно: всё в content.js,
   раздел 7а.
   ============================================================================ */

(function () {
  'use strict';

  var PLACEHOLDER = /\{\{[^}]+\}\}/;
  function isUnset(v) { return typeof v !== 'string' || v === '' || PLACEHOLDER.test(v); }
  function byId(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pick(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, CONTENT);
  }

  // Тексты, общие с главной страницей
  document.querySelectorAll('[data-text]').forEach(function (node) {
    var v = pick(node.dataset.text);
    node.textContent = v == null ? '' : v;
  });

  var brief = CONTENT.brief;
  var шагов = brief.groups.length;

  document.title = brief.pageTitle || brief.title;

  /* --- Память ---------------------------------------------------------------
     Ответы храним в браузере: человек ушёл посмотреть видео на сайте,
     вернулся — отмеченное на месте. Если хранилище недоступно
     (режим инкогнито, запрет), просто работаем без памяти. */

  var КЛЮЧ = 'instilerusso-brief';
  var выбор = {};
  var дата = '';
  var уточнения = {};   // тексты из полей «Другое» и подобных, ключ — id ответа

  try {
    var сохранённое = JSON.parse(localStorage.getItem(КЛЮЧ) || '{}');
    if (сохранённое && typeof сохранённое === 'object') {
      выбор = сохранённое.выбор || {};
      дата = сохранённое.дата || '';
      уточнения = сохранённое.уточнения || {};
    }
  } catch (e) { /* памяти нет — не беда */ }

  brief.groups.forEach(function (group) {
    var v = выбор[group.id];
    var годится = group.type === 'many' ? Array.isArray(v) : (typeof v === 'string' || v === null);
    if (!годится) выбор[group.id] = group.type === 'many' ? [] : null;
  });

  function запомнить() {
    try {
      localStorage.setItem(КЛЮЧ,
        JSON.stringify({ выбор: выбор, дата: дата, уточнения: уточнения }));
    } catch (e) { /* переполнено или запрещено — не мешаем работе */ }
  }

  /* --- Деньги --------------------------------------------------------------
     Цена события умножается на koef — длительность, день недели,
     срочность. Аппаратура, бензин и дополнения прибавляются после
     умножения: они не дорожают от того, что вечер субботний. */

  function собранное() {
    var список = [];
    brief.groups.forEach(function (group) {
      var v = выбор[group.id];
      var ids = group.type === 'many' ? (v || []) : (v ? [v] : []);
      var ответы = [];
      ids.forEach(function (id) {
        group.options.forEach(function (o) { if (o.id === id) ответы.push(o); });
      });
      if (ответы.length) список.push({ group: group, options: ответы });
    });
    return список;
  }

  function вилка(список) {
    var база = 0, допы = 0, множитель = 1;
    список.forEach(function (пара) {
      пара.options.forEach(function (o) {
        if (o.koef) множитель *= o.koef;
        if (!o.plus) return;
        if (пара.group.base) база += o.plus; else допы += o.plus;
      });
    });
    if (!база) return null;   // без формата считать нечего
    var середина = база * множитель + допы;
    var шаг = brief.spread || 0.15;
    var округлить = function (n) { return Math.round(n / 1000) * 1000; };
    return [округлить(середина * (1 - шаг)), округлить(середина * (1 + шаг))];
  }

  function число(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function деньги(ц) { return число(ц[0]) + ' – ' + число(ц[1]) + ' ₽'; }

  function датаСловами() {
    if (!дата) return null;
    var d = new Date(дата + 'T12:00:00');
    if (isNaN(d)) return null;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) +
      ' ' + d.getFullYear() + ', ' + d.toLocaleDateString('ru-RU', { weekday: 'long' });
  }

  function текстЗаявки(список, цена) {
    var строки = [brief.greeting, ''];
    строки.push(brief.dateLine + ': ' + (датаСловами() || brief.dateUnknown));
    список.forEach(function (пара) {
      строки.push(пара.group.label + ': ' + пара.options.map(function (o) {
        // У ответов вроде «Другое» рядом пишем, что именно человек имел в виду
        var свой = (уточнения[o.id] || '').trim();
        return свой ? o.label + ' — ' + свой : o.label;
      }).join(', '));
    });
    if (цена) {
      строки.push('');
      строки.push(brief.budgetLine + ': ' + деньги(цена));
    }
    строки.push('', brief.signOff);
    return строки.join('\n');
  }

  /* --- Шаги ---------------------------------------------------------------- */

  var шаг = 0;                       // 0..шагов-1 — вопросы, шагов — итог
  var сцена = byId('step');
  var бар = byId('progress-bar');
  var счётчик = byId('progress-count');
  var назадBtn = byId('step-back');
  var дальшеBtn = byId('step-next');
  var подвалЦена = byId('running-sum');

  function обновитьПолоску() {
    var доля = шаг / шагов;
    бар.style.transform = 'scaleX(' + доля + ')';
    счётчик.textContent = шаг < шагов
      ? brief.stepOf.replace('{n}', шаг + 1).replace('{all}', шагов)
      : brief.stepDone;
  }

  function обновитьПодвал() {
    // На итоговом экране вилка уже крупно написана в карточке —
    // второй раз внизу она только мозолит глаз.
    if (шаг >= шагов) { подвалЦена.hidden = true; return; }
    подвалЦена.hidden = false;
    var цена = вилка(собранное());
    подвалЦена.textContent = цена ? деньги(цена) : brief.runningEmpty;
  }

  function рисоватьВопрос(group) {
    сцена.innerHTML = '';
    var h = el('h2', 'step__question', group.label);
    сцена.appendChild(h);
    if (group.type === 'many') {
      сцена.appendChild(el('p', 'step__hint', brief.manyHint));
    }

    var поля = [];            // поля ввода у ответов с пометкой ask

    var chips = el('div', 'chips');
    chips.setAttribute('role', group.type === 'one' ? 'radiogroup' : 'group');
    chips.setAttribute('aria-label', group.label);

    group.options.forEach(function (option) {
      var выбрано = group.type === 'many'
        ? выбор[group.id].indexOf(option.id) !== -1
        : выбор[group.id] === option.id;

      var chip = el('button', 'chip', option.label);
      chip.type = 'button';
      if (group.type === 'one') {
        chip.setAttribute('role', 'radio');
        chip.setAttribute('aria-checked', выбрано ? 'true' : 'false');
      } else {
        chip.setAttribute('aria-pressed', выбрано ? 'true' : 'false');
      }

      chip.addEventListener('click', function () {
        if (group.type === 'one') {
          // Повторное нажатие снимает выбор: человек мог ткнуть случайно
          var былВыбран = выбор[group.id] === option.id;
          выбор[group.id] = былВыбран ? null : option.id;
          [].forEach.call(chips.children, function (o) {
            o.setAttribute('aria-checked', o === chip && !былВыбран ? 'true' : 'false');
          });
        } else {
          var список = выбор[group.id];
          var i = список.indexOf(option.id);
          if (i === -1) список.push(option.id); else список.splice(i, 1);
          chip.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
        }
        // Поле нужного ответа показываем, чужие прячем
        поля.forEach(function (п) {
          var выбрано = group.type === 'many'
            ? выбор[group.id].indexOf(п.option.id) !== -1
            : выбор[group.id] === п.option.id;
          п.узел.hidden = !выбрано;
          if (выбрано && п.option === option) п.ввод.focus();
        });

        byId('brief-status-line').textContent = '';
        запомнить();
        обновитьПодвал();
      });

      chips.appendChild(chip);

      // У ответа с пометкой ask под таблетками открывается поле:
      // «Другое» без пояснения — бесполезный ответ.
      if (option.ask) {
        var поле = el('p', 'ask');
        поле.hidden = !выбрано;

        var подпись = el('label', 'ask__label', option.ask);
        подпись.htmlFor = 'ask-' + option.id;

        var ввод = el('input', 'form__input');
        ввод.type = 'text';
        ввод.id = 'ask-' + option.id;
        ввод.placeholder = brief.askPlaceholder;
        ввод.value = уточнения[option.id] || '';
        ввод.addEventListener('input', function () {
          уточнения[option.id] = this.value;
          запомнить();
        });

        поле.appendChild(подпись);
        поле.appendChild(ввод);
        поля.push({ option: option, узел: поле, ввод: ввод, chip: chip });
      }
    });
    сцена.appendChild(chips);
    поля.forEach(function (п) { сцена.appendChild(п.узел); });

    // Дату спрашиваем на первом шаге — вместе с форматом это начало разговора
    if (шаг === 0) {
      var row = el('p', 'form__row step__date');
      var label = el('label', 'form__label', brief.dateLabel);
      label.htmlFor = 'brief-date';
      var input = el('input', 'form__input');
      input.type = 'date';
      input.id = 'brief-date';
      input.value = дата;
      input.addEventListener('change', function () {
        дата = this.value;
        запомнить();
      });
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(el('span', 'form__hint', brief.dateHint));
      сцена.appendChild(row);
    }
  }

  function рисоватьИтог() {
    сцена.innerHTML = '';
    var список = собранное();
    var цена = вилка(список);

    var box = el('div', 'brief__result');
    box.appendChild(el('h2', 'brief__resultTitle', brief.resultTitle));
    box.appendChild(el('p', 'brief__sum', цена ? деньги(цена) : brief.resultEmpty));
    box.appendChild(el('p', 'brief__fine', brief.resultHint));
    сцена.appendChild(box);

    сцена.appendChild(el('h3', 'subtitle', brief.messageTitle));
    сцена.appendChild(el('p', 'brief__fine', brief.messageHint));

    var area = el('textarea', 'brief__text');
    area.rows = 10;
    area.readOnly = true;
    area.setAttribute('aria-label', brief.messageTitle);
    area.value = текстЗаявки(список, цена);
    сцена.appendChild(area);

    var actions = el('div', 'brief__actions');
    var status = el('p', 'form__status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    function скопировать() {
      var текст = area.value;
      var готово = function () { status.textContent = brief.copied; };
      var провал = function () { status.textContent = brief.copyFailed; };

      function старыйСпособ() {
        try {
          area.readOnly = false;
          area.select();
          area.setSelectionRange(0, текст.length);
          var ок = document.execCommand('copy');
          area.readOnly = true;
          if (ок) готово(); else провал();
        } catch (e) { провал(); }
      }

      // Современный способ есть не везде и внутри рамок бывает запрещён
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(текст).then(готово, старыйСпособ);
      } else {
        старыйСпособ();
      }
    }

    var copy = el('button', 'btn btn--primary', brief.copy);
    copy.type = 'button';
    copy.addEventListener('click', function () {
      скопировать();
      очиститьПотом();
    });
    actions.appendChild(copy);

    // Telegram не умеет подставлять текст в переписку по ссылке:
    // копируем в буфер и открываем чат, остаётся вставить.
    var tg = CONTENT.contacts.telegram;
    if (!isUnset(tg)) {
      // Обычная ссылка, а не window.open: всплывающие окна браузеры
      // блокируют, и чат заказчика просто не открывался.
      var tgBtn = el('a', 'btn btn--outline', brief.toTelegram);
      tgBtn.href = 'https://t.me/' + tg;
      tgBtn.target = '_blank';
      tgBtn.rel = 'noopener';
      tgBtn.addEventListener('click', function () {
        скопировать();       // текст в буфер: Telegram не принимает его ссылкой
        очиститьПотом();
      });
      actions.appendChild(tgBtn);
    }

    // WhatsApp текст в ссылке принимает — вставлять ничего не нужно
    var wa = CONTENT.contacts.whatsapp;
    if (!isUnset(wa)) {
      var waBtn = el('a', 'btn btn--outline', brief.toWhatsapp);
      waBtn.target = '_blank';
      waBtn.rel = 'noopener';
      waBtn.href = 'https://wa.me/' + wa;
      waBtn.addEventListener('click', function () {
        this.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(area.value);
        очиститьПотом();
      });
      actions.appendChild(waBtn);
    }

    // Заявка ушла — опросник начинает с чистого листа. Ждём секунду,
    // чтобы копирование и переход в мессенджер успели сработать:
    // на iOS переход отменяется, если страница меняется слишком рано.
    function очиститьПотом() {
      setTimeout(function () {
        brief.groups.forEach(function (g) {
          выбор[g.id] = g.type === 'many' ? [] : null;
        });
        уточнения = {};
        дата = '';
        try { localStorage.removeItem(КЛЮЧ); } catch (e) { /* нечего убирать */ }
        шаг = 0;
        показать();
        byId('brief-status-line').textContent = brief.sentAndCleared;
      }, 1000);
    }

    сцена.appendChild(actions);
    сцена.appendChild(status);
  }

  function показать() {
    if (шаг < шагов) рисоватьВопрос(brief.groups[шаг]); else рисоватьИтог();

    назадBtn.hidden = шаг === 0;
    дальшеBtn.textContent = шаг < шагов - 1 ? brief.next
      : (шаг === шагов - 1 ? brief.showResult : brief.restart);

    обновитьПолоску();
    обновитьПодвал();

    // К началу вопроса, а не туда, где человек стоял на прошлом шаге
    window.scrollTo({ top: 0, behavior: 'auto' });
    сцена.focus({ preventScroll: true });
  }

  назадBtn.addEventListener('click', function () {
    if (шаг > 0) { шаг--; показать(); }
  });

  дальшеBtn.addEventListener('click', function () {
    шаг = шаг < шагов ? шаг + 1 : 0;   // с итога кнопка возвращает к началу
    показать();
  });

  /* --- Клавиатура не должна закрывать поле ---------------------------------
     На телефоне экранная клавиатура выезжает поверх страницы и накрывает
     то самое поле, в которое человек ткнул. Плюс снизу закреплена панель
     шага — она тоже мешает. Убираем панель и подкручиваем страницу ровно
     на недостающее. visualViewport — это то, что осталось видно поверх
     клавиатуры. */

  var viewport = window.visualViewport;
  var stepbar = document.querySelector('.stepbar');
  var вФокусе = null;

  function поднятьНадКлавиатурой(поле) {
    if (!поле) return;
    var видимыйНиз = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    // Тянем строку целиком — вместе с подписью над полем
    var строка = поле.closest('.ask') || поле.closest('.form__row') || поле;
    var нехватка = строка.getBoundingClientRect().bottom + 16 - видимыйНиз;
    if (нехватка > 0) window.scrollBy({ top: нехватка, behavior: 'smooth' });
  }

  document.addEventListener('focusin', function (event) {
    var поле = event.target;
    if (!поле.matches || !поле.matches('input, textarea')) return;
    вФокусе = поле;
    if (stepbar) stepbar.classList.add('is-away');
    // Клавиатура выезжает не мгновенно: считать сразу бессмысленно
    setTimeout(function () { поднятьНадКлавиатурой(вФокусе); }, 300);
  });

  document.addEventListener('focusout', function () {
    вФокусе = null;
    if (stepbar) stepbar.classList.remove('is-away');
  });

  // Клавиатура меняется на ходу: сменили язык, открыли эмодзи,
  // появилась строка подсказок. Каждый раз проверяем заново.
  if (viewport) {
    viewport.addEventListener('resize', function () { поднятьНадКлавиатурой(вФокусе); });
  }

  показать();

  // Тело страницы спрятано, пока тексты не расставлены, — иначе она
  // успевает мелькнуть пустой. Показываем, когда всё готово.
  document.documentElement.classList.add('ready');
})();
