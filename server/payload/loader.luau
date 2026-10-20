--!strict
--[[
	============================================================
	 Pixels Client — Telemetry Loader
	 Отдаётся сервером с /api/script
	 __API__ и __TOKEN__ подставляются сервером автоматически
	============================================================
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local API = "__API__"
local TOKEN = "__TOKEN__"

local HEARTBEAT_INTERVAL = 60 -- секунд между отчётами
local FEATURE_CHANGE_DEBOUNCE = 2

-- =========================================================
--  СОСТОЯНИЕ
-- =========================================================
local Pixels = {}
Pixels.features = {} -- { ["ESP"] = true, ... }
Pixels.online = false
Pixels.connected = false
Pixels.lastError = nil
Pixels.userid = 0
Pixels.username = ""
Pixels.displayname = ""

local pendingSend = false
local changeTimer = nil
local started = false

-- =========================================================
--  ХЕЛПЕРЫ
-- =========================================================
local function log(msg)
    if getgenv and getgenv().PX_DEBUG then
        print("[Pixels] " .. tostring(msg))
    end
end

local function url(path)
    if API == "" then
        return nil
    end
    return API .. path
end

local function getLocalPlayer()
    local ok, lp = pcall(function()
        return Players.LocalPlayer
    end)
    if ok then
        return lp
    end
    return nil
end

-- =========================================================
--  СБОР СОСТОЯНИЯ МОДУЛЕЙ
--  Модули вызывают Pixels.SetFeatures({...}) — список включённых
-- =========================================================
local function collectFeatures()
    local list = {}
    for name, enabled in pairs(Pixels.features) do
        if enabled then
            table.insert(list, name)
        end
    end
    table.sort(list)
    return list
end

-- =========================================================
--  HEARTBEAT
-- =========================================================
local function heartbeat()
    local endpoint = url("/api/heartbeat")
    if not endpoint then
        return
    end

    local lp = getLocalPlayer()
    if not lp then
        return
    end

    Pixels.userid = lp.UserId
    Pixels.username = lp.Name
    Pixels.displayname = lp.DisplayName

    local payload = {
        userid = lp.UserId,
        username = lp.Name,
        displayname = lp.DisplayName,
        game = game.PlaceId,
        features = collectFeatures(),
    }

    pcall(function()
        local body = HttpService:JSONEncode(payload)
        local response = HttpService:RequestAsync({
            Url = endpoint,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json",
                ["X-Pixels-Token"] = TOKEN,
            },
            Body = body,
        })
        if response.StatusCode and response.StatusCode >= 200 and response.StatusCode < 300 then
            Pixels.connected = true
            Pixels.online = true
            Pixels.lastError = nil
        end
    end)
end

-- отправка не чаще, чем раз в HEARTBEAT_INTERVAL
local function scheduleHeartbeat()
    if pendingSend then
        return
    end
    pendingSend = true
    task.spawn(function()
        heartbeat()
        task.wait(HEARTBEAT_INTERVAL)
        pendingSend = false
        scheduleHeartbeat()
    end)
end

-- мгновенный отчёт при включении/выключении модуля
local function scheduleImmediate()
    if changeTimer then
        changeTimer:Disconnect()
    end
    changeTimer = task.delay(FEATURE_CHANGE_DEBOUNCE, function()
        heartbeat()
    end)
end

-- =========================================================
--  ПУБЛИЧНЫЙ API ДЛЯ МОДУЛЕЙ
-- =========================================================
--- Задать список включённых модулей/визуалов
--- @param features { [string]: boolean }
function Pixels.SetFeatures(features: { [string]: boolean })
    Pixels.features = features or {}
    scheduleImmediate()
end

--- Включить один модуль
function Pixels.Enable(name: string)
    Pixels.features[name] = true
    scheduleImmediate()
end

--- Выключить один модуль
function Pixels.Disable(name: string)
    Pixels.features[name] = nil
    scheduleImmediate()
end

--- Проверить, включён ли модуль
function Pixels.IsEnabled(name: string): boolean
    return Pixels.features[name] == true
end

--- Получить список включённых
function Pixels.GetFeatures(): { string }
    return collectFeatures()
end

--- Запустить телеметрию (вызывается автоматически)
function Pixels.Start()
    if started then
        return
    end
    started = true

    local lp = getLocalPlayer()
    if lp then
        Pixels.userid = lp.UserId
        Pixels.username = lp.Name
        Pixels.displayname = lp.DisplayName
    else
        Players.PlayerAdded:Connect(function(plr)
            Pixels.userid = plr.UserId
            Pixels.username = plr.Name
            Pixels.displayname = plr.DisplayName
        end)
    end

    scheduleHeartbeat()
    log("started")
end

-- Экспорт в общее окружение, чтобы модули клиента его видели
if getgenv then
    getgenv().Pixels = Pixels
end
rawset(_G, "Pixels", Pixels)

Pixels.Start()

return Pixels
