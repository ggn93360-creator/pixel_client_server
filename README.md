<div align="center">

# 桜 · PIXELS CLIENT

**Roblox-клиент · сайт + загрузка релизов**

[![Pages](https://img.shields.io/badge/site-GitHub%20Pages-c25e78?style=flat-square)](https://ggn93360-creator.github.io/pixel_client_server/)
[![Downloads](https://img.shields.io/badge/download-Pixels.exe-13.3%20MB-c25e78?style=flat-square)](https://ggn93360-creator.github.io/pixel_client_server/client/Pixels.exe)

🌸 Сакура-тема · тёмный неон · EN / UA / RU

</div>

---

## Сайт

| Страница | Описание |
|----------|----------|
| [`index.html`](index.html) | Главная: герой, фичи, поддерживаемые игры, «получить скрипт», **секция загрузки** |
| [`downloads.html`](downloads.html) | Архив всех релизов с карточками, хешами и модалкой деталей |
| [`api.php`](api.php) | API онлайн-игроков (`?action=update` / `?action=list`) |

Сайт опубликован через **GitHub Pages**: <https://ggn93360-creator.github.io/pixel_client_server/>

---

## Скачать клиент

Файлы раздаются с **GitHub Releases** — это каноническое место для бинарников:
счётчики загрузок, история версий, правильное имя файла в `Content-Disposition`.

| Файл | Размер | Ссылка |
|------|--------|--------|
| `Pixels.exe` | 13.3 MB | [/releases/download/v1.0.0/Pixels.exe](https://github.com/ggn93360-creator/pixel_client_server/releases/download/v1.0.0/Pixels.exe) |
| `loader.zip` | 50 KB | [/releases/download/v1.0.0/loader.zip](https://github.com/ggn93360-creator/pixel_client_server/releases/download/v1.0.0/loader.zip) |

Страница релизов: <https://github.com/ggn93360-creator/pixel_client_server/releases>

> Почему `loader.zip`, а не `loader.lua`: GitHub удаляет `.lua`-ассеты из релизов
> (срабатывает сканер на обфусцированном Lua). `.zip` проходит без проблем.

### Как обновить клиент

1. Создать релиз на GitHub: **Releases → Draft a new release**
2. Тег, например `v1.1.0`, приложить `Pixels.exe` (и `loader.zip`, если менялся лоадер)
3. Обновить `releases.json`:

```json
{
  "version": "v1.1.0",
  "date": "2026-11-01",
  "channel": "stable",
  "files": [{
    "name": "Pixels.exe",
    "path": "https://github.com/ggn93360-creator/pixel_client_server/releases/download/v1.1.0/Pixels.exe",
    "type": "exe",
    "size": 13955707,
    "sha256": "63E179D97729ACA39C3AACAD87C5C3305BA06A7615181254FC50DEF6C81C49C9",
    "platform": "Windows 10/11 · x64"
  }]
}
```

4. Закоммитить и запушить — сайт обновится сам (Pages пересобирается автоматически).

> `releases.json` — единственный источник правды для секции загрузки.
> Карточки, модалка, размеры, хеши, кнопка в герое и ссылка на страницу релизов
> рисуются из него скриптом `assets/js/downloads.js`.
> Если файл недоступен — сработает встроенный фолбэк, сайт не сломается.

### Получить SHA-256 файла

```powershell
(Get-FileHash $env:USERPROFILE\Downloads\Pixels.exe -Algorithm SHA256).Hash
```

```bash
sha256sum ~/Downloads/Pixels.exe
```

> ⚠️ Хеш в `releases.json` должен считаться с **того самого файла, который
> загружен в релиз**. Если пересобрать `.zip` заново, он будет другим по байтам
> (внутри хранятся таймстемпы) — и хеш перестанет совпадать. Считай хеш
> скачанного с релиза файла.

---

## Структура

```
pixel_client_server/
├── index.html              # главная (самодостаточная, инлайн-стили + i18n)
├── downloads.html          # страница всех релизов
├── releases.json           # манифест релизов (версии, файлы, размеры, хеши)
├── download.php            # отдача файла с правильными заголовками (для PHP-хостинга)
├── api.php                 # API онлайн-игроков
├── css/
│   ├── downloads.css       # стили секции загрузок (тема 桜)
│   └── style.css           # ⚠️ legacy: старая тёмно-неоновая тема, не подключена
├── assets/js/downloads.js  # рендер карточек релизов + модалка деталей
├── avatarka.png            # аватар (логотип в герое)
├── .nojekyll               # чтобы Pages не трогал служебные файлы
└── pixels_users.json       # хранилище API (данные игроков)
```

> Бинарников в репозитории нет — `Pixels.exe` и `loader.zip` лежат в
> [GitHub Releases](https://github.com/ggn93360-creator/pixel_client_server/releases).
> Так репозиторий остаётся лёгким, а у релизов есть счётчики загрузок.
>
> `css/style.css` — остаток от предыдущей версии сайта, на текущий `index.html` не
> подключается. Можно удалить, если не нужен.

### ⚠️ Кэш GitHub Pages

Pages кэширует статику на 10 минут, поэтому после правки `downloads.css` или
`downloads.js` браузер может какое-то время отдавать старую версию. Чтобы этого
не было, у ссылок стоит версия:

```html
<link rel="stylesheet" href="css/downloads.css?v=2">
<script src="assets/js/downloads.js?v=2"></script>
```

**После изменения CSS или JS — подними число `?v=`** в `index.html` и
`downloads.html` (в обоих сразу). `releases.json` обновляется сам: скрипт
запрашивает его с `cache: 'no-cache'`.

---

## Локаальный запуск

```bash
python -m http.server 8080
# затем открой http://localhost:8080/
```

PHP-хостинг для `api.php` и `download.php` (GitHub Pages PHP не исполняет):

```bash
php -S localhost:8080
```

---

## Заметки

- `api.php` пишет в `pixels_users.json` — на хостинге этому файлу нужны права на запись
- `download.php` отдаёт файл с `Content-Disposition`, поддержкой `Range` (докачка) и
  белым списком разрешённых путей
- i18n: EN / UA / RU, переключатель в шапке. Переводы лежат в объекте `i18n`
  внутри `index.html` и `downloads.html`
- Лоадер (`.lua`) тянется с другого репозитория:
  `https://raw.githubusercontent.com/ggn93360-creator/pixel_client/main/v1`

---

<div align="center">

© 2026 PIXELS CLIENT · 桜 · NOT AFFILIATED WITH ROBLOX · MADE WITH ❤️

</div>
