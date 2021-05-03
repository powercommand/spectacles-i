/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *            Copyright (c) 2021 Fat Cerberus
***/

import { from, Random } from 'sphere-runtime';

import { AutoBattler, Stance } from '../battleSystem/index.js';

export default
class ScottTempleAI extends AutoBattler
{
	constructor(unit, battle)
	{
		super(unit, battle);

		this.definePhases([ 9000, 3000 ], 100);
		this.defaultSkill = 'swordSlash';

		this.healingItems = from([ 'tonic', 'powerTonic' ]);
		this.joltTarget = null;
	}

	strategize(stance, phase)
	{
		const skillID = Random.sample([ 'hellfire', 'upheaval', 'windchill', 'electrocute' ]);
		this.queueSkill(skillID, Stance.Attack);
	}

	on_phaseChanged(newPhase, lastPhase)
	{
		switch (newPhase) {
		case 1:
			this.queueSkill('omni', Stance.Attack, 'elysia');
			break;
		case 2:
			this.queueSkill('rejuvenate');
			break;
		case 3:
			break;
		}
	}

	on_unitReady(userID)
	{
		if (userID === 'scottTemple') {
			if (this.joltTarget !== null && !this.hasMovesQueued)
				this.queueSkill('jolt', Stance.Attack, this.joltTarget);
		}
	}

	on_itemUsed(userID, itemID, targetIDs)
	{
		if (this.healingItems.anyIs(itemID))
			this.joltTarget = targetIDs[0];
	}
	
	on_skillUsed(userID, skillID, stance, targetIDs)
	{
		// if Temple is using Jolt now, revert to normal behavior
		if (skillID === 'jolt' && userID === 'scottTemple')
			this.joltTarget = null;

		// if someone gets healed, zombify the target. in case of Renewal, retaliate with Omni.
		if ((skillID === 'heal' || skillID === 'rejuvenate') && userID !== 'scottTemple')
			this.joltTarget = targetIDs[0];
		else if (skillID === 'renewal' && userID !== 'scottTemple')
			this.queueSkill('omni', Stance.Attack, userID);
	}
}
