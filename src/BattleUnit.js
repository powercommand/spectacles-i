/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *           Copyright (c) 2013 Power-Command
***/

RequireScript('AIContext.js');
RequireScript('ItemUsable.js');
RequireScript('MoveMenu.js');
RequireScript('MPPool.js');
RequireScript('SkillUsable.js');
RequireScript('Stat.js');
RequireScript('StatusContext.js');

// BattleRow enumeration
// Specifies a battler's relative distance from its opponents.
var BattleRow =
{
	Front: -1,
	Middle: 0,
	Rear:   1,
};

// Stance enumeration
// Specifies a battle unit's current battling stance.
var Stance =
{
	Attack:  0,  // normal attacking stance
	Guard:   1,  // guard against damage and statuses
	Counter: 2,  // counterattacking stance
	Charge:  3,  // charge up an attack
};

// BattleUnit() constructor
// Creates an object representing an active battler.
// Arguments:
//     battle:      The battle in which the unit is participating.
//     basis:       The party member or enemy class to use as a basis for the unit.
//     position:    The position of the unit in the party order.
//     startingRow: The row the unit starts in.
//     mpPool:      Optional. The MP pool the battler should draw from. If not provided, a dedicated
//                  MP pool will be created for the battler.
function BattleUnit(battle, basis, position, startingRow, mpPool)
{
	this.actionQueue = [];
	this.actor = null;
	this.affinities = [];
	this.ai = null;
	this.allowTargetScan = false;
	this.battle = battle;
	this.battlerInfo = {};
	this.counterTarget = null;
	this.cv = 0;
	this.hp = 0;
	this.lastAttacker = null;
	this.lazarusFlag = false;
	this.moveTargets = null;
	this.mpPool = null;
	this.newSkills = [];
	this.newStance = Stance.Attack;
	this.partyMember = null;
	this.row = startingRow;
	this.skills = [];
	this.stance = Stance.Attack;
	this.stats = {};
	this.statuses = [];
	this.tag = random.string();
	this.turnRatio = 1.0;
	this.weapon = null;

	if (basis instanceof PartyMember) {
		this.partyMember = basis;
		this.id = this.partyMember.characterID;
		this.character = Game.characters[this.partyMember.characterID];
		this.baseStats = this.character.baseStats;
		this.tier = 1;
		this.maxHP = Math.round(Math.max(Game.math.hp(this.character, this.partyMember.getLevel(), this.tier), 1));
		this.hp = this.maxHP;
		this.name = this.partyMember.name;
		this.fullName = this.partyMember.fullName;
		this.allowTargetScan = this.partyMember.isTargetScanOn;
		var skills = this.partyMember.getUsableSkills();
		for (var i = 0; i < skills.length; ++i) {
			this.skills.push(skills[i]);
		}
		this.items = clone(this.partyMember.items);
		for (var statID in this.baseStats) {
			this.stats[statID] = this.partyMember.stats[statID];
		}
		this.weapon = Game.weapons[this.partyMember.weaponID];
	} else {
		if (!(basis in Game.enemies))
			throw new ReferenceError(`enemy template '${basis}' doesn't exist!`);
		this.enemyInfo = Game.enemies[basis];
		this.baseStats = this.enemyInfo.baseStats;
		this.affinities = 'damageModifiers' in this.enemyInfo ? this.enemyInfo.damageModifiers : [];
		this.id = basis;
		this.name = this.enemyInfo.name;
		this.fullName = 'fullName' in this.enemyInfo ? this.enemyInfo.fullName : this.enemyInfo.name;
		for (var statID in this.baseStats) {
			this.stats[statID] = new Stat(this.baseStats[statID], battle.getLevel(), false);
		}
		this.items = [];
		if ('items' in this.enemyInfo) {
			for (var i = 0; i < this.enemyInfo.items.length; ++i) {
				this.items.push(new ItemUsable(this.enemyInfo.items[i]));
			}
		}
		this.tier = 'tier' in this.enemyInfo ? this.enemyInfo.tier : 1;
		this.turnRatio = 'turnRatio' in this.enemyInfo ? this.enemyInfo.turnRatio : 1;
		this.maxHP = Math.round(Math.max(Game.math.hp(this.enemyInfo, battle.getLevel(), this.tier), 1));
		this.hp = this.maxHP;
		this.weapon = Game.weapons[this.enemyInfo.weapon];
		if ('hasLifeBar' in this.enemyInfo && this.enemyInfo.hasLifeBar) {
			this.battle.ui.hud.createEnemyHPGauge(this);
		}
		this.ai = new AIContext(this, battle, this.enemyInfo.aiType);
	}
	this.attackMenu = new MoveMenu(this, battle, Stance.Attack);
	this.counterMenu = new MoveMenu(this, battle, Stance.Counter);
	this.refreshInfo();
	this.mpPool = mpPool !== void null ? mpPool
		: new MPPool(this.id + "MP", Math.round(Math.max(Game.math.mp.capacity(this.battlerInfo), 0)));
	this.actor = battle.ui.createActor(this.name, position, this.row, this.isPartyMember() ? 'party' : 'enemy');
	if (this.isPartyMember()) {
		this.battle.ui.hud.setPartyMember(position == 2 ? 0 : position == 0 ? 2 : position, this, this.hp, this.maxHP);
	}
	if (!this.isPartyMember()) {
		this.actor.enter(true);
	}
	this.resetCounter(Game.defaultMoveRank, true);
	this.registerCommands();
	var unitType = this.ai === null ? "player" : "AI";
	term.print("Created " + unitType + " unit '" + this.name + "'",
		"hp: " + this.hp + "/" + this.maxHP,
		"id: " + this.tag);
}

// .dispose() method
// Relinquishes resources held by the battle unit.
BattleUnit.prototype.dispose = function()
{
	if (this.ai !== null) {
		this.ai.dispose();
	}
	term.undefine(this.id);
};

// .addStatus() method
// Afflicts the unit with a status effect.
// Arguments:
//     statusID:    The ID of the status to inflict.
//     isGuardable: Optional. If true, indicates that the affliction can be blocked by using
//                  Guard Stance. (default: false)
BattleUnit.prototype.addStatus = function(statusID, isGuardable)
{
	isGuardable = isGuardable !== void null ? isGuardable : false;
	
	if (this.isAlive() && !this.hasStatus(statusID)) {
		var statusName = Game.statuses[statusID].name;
		var isOverruled = from(this.statuses)
			.any(v => v.overrules(statusID));
		if (!this.isPartyMember() && from(this.enemyInfo.immunities).anyIs(statusID)) {
			if (!isGuardable) {
				this.actor.showHealing("immune", CreateColor(192, 192, 192, 255));
			}
			term.print(this.name + " is immune to " + statusName);
		} else if (isOverruled) {
			if (!isGuardable) {
				this.actor.showHealing("ward", CreateColor(192, 192, 192, 255));
			}
			term.print(statusName + " overruled by another of " + this.name + "'s statuses");
		} else if (this.stance !== Stance.Guard || !isGuardable) {
			var eventData = { unit: this, statusID: statusID, cancel: false };
			this.battle.raiseEvent('unitAfflicted', eventData);
			if (!eventData.cancel) {
				this.raiseEvent('afflicted', eventData);
			}
			if (!eventData.cancel) {
				var effect = new StatusContext(eventData.statusID, this);
				this.statuses.push(effect);
				this.battlerInfo.statuses = [];
				from(this.statuses).each(it => {
					this.battlerInfo.statuses.push(it.statusID);
				});
				term.print(this.name + " took on status " + effect.name);
			} else {
				if (!isGuardable) {
					this.actor.showHealing("ward", CreateColor(192, 192, 192, 255));
				}
				term.print(this.name + "'s " + statusName + " infliction blocked by status/FC");
			}
		} else {
			term.print(this.name + " in GS, " + statusName + " infliction blocked");
		}
	}
};

BattleUnit.prototype.announce = function(text)
{
	var bannerColor = this.isPartyMember() ? CreateColor(64, 128, 192, 255) : CreateColor(192, 64, 64, 255);
	this.battle.ui.announceAction(text, this.isPartyMember() ? 'party' : 'enemy', bannerColor);
};

// .beginCycle() method
// Prepares the unit for a new CTB cycle.
BattleUnit.prototype.beginCycle = function()
{
	if (!this.isAlive()) {
		return;
	}
	this.refreshInfo();
	for (var i = 0; i < this.statuses.length; ++i) {
		this.statuses[i].beginCycle();
	}
	var eventData = { battlerInfo: this.battlerInfo };
	this.raiseEvent('beginCycle', eventData);
	var baseStatSum = 0;
	var statSum = 0;
	var numStats = 0;
	for (var statID in this.baseStats) {
		++numStats;
		this.battlerInfo.stats[statID] = Math.round(this.battlerInfo.stats[statID]);
		statSum += this.battlerInfo.stats[statID];
		this.battlerInfo.baseStats[statID] = Math.round(this.battlerInfo.baseStats[statID]);
		baseStatSum += this.battlerInfo.baseStats[statID];
	}
	this.battlerInfo.statAverage = Math.round(statSum / numStats);
	this.battlerInfo.baseStatAverage = Math.round(baseStatSum / numStats);
	this.mpPool.restore(this.battlerInfo.statAverage / 10);
};

// .beginTargeting() method
// Signals the unit that it is being targeted by a battle action.
// Arguments:
//     actingUnit: The unit performing the action.
BattleUnit.prototype.beginTargeting = function(actingUnit)
{
	this.lastAttacker = actingUnit;
}

// .clearQueue() method
// Clears the unit's action queue without executing any queued actions.
BattleUnit.prototype.clearQueue = function()
{
	if (this.actionQueue.length > 0) {
		this.actionQueue = [];
		term.print("Cleared " + this.name + "'s action queue");
	}
};

// .die() method
// Inflicts unconditional instant death on the battler.
BattleUnit.prototype.die = function()
{
	this.battle.unitKilled.invoke(this.id);
	this.lazarusFlag = false;
	this.hp = 0;
	this.battle.ui.hud.setHP(this, this.hp);
	this.statuses = [];
	this.actor.animate('die');
	term.print(this.fullName + " afflicted with death");
};

// .endCycle() method
// Performs necessary processing for the unit at the end of a CTB cycle.
BattleUnit.prototype.endCycle = function()
{
	if (!this.isAlive()) {
		return;
	}
	if (this.stance == Stance.Counter) {
		this.cv = 0;
		if (this.ai == null) {
			this.actor.animate('active');
			this.battle.ui.hud.turnPreview.set(this.battle.predictTurns(this));
			term.print("Asking player for " + this.name + "'s counterattack");
			chosenMove = this.counterMenu.open();
		} else {
			chosenMove = this.ai.getNextMove();
			chosenMove.targets = [ this.counterTarget ];
		}
		this.queueMove(chosenMove);
		this.performAction(this.getNextAction(), chosenMove);
		this.actor.animate('dormant');
		this.newStance = Stance.Attack;
	}
	if (this.newStance !== this.stance) {
		this.stance = this.newStance;
		this.battle.stanceChanged.invoke(this.id, this.stance);
		var stanceName = this.stance == Stance.Guard ? "Guard"
			: this.stance == Stance.Counter ? "Counter"
			: "Attack";
		term.print(this.name + " is now in " + stanceName + " Stance");
	}
};

// .endTargeting() method
// Signals the unit that a battle action targeting it has finished executing. Should be paired
// with .beginTargeting().
BattleUnit.prototype.endTargeting = function()
{
	this.lastAttacker = null;
};

// .evade() method
// Processes missed attacks.
// Arguments:
//     actingUnit: The unit whose attack is being evaded.
//     action:     The action attempted to be performed on the unit.
BattleUnit.prototype.evade = function(actingUnit, action)
{
	this.actor.showHealing("miss", CreateColor(192, 192, 192, 255));
	term.print(this.name + " evaded " + actingUnit.name + "'s attack");
	var isGuardBroken = 'preserveGuard' in action ? !action.preserveGuard : true;
	var isMelee = 'isMelee' in action ? action.isMelee : false;
	if (isMelee && this.stance == Stance.Guard && isGuardBroken) {
		this.stance = Stance.Counter;
		this.counterTarget = actingUnit;
		term.print(this.name + "'s Counter Stance activated");
	}
};

// .getHealth() method
// Calculates the unit's remaining health as a percentage.
BattleUnit.prototype.getHealth = function()
{
	return Math.ceil(100 * this.hp / this.maxHP);
};

// .getLevel() method
// Calculates the unit's overall level.
BattleUnit.prototype.getLevel = function()
{
	if (this.partyMember != null) {
		return this.partyMember.getLevel();
	} else {
		return this.battle.getLevel();
	}
};

// .growSkill() method
// Adds experience to a party unit's existing skill or teaches it a new one.
// Arguments:
//     skillID:    The ID of the skill to grow.
//     experience: The amount of experience to add if the skill is already known.
// Remarks:
//     If the skill specified isn't already known at the time this method is called,
//     the unit will learn it.
BattleUnit.prototype.growSkill = function(skillID, experience)
{
	if (!this.isPartyMember()) {
		return;
	}
	var hasSkill = false;
	for (var i = 0; i < this.skills.length; ++i) {
		if (skillID == this.skills[i].skillID) {
			hasSkill = true;
			this.skills[i].grow(experience);
		}
	}
	if (!hasSkill) {
		var skill = this.partyMember.learnSkill(skillID);
		this.skills.push(skill);
		this.newSkills.push(skill);
		term.print(this.name + " learned " + skill.name);
	}
};

// .getNextAction() method
// Retrieves the next battle action, if any, in the unit's action queue.
// Returns:
//     The next action in the unit's action queue. If the action queue is empty, returns null.
BattleUnit.prototype.getNextAction = function()
{
	if (this.actionQueue.length > 0) {
		term.print(this.name + " has " + this.actionQueue.length + " action(s) pending, shifting queue");
		return this.actionQueue.shift();
	} else {
		return null;
	}
}

// .hasStatus() method
// Determines whether the unit is under the effects of a specified status.
// Arguments:
//     statusID: The ID of the status to test for, as defined in the gamedef.
BattleUnit.prototype.hasStatus = function(statusID)
{
	return from(this.statuses)
		.any(v => v.statusID === statusID);
};

// .heal() method
// Restores a specified amount of the battler's HP.
// Arguments:
//     amount:     The number of hit points to restore.
//     tags:       Optional. An array of tags to associate with the healing event.
//     isPriority: Optional. If true, specifies priority healing. Priority healing is unconditional;
//                 statuses are not allowed to act on it and as such no event will be raised. (default: false)
BattleUnit.prototype.heal = function(amount, tags, isPriority)
{
	isPriority = isPriority !== void null ? isPriority : false;
	
	if (!isPriority) {
		var eventData = {
			unit: this,
			amount: Math.round(amount), tags: tags,
			cancel: false
		};
		this.battle.raiseEvent('unitHealed', eventData);
		if (!eventData.cancel) {
			this.raiseEvent('healed', eventData);
		}
		if (!eventData.cancel) {
			amount = Math.round(eventData.amount);
		} else {
			return;
		}
	}
	if (amount > 0) {
		this.hp = Math.min(this.hp + amount, this.maxHP);
		this.actor.showHealing(amount);
		this.battle.ui.hud.setHP(this, this.hp);
		this.battle.unitHealed.invoke(this, amount);
		term.print(this.name + " healed for " + amount + " HP", "now: " + this.hp);
	} else if (amount < 0) {
		this.takeDamage(-amount, [], true);
	}
};

// .isAlive() method
// Determines whether the unit is still able to battle.
BattleUnit.prototype.isAlive = function()
{
	return this.hp > 0 || this.lazarusFlag;
};

// .isPartyMember() method
// Determines whether the unit represents a party member.
BattleUnit.prototype.isPartyMember = function()
{
	return this.partyMember != null;
};

// .liftStatus() method
// Removes a status effect from the battle unit.
// Arguments:
//     statusID: The status ID of the status effect to remove.
BattleUnit.prototype.liftStatus = function(statusID)
{
	var eventData = {
		statusID: statusID,
		cancel: false
	};
	this.raiseEvent('unitCured', eventData);
	if (!eventData.cancel) {
		this.raiseEvent('cured', eventData);
	}
	if (!eventData.cancel) {
		for (var i = 0; i < this.statuses.length; ++i) {
			if (statusID == this.statuses[i].statusID) {
				term.print(this.name + " lost status " + this.statuses[i].name);
				this.statuses.splice(i, 1);
				--i; continue;
			}
		}
		this.battlerInfo.statuses = [];
		from(this.statuses).each(it => {
			this.battlerInfo.statuses.push(it.statusID);
		});
	}
};

BattleUnit.prototype.liftStatusTags = function(tags)
{
	var activeStatuses = this.statuses.slice();
	from(activeStatuses)
		.where(v => from(v.statusDef.tags).anyIn(tags))
		.each(status =>
	{
		this.liftStatus(status.statusID);
	});
};

// .performAction() method
// Instructs the unit to perform a battle action.
// Arguments:
//     action:  The action to perform.
//     move:    The move associated with the action, as returned by MoveMenu.open()
//              or BattleAI.getNextMove().
BattleUnit.prototype.performAction = function(action, move)
{
	var eventData = { action: action, targetsInfo: [] };
	for (var i = 0; i < move.targets.length; ++i) {
		eventData.targetsInfo.push(move.targets[i].battlerInfo);
	}
	this.raiseEvent('acting', eventData);
	eventData.action.rank = Math.max(Math.round(eventData.action.rank), 0);
	if (this.isAlive()) {
		if (this.stance == Stance.Counter) {
			action.accuracyRate = 2.0;
		}
		var unitsHit = this.battle.runAction(action, this, move.targets, move.usable.useAiming);
		if (move.usable.givesExperience && unitsHit.length > 0) {
			var allEnemies = this.battle.enemiesOf(this);
			var experience = {};
			for (var i = 0; i < unitsHit.length; ++i) {
				if (!unitsHit[i].isAlive() && this.battle.areEnemies(this, unitsHit[i])) {
					for (var statID in unitsHit[i].baseStats) {
						if (!(statID in experience)) {
							experience[statID] = 0;
						}
						experience[statID] += Game.math.experience.stat(statID, unitsHit[i].battlerInfo);
					}
				}
			}
			for (var statID in experience) {
				this.stats[statID].grow(experience[statID]);
				term.print(this.name + " got " + experience[statID] + " EXP for " + Game.statNames[statID],
					"value: " + this.stats[statID].value);
			}
		}
		this.resetCounter(action.rank);
	}
};

// .queueMove() method
// Queues up actions for a move.
// Arguments:
//     move: The move to be queued, as returned by MoveMenu.open() or BattleAI.getNextMove().
BattleUnit.prototype.queueMove = function(move)
{
	this.moveUsed = move;
	var alliesInBattle = this.battle.alliesOf(this.moveUsed.targets[0]);
	var alliesAlive = from(alliesInBattle)
		.where(unit => unit.isAlive())
		.select();
	this.moveUsed.targets = this.moveUsed.usable.isGroupCast
		? this.moveUsed.usable.allowDeadTarget ? alliesInBattle : alliesAlive
		: this.moveUsed.targets;
	if (!this.moveUsed.usable.isGroupCast && !this.moveUsed.targets[0].isAlive()
		&& !this.moveUsed.usable.allowDeadTarget)
	{
		this.moveUsed.targets[0] = random.sample(alliesAlive);
	}
	var nextActions = this.moveUsed.usable.use(this, this.moveUsed.targets);
	if (move.stance == Stance.Charge) {
		nextActions.splice(0, 0, Game.skills.chargeSlash.actions[0]);
		from(nextActions)
			.from(action => action.effects)
			.where(effect => 'power' in effect)
			.each(effect =>
		{
			effect.power *= 2;
			effect.statusChance = 100;
		});
	}
	if (nextActions !== null) {
		this.battle.ui.hud.turnPreview.set(this.battle.predictTurns(this, nextActions));
		for (var i = 0; i < nextActions.length; ++i) {
			this.actionQueue.push(nextActions[i]);
		}
		if (this.actionQueue.length > 0) {
			term.print("Queued " + this.actionQueue.length + " action(s) for " + this.moveUsed.usable.name);
		}
	} else {
		this.battle.ui.hud.turnPreview.set(this.battle.predictTurns());
	}
};

// .raiseEvent() method
// Triggers a status event, allowing the unit's status effects to act on it.
// Arguments:
//     eventID: The event ID. Only statuses with a corresponding event handler will receive it.
//     data:    An object containing data for the event.
// Remarks:
//     Event handlers can change the objects referenced in the data object, for example to change the effects of
//     an action taken by a battler. If you pass in any objects from the gamedef, they should be cloned first to prevent
//     the event from inadvertantly modifying the original definition.
BattleUnit.prototype.raiseEvent = function(eventID, data)
{
	data = data !== void null ? data : null;
	
	var statuses = this.statuses.slice();
	from(statuses).each(function(status) {
		status.invoke(eventID, data);
	});
};

// .refreshInfo() method
// Refreshes the battler info.
BattleUnit.prototype.refreshInfo = function()
{
	this.battlerInfo.name = this.name;
	this.battlerInfo.affinities = clone(this.affinities);
	this.battlerInfo.health = Math.ceil(100 * this.hp / this.maxHP);
	this.battlerInfo.level = this.getLevel();
	this.battlerInfo.weapon = clone(this.weapon);
	this.battlerInfo.tier = this.tier;
	this.battlerInfo.baseStats = {};
	this.battlerInfo.stats = { maxHP: this.maxHP };
	for (var statID in this.baseStats) {
		this.battlerInfo.baseStats[statID] = this.baseStats[statID];
		this.battlerInfo.stats[statID] = this.stats[statID].value;
	}
	this.battlerInfo.statuses = [];
	from(this.statuses).each(it => {
		this.battlerInfo.statuses.push(it.statusID);
	});
	this.battlerInfo.stance = this.stance;
};

// .registerCommands() method
// Registers the BattleUnit with the terminal.
BattleUnit.prototype.registerCommands = function()
{
	term.define(this.id, this, {
		
		'add': function(statusID) {
			if (statusID in Game.statuses) {
				this.addStatus(statusID);
			} else {
				term.print("Invalid status ID '" + statusID + "'");
			}
		},
		
		'lift': function(statusID) {
			if (statusID in Game.statuses) {
				this.liftStatus(statusID);
			} else {
				term.print("Invalid status ID '" + statusID + "'");
			}
		},
		
		'damage': function(amount) {
			tags = [].slice.call(arguments, 1);
			amount = Math.max(parseInt(amount), 0);
			this.takeDamage(amount, tags);
		},
		
		'heal': function(amount) {
			tags = [].slice.call(arguments, 1);
			amount = Math.max(parseInt(amount), 0);
			this.heal(amount, tags);
		},
		
		'inv': function(instruction) {
			if (arguments.length < 1)
				return term.print("'" + this.id + " inv': No instruction provided");
			switch (instruction) {
			case 'add':
				if (arguments.length < 2)
					return term.print("'" + this.id + " inv add': Item ID required");
				var itemID = arguments[1];
				if (!(itemID in Game.items))
					return term.print("No such item ID '" + itemID + "'");
				var defaultUses = 'uses' in Game.items[itemID] ? Game.items[itemID].uses : 1;
				var itemCount = arguments[2] > 0 ? arguments[2] : defaultUses;
				var addCount = 0;
				from(this.items)
					.where(item => item.itemID === itemID)
					.each(item =>
				{
					item.usesLeft += itemCount;
					addCount += itemCount;
				});
				if (addCount == 0) {
					var usable = new ItemUsable(itemID);
					usable.usesLeft = itemCount;
					this.items.push(usable);
					addCount = itemCount;
				}
				term.print(addCount + "x " + Game.items[itemID].name + " added to " + this.name + "'s inventory");
				break;
			case 'munch':
				new scenes.Scene().playSound('Munch.wav').run();
				this.items.length = 0;
				term.print("maggie ate " + this.name + "'s entire inventory");
				break;
			case 'rm':
				if (arguments.length < 2)
					return term.print("'" + this.id + " inv add': Item ID required");
				var itemID = arguments[1];
				var itemCount = 0;
				from(this.items)
					.where(v => v.itemID === itemID)
					.besides(v => itemCount += v.usesLeft)
					.remove();
				if (itemCount > 0)
					term.print(itemCount + "x " + Game.items[itemID].name
						+ " deleted from " + this.name + "'s inventory");
				else
					term.print("No " + Game.items[itemID].name + " in " + this.name + "'s inventory");
				break;
			default:
				return term.print("'" + this.id + " inv': Unknown instruction '" + instruction + "'");
			}
		},
		
		'revive': function() {
			this.resurrect();
		},
		
		'scan': function(flag) {
			flag = flag.toLowerCase();
			if (flag == 'on') this.allowTargetScan = true;
			if (flag == 'off') this.allowTargetScan = false;
			term.print("Target Scan for " + this.name + " is " +
				(this.allowTargetScan ? "ON" : "OFF"));
		},
	});
};

// .resetCounter() method
// Resets the unit's counter value (CV) after an attack. The CV determines the number of
// ticks that must elapse before the unit is able to act.
// Arguments:
//     rank:        The rank of the action taken. The higher the rank, the longer the unit will have to
//                  wait for its next turn.
//     isFirstTurn: Optional. If true, specifies that the CV is being initialized at the start of a battle.
//                  This ensures that units' first turns are in proper speed order regardless of their turn ratio.
//                  (default: false)
// Remarks:
//     Rank 0 is treated as a special case; passing 0 or less for rank will always give the unit
//     its next turn immediately.
BattleUnit.prototype.resetCounter = function(rank, isFirstTurn)
{
	isFirstTurn = isFirstTurn !== void null ? isFirstTurn : false;
	
	var divisor = isFirstTurn ? 1.0 : this.turnRatio;
	this.cv = rank > 0
		? Math.max(Math.round(Game.math.timeUntilNextTurn(this.battlerInfo, rank) / divisor), 1)
		: 1;
	term.print(this.name + "'s CV " + (isFirstTurn ? "initialized" : "reset") + " to " + this.cv,
		"rank: " + rank);
};

// .restoreMP() method
// Restores magic points to the unit's assigned MP pool.
// Arguments:
//     amount: The number of magic points to restore.
BattleUnit.prototype.restoreMP = function(amount)
{
	amount = Math.round(amount);
	this.mpPool.restore(amount);
	var color = BlendColorsWeighted(CreateColor(255, 0, 255, 255), CreateColor(255, 255, 255, 255), 33, 66);
	this.actor.showHealing(amount + "MP", color);
};

// .resurrect() method
// Resurrects the unit from a dead state.
// Arguments:
//     isFullHeal: Optional. Specifies whether the resurrection should include a full
//                 HP restoration. If not specified or false, the unit will be revived
//                 with 1 HP. (default: false)
// Remarks:
//     This method does nothing if the unit is still alive.
BattleUnit.prototype.resurrect = function(isFullHeal)
{
	isFullHeal = isFullHeal !== void null ? isFullHeal : false;
	
	if (!this.isAlive()) {
		this.lazarusFlag = true;
		this.heal(isFullHeal ? this.maxHP : 1);
		this.actor.animate('revive');
		this.resetCounter(Game.reviveRank);
		term.print(this.name + " brought back from the dead");
	} else {
		this.actor.showHealing("ward", CreateColor(192, 192, 192, 255));
	}
};

// .setGuard() method
// Switches the unit into Guard Stance.
BattleUnit.prototype.setGuard = function()
{
	term.print(this.name + " will switch to Guard Stance");
	this.announce("Guard");
	this.newStance = Stance.Guard;
	this.resetCounter(Game.stanceChangeRank);
};

// .setWeapon() method
// Equips the unit with a specified weapon.
// Arguments:
//     weaponID: The weapon ID of the weapon to equip.
BattleUnit.prototype.setWeapon = function(weaponID)
{
	var weaponDef = Game.weapons[weaponID];
	this.announce("equip " + weaponDef.name);
	this.weapon = weaponDef;
	term.print(this.name + " equipped weapon " + weaponDef.name);
	this.resetCounter(Game.equipWeaponRank);
};

// .takeDamage() method
// Inflicts damage on the battler.
// Arguments:
//     amount:     The amount of damage to inflict.
//     tags:       Optional. An array of tags to associate with the damage event. The damage output
//                 will change if any of the tags are found in the unit's list of affinities.
//     isPriority: Optional. If true, specifies priority damage. Priority damage is unconditional;
//                 it is not affected by affinities and statuses don't receive the usual 'damaged' event before
//                 it is applied. (default: false)
// Remarks:
//     If, after all processing is complete, the final damage output is negative, the unit will be healed
//     instead. If it is exactly zero, it will be set to 1.
BattleUnit.prototype.takeDamage = function(amount, tags, isPriority)
{
	tags = tags !== void null ? tags : [];
	isPriority = isPriority !== void null ? isPriority : false;
	
	amount = Math.round(amount);
	var multiplier = 1.0;
	for (var i = 0; i < tags.length; ++i) {
		if (tags[i] in this.affinities) {
			multiplier *= this.affinities[tags[i]];
		}
	}
	amount = Math.round(amount * multiplier);
	if (amount > 0 && !isPriority) {
		var eventData = {
			unit: this, amount: amount, tags: tags,
			actingUnit: this.lastAttacker,
			cancel: false
		};
		this.battle.raiseEvent('unitDamaged', eventData);
		if (!eventData.cancel) {
			this.raiseEvent('damaged', eventData);
		}
		if (!eventData.cancel) {
			amount = Math.round(eventData.amount);
		} else {
			return;
		}
	}
	if (amount >= 0) {
		if (this.lastAttacker !== null && this.lastAttacker.stance == Stance.Counter) {
			term.print(this.name + " hit from Counter Stance, damage increased");
			amount = Math.round(amount * Game.bonusMultiplier);
		}
		if (this.stance != Stance.Attack && this.lastAttacker !== null) {
			amount = Math.round(Game.math.guardStance.damageTaken(amount, tags));
			term.print(this.name + " is in Guard Stance, damage reduced");
		}
		var oldHPValue = this.hp;
		this.hp = Math.max(this.hp - amount, 0);
		this.battle.unitDamaged.invoke(this, amount, tags, this.lastAttacker);
		term.print(this.name + " took " + amount + " HP damage", "left: " + this.hp);
		if (oldHPValue > 0 || this.lazarusFlag) {
			var damageColor = null;
			from(tags)
				.where(tag => tag in Game.elements)
				.each(tag =>
			{
				damageColor = damageColor !== null ? BlendColors(damageColor, Game.elements[tag].color)
					: Game.elements[tag].color;
			});
			damageColor = damageColor !== null ? BlendColorsWeighted(damageColor, CreateColor(255, 255, 255, 255), 33, 66)
				: CreateColor(255, 255, 255, 255);
			this.actor.showDamage(amount, damageColor);
		}
		this.battle.ui.hud.setHP(this, this.hp);
		if (this.hp <= 0 && (oldHPValue > 0 || this.lazarusFlag)) {
			term.print(this.name + " dying due to lack of HP");
			this.lazarusFlag = true;
			var eventData = { unit: this, cancel: false };
			this.battle.raiseEvent('unitDying', eventData);
			if (!eventData.cancel) {
				this.raiseEvent('dying', eventData);
			}
			this.lazarusFlag = eventData.cancel;
			if (!this.lazarusFlag) {
				this.die();
			} else {
				term.print(this.name + "'s death suspended by status/FC");
			}
		}
	} else if (amount < 0) {
		this.heal(Math.abs(amount), tags);
	}
};

// .takeHit() method
// Performs processing when the unit is hit by a move.
// Arguments:
//     actingUnit: The unit performing the move.
//     action:     The action being performed.
BattleUnit.prototype.takeHit = function(actingUnit, action)
{
	var eventData = {
		actingUnitInfo: actingUnit.battlerInfo,
		action: action,
		stance: actingUnit.stance
	};
	this.raiseEvent('attacked', eventData);
	var isGuardBroken = 'preserveGuard' in action ? !action.preserveGuard : true;
	var isMelee = 'isMelee' in action ? action.isMelee : false;
	if (this.stance == Stance.Guard && isMelee && isGuardBroken) {
		action.accuracyRate = 0.0; //'accuracyRate' in action ? 0.5 * action.accuracyRate : 0.5;
	}
	if (this.stance == Stance.Guard && isGuardBroken) {
		term.print(this.name + "'s Guard Stance was broken", "by: " + actingUnit.name);
		this.newStance = Stance.Attack;
		this.resetCounter(Game.guardBreakRank);
	}
};

// .tick() method
// Decrements the unit's CTB counter value (CV).
// Returns:
//     true if the unit performed an action during this tick; false otherwise.
// Remarks:
//     The unit will be allowed to act when its CV reaches zero.
BattleUnit.prototype.tick = function()
{
	if (!this.isAlive()) {
		return false;
	}
	--this.cv;
	if (this.cv == 0) {
		this.battle.suspend();
		if (this.stance == Stance.Guard) {
			this.stance = this.newStance = Stance.Attack;
			this.battle.stanceChanged.invoke(this.id, this.stance);
			term.print(this.name + "'s Guard Stance has expired");
		} else if (this.stance == Stance.Counter) {
			this.newStance = Stance.Attack;
		}
		term.print(this.name + "'s turn is up");
		this.actor.animate('active');
		this.battle.unitReady.invoke(this.id);
		var eventData = { skipTurn: false };
		this.raiseEvent('beginTurn', eventData);
		if (!this.isAlive()) {
			this.battle.resume();
			return true;
		}
		if (eventData.skipTurn) {
			this.clearQueue();
			term.print(this.name + "'s turn was skipped");
			this.resetCounter(Game.defaultMoveRank);
			this.battle.resume();
			return true;
		}
		var action = this.getNextAction();
		if (action == null) {
			var chosenMove = null;
			if (this.ai == null) {
				this.battle.ui.hud.turnPreview.set(this.battle.predictTurns(this));
				term.print("Asking player for " + this.name + "'s next move");
				chosenMove = this.attackMenu.open();
			} else {
				chosenMove = this.ai.getNextMove();
			}
			if (chosenMove.stance != Stance.Guard) {
				this.queueMove(chosenMove);
				action = this.getNextAction();
			} else {
				this.setGuard();
			}
		}
		if (this.isAlive()) {
			if (action !== null) {
				this.performAction(action, this.moveUsed);
			}
			this.raiseEvent('endTurn');
		}
		var eventData = { actingUnit: this };
		this.battle.raiseEvent('endTurn', eventData);
		this.actor.animate('dormant');
		term.print("End of " + this.name + "'s turn");
		this.battle.resume();
		return true;
	} else {
		return false;
	}
};

// .timeUntilNextTurn() method
// Gets the number of ticks until the battler can act.
BattleUnit.prototype.timeUntilNextTurn = function()
{
	return this.cv;
};

// .timeUntilTurn() method
// Estimates the time remaining until a future turn.
// Arguments:
//     turnIndex:   How many turns ahead to look. Zero means the next turn.
//     assumedRank: Optional. The action rank to assume when the exact move to be used isn't known.
//                  If this is not specified, the value of Game.defaultMoveRank is used.
//     nextActions: Optional. The action(s) the battler is to perform next.
// Returns:
//     The estimated number of ticks until the specified turn.
BattleUnit.prototype.timeUntilTurn = function(turnIndex, assumedRank, nextActions)
{
	assumedRank = assumedRank !== void null ? assumedRank : Game.defaultMoveRank;
	nextActions = nextActions !== void null ? nextActions : null;
	
	if (this.isAlive()) {
		nextActions = nextActions !== null
			? this.actionQueue.concat(nextActions)
			: this.actionQueue;
		var timeLeft = this.cv;
		for (var i = 1; i <= turnIndex; ++i) {
			var rank = assumedRank;
			if (i <= nextActions.length) {
				rank = isNaN(nextActions[i - 1]) ? nextActions[i - 1].rank
					: nextActions[i - 1];
			}
			timeLeft += Math.max(Math.round(Game.math.timeUntilNextTurn(this.battlerInfo, rank) / this.turnRatio), 1);
		}
		return timeLeft;
	} else {
		return Infinity;
	}
};