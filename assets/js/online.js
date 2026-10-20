/* =========================================================
   online.js — виджет «Сейчас играют»
   Тянет список игроков с бэкенда и рисует карточки.
   ========================================================= */
(function () {
    'use strict';

    var CFG = window.PIXELS_CONFIG || {};
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function ago(ts) {
        var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
        if (s < 60) return s + ' с назад';
        if (s < 3600) return Math.round(s / 60) + ' мин назад';
        if (s < 86400) return Math.round(s / 3600) + ' ч назад';
        return Math.round(s / 86400) + ' дн назад';
    }

    function apiBase() {
        return (CFG.API_BASE || '').replace(/\/+$/, '');
    }

    function scriptUrl() {
        if (CFG.SCRIPT_URL) return CFG.SCRIPT_URL;
        var b = apiBase();
        return b ? b + '/api/script' : '';
    }

    /* ---------- состояние ---------- */
    var state = { users: [], stats: null, timer: null, lastError: null };

    /* ---------- рендер ---------- */
    function renderList(container, users) {
        if (!users.length) {
            container.innerHTML = '<div class="on-empty">Пока никто не в игре — стань первым</div>';
            return;
        }
        container.innerHTML = users.map(function (u) {
            var feats = (u.features || []).map(function (f) {
                return '<span class="on-feat">' + esc(f) + '</span>';
            }).join('');
            return '' +
            '<li class="on-item">' +
                '<span class="on-avatar" aria-hidden="true">' + esc((u.displayname || u.username || '?').charAt(0).toUpperCase()) + '</span>' +
                '<span class="on-info">' +
                    '<b>' + esc(u.displayname || u.username) + '</b>' +
                    '<span class="on-sub">@' + esc(u.username) + ' · ' + esc(ago(u.lastSeen)) + '</span>' +
                '</span>' +
                '<span class="on-feats">' + (feats || '<span class="on-feat off">модули не отправлены</span>') + '</span>' +
            '</li>';
        }).join('');
    }

    function renderStats(box, s) {
        if (!s) { box.innerHTML = ''; return; }
        var items = [
            ['онлайн', s.online],
            ['всего', s.total],
            ['запусков', s.totalHits]
        ];
        box.innerHTML = items.map(function (i) {
            return '<div class="on-stat"><b>' + i[1] + '</b><span>' + i[0] + '</span></div>';
        }).join('');
    }

    /* ---------- загрузка ---------- */
    function refresh() {
        var base = apiBase();
        var listBox = $('#onList');
        var statBox = $('#onStats');
        var status = $('#onStatus');
        var statusText = status ? status.querySelector('.txt') : null;
        if (!listBox) return;

        if (!base) {
            listBox.innerHTML = '<div class="on-empty">Сервер не подключён — укажи API_BASE в <code>assets/js/config.js</code></div>';
            if (status) { status.classList.add('off'); if (statusText) statusText.textContent = 'нет сервера'; }
            return;
        }

        fetch(base + '/api/list', { cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                state.users = data.users || [];
                renderList(listBox, state.users);
                if (status) {
                    status.classList.remove('off');
                    if (statusText) {
                        statusText.textContent = state.users.length + ' ' +
                            (state.users.length === 1 ? 'онлайн' : 'онлайн');
                    }
                }
                return fetch(base + '/api/stats', { cache: 'no-store' })
                    .then(function (r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.json();
                    })
                    .then(function (d) {
                        state.stats = d.stats;
                        renderStats(statBox, d.stats);
                    })
                    .catch(function (e) {
                        if (statBox) statBox.innerHTML = '';
                    });
            })
            .catch(function (err) {
                state.lastError = err.message;
                listBox.innerHTML = '<div class="on-empty">Сервер недоступен (' + esc(err.message) + ')</div>';
                if (status) { status.classList.add('off'); if (statusText) statusText.textContent = 'ошибка'; }
            });
    }

    /* ---------- загрузчик скрипта ---------- */
    function setupLoader() {
        var box = $('#onLoader');
        if (!box) return;
        var url = scriptUrl();
        if (!url) {
            box.textContent = '-- укажи адрес сервера в assets/js/config.js';
            return;
        }
        box.textContent = 'loadstring(game:HttpGet("' + url + '"))()';

        var btn = $('#onCopy');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var text = box.textContent;
            var done = function () {
                var orig = btn.innerHTML;
                btn.innerHTML = '✓ Скопировано';
                setTimeout(function () { btn.innerHTML = orig; }, 1800);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(function () {});
            } else {
                var ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select();
                try { document.execCommand('copy'); done(); } catch (e) {}
                ta.remove();
            }
        });
    }

    /* ---------- загрузчик оверлея (список игроков) ---------- */
    function setupOverlay() {
        var box = $('#onOverlay');
        if (!box) return;
        var base = apiBase();
        if (!base) {
            box.textContent = '-- укажи адрес сервера в assets/js/config.js';
            return;
        }
        box.textContent = 'loadstring(game:HttpGet("' + base + '/api/overlay"))()';

        var btn = $('#onOverlayCopy');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var text = box.textContent;
            var done = function () {
                var orig = btn.innerHTML;
                btn.innerHTML = '✓ Скопировано';
                setTimeout(function () { btn.innerHTML = orig; }, 1800);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(function () {});
            } else {
                var ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select();
                try { document.execCommand('copy'); done(); } catch (e) {}
                ta.remove();
            }
        });
    }

    /* ---------- init ---------- */
    function init() {
        if (!document.querySelector('#onList')) return;
        if (CFG.SHOW_ONLINE === false) return;

        setupLoader();
        setupOverlay();
        refresh();
        state.timer = setInterval(refresh, CFG.REFRESH_MS || 15000);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) refresh();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
