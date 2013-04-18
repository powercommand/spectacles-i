/**
 * Scenario 3.1 for Sphere - � 2008-2013 Bruce E. Pascoe
 * An advanced cutscene engine that allows you to coordinate complex cutscenes using multiple
 * timelines and cooperative threading
**/

var Scenario = Scenario || {};

// .defineCommand() function
// Registers a new cutscene command with Scenario.
// Arguments:
//     name: The name of the command. This should be a valid JavaScript identifier (alphanumeric, no spaces)
//     code: An object defining the command's callback functions:
//           .start(scene, state, ...): Called when the command begins executing to initialize the state, or for
//                                      instantaneous commands, perform the necessary action.
//           .update(scene, state):     Optional. If provided, called once per frame to maintain state variables.
//                                      If not provided, Scenario immediately moves on to the next command after
//                                      calling start(). This function should return true to keep the operation running,
//                                      or false to terminate it.
//           .render(scene, state):     Optional. If provided, called once per frame to perform any rendering
//                                      related to the command (e.g. text boxes).
//           .getInput(scene, state):   Optional. If provided, called once per frame while the command has the input
//                                      focus to check for player input and update the state accordingly.
Scenario.defineCommand = function(name, code)
{
	if (Scenario.prototype[name] != null) {
		Abort("Scenario.defineCommand():\nThe instruction name '" + name + "' is already in use.");
	}
	Scenario.prototype[name] = function() {
		var command = {};
		command.state = {};
		command.arguments = arguments;
		command.start = code.start;
		command.update = code.update;
		command.render = code.render;
		command.getInput = code.getInput;
		this.enqueue(command);
		return this;
	};
};

// Scenario() constructor
// Creates an object representing a scenario (cutscene definition)
function Scenario()
{
	this.createDelegate = function(o, method)
	{
		if (method == null) {
			return null;
		}
		return function() { return method.apply(o, arguments); };
	};
	
	this.createThread = function(state, updater, renderer, priority, inputHandler)
	{
		if (renderer === undefined) { renderer = null; }
		if (priority === undefined) { priority = 0; }
		if (inputHandler === undefined) { inputHandler = null; }
		var threadObject = {
			id:           this.nextThreadID,
			state:        state,
			priority:     priority,
			updater:      updater,
			renderer:     renderer,
			inputHandler: inputHandler
		};
		this.threads.push(threadObject);
		this.threads.sort(function(a, b) { return a.priority - b.priority; });
		if (inputHandler != null) {
			this.focusThreadStack.push(this.focusThread);
			this.focusThread = threadObject.id;
		}
		++this.nextThreadID;
		return threadObject.id;
	}
	
	this.createCommandThread = function(command)
	{
		var updater = this.createDelegate(this, command.update);
		var renderer = this.createDelegate(this, command.render);
		var inputHandler = this.createDelegate(this, command.getInput);
		return this.createThread(command.state, updater, renderer, 0, inputHandler);
	};
	
	this.createForkThread = function(state)
	{
		return this.createThread(state, this.createDelegate(this, this.updateFork));
	};
	
	this.isThreadRunning = function(id)
	{
		if (id == 0) {
			return false;
		}
		for (var i = 0; i < this.threads.length; ++i) {
			if (id == this.threads[i].id) {
				return true;
			}
		}
		return false;
	};
	
	this.killThread = function(id)
	{
		for (var i = 0; i < this.threads.length; ++i) {
			if (id == this.threads[i].id) {
				this.threads.splice(i, 1);
				--i; continue;
			}
		}
	};
	
	this.updateFork = function(scene, state)
	{
		for (var iFork = 0; iFork < state.forkThreads.length; ++iFork) {
			if (!scene.isThreadRunning(state.forkThreads[iFork])) {
				state.forkThreads.splice(iFork, 1);
				--iFork; continue;
			}
		}
		if (scene.isThreadRunning(state.currentCommandThread)) return true;
		if (state.commandQueue.length == 0 && state.forkThreads.length == 0) return false;
		if (state.commandQueue.length > 0) {
			var command = state.commandQueue.shift();
			if (command.start != null) {
				var parameters = [];
				parameters.push(scene);
				parameters.push(command.state);
				for (i = 0; i < command.arguments.length; ++i) {
					parameters.push(command.arguments[i]);
				}
				command.start.apply(command, parameters);
			}
			if (command.update != null) {
				state.currentCommandThread = scene.createCommandThread(command);
			} else {
				return true;
			}
		}
		return true;
	};
	
	this.enqueue = function(command)
	{
		this.currentQueue.push(command);
	};
	
	this.renderScene = function()
	{
		for (var iThread = 0; iThread < this.threads.length; ++iThread) {
			var renderer = this.threads[iThread].renderer;
			if (renderer != null) {
				renderer(this,this.threads[iThread].state);
			}
		}
	};
	
	this.updateScene = function()
	{
		for (var iThread = 0; iThread < this.threads.length; ++iThread) {
			var id = this.threads[iThread].id;
			var updater = this.threads[iThread].updater;
			var inputHandler = this.threads[iThread].inputHandler;
			var state = this.threads[iThread].state;
			if (updater == null) continue;
			if (!updater(this, state)) {
				if (this.focusThread == id) {
					this.focusThread = this.focusThreadStack.pop();
				}
				this.threads.splice(iThread, 1);
				--iThread; continue;
			}
			if (this.focusThread == id) {
				inputHandler(this, state);
			}
		}
	};
	
	this.currentQueue = [];
	this.queues = [];
	this.threads = [];
	this.nextThreadID = 1;
	this.focusThreadStack = [];
	this.focusThread = 0;
	this.forkThreadLists = [];
	this.currentForkThreadList = [];
	this.fadeMask = CreateColor(0, 0, 0, 0);
	this.isRunning = false;
}

// .beginFork() method
// Forks the timeline.
Scenario.prototype.beginFork = function()
{
	this.forkThreadLists.push(this.currentForkThreadList);
	this.currentForkThreadList = [];
	this.queues.push(this.currentQueue);
	this.currentQueue = [];
	return this;
};

// .endFork() method
// Marks the end of a forked timeline.
Scenario.prototype.endFork = function()
{
	var threadList = this.currentForkThreadList;
	this.currentForkThreadList = this.forkThreadLists.pop();
	var parentThreadList = this.currentForkThreadList;
	var command = {
		state: {},
		arguments: [ parentThreadList, threadList, this.currentQueue ],
		start: function(scene, state, threads, subthreads, queue) {
			var forkThreadState = {
				scene:                scene,
				commandQueue:         queue,
				currentCommandThread: 0,
				forkThreads:          subthreads
			};
			var thread = scene.createForkThread(forkThreadState);
			threads.push(thread);
		}
	};
	this.currentQueue = this.queues.pop();
	this.enqueue(command);
	return this;
};

// .synchronize() method
// Suspends the current timeline until all its forks have finished executing.
Scenario.prototype.synchronize = function()
{
	var command = {};
	command.state = {};
	command.arguments = [ this.currentForkThreadList ];
	command.start = function(scene, state, subthreads) {
		state.subthreads = subthreads;
	};
	command.update = function(scene, state) {
		return state.subthreads.length != 0;
	};
	this.enqueue(command);
	return this;
};

// .run() method
// Runs the scenario.
Scenario.prototype.run = function()
{
	if (!IsMapEngineRunning()) {
		Abort("Scenario.execute():\nCannot execute a scenario without an active map engine.");
	}
	if (this.isRunning) {
		return;
	}
	this.synchronize();
	if (!IsCameraAttached()) {
		var oldCameraX = GetCameraX();
		var oldCameraY = GetCameraY();
		this.beginFork();
			this.panTo(oldCameraX, oldCameraY);
		this.endFork();
	} else {
		var oldCameraTarget = GetCameraPerson();
		this.beginFork();
			this.followPerson(oldCameraTarget);
		this.endFork();
	}
	this.beginFork();
		this.fadeTo(CreateColor(0, 0, 0, 0));
	this.endFork();
	this.frameRate = GetMapEngineFrameRate();
	var oldPC = IsInputAttached() ? GetInputPerson() : null;
	DetachInput();
	var oldFrameRate = GetFrameRate();
	SetFrameRate(this.frameRate);
	this.isRunning = true;
	var fadeRenderer = function(scene, state) {
		ApplyColorMask(scene.fadeMask);
	}
	var fadeThread = this.createThread(null, null, fadeRenderer, -1);
	var state = {
		currentCommandThread: 0,
		commandQueue:         this.currentQueue,
		forkThreads:          this.currentForkThreadList
	};
	var mainThread = this.createForkThread(state);
	while (this.isThreadRunning(mainThread)) {
		RenderMap();
		this.renderScene();
		FlipScreen();
		UpdateMapEngine();
		this.updateScene();
	}
	SetFrameRate(oldFrameRate);
	if (oldPC != null) AttachInput(oldPC);
	this.killThread(fadeThread);
	this.isRunning = false;
};

// Register predefined commands
Scenario.defineCommand("call", {
	start: function(scene, state, method, parameters) {
		method.apply(null, parameters);
	},
});

Scenario.defineCommand("facePerson", {
	start: function(scene, state, person, direction) {
		var faceCommand;
		switch (direction.toLowerCase()) {
			case "n": case "north":
				faceCommand = COMMAND_FACE_NORTH;
				break;
			case "ne": case "northeast":
				faceCommand = COMMAND_FACE_NORTHEAST;
				break;
			case "e": case "east":
				faceCommand = COMMAND_FACE_EAST;
				break;
			case "se": case "southeast":
				faceCommand = COMMAND_FACE_SOUTHEAST;
				break;
			case "s": case "south":
				faceCommand = COMMAND_FACE_SOUTH;
				break;
			case "sw": case "southwest":
				faceCommand = COMMAND_FACE_SOUTHWEST;
				break;
			case "w": case "west":
				faceCommand = COMMAND_FACE_WEST;
				break;
			case "nw": case "northwest":
				faceCommand = COMMAND_FACE_NORTHWEST;
				break;
			default:
				faceCommand = COMMAND_WAIT;
		}
		QueuePersonCommand(person, faceCommand, false);
	}
});

Scenario.defineCommand("fadeTo", {
	start: function(scene, state, color, duration) {
		if (duration === undefined) { duration = 250; }
		state.color = color;
		state.duration = duration;
		if (state.duration <= 0) scene.fadeMask = color;
		var multiplier = state.duration > 0 ? 1000 / state.duration : 0;
		var fadeFromRGBA = [ scene.fadeMask.red, scene.fadeMask.green, scene.fadeMask.blue, scene.fadeMask.alpha ];
		var fadeToRGBA = [ state.color.red, state.color.green, state.color.blue, state.color.alpha ];
		state.interval = [];
		for (var i = 0; i < fadeToRGBA.length; ++i) {
			state.interval[i] = multiplier * (fadeToRGBA[i] - fadeFromRGBA[i]) / scene.frameRate;
		}
	},
	update: function(scene, state) {
		var currentRGBA = [ scene.fadeMask.red, scene.fadeMask.green, scene.fadeMask.blue, scene.fadeMask.alpha ];
		var fadeToRGBA = [ state.color.red, state.color.green, state.color.blue, state.color.alpha ];
		var newMaskRGBA = [];
		for (var i = 0; i < fadeToRGBA.length; ++i) {
			var newValue = currentRGBA[i] + state.interval[i];
			if (newValue > fadeToRGBA[i] && state.interval[i] > 0.0) {
				newValue = fadeToRGBA[i];
			} else if (newValue < fadeToRGBA[i] && state.interval[i] < 0.0) {
				newValue = fadeToRGBA[i];
			}
			newMaskRGBA[i] = newValue;
		}
		scene.fadeMask = CreateColor(newMaskRGBA[0], newMaskRGBA[1], newMaskRGBA[2], newMaskRGBA[3]);
		return state.color.red != scene.fadeMask.red
			|| state.color.green != scene.fadeMask.green
			|| state.color.blue != scene.fadeMask.blue
			|| state.color.alpha != scene.fadeMask.alpha;
	}
});

Scenario.defineCommand("focusOnPerson", {
	start: function(scene, state, person, duration) {
		if (duration === undefined) { duration = 250; }
		DetachCamera();
		state.xTarget = GetPersonX(person);
		state.yTarget = GetPersonY(person);
		state.x = duration > 0 ? GetCameraX() : state.xTarget;
		state.y = duration > 0 ? GetCameraY() : state.yTarget;
		var multiplier = duration > 0 ? 1000 / duration : 0;
		state.xInterval = multiplier * ((state.xTarget - state.x) / scene.frameRate);
		state.yInterval = multiplier * ((state.yTarget - state.y) / scene.frameRate);
	},
	update: function(scene, state) {
		state.x += state.xInterval;
		if (state.x > state.xTarget && state.xInterval > 0) {
			state.x = state.xTarget;
		} else if (state.x < state.xTarget && state.yInterval < 0.0) {
			state.x = state.xTarget;
		}
		state.y += state.yInterval;
		if (state.y > state.yTarget && state.yInterval > 0) {
			state.y = state.yTarget;
		} else if (state.y < state.yTarget && state.yInterval < 0.0) {
			state.y = state.yTarget;
		}
		SetCameraX(state.x);
		SetCameraY(state.y);
		return state.x != state.xTarget || state.y != state.yTarget;
	}
});

Scenario.defineCommand("followPerson", {
	start: function(scene, state, person) {
		state.Person = person;
		state.XTarget = GetPersonX(state.Person);
		state.YTarget = GetPersonY(state.Person);
		state.X = GetCameraX();
		state.Y = GetCameraY();
		var PanDuration = 250;
		var Multiplier = 1000 / PanDuration;
		state.XInterval = Multiplier * ((state.XTarget - state.X) / scene.frameRate);
		state.YInterval = Multiplier * ((state.YTarget - state.Y) / scene.frameRate);
	},
	update: function(scene, state) {
		state.X += state.XInterval;
		if (state.X > state.XTarget && state.XInterval > 0) state.X = state.XTarget;
			else if (state.X < state.XTarget && state.XInterval < 0) state.X = state.XTarget;
		state.Y += state.YInterval;
		if (state.Y > state.YTarget && state.YInterval > 0) state.Y = state.YTarget;
			else if (state.Y < state.YTarget && state.YInterval < 0) state.Y = state.YTarget;
		SetCameraX(state.X); SetCameraY(state.Y);
		if (state.X == state.XTarget && state.Y == state.YTarget) {
			AttachCamera(state.Person);
			return false;
		}
		return true;
	}
});

Scenario.defineCommand("hidePerson", {
	start: function(scene, state, person) {
		SetPersonVisible(person, false);
		IgnorePersonObstructions(person, true);
	}
});

Scenario.defineCommand("killPerson", {
	start: function(scene, state, person) {
		DestroyPerson(person);
	}
});

Scenario.defineCommand("movePerson", {
	start: function(scene, state, person, direction, distance, speed, faceFirst) {
		if (faceFirst === undefined) { faceFirst = true };
		if (!isNaN(speed)) {
			speedVector = [ speed, speed ];
		} else {
			speedVector = speed;
		}
		state.person = person;
		state.oldSpeedVector = [ GetPersonSpeedX(person), GetPersonSpeedY(person) ];
		if (speedVector != null) {
			SetPersonSpeedXY(state.person, speedVector[0], speedVector[1]);
		} else {
			speedVector = state.oldSpeedVector;
		}
		var xMovement;
		var yMovement;
		var faceCommand;
		var stepCount;
		switch (direction) {
			case "n": case "north":
				faceCommand = COMMAND_FACE_NORTH;
				xMovement = COMMAND_WAIT;
				yMovement = COMMAND_MOVE_NORTH;
				stepCount = distance / speedVector[1];
				break;
			case "e": case "east":
				faceCommand = COMMAND_FACE_EAST;
				xMovement = COMMAND_MOVE_EAST;
				yMovement = COMMAND_WAIT;
				stepCount = distance / speedVector[0];
				break;
			case "s": case "south":
				faceCommand = COMMAND_FACE_SOUTH;
				xMovement = COMMAND_WAIT;
				yMovement = COMMAND_MOVE_SOUTH;
				stepCount = distance / speedVector[1];
				break;
			case "w": case "west":
				faceCommand = COMMAND_FACE_WEST;
				xMovement = COMMAND_MOVE_WEST;
				yMovement = COMMAND_WAIT;
				stepCount = distance / speedVector[0];
				break;
			default:
				faceCommand = COMMAND_WAIT;
				xMovement = COMMAND_WAIT;
				yMovement = COMMAND_WAIT;
				stepCount = 0;
		}
		if (faceFirst) {
			QueuePersonCommand(state.person, faceCommand, true);
		}
		for (iStep = 0; iStep < stepCount; ++iStep) {
			QueuePersonCommand(state.person, xMovement, true);
			QueuePersonCommand(state.person, yMovement, true);
			QueuePersonCommand(state.person, COMMAND_WAIT, false);
		}
		return true;
	},
	update: function(scene,state) {
		if (IsCommandQueueEmpty(state.person)) {
			SetPersonSpeedXY(state.person, state.oldSpeedVector[0], state.oldSpeedVector[1]);
			return false;
		}
		return true;
	}
});

Scenario.defineCommand("panTo", {
	start: function(scene, state, x, y, duration) {
		if (duration === undefined) { duration = 250; }
		state.targetXY = [ x, y ];
		DetachCamera();
		state.currentXY = duration != 0 ? [ GetCameraX(), GetCameraY() ] : state.targetXY;
		var multiplier = 1000 / duration;
		state.intervalXY = [];
		for (var i = 0; i < state.targetXY.length; ++i) {
			state.intervalXY[i] = multiplier * (state.targetXY[i] - state.currentXY[i]) / scene.frameRate;
		}
		return true;
	},
	update: function(scene, state) {
		for (var i = 0; i < state.targetXY.length; ++i) {
			state.currentXY[i] += state.intervalXY[i];
			if (state.currentXY[i] > state.targetXY[i] && state.intervalXY[i] > 0.0) {
				state.currentXY[i] = state.targetXY[i];
			} else if (state.currentXY[i] < state.targetXY[i] && state.intervalXY[i] < 0.0) {
				state.currentXY[i] = state.targetXY[i];
			}
		}
		SetCameraX(state.currentXY[0]);
		SetCameraY(state.currentXY[1]);
		return state.currentXY[0] != state.targetXY[0] || state.currentXY[1] != state.targetXY[1];
	}
});

Scenario.defineCommand("pause", {
	start: function(scene, state, duration) {
		state.endTime = duration + GetTime();
	},
	update: function(scene, state) {
		return GetTime() < state.endTime;
	}
});

Scenario.defineCommand("playSound", {
	start: function(scene, state, file) {
		state.sound = LoadSound(file);
		state.sound.play(false);
		return true;
	},
	update: function(scene, state) {
		return state.sound.isPlaying();
	}
});

Scenario.defineCommand("showPerson", {
	start: function(scene, state, person) {
		SetPersonVisible(person, true);
		IgnorePersonObstructions(person, false);
	}
});