/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *           Copyright (c) 2017 Power-Command
***/

const transpile = require('transpile');

describe("Spectacles: Bruce's Story", {
	version: 1,
	author: "Fat Cerberus",
	summary: "Follow Scott Starcross in his quest to stop the Primus.",
	resolution: '320x200',
	main: 'scripts/main.js',

	logPath: '~/Spectacles Saga/console.log',

	disableAnimation: false,
	disableBattles: false,
	disableSplash: true,
	disableTitleScreen: true,
});

transpile.v1('@/scripts/', files('scripts/*.js', true));
transpile.v2('@/lib/',     files('lib/*.js', true));

install('@/images/',     files('images/*.png', true));
install('@/maps/',       files('maps/*.rmp', true));
install('@/maps/',       files('maps/*.rts', true));
install('@/music/',      files('music/*.ogg', true));
install('@/spritesets/', files('spritesets/*.rss', true));
install('@/sounds/',     files('sounds/*.wav', true));
install('@/',            files('icon.png'));
