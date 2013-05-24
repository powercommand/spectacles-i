/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *           Copyright (c) 2013 Power-Command
***/

RequireScript("TargetMenu.js");

// MoveMenu() constructor
// Creates an object representing a move-choosing menu.
// Arguments:
//     battle: The Battle during which the menu will be shown.
//     unit:   The BattleUnit this menu belongs to.
function MoveMenu(battle, unit)
{
	this.lockedCursorColor = CreateColor(0, 36, 72, 255);
	this.normalCursorColor = CreateColor(0, 72, 144, 255);
	
	this.battle = battle;
	this.drawers = null;
	this.expansion = 0.0;
	this.fadeness = 0.0;
	this.font = GetSystemFont();
	this.healthyColor
	this.isExpanded = false;
	this.moveCursor = 0;
	this.moveCursorColor = CreateColor(0, 0, 0, 0);
	this.moveList = null;
	this.selection = null;
	this.topCursor = 0;
	this.topCursorColor = CreateColor(0, 0, 0, 0);
	this.unit = unit;
	
	this.chooseMove = new Scenario()
		.fork()
			.tween(this.moveCursorColor, 0.125, 'easeInOutSine', this.lockedCursorColor)
		.end()
		.fork()
			.tween(this, 0.25, 'easeInBack', { expansion: 0.0 })
		.end()
		.tween(this, 0.25, 'easeInBack', { fadeness: 0.0 });
	this.hideMoveList = new Scenario()
		.fork()
			.tween(this.moveCursorColor, 0.25, 'linear', CreateColor(0, 0, 0, 0))
		.end()
		.fork()
			.tween(this.topCursorColor, 0.25, 'easeInOutSine', this.normalCursorColor)
		.end()
		.tween(this, 0.25, 'easeInBack', { expansion: 0.0 });
	this.showMenu = new Scenario()
		.fork()	
			.tween(this.topCursorColor, 0.25, 'easeOutQuad', CreateColor(192, 192, 192, 255))
			.tween(this.topCursorColor, 0.25, 'easeOutQuad', this.normalCursorColor)
		.end()
		.tween(this, 0.5, 'easeOutBounce', { fadeness: 1.0 });
	this.showMoveList = new Scenario()
		.fork()
			.tween(this.topCursorColor, 0.25, 'easeInOutSine', this.lockedCursorColor)
		.end()
		.fork()
			.tween(this.moveCursorColor, 0.25, 'linear', this.normalCursorColor)
		.end()
		.tween(this, 0.25, 'easeOutExpo', { expansion: 1.0 });
	
	this.drawCursor = function(x, y, width, height, cursorColor, isLockedIn, isEnabled) {
		isEnabled = isEnabled !== void null ? isEnabled : null;
		
		var color;
		var color2;
		color = isEnabled ? cursorColor : CreateColor(64, 64, 64, cursorColor.alpha);
		color2 = BlendColors(color, CreateColor(0, 0, 0, color.alpha));
		if (isLockedIn) {
			var mainColor = color;
			color = color2;
			color2 = mainColor;
		}
		var halfHeight = Math.round((height - 2) / 2);
		GradientRectangle(x + 1, y + 1, width - 2, halfHeight, color2, color2, color, color);
		GradientRectangle(x + 1, y + 1 + halfHeight, width - 2, height - 2 - halfHeight, color, color, color2, color2);
		OutlinedRectangle(x, y, width, height, CreateColor(0, 0, 0, cursorColor.alpha));
	};
	this.drawItemBox = function(x, y, width, height, alpha, isSelected, isLockedIn, cursorColor, isEnabled) {
		isEnabled = isEnabled !== void null ? isEnabled : true;
		
		Rectangle(x, y, width, height, CreateColor(0, 0, 0, alpha));
		OutlinedRectangle(x, y, width, height, CreateColor(0, 0, 0, 32));
		if (isSelected) {
			this.drawCursor(x, y, width, height, cursorColor, isLockedIn, isEnabled);
		}
	};
	this.drawMoveItem = function(x, y, item, isSelected, isLockedIn) {
		var alpha = 255 * this.fadeness * this.expansion;
		var isEnabled = item.isUsable();
		var textColor = isSelected ?
			BlendColorsWeighted(CreateColor(255, 255, 255, alpha), CreateColor(128, 128, 128, alpha), this.moveCursorColor.alpha, 255 - this.moveCursorColor.alpha) :
			CreateColor(128, 128, 128, alpha);
		textColor = isEnabled ? textColor : BlendColorsWeighted(textColor, CreateColor(0, 0, 0, textColor.alpha), 0.25, 0.75);
		var titleColor = isSelected ?
			BlendColorsWeighted(CreateColor(255, 192, 0, alpha), CreateColor(128, 96, 0, alpha), this.moveCursorColor.alpha, 255 - this.moveCursorColor.alpha) :
			CreateColor(128, 96, 0, alpha);
		titleColor = isEnabled ? titleColor : BlendColorsWeighted(titleColor, CreateColor(0, 0, 0, titleColor.alpha), 0.25, 0.75);
		this.drawItemBox(x, y, 160, 18, alpha * 128 / 255, isSelected, isLockedIn, this.moveCursorColor, isEnabled);
		Rectangle(x + 4, y + 2, 13, 13, CreateColor(128, 128, 128, alpha));
		OutlinedRectangle(x + 4, y + 2, 13, 13, CreateColor(0, 0, 0, alpha * 0.5));
		//this.drawText(this.font, x + 7, y + 2, 1, textColor, skill.technique.actions[0].rank);
		this.drawText(this.font, x + 22, y + 3, 1, textColor, item.name);
		this.drawText(this.font, x + 142, y + 3, 1, titleColor, "R");
		//this.drawText(this.font, x + 156, y + 1, 1, textColor, skill.technique.actions[0].rank, 'right');
	};
	this.drawTopItem = function(x, y, width, item, isSelected) {
		var isEnabled = item.contents.length > 0;
		this.drawItemBox(x, y, width, 18, 160 * this.fadeness, isSelected, this.isExpanded, this.topCursorColor, isEnabled);
		var textColor = isSelected ? CreateColor(255, 255, 255, 255 * this.fadeness) : CreateColor(128, 128, 128, 255 * this.fadeness);
		textColor = isEnabled ? textColor : BlendColorsWeighted(textColor, CreateColor(0, 0, 0, textColor.alpha), 0.25, 0.75);
		this.drawText(this.font, x + width / 2, y + 3, 1, textColor, item.name, 'center');
	};
	this.drawText = function(font, x, y, shadowDistance, color, text, alignment) {
		var aligners = {
			left: function(font, x, text) { return x; },
			center: function(font, x, text) { return x - font.getStringWidth(text) / 2; },
			right: function(font, x, text) { return x - font.getStringWidth(text); }
		};
		
		alignment = alignment !== void null ? alignment : 'left';
		
		if (!(alignment in aligners)) {
			Abort("MoveMenu.drawText(): Invalid text alignment '" + alignment + "'.");
		}
		x = aligners[alignment](font, x, text);
		font.setColorMask(CreateColor(0, 0, 0, color.alpha));
		font.drawText(x + shadowDistance, y + shadowDistance, text);
		font.setColorMask(color);
		font.drawText(x, y, text);
	};
}

// .getInput() method
// Checks for player input and updates the state accordingly.
MoveMenu.prototype.getInput = function()
{
	var key = AreKeysLeft() ? GetKey() : null;
	while (AreKeysLeft()) { GetKey(); }
	if (this.showMenu.isRunning()) {
		return;
	}
	if (key == GetPlayerKey(PLAYER_1, PLAYER_KEY_A)) {
		if (!this.isExpanded && this.drawers[this.topCursor].contents.length > 0) {
			this.moveList = this.drawers[this.topCursor].contents;
			this.isExpanded = true;
			this.hideMoveList.stop();
			this.showMoveList.run();
		} else if (this.isExpanded && this.moveList[this.moveCursor].isUsable()) {
			this.selection = this.moveList[this.moveCursor];
			this.showMoveList.stop();
			this.chooseMove.run();
		}
	} else if (key == GetPlayerKey(PLAYER_1, PLAYER_KEY_B)) {
		this.isExpanded = false;
		this.showMoveList.stop();
		this.hideMoveList.run();
	} else if (!this.isExpanded && key == GetPlayerKey(PLAYER_1, PLAYER_KEY_LEFT)) {
		--this.topCursor;
		if (this.topCursor < 0) {
			this.topCursor = this.drawers.length - 1;
		}
	} else if (!this.isExpanded && key == GetPlayerKey(PLAYER_1, PLAYER_KEY_RIGHT)) {
		++this.topCursor;
		if (this.topCursor >= this.drawers.length) {
			this.topCursor = 0;
		}
	} else if (this.isExpanded && key == GetPlayerKey(PLAYER_1, PLAYER_KEY_UP)) {
		this.moveCursor = this.moveCursor - 1 < 0 ? this.moveList.length - 1 : this.moveCursor - 1;
	} else if (this.isExpanded && key == GetPlayerKey(PLAYER_1, PLAYER_KEY_DOWN)) {
		this.moveCursor = (this.moveCursor + 1) % this.moveList.length;
	}
};

// .open() method
// Opens the menu to allow the player to choose an action.
MoveMenu.prototype.open = function()
{
	this.drawers = [
		{ name: "Skill", contents: this.unit.skills },
		{ name: "Item", contents: this.unit.items },
		{ name: "Defend", contents: [] }
	];
	this.expansion = 0.0;
	this.isExpanded = false;
	this.selection = null;
	this.battle.suspend();
	this.battle.ui.hud.highlight(this.unit.name);
	this.showMenu.run();
	Threads.waitFor(Threads.createEntityThread(this, 10));
	this.battle.ui.hud.highlight(null);
	this.battle.resume();
	return {
		usable: this.selection,
		targets: [ this.battle.enemiesOf(this.unit)[0] ]
	};
};

// .render() method
// Renders the menu in its current state.
MoveMenu.prototype.render = function()
{
	var yOrigin = -34 * (1.0 - this.fadeness) + 16;
	var itemWidth = 160 / this.drawers.length;
	var litTextColor = CreateColor(255, 255, 255, 255);
	var dimTextColor = CreateColor(192, 192, 192, 255);
	Rectangle(0, 16, 160, yOrigin - 16, CreateColor(0, 0, 0, 128 * this.fadeness));
	for (var i = 0; i < this.drawers.length; ++i) {
		var x = Math.floor(i * itemWidth);
		var width = Math.floor((i + 1) * itemWidth) - x;
		this.drawTopItem(x, yOrigin, width, this.drawers[i], i == this.topCursor);
	}
	if (this.expansion > 0.0) {
		SetClippingRectangle(0, yOrigin + 18, 160, GetScreenHeight() - (yOrigin + 18));
		var height = this.moveList.length * 18;
		var y = yOrigin + 18 - height * (1.0 - this.expansion);
		Rectangle(0, 34, 160, y - 34, CreateColor(0, 0, 0, 96 * this.expansion * this.fadeness)); 
		for (var i = 0; i < this.moveList.length; ++i) {
			var itemY = y + i * 18;
			this.drawMoveItem(0, itemY, this.moveList[i], i == this.moveCursor, this.chooseMove.isRunning());
		}
		SetClippingRectangle(0, 0, GetScreenWidth(), GetScreenHeight())
	}
};

// .update() method
// Updates the entity's state for the next frame.
MoveMenu.prototype.update = function()
{
	return this.selection === null || this.chooseMove.isRunning();
};
