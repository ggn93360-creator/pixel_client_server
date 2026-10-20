# Pixels Client — Backend

Сервер, который:
- **регистрирует игроков**, запустивших скрипт (userid, ник, отображаемое имя),
- **запоминает, какие модули/визуалы включены** у каждого,
- **отдаёт Luau-скрипт** по адресу `/api/script`,
- **показывает список онлайн** на сайте (виджет «Сейчас играют»).

Node.js 18+, **без единой внешней зависимости** — только встроенные модули.

---

## Быстрый старт

```bash
cd server
node server.js
```

Сервер поднимется на `http://localhost:8787` и напечатает админ-токен.

```bash
# задай свои значения
PORT=8787 \
PUBLIC_URL=https://pixels.example.com \
ADMIN_TOKEN=свой-длинный-токен \
WHITELIST_ONLY=0 \
node server.js
```

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `8787` | порт |
| `PUBLIC_URL` | — | публичный адрес; подставляется в скрипт как `__API__` |
| `ADMIN_TOKEN` | случайный | токен для админ-эндпоинтов |
| `SESSION_SECRET` | — | если задан, `/api/script` требует `?token=` |
| `DATA_DIR` | `./data` | папка с `players.json` и `whitelist.json` |
| `SCRIPT_FILE` | `./payload/loader.luau` | тело скрипта, которое отдаётся игрокам |
| `OFFLINE_TTL` | `120` | секунд без heartbeat → игрок считается офлайн |
| `WHITELIST_ONLY` | `0` | `1` — отдавать скрипт только из whitelist |

> ⚠️ `PUBLIC_URL` обязателен в проде: именно он подставляется в скрипт, и по
> нему Luau-клиент ходит на сервер. Без него `__API__` будет пустым.

---

## API

### `POST /api/heartbeat`
Регистрирует игрока и его состояние. Клиент шлёт это раз в минуту.

```json
{
  "userid": 12345678,
  "username": "Player",
  "displayname": "Игрок",
  "game": "31490825",
  "features": ["ESP", "AimAssist", "SpeedFly"],
  "hwid": "..."
}
```

Ответ: `{ "status": "ok", "userid": "12345678", "online": true, "features": [...] }`

### `GET /api/list?game=<id>`
Список игроков онлайн (по `game` — фильтр).

```json
{
  "status": "ok",
  "count": 1,
  "users": [{
    "userid": "12345678",
    "username": "Player",
    "displayname": "Игрок",
    "game": "31490825",
    "features": ["ESP", "AimAssist"],
    "firstSeen": 1792483240283,
    "lastSeen": 1792483440283,
    "hits": 12,
    "online": true
  }]
}
```

### `GET /api/player?userid=<id>`
Один игрок.

### `GET /api/stats`
Сводка: всего, онлайн, запусков, whitelist, топ модулей.

### `GET /api/script?userid=<id>`
Отдаёт Luau-скрипт. Если `WHITELIST_ONLY=1` — только разрешённым `userid`,
остальным `403`. Если задан `SESSION_SECRET` — нужен ещё и `?token=`.

### `GET|POST /api/whitelist`
Список / добавление в whitelist. Требует `X-Admin-Token`.

```bash
curl -X POST http://localhost:8787/api/whitelist \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userid": "12345678"}'
```

### `GET /api/all`
Все игроки (включая офлайн). Требует `X-Admin-Token`.

---

## Админ-панель

```
http://localhost:8787/admin?token=<ADMIN_TOKEN>
```

Показывает: сколько онлайн, всего игроков, запусков; топ модулей; таблицу
игроков (userid, ник, включённые модули, число заходов, последняя активность);
кнопку добавить/убрать из whitelist. Обновляется каждые 5 секунд.

Токен можно вписать один раз — он сохранится в `localStorage` браузера.

---

## Как это связано с клиентом

Скрипт на сервере — `payload/loader.luau`. Он:

1. отдаёт наружу объект `Pixels` через `getgenv().Pixels`,
2. каждые `HEARTBEAT_INTERVAL` секунд шлёт heartbeat с userid/ником/модулями,
3. даёт модулям клиента API:
   ```lua
   local Pixels = getgenv().Pixels

   Pixels.SetFeatures({ ESP = true, AimAssist = false })  -- задать весь набор
   Pixels.Enable("SpeedFly")                             -- включить модуль
   Pixels.Disable("ESP")                                 -- выключить
   Pixels.IsEnabled("ESP")                               -- проверить
   ```

   Любое изменение сразу уходит на сервер — на сайте видно, кто и с какими
   визуалами сидит.

Чтобы сервер отдавал **твой** скрипт, положи его в `payload/loader.luau`
(или укажи другой путь через `SCRIPT_FILE`). Шаблон подставит `__API__` и `__TOKEN__`.

---

## Подключение к сайту

В `assets/js/config.js` укажи адрес сервера:

```js
window.PIXELS_CONFIG = {
  API_BASE: "https://pixels.example.com",
  SCRIPT_URL: "",          // если пусто — API_BASE + "/api/script"
  REFRESH_MS: 15000,
  SHOW_ONLINE: true
};
```

Виджет «Сейчас играют» на главной подхватит список и модули автоматически.

---

## Деплой

### Railway / Render / Fly.io
Собирается из `Dockerfile` в папке `server/`. Обязательные переменные:
`PUBLIC_URL`, `ADMIN_TOKEN`.

### VPS
```bash
scp -r server user@host:/opt/pixels
ssh user@host
cd /opt/pixels && node server.js
```

Для постоянной работы — systemd-юнит:

```ini
[Unit]
Description=Pixels Client Backend
After=network.target

[Service]
WorkingDirectory=/opt/pixels/server
ExecStart=/usr/bin/node server.js
Environment=PUBLIC_URL=https://pixels.example.com
Environment=ADMIN_TOKEN=твой-токен
Restart=always

[Install]
WantedBy=multi-user.target
```

### Свой PHP-хостинг
Если Node недоступен — используй `api.php` из корня репозитория. Контракт
тот же (`/api.php?action=heartbeat`, `?action=list`, `?action=script`…),
админ-панели там нет, но сайт будет работать.

---

## Данные

Всё хранится в `server/data/`:

| Файл | Что внутри |
|---|---|
| `players.json` | все игроки: userid, ник, модули, время захода |
| `whitelist.json` | список разрешённых userid |

Пишутся атомарно (через временный файл + rename), с дебаунсом 1.5 с,
чтобы не писать на каждый heartbeat. Записи старше `OFFLINE_TTL * 60` удаляются
раз в 5 минут.

Бэкап — просто скопируй папку `data/`.

> `server/data/` в `.gitignore` — реальные данные игроков не должны попасть
> в публичный репозиторий.
