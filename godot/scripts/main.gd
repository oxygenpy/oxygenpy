extends Node2D

const ROOM := Rect2(48.0, 170.0, 864.0, 450.0)
const ATTACK_RANGE := 470.0
const ROLE_NAMES := ["青霄剑修", "天雷符师", "丹霞药师"]
const SKILL_NAMES := ["剑影追星", "引雷符", "丹华护体"]
const SKILL_COOLDOWNS := [7.0, 8.0, 10.0]

var rng := RandomNumberGenerator.new()
var phase := "combat"
var level := 1
var wave_index := 0
var waves_total := 2
var wave_wait := 0.0
var role_index := 0
var player_position := Vector2(480.0, 395.0)
var last_move := Vector2.RIGHT
var player_hp := 100
var player_max_hp := 100
var player_damage := 12
var spirit_stones := 0
var attack_timer := 0.0
var skill_timer := 0.0
var dodge_cooldown := 0.0
var invulnerability_timer := 0.0
var dash_timer := 0.0
var dash_direction := Vector2.RIGHT
var enemies: Array[Dictionary] = []
var projectiles: Array[Dictionary] = []
var effects: Array[Dictionary] = []

var hud_layer: CanvasLayer
var status_label: Label
var hint_label: Label
var role_picker: OptionButton
var skill_button: Button
var dodge_button: Button
var attack_upgrade_button: Button
var health_upgrade_button: Button
var next_level_button: Button
var restart_button: Button


func _ready() -> void:
	rng.randomize()
	_build_hud()
	_start_run()


func _process(delta: float) -> void:
	_update_effects(delta)
	if phase == "combat":
		_update_combat(delta)
	_refresh_hud()
	queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	var key_event := event as InputEventKey
	if key_event == null or not key_event.pressed or key_event.echo:
		return
	if key_event.keycode == KEY_E:
		_cast_skill()
	elif key_event.keycode == KEY_SHIFT:
		_try_dodge()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, Vector2(960.0, 640.0)), Color(0.035, 0.055, 0.065))
	draw_rect(ROOM, Color(0.075, 0.11, 0.12))
	draw_rect(ROOM, Color(0.35, 0.49, 0.39), false, 3.0)
	for grid_x in range(18):
		var x := ROOM.position.x + 24.0 + float(grid_x) * 48.0
		draw_line(Vector2(x, ROOM.position.y), Vector2(x, ROOM.end.y), Color(0.12, 0.16, 0.15), 1.0)
	for grid_y in range(9):
		var y := ROOM.position.y + 24.0 + float(grid_y) * 48.0
		draw_line(Vector2(ROOM.position.x, y), Vector2(ROOM.end.x, y), Color(0.12, 0.16, 0.15), 1.0)

	var target_index := _nearest_enemy(ATTACK_RANGE)
	if target_index >= 0:
		var target_position: Vector2 = enemies[target_index]["position"]
		draw_line(player_position, target_position, Color(0.3, 0.85, 0.83, 0.45), 2.0)
		draw_arc(target_position, 20.0, 0.0, TAU, 20, Color(0.65, 0.95, 0.64), 2.0)

	for enemy in enemies:
		var enemy_position: Vector2 = enemy["position"]
		var enemy_color := Color(0.84, 0.42, 0.28)
		if enemy["kind"] == "ranged":
			enemy_color = Color(0.76, 0.56, 0.91)
		draw_rect(Rect2(enemy_position - Vector2(10.0, 10.0), Vector2(20.0, 20.0)), enemy_color)
		draw_rect(Rect2(enemy_position - Vector2(10.0, 16.0), Vector2(20.0, 3.0)), Color(0.18, 0.14, 0.15))
		var health_ratio := clampf(float(enemy["hp"]) / float(enemy["max_hp"]), 0.0, 1.0)
		draw_rect(Rect2(enemy_position - Vector2(10.0, 16.0), Vector2(20.0 * health_ratio, 3.0)), Color(0.93, 0.35, 0.29))

	for projectile in projectiles:
		var projectile_position: Vector2 = projectile["position"]
		var projectile_color := Color(0.48, 0.91, 0.87)
		if projectile["is_enemy"]:
			projectile_color = Color(1.0, 0.56, 0.35)
		draw_rect(Rect2(projectile_position - Vector2(4.0, 4.0), Vector2(8.0, 8.0)), projectile_color)

	for effect in effects:
		var duration: float = effect["duration"]
		var remaining: float = effect["time"]
		var progress := 1.0 - remaining / duration
		var radius: float = effect["radius"] * (0.45 + progress * 0.65)
		var color: Color = effect["color"]
		color.a = clampf(remaining / duration, 0.0, 1.0)
		draw_arc(effect["position"], radius, 0.0, TAU, 28, color, 3.0)
		if effect["kind"] == "lightning":
			draw_line(effect["position"] + Vector2(-14.0, -26.0), effect["position"] + Vector2(8.0, 0.0), color, 4.0)
			draw_line(effect["position"] + Vector2(8.0, 0.0), effect["position"] + Vector2(-7.0, 26.0), color, 4.0)

	var player_color := Color(0.35, 0.82, 0.78)
	if invulnerability_timer > 0.0 and int(Time.get_ticks_msec() / 70) % 2 == 0:
		player_color = Color(0.9, 0.95, 0.76)
	draw_rect(Rect2(player_position - Vector2(9.0, 12.0), Vector2(18.0, 24.0)), player_color)
	draw_rect(Rect2(player_position - Vector2(6.0, 16.0), Vector2(12.0, 8.0)), Color(0.91, 0.76, 0.48))
	draw_rect(Rect2(player_position + Vector2(-3.0, -3.0), Vector2(6.0, 4.0)), Color(0.12, 0.24, 0.25))


func _build_hud() -> void:
	hud_layer = CanvasLayer.new()
	add_child(hud_layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_PASS
	hud_layer.add_child(root)

	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	panel.offset_left = 12.0
	panel.offset_top = 8.0
	panel.offset_right = -12.0
	panel.offset_bottom = 158.0
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.055, 0.085, 0.09, 0.96)
	panel_style.border_color = Color(0.24, 0.38, 0.34)
	panel_style.set_border_width_all(2)
	panel_style.set_corner_radius_all(8)
	panel.add_theme_stylebox_override("panel", panel_style)
	root.add_child(panel)

	var layout := VBoxContainer.new()
	layout.add_theme_constant_override("separation", 4)
	panel.add_child(layout)
	var title := Label.new()
	title.text = "靈墟 · 一念成仙　　移動：WASD / 方向鍵　自動鎖敵施法"
	title.add_theme_color_override("font_color", Color(0.91, 0.83, 0.61))
	title.add_theme_font_size_override("font_size", 18)
	layout.add_child(title)
	status_label = Label.new()
	status_label.add_theme_color_override("font_color", Color(0.83, 0.9, 0.83))
	layout.add_child(status_label)
	hint_label = Label.new()
	hint_label.add_theme_color_override("font_color", Color(0.66, 0.79, 0.74))
	layout.add_child(hint_label)

	var controls := HBoxContainer.new()
	controls.add_theme_constant_override("separation", 8)
	layout.add_child(controls)
	role_picker = OptionButton.new()
	for role_name in ROLE_NAMES:
		role_picker.add_item(role_name)
	role_picker.item_selected.connect(_on_role_selected)
	controls.add_child(role_picker)

	skill_button = _make_button("施展神通 [E]", _cast_skill)
	skill_button.custom_minimum_size.x = 178.0
	controls.add_child(skill_button)
	dodge_button = _make_button("身法閃避 [Shift]", _try_dodge)
	dodge_button.custom_minimum_size.x = 160.0
	controls.add_child(dodge_button)

	var reward_controls := HBoxContainer.new()
	reward_controls.add_theme_constant_override("separation", 8)
	layout.add_child(reward_controls)
	attack_upgrade_button = _make_button("淬鍊法器 · 12 靈石", _buy_attack_upgrade)
	health_upgrade_button = _make_button("靈氣護體 · 10 靈石", _buy_health_upgrade)
	next_level_button = _make_button("進入下一間", _go_to_next_level)
	restart_button = _make_button("重新開始", _start_run)
	reward_controls.add_child(attack_upgrade_button)
	reward_controls.add_child(health_upgrade_button)
	reward_controls.add_child(next_level_button)
	reward_controls.add_child(restart_button)


func _make_button(text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 30.0
	button.pressed.connect(action)
	return button


func _start_run() -> void:
	level = 1
	spirit_stones = 0
	player_max_hp = 100
	player_hp = player_max_hp
	player_damage = 12
	role_index = 0
	if role_picker != null:
		role_picker.select(role_index)
	_start_level()


func _start_level() -> void:
	phase = "combat"
	player_position = ROOM.get_center() + Vector2(0.0, 55.0)
	enemies.clear()
	projectiles.clear()
	wave_index = 0
	waves_total = 2 + int((level - 1) / 2)
	wave_wait = 0.0
	skill_timer = 0.0
	dodge_cooldown = 0.0
	invulnerability_timer = 0.0
	dash_timer = 0.0
	_spawn_next_wave()
	_refresh_hud()


func _spawn_next_wave() -> void:
	wave_index += 1
	var enemy_count := 2 + level + wave_index
	for index in range(enemy_count):
		var edge := rng.randi_range(0, 3)
		var spawn_position := Vector2.ZERO
		match edge:
			0:
				spawn_position = Vector2(rng.randf_range(ROOM.position.x + 24.0, ROOM.end.x - 24.0), ROOM.position.y + 24.0)
			1:
				spawn_position = Vector2(rng.randf_range(ROOM.position.x + 24.0, ROOM.end.x - 24.0), ROOM.end.y - 24.0)
			2:
				spawn_position = Vector2(ROOM.position.x + 24.0, rng.randf_range(ROOM.position.y + 24.0, ROOM.end.y - 24.0))
			_:
				spawn_position = Vector2(ROOM.end.x - 24.0, rng.randf_range(ROOM.position.y + 24.0, ROOM.end.y - 24.0))
		var ranged := level >= 2 and index % 3 == 2
		var max_hp := 22 + level * 5
		enemies.append({
			"position": spawn_position,
			"hp": max_hp,
			"max_hp": max_hp,
			"speed": 42.0 + minf(float(level), 8.0) * 2.5,
			"kind": "ranged" if ranged else "melee",
			"attack_cd": rng.randf_range(0.4, 1.2),
		})
	hint_label.text = "第 %d 波妖物來襲！靠近後自動鎖敵攻擊，E 施展神通。" % wave_index


func _update_combat(delta: float) -> void:
	skill_timer = maxf(0.0, skill_timer - delta)
	dodge_cooldown = maxf(0.0, dodge_cooldown - delta)
	invulnerability_timer = maxf(0.0, invulnerability_timer - delta)
	attack_timer = maxf(0.0, attack_timer - delta)
	dash_timer = maxf(0.0, dash_timer - delta)

	var movement := _movement_input()
	if movement.length() > 0.0:
		last_move = movement
	if dash_timer > 0.0:
		player_position += dash_direction * 570.0 * delta
	else:
		player_position += movement * 205.0 * delta
	player_position.x = clampf(player_position.x, ROOM.position.x + 15.0, ROOM.end.x - 15.0)
	player_position.y = clampf(player_position.y, ROOM.position.y + 18.0, ROOM.end.y - 15.0)

	var target_index := _nearest_enemy(ATTACK_RANGE)
	if target_index >= 0 and attack_timer <= 0.0:
		var target_position: Vector2 = enemies[target_index]["position"]
		var direction := (target_position - player_position).normalized()
		projectiles.append({
			"position": player_position + direction * 16.0,
			"velocity": direction * 480.0,
			"damage": player_damage,
			"is_enemy": false,
			"time": 1.4,
		})
		_add_effect("shot", player_position + direction * 14.0, 15.0, 0.16, Color(0.47, 0.91, 0.84))
		attack_timer = 0.48

	_update_enemies(delta)
	_update_projectiles(delta)
	if phase != "combat":
		return
	if enemies.is_empty():
		if wave_index < waves_total:
			wave_wait += delta
			hint_label.text = "第 %d 波已肃清，下一波妖物即将出现。" % wave_index
			if wave_wait >= 1.15:
				wave_wait = 0.0
				_spawn_next_wave()
		else:
			_finish_level()


func _movement_input() -> Vector2:
	var movement := Vector2.ZERO
	if Input.is_action_pressed("ui_left") or Input.is_key_pressed(KEY_A):
		movement.x -= 1.0
	if Input.is_action_pressed("ui_right") or Input.is_key_pressed(KEY_D):
		movement.x += 1.0
	if Input.is_action_pressed("ui_up") or Input.is_key_pressed(KEY_W):
		movement.y -= 1.0
	if Input.is_action_pressed("ui_down") or Input.is_key_pressed(KEY_S):
		movement.y += 1.0
	return movement.normalized()


func _update_enemies(delta: float) -> void:
	for index in range(enemies.size() - 1, -1, -1):
		var enemy: Dictionary = enemies[index]
		var enemy_position: Vector2 = enemy["position"]
		var offset := player_position - enemy_position
		var distance := offset.length()
		var direction := offset.normalized() if distance > 0.0 else Vector2.UP
		var ranged: bool = enemy["kind"] == "ranged"
		var speed: float = enemy["speed"]

		if ranged:
			if distance > 205.0:
				enemy_position += direction * speed * delta
			elif distance < 130.0:
				enemy_position -= direction * speed * delta
			enemy["attack_cd"] = float(enemy["attack_cd"]) - delta
			if distance < 430.0 and float(enemy["attack_cd"]) <= 0.0:
				projectiles.append({
					"position": enemy_position,
					"velocity": direction * 205.0,
					"damage": 8 + int(level / 2),
					"is_enemy": true,
					"time": 3.0,
				})
				enemy["attack_cd"] = 2.4
		else:
			enemy_position += direction * speed * delta
			enemy["attack_cd"] = float(enemy["attack_cd"]) - delta
			if distance < 25.0 and float(enemy["attack_cd"]) <= 0.0:
				_hurt_player(9 + int(level / 2))
				enemy["attack_cd"] = 1.0

		enemy_position.x = clampf(enemy_position.x, ROOM.position.x + 12.0, ROOM.end.x - 12.0)
		enemy_position.y = clampf(enemy_position.y, ROOM.position.y + 12.0, ROOM.end.y - 12.0)
		enemy["position"] = enemy_position
		enemies[index] = enemy


func _update_projectiles(delta: float) -> void:
	for projectile_index in range(projectiles.size() - 1, -1, -1):
		var projectile: Dictionary = projectiles[projectile_index]
		var position: Vector2 = projectile["position"] + projectile["velocity"] * delta
		var time_left: float = float(projectile["time"]) - delta
		projectile["position"] = position
		projectile["time"] = time_left
		projectiles[projectile_index] = projectile
		if time_left <= 0.0 or not ROOM.grow(40.0).has_point(position):
			projectiles.remove_at(projectile_index)
			continue

		var hit := false
		if projectile["is_enemy"]:
			if position.distance_to(player_position) < 15.0:
				_hurt_player(int(projectile["damage"]))
				hit = true
		else:
			for enemy_index in range(enemies.size() - 1, -1, -1):
				var enemy_position: Vector2 = enemies[enemy_index]["position"]
				if position.distance_to(enemy_position) < 16.0:
					_damage_enemy(enemy_index, int(projectile["damage"]))
					hit = true
					break
		if hit:
			projectiles.remove_at(projectile_index)


func _nearest_enemy(max_distance: float) -> int:
	var nearest_index := -1
	var nearest_distance := max_distance
	for index in range(enemies.size()):
		var distance: float = player_position.distance_to(enemies[index]["position"])
		if distance < nearest_distance:
			nearest_distance = distance
			nearest_index = index
	return nearest_index


func _damage_enemy(index: int, damage: int) -> void:
	if index < 0 or index >= enemies.size():
		return
	var enemy: Dictionary = enemies[index]
	var position: Vector2 = enemy["position"]
	enemy["hp"] = int(enemy["hp"]) - damage
	if int(enemy["hp"]) <= 0:
		enemies.remove_at(index)
		spirit_stones += 2 + int(level * 0.8)
		_add_effect("hit", position, 28.0, 0.28, Color(1.0, 0.71, 0.38))
	else:
		enemies[index] = enemy
		_add_effect("hit", position, 13.0, 0.12, Color(1.0, 0.83, 0.52))


func _hurt_player(damage: int) -> void:
	if invulnerability_timer > 0.0 or phase != "combat":
		return
	player_hp = max(0, player_hp - damage)
	invulnerability_timer = 0.55
	_add_effect("hurt", player_position, 34.0, 0.25, Color(0.95, 0.38, 0.35))
	if player_hp <= 0:
		phase = "game_over"
		hint_label.text = "你在第 %d 關石室力竭，重整修為後可重新開始。" % level


func _cast_skill() -> void:
	if phase != "combat" or skill_timer > 0.0:
		return
	skill_timer = SKILL_COOLDOWNS[role_index]
	var target_index := _nearest_enemy(ATTACK_RANGE)
	var center := player_position
	if target_index >= 0:
		center = enemies[target_index]["position"]

	match role_index:
		0:
			_add_effect("slash", center, 125.0, 0.42, Color(0.57, 0.94, 0.87))
			_damage_in_area(center, 125.0, player_damage * 3, false)
			hint_label.text = "劍影追星：劍氣斬中目標及周圍妖物！"
		1:
			_add_effect("lightning", center, 165.0, 0.62, Color(0.79, 0.66, 1.0))
			_damage_in_area(center, 165.0, player_damage * 2, false)
			hint_label.text = "引雷符：天雷轟擊鎖定區域！"
		2:
			player_hp = mini(player_max_hp, player_hp + 32)
			_add_effect("aura", player_position, 115.0, 0.72, Color(0.77, 0.9, 0.49))
			_damage_in_area(player_position, 115.0, player_damage, true)
			hint_label.text = "丹華護體：療傷並震退近身妖物！"


func _damage_in_area(center: Vector2, radius: float, damage: int, knockback: bool) -> void:
	for index in range(enemies.size() - 1, -1, -1):
		var enemy: Dictionary = enemies[index]
		var enemy_position: Vector2 = enemy["position"]
		if enemy_position.distance_to(center) <= radius:
			if knockback:
				var push_direction := (enemy_position - player_position).normalized()
				if push_direction == Vector2.ZERO:
					push_direction = Vector2.UP
				enemy["position"] = enemy_position + push_direction * 70.0
				enemies[index] = enemy
			_damage_enemy(index, damage)


func _try_dodge() -> void:
	if phase != "combat" or dodge_cooldown > 0.0:
		return
	var movement := _movement_input()
	dash_direction = movement if movement != Vector2.ZERO else last_move
	dash_timer = 0.2
	dodge_cooldown = 1.2
	invulnerability_timer = maxf(invulnerability_timer, 0.35)
	_add_effect("dodge", player_position, 34.0, 0.28, Color(0.48, 0.84, 0.9))


func _finish_level() -> void:
	phase = "reward"
	var reward := 8 + level * 3
	spirit_stones += reward
	hint_label.text = "石室已清，獲得 %d 枚靈石。可消耗靈石強化，再進入下一關。" % reward


func _buy_attack_upgrade() -> void:
	if phase != "reward" or spirit_stones < 12:
		return
	spirit_stones -= 12
	player_damage += 4
	hint_label.text = "法器淬鍊完成：自動攻擊傷害提升 4。"
	_refresh_hud()


func _buy_health_upgrade() -> void:
	if phase != "reward" or spirit_stones < 10:
		return
	spirit_stones -= 10
	player_max_hp += 25
	player_hp = mini(player_max_hp, player_hp + 25)
	hint_label.text = "靈氣護體：最大氣血提升 25，並恢復 25 點。"
	_refresh_hud()


func _go_to_next_level() -> void:
	if phase != "reward":
		return
	level += 1
	_start_level()


func _on_role_selected(index: int) -> void:
	role_index = clampi(index, 0, ROLE_NAMES.size() - 1)
	if phase == "combat":
		hint_label.text = "%s已選定，神通：%s。" % [ROLE_NAMES[role_index], SKILL_NAMES[role_index]]
	_refresh_hud()


func _update_effects(delta: float) -> void:
	for index in range(effects.size() - 1, -1, -1):
		effects[index]["time"] = float(effects[index]["time"]) - delta
		if float(effects[index]["time"]) <= 0.0:
			effects.remove_at(index)


func _add_effect(kind: String, position: Vector2, radius: float, duration: float, color: Color) -> void:
	effects.append({
		"kind": kind,
		"position": position,
		"radius": radius,
		"duration": duration,
		"time": duration,
		"color": color,
	})


func _refresh_hud() -> void:
	if status_label == null:
		return
	var phase_text := "戰鬥中"
	if phase == "reward":
		phase_text = "清關獎勵"
	elif phase == "game_over":
		phase_text = "歷練失敗"
	status_label.text = "第 %d 關 · 波次 %d/%d · %s · 氣血 %d/%d · 靈石 %d · 攻擊 %d" % [
		level, wave_index, waves_total, phase_text, player_hp, player_max_hp, spirit_stones, player_damage
	]
	skill_button.text = "%s [E] · %s" % [
		SKILL_NAMES[role_index],
		"%.1f 秒" % skill_timer if skill_timer > 0.0 else "就緒",
	]
	skill_button.disabled = phase != "combat" or skill_timer > 0.0
	dodge_button.text = "身法閃避 [Shift] · %.1f 秒" % dodge_cooldown if dodge_cooldown > 0.0 else "身法閃避 [Shift]"
	dodge_button.disabled = phase != "combat" or dodge_cooldown > 0.0
	role_picker.disabled = phase != "combat"
	var reward_phase := phase == "reward"
	attack_upgrade_button.visible = reward_phase
	health_upgrade_button.visible = reward_phase
	next_level_button.visible = reward_phase
	attack_upgrade_button.disabled = spirit_stones < 12
	health_upgrade_button.disabled = spirit_stones < 10
	restart_button.visible = phase == "game_over"
	skill_button.visible = phase == "combat"
	dodge_button.visible = phase == "combat"
	if phase == "game_over":
		restart_button.disabled = false
		role_picker.disabled = true
