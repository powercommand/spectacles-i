/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *           Copyright (c) 2013 Power-Command
***/

Game.conditions =
{
	// Blackout field condition
	// Lowers accuracy and sometimes retargets attacks. Wears off after 10 actions.
	blackout:
	{
		name: "Blackout",
		
		initialize: function(battle) {
			this.actionsLeft = 10;
		},
		
		actionTaken: function(battle, eventData) {
			if (eventData.targets.length == 1 && 0.5 > Math.random()) {
				var target = eventData.targets[0];
				var newTargets = Math.random() < 0.5
					? battle.alliesOf(target)
					: battle.enemiesOf(target);
				var targetID = Math.min(Math.floor(Math.random() * newTargets.length), newTargets.length - 1);
				eventData.targets = [ newTargets[targetID] ];
			}
			--this.actionsLeft;
			if (this.actionsLeft <= 0) {
				mini.Console.write("Blackout has expired");
				battle.liftCondition('blackout');
			} else {
				mini.Console.write("Blackout will expire in " + this.actionsLeft + " more action(s)");
			}
		}
	},
	
	// General Disarray field condition
	// Randomizes the move rank of any skill or item used. Wears off after
	// 15 actions have been taken.
	generalDisarray:
	{
		name: "G. Disarray",
		
		initialize: function(battle) {
			this.actionsLeft = 15;
		},
		
		actionTaken: function(battle, eventData) {
			var oldRank = eventData.action.rank
			eventData.action.rank = Math.min(Math.floor(Math.random() * 5 + 1), 5);
			if (eventData.action.rank != oldRank) {
				mini.Console.write("Rank of action changed by G. Disarray to " + eventData.action.rank);
				mini.Console.append("was: " + oldRank);
			}
			--this.actionsLeft;
			if (this.actionsLeft > 0) {
				mini.Console.write("G. Disarray will expire in " + this.actionsLeft + " more action(s)");
			} else {
				mini.Console.write("G. Disarray has expired");
				battle.liftCondition('generalDisarray');
			}
		}
	},
	
	// Healing Aura field condition
	// Restores a small amount of health to a random battler at the beginning of
	// each cycle. Wears off after 25 healings.
	healingAura:
	{
		name: "Healing Aura",
		
		initialize: function(battle) {
			this.cyclesLeft = 25;
		},
		
		beginCycle: function(battle, eventData) {
			var units = mini.Link(battle.battleUnits)
				.where(function(unit) { return unit.isAlive(); })
				.toArray();
			var unit = units[Math.min(Math.floor(Math.random() * units.length), units.length - 1)];
			var vit = Game.math.statValue(unit.battlerInfo.baseStats.vit, unit.battlerInfo.level);
			unit.heal(vit, [ 'cure' ]);
			--this.cyclesLeft;
			if (this.cyclesLeft <= 0) {
				mini.Console.write("Healing Aura has expired");
				battle.liftCondition('healingAura');
			} else {
				mini.Console.write("Healing Aura will expire in " + this.cyclesLeft + " more cycle(s)");
			}
		}
	},
	
	// Inferno field condition
	// Inflicts a small amount of Fire damage on all battlers at the beginning of a
	// cycle and boosts any Fire attacks performed. Residual damage from Inferno diminishes
	// over time, eventually settling at half the original output.
	inferno:
	{
		name: "Inferno",
		
		initialize: function(battle) {
			mini.Link(battle.battleUnits)
				.where(function(unit) { return unit.isAlive(); })
				.each(function(unit)
			{
				if (unit.hasStatus('frostbite')) {
					mini.Console.write(unit.name + "'s Frostbite nullified by Inferno installation");
					unit.liftStatus('frostbite');
				}
			});
		},
		
		actionTaken: function(battle, eventData) {
			mini.Link(eventData.action.effects)
				.filterBy('type', 'damage')
				.each(function(effect)
			{
				if (effect.element == 'fire') {
					var oldPower = effect.power;
					effect.power = Math.round(effect.power * Game.bonusMultiplier);
					mini.Console.write("Fire attack strengthened by Inferno to " + effect.power + " POW");
					mini.Console.append("was: " + oldPower);
				} else if (effect.element == 'ice') {
					var oldPower = effect.power;
					effect.power = Math.round(effect.power / Game.bonusMultiplier);
					mini.Console.write("Ice attack weakened by Inferno to " + effect.power + " POW");
					mini.Console.append("was: " + oldPower);
				}
			});
		},
		
		beginCycle: function(battle, eventData) {
			var units = mini.Link(battle.battleUnits)
				.where(function(unit) { return unit.isAlive(); })
				.toArray();
			var unit = units[Math.min(Math.floor(Math.random() * units.length), units.length - 1)];
			var vit = Game.math.statValue(unit.battlerInfo.baseStats.vit, unit.battlerInfo.level);
			unit.takeDamage(vit, [ 'special', 'fire' ]);
		},
		
		conditionInstalled: function(battle, eventData) {
			if (eventData.conditionID == 'subzero') {
				mini.Console.write("Inferno canceled by Subzero installation, both suppressed");
				eventData.cancel = true;
				battle.liftCondition('inferno');
				mini.Link(battle.battleUnits)
					.where(function(unit) { return unit.isAlive(); })
					.each(function(unit)
				{
					unit.addStatus('zombie', true);
				});
			}
		},
		
		unitAfflicted: function(battle, eventData) {
			if (eventData.statusID == 'frostbite') {
				eventData.cancel = true;
				mini.Console.write("Frostbite is incompatible with Inferno");
			}
		}
	},
	
	// Subzero field condition
	// Inflicts a small amount of Ice damage on a battler at the end of his turn.
	// The effect intensifies over time per battler, maxing out at double its original
	// output.
	subzero:
	{
		name: "Subzero",
		
		initialize: function(battle) {
			this.multiplier = 1.0;
			this.rank = 0;
			mini.Link(battle.battleUnits)
				.where(function(unit) { return unit.isAlive(); })
				.each(function(unit)
			{
				if (unit.hasStatus('frostbite')) {
					mini.Console.write(unit.name + "'s Frostbite overruled by Subzero installation");
					unit.liftStatus('frostbite');
				}
				if (unit.hasStatus('ignite')) {
					mini.Console.write(unit.name + "'s Ignite nullified by Subzero installation");
					unit.liftStatus('ignite');
				}
			});
		},
		
		actionTaken: function(battle, eventData) {
			this.rank = eventData.action.rank;
			mini.Link(eventData.action.effects)
				.filterBy('type', 'damage')
				.filterBy('element', 'ice')
				.each(function(effect)
			{
				if (effect.element == 'ice') {
					var oldPower = effect.power;
					effect.power = Math.round(effect.power * Game.bonusMultiplier);
					mini.Console.write("Ice attack strengthened by Subzero to " + effect.power + " POW");
					mini.Console.append("was: " + oldPower);
				} else if (effect.element == 'fire') {
					var oldPower = effect.power;
					effect.power = Math.round(effect.power / Game.bonusMultiplier);
					mini.Console.write("Fire attack weakened by Subzero to " + effect.power + " POW");
					mini.Console.append("was: " + oldPower);
				}
			});
		},
		
		conditionInstalled: function(battle, eventData) {
			if (eventData.conditionID == 'inferno') {
				mini.Console.write("Subzero canceled by Inferno installation, both suppressed");
				eventData.cancel = true;
				battle.liftCondition('subzero');
				mini.Link(battle.battleUnits)
					.where(function(unit) { return unit.isAlive(); })
					.each(function(unit)
				{
					unit.addStatus('zombie', true);
				});
			}
		},
		
		endTurn: function(battle, eventData) {
			var unit = eventData.actingUnit;
			if (unit.isAlive() && this.rank != 0) {
				var vit = Game.math.statValue(unit.battlerInfo.baseStats.vit, unit.battlerInfo.level);
				unit.takeDamage(this.rank * vit * this.multiplier / 5, [ 'special', 'ice' ]);
				var increment = 0.1 * this.rank / 5;
				this.multiplier = Math.min(this.multiplier + increment, 2.0);
			}
			this.rank = 0;
		},
		
		unitAfflicted: function(battle, eventData) {
			if (eventData.statusID == 'frostbite') {
				eventData.cancel = true;
				mini.Console.write("Frostbite infliction overruled by Subzero");
			} else if (eventData.statusID == 'ignite') {
				eventData.cancel = true;
				mini.Console.write("Ignite is incompatible with Subzero");
			}
		}
	},
	
	// Thunderstorm field condition
	// Sometimes drops a lightning bolt on a unit at the end of their turn, dealing a small amount
	// of lightning damage and inflicting Zombie status. Wears off after 10 strikes.
	thunderstorm:
	{
		name: "Thunderstorm",
		
		initialize: function(battle) {
			this.strikesLeft = 10;
		},
		
		endTurn: function(battle, eventData) {
			if (0.5 > Math.random()) {
				var unit = eventData.actingUnit;
				mini.Console.write(unit.name + " struck by lightning from Thunderstorm");
				var level = battle.getLevel();
				var attack = Game.math.statValue(100, level);
				var defense = Game.math.statValue(0, level);
				var damage = Game.math.damage.calculate(5, battle.getLevel(), unit.tier, attack, defense);
				unit.takeDamage(damage, [ 'special', 'lightning' ]);
				unit.liftStatusTags('buff');
				--this.strikesLeft;
				if (this.strikesLeft <= 0) {
					mini.Console.write("Thunderstorm has expired");
					battle.liftCondition('thunderstorm');
				} else {
					mini.Console.write("Thunderstorm will expire in " + this.strikesLeft + " more strike(s)");
				}
			}
		}
	}
};