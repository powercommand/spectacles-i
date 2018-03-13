/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *           Copyright (c) 2018 Power-Command
***/

import { Scene, Thread } from 'sphere-runtime';

import { Game, Elements, SkillCategories } from '$/gameDef';
import { drawTextEx } from '$/utilities';

import ItemUsable from './itemUsable';
import Stance from './stance';
import TargetMenu from './targetMenu';

export default
class MoveMenu extends Thread
{
	constructor(unit, battle, stance)
	{
		super({ priority: 10 });
		
		this.lockedCursorColor = CreateColor(0, 36, 72, 255);
		this.moveRankColor = CreateColor(255, 255, 255, 255);
		this.normalCursorColor = CreateColor(0, 72, 144, 255);
		this.textColor = CreateColor(255, 255, 255, 255);
		this.usageTextColor = CreateColor(255, 192, 0, 255);

		this.battle = battle;
		this.drawers = null;
		this.expansion = 0.0;
		this.fadeness = 0.0;
		this.font = GetSystemFont();
		this.isExpanded = false;
		this.menuStance = stance;
		this.moveCursor = 0;
		this.moveCursorColor = CreateColor(0, 0, 0, 0);
		this.moveMenu = null;
		this.selection = null;
		this.stance = null;
		this.topCursor = 0;
		this.topCursorColor = CreateColor(0, 0, 0, 0);
		this.unit = unit;
		let drawerTable = {};
		for (const skill of this.unit.skills) {
			let category = skill.skillInfo.category;
			if (!(category in drawerTable)) {
				drawerTable[category] = {
					name: SkillCategories[category],
					contents: [],
					cursor: 0
				};
			}
			drawerTable[category].contents.push(skill);
		}
		this.drawers = [];
		for (const category in drawerTable)
			this.drawers.push(drawerTable[category]);
		if (stance == Stance.Attack) {
			this.drawers = this.drawers.concat([
				{ name: "Item", contents: this.unit.items, cursor: 0 } ]);
		}

		this.chooseMove = new Scene()
			.fork()
				.tween(this.moveCursorColor, 7, 'easeInOutSine', this.lockedCursorColor)
			.end()
			.fork()
				.tween(this, 15, 'easeInBack', { expansion: 0.0 })
			.end()
			.tween(this, 15, 'easeInBack', { fadeness: 0.0 });

		this.hideMoveList = new Scene()
			.fork()
				.tween(this.moveCursorColor, 15, 'linear', CreateColor(0, 0, 0, 0))
			.end()
			.fork()
				.tween(this.topCursorColor, 15, 'easeInOutSine', this.normalCursorColor)
			.end()
			.tween(this, 15, 'easeInBack', { expansion: 0.0 });

		this.showMenu = new Scene()
			.fork()
				.tween(this.topCursorColor, 15, 'easeOutQuad', CreateColor(192, 192, 192, 255))
				.tween(this.topCursorColor, 15, 'easeOutQuad', this.normalCursorColor)
			.end()
			.tween(this, 30, 'easeOutBounce', { fadeness: 1.0 });

		this.showMoveList = new Scene()
			.fork()
				.tween(this.topCursorColor, 15, 'easeInOutSine', this.lockedCursorColor)
			.end()
			.fork()
				.tween(this.moveCursorColor, 15, 'linear', this.normalCursorColor)
			.end()
			.tween(this, 15, 'easeOutExpo', { expansion: 1.0 });

		this.drawCursor = function(x, y, width, height, cursorColor, isLockedIn, isEnabled = true)
		{
			let color;
			let color2;
			color = isEnabled ? cursorColor : CreateColor(96, 96, 96, cursorColor.alpha);
			color2 = BlendColors(color, CreateColor(0, 0, 0, color.alpha));
			if (isLockedIn) {
				let mainColor = color;
				color = color2;
				color2 = mainColor;
			}
			let halfHeight = Math.round(height / 2);
			GradientRectangle(x, y, width , halfHeight, color2, color2, color, color);
			GradientRectangle(x, y + halfHeight, width, height - halfHeight, color, color, color2, color2);
			OutlinedRectangle(x, y, width, height, CreateColor(0, 0, 0, cursorColor.alpha / 2));
		};

		this.drawItemBox = function(x, y, width, height, alpha, isSelected, isLockedIn, cursorColor, isEnabled = true)
		{
			Rectangle(x, y, width, height, CreateColor(0, 0, 0, alpha));
			OutlinedRectangle(x, y, width, height, CreateColor(0, 0, 0, 24));
			if (isSelected) {
				this.drawCursor(x, y, width, height, cursorColor, isLockedIn, isEnabled);
			}
		};

		this.drawMoveItem = function(x, y, item, isSelected, isLockedIn)
		{
			let alpha = 255 * this.fadeness * this.expansion;
			let isEnabled = item.isEnabled;
			let textColor = isSelected ? this.textColor : CreateColor(128, 128, 128, alpha);
			let usageTextColor = isSelected ? this.usageTextColor : BlendColors(this.usageTextColor, CreateColor(0, 0, 0, this.usageTextColor.alpha));
			textColor = isEnabled ? textColor : CreateColor(0, 0, 0, 32 * alpha / 255);
			usageTextColor = isEnabled ? usageTextColor : CreateColor(0, 0, 0, 32 * alpha / 255);
			this.drawItemBox(x, y, 160, 18, alpha * 128 / 255, isSelected, isLockedIn, this.moveCursorColor, isEnabled);
			let rankBoxColor = isEnabled ? BlendColors(item.idColor, CreateColor(0, 0, 0, item.idColor.alpha))
				: BlendColorsWeighted(item.idColor, CreateColor(0, 0, 0, item.idColor.alpha), 25, 75);
			let rankColor = isEnabled ? item.idColor : BlendColorsWeighted(item.idColor, CreateColor(0, 0, 0, item.idColor.alpha), 33, 66);
			Rectangle(x + 5, y + 2, 14, 14, rankBoxColor);
			OutlinedRectangle(x + 5, y + 2, 14, 14, CreateColor(0, 0, 0, rankBoxColor.alpha / 2));
			drawTextEx(this.font, x + 12, y + 3, isFinite(item.rank) ? item.rank : "?", rankColor, 1, 'center');

			let shadowLength = isEnabled ? 1 : 0;
			drawTextEx(this.font, x + 24, y + 3, item.name, textColor, shadowLength);
			if (item.mpCost > 0) {
				drawTextEx(this.font, x + 141, y + 1, item.mpCost, textColor, shadowLength, 'right');
				drawTextEx(this.font, x + 142, y + 5, "MP", usageTextColor, shadowLength);
			} else if (item.usable instanceof ItemUsable) {
				drawTextEx(this.font, x + 148, y + 3, item.usable.usesLeft, textColor, shadowLength, 'right');
				drawTextEx(this.font, x + 149, y + 3, "x", usageTextColor, shadowLength);
			}
		};

		this.drawTopItem = function(x, y, width, item, isSelected)
		{
			let isEnabled = item.contents.length > 0;
			this.drawItemBox(x, y, width, 18, 144 * this.fadeness, isSelected, this.isExpanded, this.topCursorColor, isEnabled);
			let textColor = isSelected ? CreateColor(255, 255, 255, 255 * this.fadeness) : CreateColor(128, 128, 128, 255 * this.fadeness);
			textColor = isEnabled ? textColor : CreateColor(0, 0, 0, 32 * this.fadeness);
			drawTextEx(this.font, x + width / 2, y + 3, item.name.substr(0, 3), textColor, isEnabled ? 1 : 0, 'center');
		};

		this.updateTurnPreview = function()
		{
			let nextMoveOrRank;
			if (this.stance != Stance.Guard) {
				if (this.isExpanded) {
					nextMoveOrRank = this.moveMenu[this.moveCursor].usable;
				} else {
					let drawer = this.drawers[this.topCursor];
					nextMoveOrRank = drawer.contents.length > 0 ? drawer.contents[drawer.cursor] : Game.defaultItemRank;
				}
			} else {
				nextMoveOrRank = Game.stanceChangeRank;
			}
			let nextActions = isNaN(nextMoveOrRank) ? nextMoveOrRank.peekActions() : [ nextMoveOrRank ];
			if (this.stance == Stance.Charge)
				nextActions = [ 1 ].concat(nextActions);
			let prediction = this.battle.predictTurns(this.unit, nextActions);
			this.battle.ui.hud.turnPreview.set(prediction);
		};
	}

	async run()
	{
		this.battle.suspend();
		this.battle.ui.hud.highlight(this.unit);
		let chosenTargets = null;
		this.stance = this.lastStance = this.menuStance;
		while (chosenTargets === null) {
			this.expansion = 0.0;
			this.isExpanded = false;
			this.selection = null;
			this.stance = this.lastStance;
			while (AreKeysLeft()) { GetKey(); }
			this.showMenu.run();
			this.updateTurnPreview();
			this.start();
			this.takeFocus();
			await Thread.join(this);
			let targetMenu;
			switch (this.stance) {
				case Stance.Attack:
				case Stance.Charge:
					let name = this.stance == Stance.Charge
						? `CS ${this.selection.name}`
						: this.selection.name;
					chosenTargets = await new TargetMenu(this.unit, this.battle, this.selection, name).run();
					break;
				case Stance.Counter:
					targetMenu = new TargetMenu(this.unit, this.battle, null, `GS ${this.selection.name}`);
					targetMenu.lockTargets([ this.unit.counterTarget ]);
					chosenTargets = await targetMenu.run();
					break;
				case Stance.Guard:
					targetMenu = new TargetMenu(this.unit, this.battle, null, "Guard");
					targetMenu.lockTargets([ this.unit ]);
					chosenTargets = await targetMenu.run();
					break;
			}
		}
		this.battle.ui.hud.highlight(null);
		this.battle.resume();
		return {
			usable: this.selection,
			stance: this.stance,
			targets: chosenTargets
		};
	}

	on_inputCheck()
	{
		let key = AreKeysLeft() ? GetKey() : null;
		if (key == GetPlayerKey(PLAYER_1, PLAYER_KEY_A)) {
			if (!this.isExpanded && this.drawers[this.topCursor].contents.length > 0) {
				let usables = this.drawers[this.topCursor].contents;
				this.moveMenu = [];
				for (let i = 0; i < usables.length; ++i) {
					let menuItem = {
						name: usables[i].name,
						idColor: CreateColor(192, 192, 192, 255),
						isEnabled: usables[i].isUsable(this.unit, this.stance),
						mpCost: usables[i].mpCost(this.unit),
						rank: usables[i].rank,
						usable: usables[i]
					};
					let actions = menuItem.usable.peekActions();
					for (let i2 = 0; i2 < actions.length; ++i2) {
						for (let i3 = 0; i3 < actions[i2].effects.length; ++i3) {
							if ('element' in actions[i2].effects[i3]) {
								menuItem.idColor = Elements[actions[i2].effects[i3].element].color;
							}
						}
					}
					this.moveMenu.push(menuItem);
				}
				this.moveCursor = this.drawers[this.topCursor].cursor;
				this.isExpanded = true;
				this.hideMoveList.stop();
				this.showMoveList.run();
				this.updateTurnPreview();
			} else if (this.isExpanded && this.moveMenu[this.moveCursor].isEnabled) {
				this.drawers[this.topCursor].cursor = this.moveCursor;
				this.selection = this.moveMenu[this.moveCursor].usable;
				this.showMoveList.stop();
				this.chooseMove.run();
			}
		} else if (key == GetPlayerKey(PLAYER_1, PLAYER_KEY_B) && this.isExpanded) {
			this.drawers[this.topCursor].cursor = this.moveCursor;
			this.isExpanded = false;
			this.showMoveList.stop();
			this.hideMoveList.run();
		} else if (key == GetPlayerKey(PLAYER_1, PLAYER_KEY_Y)
			&& this.stance != Stance.Guard && this.stance != Stance.Counter)
		{
			this.stance = this.stance == Stance.Attack ? Stance.Charge
				: Stance.Guard;
			this.updateTurnPreview();
			if (this.stance == Stance.Guard) {
				this.showMoveList.stop();
				this.chooseMove.run();
			}
		} else if (!this.isExpanded && key == GetPlayerKey(PLAYER_1, PLAYER_KEY_LEFT)) {
			--this.topCursor;
			if (this.topCursor < 0) {
				this.topCursor = this.drawers.length - 1;
			}
			this.updateTurnPreview();
		} else if (!this.isExpanded && key == GetPlayerKey(PLAYER_1, PLAYER_KEY_RIGHT)) {
			++this.topCursor;
			if (this.topCursor >= this.drawers.length) {
				this.topCursor = 0;
			}
			this.updateTurnPreview();
		} else if (this.isExpanded && key == GetPlayerKey(PLAYER_1, PLAYER_KEY_UP)) {
			this.moveCursor = this.moveCursor - 1 < 0 ? this.moveMenu.length - 1 : this.moveCursor - 1;
			this.updateTurnPreview();
		} else if (this.isExpanded && key == GetPlayerKey(PLAYER_1, PLAYER_KEY_DOWN)) {
			this.moveCursor = (this.moveCursor + 1) % this.moveMenu.length;
			this.updateTurnPreview();
		}
	}

	on_render()
	{
		let yOrigin = -54 * (1.0 - this.fadeness) + 16;
		let stanceText = this.stance == Stance.Charge ? "CS"
			: this.stance == Stance.Counter ? "CA"
			: this.stance == Stance.Guard ? "GS"
			: "AS";
		Surface.Screen.clipTo(0, 16, Surface.Screen.width, Surface.Screen.height - 16);
		Rectangle(0, yOrigin, 136, 16, CreateColor(0, 0, 0, 160 * this.fadeness));
		OutlinedRectangle(0, yOrigin, 136, 16, CreateColor(0, 0, 0, 24 * this.fadeness));
		Rectangle(136, yOrigin, 24, 16, CreateColor(0, 0, 0, 176 * this.fadeness));
		OutlinedRectangle(136, yOrigin, 24, 16, CreateColor(0, 0, 0, 24 * this.fadeness));
		drawTextEx(this.font, 68, yOrigin + 2, this.unit.fullName, CreateColor(160, 160, 160, 255 * this.fadeness), 1, 'center');
		drawTextEx(this.font, 148, yOrigin + 2, stanceText, CreateColor(255, 255, 128, 255 * this.fadeness), 1, 'center');
		let itemWidth = 160 / this.drawers.length;
		let litTextColor = CreateColor(255, 255, 255, 255);
		let dimTextColor = CreateColor(192, 192, 192, 255);
		Rectangle(0, 16, 160, yOrigin - 16, CreateColor(0, 0, 0, 192 * this.fadeness));
		for (let i = 0; i < this.drawers.length; ++i) {
			let x = Math.floor(i * itemWidth);
			let width = Math.floor((i + 1) * itemWidth) - x;
			this.drawTopItem(x, yOrigin + 16, width, this.drawers[i], i == this.topCursor);
		}
		Surface.Screen.clipTo(0, 0, Surface.Screen.width, Surface.Screen.height);
		let itemY;
		if (this.expansion > 0.0) {
			SetClippingRectangle(0, yOrigin + 34, 160, Surface.Screen.height - (yOrigin + 34));
			let height = this.moveMenu.length * 16;
			let y = yOrigin + 34 - height * (1.0 - this.expansion);
			Rectangle(0, 34, 160, y - 34, CreateColor(0, 0, 0, 128 * this.expansion * this.fadeness));
			itemY = y;
			for (let i = 0; i < this.moveMenu.length; ++i) {
				this.drawMoveItem(0, itemY, this.moveMenu[i], i == this.moveCursor, this.chooseMove.running);
				itemY += 18;
			}
			SetClippingRectangle(0, 0, Surface.Screen.width, Surface.Screen.height);
		} else {
			itemY = yOrigin + 34;
		}
	}

	on_update()
	{
		if ((this.selection !== null || this.stance === Stance.Guard) && !this.chooseMove.running)
			this.stop();
	}
}