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

Главная кнопка ведёт на:

```
client/Pixels.exe
```

Это работает напрямую с GitHub Pages — файл отдаётся как `application/octet-stream` и скачивается без редиректов.

### Как обновить клиент

1. Положить новый бинарник в `client/Pixels.exe`
2. Обновить `releases.json`:

```json
{
  "version": "v1.1.0",
  "date": "2026-11-01",
  "channel": "stable",
  "files": [{
    "name": "Pixels.exe",
    "path": "client/Pixels.exe",
    "type": "exe",
    "size": 13955707,
    "sha256": "63E179D97729ACA39C3AACAD87C5C3305BA06A7615181254FC50DEF6C81C49C9",
    "platform": "Windows 10/11 · x64"
  }]
}
```

3. Закоммитить и запушить — сайт обновится сам (Pages пересобирается автоматически).

> `releases.json` — единственный источник правды для секции загрузки.
> Карточки, модалка, размеры, хеши и кнопки рисуются из него скриптом `assets/js/downloads.js`.
> Если файл недоступен — сработает встроенный фолбэк, сайт не сломается.

### Получить SHA-256 файла

```powershell
(Get-FileHash client\Pixels.exe -Algorithm SHA256).Hash
```

```bash
sha256sum client/Pixels.exe
```

---

## Структура

```
pixel_client_server/
├── index.html              # главная (самодостаточная, инлайн-стили + i18n)
├── downloads.html          # страница всех релизов
├── releases.json           # манифест релизов (версии, файлы, размеры, хеши)
├── download.php            # отдача файла с правильными заголовками (для PHP-хостинга)
├── api.php                 # API онлайн-игроков
├── client/
│   └── Pixels.exe          # сам клиент
├── css/
│   ├── downloads.css       # стили секции загрузок (тема 桜)
│   └── style.css           # ⚠️ legacy: старая тёмно-неоновая тема, не подключена
├── assets/js/downloads.js  # рендер карточек релизов + модалка деталей
├── avatarka.png            # аватар (логотип в герое)
├── .nojekyll               # чтобы Pages не трогал служебные файлы
└── pixels_users.json       # хранилище API (данные игроков)
```

> `css/style.css` — остаток от предыдущей версии сайта, на текущий `index.html` не
> подключается. Можно удалить, если не нужен.

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
