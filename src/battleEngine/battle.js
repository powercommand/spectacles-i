/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *           Copyright (c) 2017 Power-Command
***/

RequireScript('battleEngine/battleScreen.js');
RequireScript('battleEngine/battleUnit.js');
RequireScript('battleEngine/fieldCondition.js');
RequireScript('battleEngine/mpPool.js');

const BattleResult =
{
	Win:  1,
	Flee: 2,
	Lose: 3,
};

class Battle extends Thread
{
	constructor(session, battleID)
	{
		if (!(battleID in Game.battles))
			throw new ReferenceError(`no encounter data for '${battleID}'`);

		super();

		console.log(`initialize battle context for '${battleID}'`);
		this.aiList = [];
		this.battleID = battleID;
		this.mode = null;
		this.parameters = Game.battles[battleID];
		this.partyMPPool = null;
		this.session = session;
		this.suspendCount = 0;
		this.timer = 0;
		this.battleLevel = 'battleLevel' in this.parameters ? this.parameters.battleLevel : session.party.level;
	}

	addCondition(conditionID)
	{
		if (this.hasCondition(conditionID))
			return;  // nop if already installed
		let eventData = { conditionID: conditionID, cancel: false };
		this.raiseEvent('conditionInstalled', eventData);
		if (!eventData.cancel) {
			let effect = new FieldCondition(eventData.conditionID, this);
			this.conditions.push(effect);
			console.log(`install field condition ${effect.name}`);
		} else {
			console.log(`cancel FC '${conditionID}' per existing FC`);
		}
	}

	alliesOf(unit)
	{
		if (unit.isPartyMember())
			return this.playerUnits;
		else
			return this.enemyUnits;
	}

	areEnemies(unit1, unit2)
	{
		return from(this.enemiesOf(unit1))
			.anyIs(unit2);
	}

	enemiesOf(unit)
	{
		if (unit.isPartyMember()) {
			return this.enemyUnits;
		} else {
			return this.playerUnits;
		}
	}

	findUnit(unitID)
	{
		let unit = from(this.enemyUnits, this.playerUnits)
			.first(it => it.id == unitID);
		return unit !== undefined ? unit : null;
	}

	getLevel()
	{
		return this.battleLevel;
	}

	go()
	{
		if (Sphere.Game.disableBattles) {
			console.log("battles disabled, automatic win", `battleID: ${this.battleID}`);
			this.result = BattleResult.Win;
			return null;
		}
		console.log("");
		console.log("start battle engine", `battleID: ${this.battleID}`);
		var partyMaxMP = 0;
		for (let key in this.session.party.members) {
			var battlerInfo = this.session.party.members[key].getInfo();
			var mpDonated = Math.round(Game.math.mp.capacity(battlerInfo));
			partyMaxMP += mpDonated;
			console.log(Game.characters[battlerInfo.characterID].name + " donated " + mpDonated + " MP to shared pool");
		}
		partyMaxMP = Math.min(Math.max(partyMaxMP, 0), 9999);
		var partyMPPool = new MPPool('partyMP', Math.min(Math.max(partyMaxMP, 0), 9999));
		partyMPPool.gainedMP.addHandler((mpPool, availableMP) => {
			this.ui.hud.mpGauge.set(availableMP);
		});
		partyMPPool.lostMP.addHandler((mpPool, availableMP) => {
			this.ui.hud.mpGauge.set(availableMP);
		});
		this.ui = new BattleScreen(partyMaxMP);
		this.battleUnits = [];
		this.playerUnits = [];
		this.enemyUnits = [];
		this.conditions = [];
		for (let i = 0; i < this.parameters.enemies.length; ++i) {
			var enemyID = this.parameters.enemies[i];
			var unit = new BattleUnit(this, enemyID, i == 0 ? 1 : i == 1 ? 0 : i, Row.Middle);
			this.battleUnits.push(unit);
			this.enemyUnits.push(unit);
		}
		var i = 0;
		for (let name in this.session.party.members) {
			var unit = new BattleUnit(this, this.session.party.members[name], i == 0 ? 1 : i == 1 ? 0 : i, Row.Middle, partyMPPool);
			this.battleUnits.push(unit);
			this.playerUnits.push(unit);
			++i;
		}
		var battleBGMTrack = Game.defaultBattleBGM;
		if ('bgm' in this.parameters) {
			battleBGMTrack = this.parameters.bgm;
		}
		this.ui.hud.turnPreview.set(this.predictTurns());
		Music.push(battleBGMTrack);
		this.result = null;
		this.timer = 0;
		this.mode = 'setup';
		console.defineObject('battle', this, {
			'spawn': this.spawnEnemy,
		});
		this.start();
		return this;
	}

	hasCondition(conditionID)
	{
		return from(this.conditions)
			.select(it => it.conditionID)
			.anyIs(conditionID);
	}

	isActive()
	{
		return this.result === null;
	}

	liftCondition(conditionID)
	{
		from(this.conditions)
			.where(it => it.conditionID === conditionID)
			.besides(it => console.log(`lift field condition ${it.name}`))
			.remove();
	}

	async notifyAIs(eventName, ...args)
	{
		for (const ai of this.aiList) {
			console.log(`notify AI battler ${ai.unit.name} '${eventName}'`);
			await ai[`on_${eventName}`](...args);
		}
	}

	predictTurns(actingUnit = null, nextActions = null)
	{
		var forecast = [];
		for (let turnIndex = 0; turnIndex < 8; ++turnIndex) {
			let bias = 0;
			from(this.enemyUnits, this.playerUnits)
				.where(it => it !== actingUnit || turnIndex > 0)
				.each(unit =>
			{
				++bias;
				let timeUntilUp = unit.timeUntilTurn(turnIndex, Game.defaultMoveRank,
					actingUnit === unit ? nextActions : null);
				forecast.push({
					bias: bias,
					remainingTime: timeUntilUp,
					turnIndex: turnIndex,
					unit: unit
				});
			});
		}
		forecast.sort(function(a, b) {
			let sortOrder = a.remainingTime - b.remainingTime;
			let biasOrder = a.bias - b.bias;
			return sortOrder !== 0 ? sortOrder : biasOrder;
		});
		forecast = forecast.slice(0, 10);
		return forecast;
	}

	raiseEvent(eventID, data = null)
	{
		var conditions = [ ...this.conditions ];
		from(conditions)
			.each(it => it.invoke(eventID, data));
	}

	registerAI(ai)
	{
		this.aiList.push(ai);
	}

	resume()
	{
		if (--this.suspendCount < 0)
			this.suspendCount = 0;
	}

	async runAction(action, actingUnit, targetUnits, useAiming = true)
	{
		let eventData = { action: action, targets: targetUnits };
		this.raiseEvent('actionTaken', eventData);
		targetUnits = eventData.targets;
		if ('announceAs' in action && action.announceAs != null)
			await actingUnit.announce(action.announceAs);
		from(action.effects)
			.where(it => it.targetHint === 'user')
			.each(effect =>
		{
			console.log(`apply effect '${effect.type}'`, `retarg: ${effect.targetHint}`);
			let effectHandler = Game.moveEffects[effect.type];
			effectHandler(actingUnit, [ actingUnit ], effect);
		});
		from(targetUnits)
			.each(it => it.takeHit(actingUnit, action));
		if (action.effects === null)
			return [];
		let targetsHit = [];
		let accuracyRate = 'accuracyRate' in action ? action.accuracyRate : 1.0;
		for (let i = 0; i < targetUnits.length; ++i) {
			let baseOdds = 'accuracyType' in action ? Game.math.accuracy[action.accuracyType](actingUnit.battlerInfo, targetUnits[i].battlerInfo) : 1.0;
			let aimRate = 1.0;
			if (useAiming) {
				let eventData = {
					action: clone(action),
					aimRate: 1.0,
					targetInfo: clone(targetUnits[i].battlerInfo)
				};
				actingUnit.raiseEvent('aiming', eventData);
				aimRate = eventData.aimRate;
			}
			let odds = Math.min(Math.max(baseOdds * accuracyRate * aimRate, 0.0), 1.0);
			let isHit = Random.chance(odds);
			console.log(`odds of hitting ${targetUnits[i].name} at ~${Math.round(odds * 100)}%`,
				isHit ? "hit" : "miss");
			if (isHit) {
				await this.notifyAIs('unitTargeted', targetUnits[i].id, action, actingUnit.id);
				targetsHit.push(targetUnits[i]);
			} else {
				targetUnits[i].evade(actingUnit, action);
			}
		}
		if (targetsHit.length == 0)
			return [];

		// apply move effects to target(s)
		from(targetsHit)
			.each(it => it.beginTargeting(actingUnit));
		let animContext = {
			effects: from(action.effects)
				.where(it => from([ 'selected', 'random' ]).anyIs(it.targetHint))
				.where(it => it.type != null)
				.toArray(),
			pc: 0,
			nextEffect: function() {
				if (this.pc < this.effects.length) {
					let effect = this.effects[this.pc++];
					let targets = effect.targetHint == 'random'
						? [ Random.sample(targetsHit) ]
						: targetsHit;
					console.log(`apply effect '${effect.type}'`, `retarg: ${effect.targetHint}`);
					Game.moveEffects[effect.type](actingUnit, targets, effect);
				}
				return this.pc < this.effects.length;
			}
		};
		if (action.animation in Game.animations) {
			Game.animations[action.animation]
				.call(animContext, actingUnit, targetsHit, false);
		}
		while (animContext.nextEffect());
		from(targetsHit)
			.each(it => it.endTargeting());
		return targetsHit;
	}

	spawnEnemy(enemyClass)
	{
		console.log(`spawn new enemy '${enemyClass}'`);
		var newUnit = new BattleUnit(this, enemyClass);
		this.battleUnits.push(newUnit);
		this.enemyUnits.push(newUnit);
	}

	suspend()
	{
		++this.suspendCount;
	}

	async tick()
	{
		if (this.suspendCount > 0 || this.result != null)
			return;
		console.log("");
		console.log(`begin CTB turn cycle #${this.timer + 1}`);
		++this.timer;
		var isUnitDead = unit => !unit.isAlive();
		var unitLists = [ this.enemyUnits, this.playerUnits ];
		from(...unitLists)
			.each(unit => unit.beginCycle());
		from(this.conditions)
			.each(condition => condition.beginCycle());
		this.raiseEvent('beginCycle');
		var actionTaken = false;
		while (!actionTaken) {
			for (const unit of from(...unitLists))
				actionTaken = await unit.tick() || actionTaken;
			if (from(this.playerUnits).all(isUnitDead)) {
				Music.adjustVolume(0.0, 120);
				await this.ui.fadeOut(120);
				this.result = BattleResult.Lose;
				console.log("all player characters have been KO'd");
				return;
			}
			if (from(this.enemyUnits).all(isUnitDead)) {
				Music.adjustVolume(0.0, 60);
				await this.ui.fadeOut(60);
				this.result = BattleResult.Win;
				console.log("all enemies have been KO'd");
				return;
			}
		}
		for (const unit of from(...unitLists))
			await unit.endCycle();
	}

	unregisterAI(ai)
	{
		from(this.aiList)
			.where(it => it === ai)
			.remove();
	}

	async on_update() {
		switch (this.mode) {
			case 'setup':
				var heading = ('isFinalBattle' in this.parameters && this.parameters.isFinalBattle)
					? "Final Battle: " : "Boss Battle: ";
				await this.ui.go('title' in this.parameters ? heading + this.parameters.title : null);
				for (const unit of from(this.enemyUnits, this.playerUnits))
					await unit.actor.enter();
				this.ui.hud.turnPreview.show();
				if (!from(this.session.battlesSeen).anyIs(this.battleID)) {
					this.session.battlesSeen.push(this.battleID);
					 if ('onFirstStart' in this.parameters) {
						console.log(`call onFirstStart() for battle '${this.battleID}'`);
						await this.parameters.onFirstStart.call(this);
					 }
				}
				if ('onStart' in this.parameters) {
					console.log(`call onStart() for battle '${this.battleID}'`);
					await this.parameters.onStart.call(this);
				}
				await this.ui.showTitle();
				this.mode = 'battle';
				break;
			case 'battle':
				await this.tick();
				break;
		}
		if (this.result !== null) {
			console.log("shut down battle engine");
			from(this.battleUnits)
				.each(unit => unit.dispose());
			this.ui.dispose();
			Music.pop();
			Music.adjustVolume(1.0, 0);
			console.undefineObject('battle');
			return false;
		}
		else {
			return true;
		}
	}
}
