/* ============================================
   downloads.js — рендер релизов + модалка деталей
   Работает на GitHub Pages и на любом статик-хостинге.
   Источник данных: releases.json (указывается в data-releases-url)
   ============================================ */
(function () {
    'use strict';

    /* ---------- утилиты ---------- */
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function fmtSize(bytes) {
        if (!bytes) return '—';
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return bytes + ' B';
    }

    function fmtDate(iso) {
        var d = new Date(iso + 'T00:00:00');
        if (isNaN(d.getTime())) return iso;
        var months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
    }

    function fmtNum(n) {
        n = Number(n) || 0;
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    /* ---------- переводы для динамических строк ---------- */
    var T = {
        en: {
            download: 'Download', details: 'Details', copy: 'Copy', copied: 'Copied',
            size: 'Size', sha256: 'SHA-256', platform: 'Platform', file: 'File',
            open: 'Open file', close: 'Close', notes: 'Changelog', stable: 'Stable', beta: 'Beta',
            noNotes: 'No changelog for this build.', empty: 'No releases published yet.',
            onGithub: 'View release',
            exe: 'EXE', lua: 'LUA', zip: 'ZIP', raw: 'FILE'
        },
        uk: {
            download: 'Завантажити', details: 'Деталі', copy: 'Копіювати', copied: 'Скопійовано',
            size: 'Розмір', sha256: 'SHA-256', platform: 'Платформа', file: 'Файл',
            open: 'Відкрити файл', close: 'Закрити', notes: 'Зміни', stable: 'Стабільна', beta: 'Бета',
            noNotes: 'Немає списку змін для цієї збірки.', empty: 'Релізів поки немає.',
            onGithub: 'Реліз на GitHub',
            exe: 'EXE', lua: 'LUA', zip: 'ZIP', raw: 'FILE'
        },
        ru: {
            download: 'Скачать', details: 'Детали', copy: 'Копировать', copied: 'Скопировано',
            size: 'Размер', sha256: 'SHA-256', platform: 'Платформа', file: 'Файл',
            open: 'Открыть файл', close: 'Закрыть', notes: 'Изменения', stable: 'Стабильная', beta: 'Бета',
            noNotes: 'Список изменений для этой сборки отсутствует.', empty: 'Релизов пока нет.',
            onGithub: 'Релиз на GitHub',
            exe: 'EXE', lua: 'LUA', zip: 'ZIP', raw: 'FILE'
        }
    };

    function t(key) {
        var lang = (window.currentLang || 'en');
        return (T[lang] && T[lang][key]) || T.en[key] || key;
    }

    /* ---------- состояние ---------- */
    var state = { releases: [], manifest: {}, modal: null, lastFocus: null };

    /* ---------- рендер карточек ---------- */
    function releaseCard(rel, idx) {
        var files = (rel.files || []).map(function (f, i) {
            var isRemote = /^https?:/i.test(f.path);
            var href = f.path;
            var dlAttr = isRemote ? '' : ' download="' + esc(f.name) + '"';
            var typeIcon = (T[window.currentLang || 'en'] || T.en)[f.type] || T.en.raw;
            var sub = [];
            if (f.platform) sub.push(esc(f.platform));
            sub.push(fmtSize(f.size));

            return '' +
            '<li class="dl-file">' +
                '<span class="dl-file-ic">' + esc(typeIcon) + '</span>' +
                '<span class="dl-file-info">' +
                    '<b>' + esc(f.name) + '</b>' +
                    '<span>' + sub.join(' · ') + '</span>' +
                '</span>' +
                '<span class="dl-actions">' +
                    '<a class="dl-btn" href="' + esc(href) + '"' + dlAttr + ' data-dl-track="' + esc(f.name) + '">' +
                        '<i class="fas fa-download"></i> ' + esc(t('download')) +
                    '</a>' +
                    '<button class="dl-info-btn" data-dl-info="' + idx + ':' + i + '" title="' + esc(t('details')) + '">' +
                        '<i class="fas fa-circle-info"></i>' +
                    '</button>' +
                '</span>' +
            '</li>';
        }).join('');

        var notes = '';
        if (rel.notes && rel.notes.length) {
            notes = '<div class="dl-notes"><h4>' + esc(t('notes')) + '</h4><ul>' +
                rel.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') +
                '</ul></div>';
        }

        // ссылка на страницу релиза на GitHub
        var ghLink = '';
        if (state.manifest.releasesPage) {
            ghLink = '<a class="dl-gh-link" href="' + esc(state.manifest.releasesPage + '/tag/' + rel.version) +
                '" target="_blank" rel="noopener"><i class="fab fa-github"></i> ' + esc(t('onGithub')) + '</a>';
        }

        return '' +
        '<article class="dl-card">' +
            '<header class="dl-card-head">' +
                '<div class="dl-ver-block">' +
                    '<span class="dl-ver">' + esc(rel.version) + '</span>' +
                    '<span class="dl-channel ' + esc(rel.channel || 'stable') + '">' +
                        esc(rel.channel === 'beta' ? t('beta') : t('stable')) +
                    '</span>' +
                    ghLink +
                '</div>' +
                '<time class="dl-date">' + esc(fmtDate(rel.date)) + '</time>' +
            '</header>' +
            '<ul class="dl-files">' + files + '</ul>' +
            notes +
        '</article>';
    }

    /* ---------- применение ссылок из манифеста ---------- */
    function applyManifestLinks() {
        var first = state.releases[0];
        if (!first) return;

        // кнопка в герое: первый файл последнего релиза
        var heroName = $('[data-dl-hero]') ? $('[data-dl-hero]').getAttribute('data-dl-hero') : null;
        if (heroName) {
            var heroFile = (first.files || []).filter(function (f) { return f.name === heroName; })[0] || (first.files || [])[0];
            if (heroFile) {
                $$('[data-dl-hero]').forEach(function (el) {
                    el.setAttribute('href', heroFile.path);
                    el.removeAttribute('download');
                });
            }
        }

        // кнопка "Releases на GitHub"
        if (state.manifest.releasesPage) {
            $$('[data-dl-releases-link]').forEach(function (el) {
                el.setAttribute('href', state.manifest.releasesPage);
            });
        }
    }

    function render(grid, releases) {
        if (!releases || !releases.length) {
            grid.innerHTML = '<div class="dl-empty">' + esc(t('empty')) + '</div>';
            return;
        }
        grid.innerHTML = releases.map(releaseCard).join('');
        applyManifestLinks();
    }

    /* ---------- модалка деталей ---------- */
    function openModal(rel, file) {
        var isRemote = /^https?:/i.test(file.path);
        var rows = '';

        rows += '<div class="dl-kv-row"><dt>' + esc(t('file')) + '</dt><dd>' + esc(file.name) + '</dd></div>';
        rows += '<div class="dl-kv-row"><dt>' + esc(t('size')) + '</dt><dd>' +
            fmtSize(file.size) + (file.size ? ' <span style="opacity:.55">(' + fmtNum(file.size) + ' B)</span>' : '') + '</dd></div>';
        if (file.platform) {
            rows += '<div class="dl-kv-row"><dt>' + esc(t('platform')) + '</dt><dd>' + esc(file.platform) + '</dd></div>';
        }
        if (file.sha256) {
            rows += '<div class="dl-kv-row"><dt>' + esc(t('sha256')) + '</dt><dd>' +
                '<span class="dl-hash"><span>' + esc(file.sha256) + '</span>' +
                '<button class="dl-copy" data-dl-copy="' + esc(file.sha256) + '">' + esc(t('copy')) + '</button>' +
                '</span></dd></div>';
        }

        var body = '' +
            '<div class="dl-file">' +
                '<span class="dl-file-ic">' + esc((T[window.currentLang || 'en'] || T.en)[file.type] || T.en.raw) + '</span>' +
                '<span class="dl-file-info"><b>' + esc(file.name) + '</b>' +
                '<span>' + esc(rel.version) + ' · ' + fmtSize(file.size) + '</span></span>' +
            '</div>' +
            '<dl class="dl-kv">' + rows + '</dl>';

        var foot = '<a class="dl-btn" href="' + esc(file.path) + '"' +
            (isRemote ? '' : ' download="' + esc(file.name) + '"') +
            ' data-dl-track="' + esc(file.name) + '"><i class="fas fa-download"></i> ' + esc(t('download')) + '</a>' +
            '<button class="dl-btn ghost" data-dl-close>' + esc(t('close')) + '</button>';

        showModal(esc(rel.version) + ' · ' + esc(file.name), body, foot);
    }

    function showModal(title, bodyHtml, footHtml) {
        closeModal();
        state.lastFocus = document.activeElement;

        var back = document.createElement('div');
        back.className = 'dl-modal-backdrop';
        back.id = 'dlModalBackdrop';
        back.innerHTML =
            '<div class="dl-modal" role="dialog" aria-modal="true" aria-label="' + title + '">' +
                '<div class="dl-modal-head">' +
                    '<h3>' + title + '</h3>' +
                    '<button class="dl-close" data-dl-close aria-label="Close">&times;</button>' +
                '</div>' +
                '<div class="dl-modal-body">' + bodyHtml + '</div>' +
                '<div class="dl-modal-foot">' + footHtml + '</div>' +
            '</div>';

        document.body.appendChild(back);
        document.body.style.overflow = 'hidden';
        state.modal = back;

        back.addEventListener('click', onModalClick);
        document.addEventListener('keydown', onModalKey);
    }

    function closeModal() {
        if (state.modal) {
            state.modal.remove();
            state.modal = null;
            document.body.style.overflow = '';
            document.removeEventListener('keydown', onModalKey);
            if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
        }
    }

    function onModalClick(e) {
        if (e.target === state.modal || e.target.closest('[data-dl-close]')) {
            closeModal();
            return;
        }
        var copyBtn = e.target.closest('[data-dl-copy]');
        if (copyBtn) {
            var text = copyBtn.getAttribute('data-dl-copy');
            copyText(text, copyBtn);
        }
    }

    function onModalKey(e) {
        if (e.key === 'Escape') closeModal();
    }

    function copyText(text, btn) {
        var done = function () {
            var orig = btn.innerHTML;
            btn.innerHTML = esc(t('copied'));
            setTimeout(function () { btn.innerHTML = orig; }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
        } else {
            fallbackCopy(text, done);
        }
    }

    function fallbackCopy(text, done) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (err) { /* ignore */ }
        ta.remove();
    }

    /* ---------- загрузка манифеста ---------- */
    function loadManifest(url) {
        return fetch(url, { cache: 'no-cache' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            });
    }

    function init() {
        var grids = $$('[data-releases]');
        if (!grids.length) return;

        grids.forEach(function (grid) {
            var url = grid.getAttribute('data-releases') || 'releases.json';
            var limit = parseInt(grid.getAttribute('data-releases-limit') || '0', 10);
            var showAll = grid.getAttribute('data-releases-all') === 'true';

            grid.innerHTML = '<div class="dl-loading"><div class="dl-spinner"></div>…</div>';

            loadManifest(url).then(function (data) {
                state.manifest = data || {};
                state.releases = (data && data.releases) || [];
                var list = state.releases;
                if (!showAll && limit > 0) list = list.slice(0, limit);
                render(grid, list);
            }).catch(function () {
                // фолбэк: манифест недоступен — показываем встроенный дефолт
                state.manifest = FALLBACK.manifest || {};
                state.releases = FALLBACK.releases;
                render(grid, showAll ? FALLBACK.releases : FALLBACK.releases.slice(0, limit || 1));
            });
        });

        // клики по карточкам (делегирование)
        document.addEventListener('click', function (e) {
            var info = e.target.closest('[data-dl-info]');
            if (!info) return;
            var parts = info.getAttribute('data-dl-info').split(':');
            var rel = state.releases[Number(parts[0])];
            var file = rel && rel.files ? rel.files[Number(parts[1])] : null;
            if (rel && file) openModal(rel, file);
        });

        // перерисовка при смене языка
        document.addEventListener('langchange', function (e) {
            var lang = (e && e.detail) || window.currentLang || 'en';
            $$('[data-releases]').forEach(function (grid) {
                var limit = parseInt(grid.getAttribute('data-releases-limit') || '0', 10);
                var showAll = grid.getAttribute('data-releases-all') === 'true';
                var list = state.releases.slice();
                if (!showAll && limit > 0) list = list.slice(0, limit);
                render(grid, list);
            });
        });
    }

    /* ---------- встроенный фолбэк ---------- */
    var FALLBACK = {
        manifest: {
            releasesPage: 'https://github.com/ggn93360-creator/pixel_client_server/releases'
        },
        releases: [{
            version: 'v1.0.0',
            title: 'Final Build',
            date: '2026-10-20',
            channel: 'stable',
            notes: [],
            files: [{
                name: 'Pixels.exe',
                path: 'https://github.com/ggn93360-creator/pixel_client_server/releases/download/v1.0.0/Pixels.exe',
                type: 'exe',
                size: 13955707,
                sha256: '63E179D97729ACA39C3AACAD87C5C3305BA06A7615181254FC50DEF6C81C49C9',
                platform: 'Windows 10/11 · x64'
            }, {
                name: 'loader.zip',
                path: 'https://github.com/ggn93360-creator/pixel_client_server/releases/download/v1.0.0/loader.zip',
                type: 'zip',
                size: 50594,
                sha256: 'B58FD74E79B4EC369171F0F20BBA38E5117B8D311F8ED4BD79B877DB86F8B926',
                platform: 'Universal loader · unpack and paste loader.lua'
            }]
        }]
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
