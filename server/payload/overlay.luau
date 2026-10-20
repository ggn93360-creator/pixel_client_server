--!strict
--[[
	============================================================
	 Pixels Client — Online Players Overlay
	 Показывает, кто сейчас играет с этим скриптом,
	 и какие модули у каждого включены.

	 Сервер подставляет __API__ (адрес бэкенда).
	 Открывается/закрывается клавишей End.
	============================================================
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")

local API = "__API__"
local REFRESH_SECONDS = 10
local TOGGLE_KEY = Enum.KeyCode.End
local WIDTH = 320
local ROW_HEIGHT = 46

-- =========================================================
--  ЦВЕТА (тема Dark Purple — как в клиенте)
-- =========================================================
local C = {
	bg = Color3.fromRGB(18, 16, 26),
	bgSoft = Color3.fromRGB(26, 23, 38),
	row = Color3.fromRGB(31, 28, 45),
	border = Color3.fromRGB(58, 52, 84),
	accent = Color3.fromRGB(160, 120, 255),
	accentSoft = Color3.fromRGB(120, 90, 200),
	pink = Color3.fromRGB(244, 114, 182),
	text = Color3.fromRGB(240, 238, 250),
	muted = Color3.fromRGB(150, 145, 175),
	green = Color3.fromRGB(80, 220, 140),
}

-- =========================================================
--  СОСТОЯНИЕ
-- =========================================================
local state = {
	open = false,
	users = {},
	built = false,
	gui = nil,
	rows = {},
	frame = nil,
	list = nil,
	countLabel = nil,
	updatedLabel = nil,
	busy = false,
}

-- =========================================================
--  СЕТЬ
-- =========================================================
local function fetchList(): { any }
	if API == "" then
		warn("[Pixels] сервер не настроен (API пуст)")
		return {}
	end

	local ok, result = pcall(function()
		local response = HttpService:RequestAsync({
			Url = API .. "/api/list",
			Method = "GET",
			Headers = { ["X-Pixels-Token"] = "" },
		})
		if response.StatusCode ~= 200 then
			error("HTTP " .. tostring(response.StatusCode))
		end
		return HttpService:JSONDecode(response.Body)
	end)

	if not ok then
		warn("[Pixels] не удалось получить список:", result)
		return {}
	end

	if type(result) ~= "table" or type(result.users) ~= "table" then
		return {}
	end
	return result.users
end

-- =========================================================
--  ХЕЛПЕРЫ UI
-- =========================================================
local function make(class: string, props: { [string]: any }): Instance
	local inst = Instance.new(class)
	for k, v in pairs(props) do
		(inst :: any)[k] = v
	end
	return inst
end

local function corner(parent: Instance, radius: number)
	make("UICorner", { CornerRadius = UDim.new(0, radius), Parent = parent })
end

local function stroke(parent: Instance, color: Color3, transparency: number, thickness: number)
	make("UIStroke", {
		Color = color,
		Transparency = transparency,
		Thickness = thickness,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
		Parent = parent,
	})
end

local function addText(parent: Instance, text: string, size: number, color: Color3, bold: boolean, align: TextXAlignment): TextLabel
	local lbl = make("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 1, 0),
		Position = UDim2.new(0, 0, 0, 0),
		Font = bold and Enum.Font.GothamBold or Enum.Font.Gotham,
		Text = text,
		TextSize = size,
		TextColor3 = color,
		TextXAlignment = align,
		TextYAlignment = Enum.TextYAlignment.Center,
		TextTruncate = Enum.TextTruncate.AtEnd,
		Parent = parent,
	})
	return lbl
end

-- =========================================================
--  ПОСТРОЕНИЕ GUI
-- =========================================================
local function build()
	if state.built then
		return
	end

	local gui = make("ScreenGui", {
		Name = "PixelsOnlineOverlay",
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		DisplayOrder = 100,
		Parent = game:GetService("CoreGui"),
	})
	state.gui = gui

	local frame = make("Frame", {
		Name = "Root",
		Size = UDim2.new(0, WIDTH, 0, 380),
		Position = UDim2.new(0, 24, 0, 120),
		BackgroundColor3 = C.bg,
		BorderSizePixel = 0,
		ClipsDescendants = true,
		Parent = gui,
	})
	corner(frame, 14)
	stroke(frame, C.border, 0.25, 1)
	state.frame = frame

	-- затемнение снизу
	make("UIGradient", {
		Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, C.accentSoft),
			ColorSequenceKeypoint.new(1, C.pink),
		}),
		Rotation = 0,
		Size = UDim2.new(1, 0, 0, 3),
		Position = UDim2.new(0, 0, 0, 0),
		Parent = frame,
	})

	-- ---------- шапка ----------
	local header = make("Frame", {
		Size = UDim2.new(1, 0, 0, 48),
		BackgroundColor3 = C.bgSoft,
		BorderSizePixel = 0,
		Parent = frame,
	})
	make("UIGradient", {
		Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, C.accentSoft),
			ColorSequenceKeypoint.new(1, C.pink),
		}),
		Rotation = 0,
		Size = UDim2.new(1, 0, 0, 2),
		Position = UDim2.new(0, 0, 0, 46),
		Parent = header,
	})

	local title = addText(header, "PIXELS  ·  ONLINE", 15, C.text, true, Enum.TextXAlignment.Left)
	title.Position = UDim2.new(0, 14, 0, 6)
	title.Size = UDim2.new(1, -110, 0, 20)

	local hint = addText(header, "кто играет сейчас", 10, C.muted, false, Enum.TextXAlignment.Left)
	hint.Position = UDim2.new(0, 14, 0, 26)
	hint.Size = UDim2.new(1, -110, 0, 14)

	local count = make("TextLabel", {
		BackgroundColor3 = C.accentSoft,
		BorderSizePixel = 0,
		Size = UDim2.new(0, 46, 0, 24),
		Position = UDim2.new(1, -60, 0, 12),
		Font = Enum.Font.GothamBold,
		Text = "0",
		TextSize = 13,
		TextColor3 = C.text,
		Parent = header,
	})
	corner(count, 12)
	state.countLabel = count

	-- ---------- список ----------
	local list = make("ScrollingFrame", {
		Name = "List",
		Size = UDim2.new(1, -16, 1, -78),
		Position = UDim2.new(0, 8, 0, 52),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 3,
		ScrollBarImageColor3 = C.accent,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		Parent = frame,
	})
	make("UIListLayout", {
		SortOrder = Enum.SortOrder.LayoutOrder,
		Padding = UDim.new(0, 6),
		Parent = list,
	})
	state.list = list

	-- ---------- подвал ----------
	local footer = make("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, -16, 0, 22),
		Position = UDim2.new(0, 8, 1, -26),
		Font = Enum.Font.Gotham,
		Text = "",
		TextSize = 10,
		TextColor3 = C.muted,
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = frame,
	})
	state.updatedLabel = footer

	-- ---------- перетаскивание ----------
	local dragging, dragInput, dragStart, startPos

	header.InputBegan:Connect(function(input: InputObject)
		if input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch then
			dragging = true
			dragStart = input.Position
			startPos = frame.Position
			dragInput = input
			input.Grabbed = true
		end
	end)

	header.InputChanged:Connect(function(input: InputObject)
		if input == dragInput and dragging then
			local delta = input.Position - dragStart
			frame.Position = UDim2.new(
				startPos.X.Offset + delta.X,
				startPos.Y.Offset + delta.Y
			)
		end
	end)

	UserInputService.InputEnded:Connect(function(input: InputObject)
		if input == dragInput then
			dragging = false
		end
	end)

	-- ---------- клавиша ----------
	UserInputService.InputBegan:Connect(function(input: InputObject, gpe: GameProcessedEvent)
		if gpe then
			return
		end
		if input.KeyCode == TOGGLE_KEY then
			toggle()
		end
	end)

	state.built = true
end

-- =========================================================
--  ОТРИСОВКА СПИСКА
-- =========================================================
local function clearRows()
	for _, row in pairs(state.rows) do
		row:Destroy()
	end
	table.clear(state.rows)
end

local function renderRow(user: any, order: number)
	local row = make("Frame", {
		Size = UDim2.new(1, -6, 0, ROW_HEIGHT),
		BackgroundColor3 = C.row,
		BorderSizePixel = 0,
		LayoutOrder = order,
		Parent = state.list,
	})
	corner(row, 10)

	-- аватар
	local initial = string.sub(string.upper(user.displayname or user.username or "?"), 1, 1)
	local avatar = make("TextLabel", {
		Size = UDim2.new(0, 32, 0, 32),
		Position = UDim2.new(0, 8, 0.5, -16),
		BackgroundColor3 = C.accentSoft,
		BorderSizePixel = 0,
		Font = Enum.Font.GothamBold,
		Text = initial,
		TextSize = 14,
		TextColor3 = C.text,
		Parent = row,
	})
	corner(avatar, 16)

	-- имя
	local name = addText(row, user.displayname or user.username or "?", 13, C.text, true, Enum.TextXAlignment.Left)
	name.Position = UDim2.new(0, 48, 0, 6)
	name.Size = UDim2.new(1, -130, 0, 18)

	local sub = addText(row, "@" .. tostring(user.username or "?"), 10.5, C.muted, false, Enum.TextXAlignment.Left)
	sub.Position = UDim2.new(0, 48, 0, 23)
	sub.Size = UDim2.new(1, -130, 0, 14)

	-- индикатор онлайн
	local dot = make("Frame", {
		Size = UDim2.new(0, 7, 0, 7),
		Position = UDim2.new(1, -14, 0.5, -3.5),
		BackgroundColor3 = C.green,
		BorderSizePixel = 0,
		Parent = row,
	})
	corner(dot, 4)

	-- модули
	local feats = user.features
	if type(feats) == "table" and #feats > 0 then
		local shown = {}
		for i = 1, math.min(#feats, 2) do
			table.insert(shown, tostring(feats[i]))
		end
		local label = addText(
			row,
			table.concat(shown, "  ") .. (#feats > 2 and ("  +" .. tostring(#feats - 2)) or ""),
			10,
			C.pink,
			true,
			Enum.TextXAlignment.Right
		)
		label.Position = UDim2.new(0, 48, 0, 33)
		label.Size = UDim2.new(1, -62, 0, 12)
	end

	table.insert(state.rows, row)
	return row
end

local function render()
	local users = state.users
	state.countLabel.Text = tostring(#users)

	clearRows()
	for i, user in ipairs(users) do
		renderRow(user, i)
	end

	if #users == 0 then
		local empty = make("TextLabel", {
			BackgroundTransparency = 1,
			Size = UDim2.new(1, -6, 0, 60),
			Font = Enum.Font.Gotham,
			Text = "Никого нет — стань первым",
			TextSize = 12,
			TextColor3 = C.muted,
			Parent = state.list,
		})
		table.insert(state.rows, empty)
	end

	state.updatedLabel.Text = "обновлено " .. os.date("%H:%M:%S") .. "  ·  каждые " .. REFRESH_SECONDS .. " с"
end

-- =========================================================
--  ОБНОВЛЕНИЕ
-- =========================================================
local function refresh()
	if state.busy then
		return
	end
	state.busy = true

	-- получаем в отдельном потоке, чтобы не блокировать рендер
	task.spawn(function()
		local users = fetchList()
		state.users = users
		if state.built then
			render()
		end
		state.busy = false
	end)
end

-- =========================================================
--  ПОКАЗАТЬ / СКРЫТЬ
-- =========================================================
local function setOpen(open: boolean)
	state.open = open
	if not state.built then
		build()
	end
	if not state.frame then
		return
	end

	if open then
		state.frame.Visible = true
		state.frame.BackgroundTransparency = 1
		TweenService:Create(
			state.frame,
			TweenInfo.new(0.22, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
			{ BackgroundTransparency = 0 }
		):Play()
		refresh()
	else
		TweenService:Create(
			state.frame,
			TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ BackgroundTransparency = 1 }
		):Play()
		task.delay(0.18, function()
			if not state.open and state.frame then
				state.frame.Visible = false
			end
		end)
	end
end

function toggle()
	setOpen(not state.open)
end

-- =========================================================
--  СТАРТ
-- =========================================================
build()
setOpen(true)

-- автообновление
task.spawn(function()
	while true do
		task.wait(REFRESH_SECONDS)
		if state.open and not state.busy then
			refresh()
		end
	end
end)

-- Экспорт
getgenv().PixelsOnline = {
	Toggle = toggle,
	Refresh = refresh,
	GetUsers = function()
		return state.users
	end,
}
