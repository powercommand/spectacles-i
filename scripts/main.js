/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *           Copyright (c) 2015 Power-Command
***/

var DBG_DISABLE_BATTLES = false;
var DBG_DISABLE_TEXTBOXES = false;
var DBG_DISABLE_TITLE_CARD = true;
var DBG_DISABLE_TITLE_SCREEN = true;
var DBG_DISABLE_TRANSITIONS = false;
var DBG_LOG_CONSOLE_OUTPUT = true;
var DBG_IN_GAME_CONSOLE = true;

RequireSystemScript('mini/miniRT.js');
RequireSystemScript('analogue.js');
RequireSystemScript('kh2Bar.js');
RequireSystemScript('SpriteImage.js');

RequireScript('Core/Engine.js');
RequireScript('Battle.js');
RequireScript('Cutscenes.js');
RequireScript('FieldMenu.js');
RequireScript('GameOverScreen.js');
RequireScript('LucidaClock.js');
RequireScript('MenuStrip.js');
RequireScript('Scrambler.js');
RequireScript('Session.js');
RequireScript('TestHarness.js');
RequireScript('TitleScreen.js');

EvaluateScript('GameDef/game.js');

// game() function
// This is called by Sphere when the game is launched.
function game()
{
	// initialize Specs Engine components
	Engine.initialize(60);
	analogue.init();
	
	// initialize miniRT
	mini.initialize({
		frameRate: 60,
		scenePriority: 99,
		consolePrompt: "Specs Engine:",
		consoleLines: 10,
		logFile: DBG_LOG_CONSOLE_OUTPUT ? 'consoleLog.txt' : null,
	});
	
	var pixelShader = new PixelShader('pixel.glsl');
	var vertexShader = new VertexShader('vertex.glsl');
	var shader = new ShaderProgram(pixelShader, vertexShader);
	var image = new Image('MapTiles/Grass.png');
	var shape = new Shape([
		{ x: 10, y: 10 },
		{ x: 110, y: 10 },
		{ x: 110, y: 110 },
		{ x: 10, y: 110 },
	], image);
	var group = new Group([ shape ], shader);
	mini.Threads.createEx(group, {
		update: function() { return true; },
		render: function() { this.draw(); }
	});
	
	mini.Console.register('yap', null, {
		'on': function() { DBG_DISABLE_TEXTBOXES = false; mini.Console.write("Yappy times are currently ON"); }, 
		'off': function() { DBG_DISABLE_TEXTBOXES = true; mini.Console.write("Yappy times are currently OFF"); }, 
	});
	mini.Console.register('bgm', mini.BGM, {
		'kill': function() { this.play(null); this.play = this.push = this.pop = function() {} },
		'play': function(trackName) { this.play('BGM/' + trackName + '.ogg'); },
		'pop': function() { this.pop(); },
		'push': function(trackName) { this.push('BGM/' + trackName + '.ogg'); },
		'stop': function() { this.play(null); },
		'vol': function(volume) { this.adjust(volume, 0.5); },
	});
	mini.Console.register('field', Sphere, {
		'add': function(name) {
			CreatePerson(name, 'battlers/' + name + '.rss', false);
			SetPersonX(name, RNG.range(22, 26) * 32);
			SetPersonY(name, RNG.range(23, 25) * 32);
		}
	});
	
	// set up the beta test harness
	TestHarness.initialize();
	EvaluateScript('DebugHelp/BattleTests.js');
	
	// show the title screen and start the game!
	if (!DBG_DISABLE_TITLE_CARD) {
		mini.BGM.push('BGM/SpectaclesTheme.ogg');
		Engine.showLogo('TitleCard', 5.0);
	}
	var session = new TitleScreen('SpectaclesTheme').show();
	analogue.getWorld().session = session;
	LucidaClock.initialize();
	
	MapEngine('Testville.rmp', 60);
}

function DrawTextEx(font, x, y, text, color, shadowDistance, alignment)
{
	color = color !== void null ? color : CreateColor(255, 255, 255, 255);
	shadowDistance = shadowDistance !== void null ? shadowDistance : 0;
	alignment = alignment !== void null ? alignment : 'left';
	
	if (arguments.length < 4) {
		Abort(
			"DrawTextEx() - error: Wrong number of arguments\n" +
			"At least 4 arguments were expected; caller only passed " + arguments.length + "."
		, -1);
	}
	var alignments = {
		left: function(font, x, text) { return x; },
		center: function(font, x, text) { return x - font.getStringWidth(text) / 2; },
		right: function(font, x, text) { return x - font.getStringWidth(text); }
	};
	if (!(alignment in alignments)) {
		Abort("DrawTextEx() - error: Invalid argument\nThe caller specified an invalid text alignment mode: '" + alignment + "'.", -1);
	}
	x = alignments[alignment](font, x, text);
	var oldColorMask = font.getColorMask();
	font.setColorMask(CreateColor(0, 0, 0, color.alpha));
	font.drawText(x + shadowDistance, y + shadowDistance, text);
	font.setColorMask(color);
	font.drawText(x, y, text);
	font.setColorMask(oldColorMask);
}

// clone() function
// Creates a deep copy of an object, preserving circular references.
// Arguments:
//     o: The object to clone.
// Returns:
//     The new, cloned object.
function clone(o)
{
	var clones = arguments.length >= 2 ? arguments[1] : [];
	if (typeof o === 'object' && o !== null) {
		for (var i = 0; i < clones.length; ++i) {
			if (o === clones[i].original) {
				return clones[i].dolly;
			}
		}
		var dolly = o instanceof Array ? []
			: 'clone' in o && typeof o.clone === 'function' ? o.clone()
			: {};
		clones.push({ original: o, dolly: dolly });
		if (o instanceof Array || !('clone' in o) || typeof o.clone !== 'function') {
			for (var p in o) {
				dolly[p] = clone(o[p], clones);
			}
		}
		return dolly;
	} else {
		return o;
	}
}
