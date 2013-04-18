/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *           Copyright (C) 2012 Power-Command
***/

RequireScript("lib/MultiDelegate.js");

// Threads object
// Represents the thread manager.
Threads = new (function()
{
	// .create() method
	// Creates a thread and begins running it.
	// Arguments:
	//     o:            The object to pass as 'this' to the updater/renderer/input handler. May be null.
	//     updater:      The update function for the new thread.
	//     renderer:     Optional. The render function for the new thread.
	//     inputHandler: Optional. The input handler for the new thread.
	//     priority:     Optional. The render priority for the new thread. Higher-priority threads are rendered
	//                   later in a frame than lower-priority ones.
	//                   (Defaults to 0. Ignored if no renderer is provided.)
	this.create = function(o, updater, renderer, inputHandler, priority)
	{
		if (renderer === undefined) { renderer = null; }
		if (inputHandler === undefined) { inputHandler = null; }
		if (priority === undefined) { priority = 0; }
		
		var updateDelegate = new MultiDelegate();
		updateDelegate.add(o, updater);
		var renderDelegate = new MultiDelegate();
		if (renderer !== null)
		{
			renderDelegate.add(o, renderer);
		}
		var checkInputDelegate = new MultiDelegate();
		if (inputHandler !== null) {
			checkInputDelegate.add(o, inputHandler);
		}
		var newThread =
		{
			id: this.nextThreadID,
			updater: updateDelegate,
			renderer: renderDelegate,
			inputHandler: checkInputDelegate,
			priority: priority,
			isUpdating: false
		};
		this.threads.push(newThread);
		this.threads.sort(function(a, b) { return a.priority - b.priority; });
		++this.nextThreadID;
		return newThread.id;
	};
	
	// .createEntityThread() method
	// Creates a thread for a specified entity.
	// Arguments:
	//     entity:   The entity for which to create the thread. This should be an object having .update() and
	//               optionally, .render() and .checkInput() methods. Each of these will be called once
	//               per frame until the thread either finishes (entity.update() returns false) or is terminated.
	//     priority: Optional. The render priority for the new thread. Higher-priority threads are rendered
	//               later in a frame than lower-priority ones.
	//               (Defaults to 0. Ignored if no renderer is provided.)
	this.createEntityThread = function(entity, priority)
	{
		if (priority === undefined) { priority = 0; }
		
		var updater = entity.update;
		var renderer = (typeof entity.render === 'function') ? entity.render : null;
		var inputHandler = (typeof entity.checkInput === 'function') ? entity.checkInput : null;
		return this.create(entity, updater, renderer, inputHandler, priority);
	};
	
	// .doWith() method
	// Creates an impromptu thread and runs it to completion.
	// Arguments:
	//     o:        The object to pass as 'this' to the updater/renderer.
	//     updater:  The update function for the new thread.
	//     renderer: Optional. The render function for the new thread.
	//     priority: Optional. The render priority for the new thread. Higher-priority threads are rendered
	//               later in a frame than lower-priority ones.
	//               (Defaults to 0. Ignored if no renderer is provided.)
	// Remarks:
	//     .doWith() will not return as long as the thread it creates remains running.
	this.doWith = function(o, updater, renderer, priority)
	{
		var updateDelegate = new MultiDelegate();
		updateDelegate.add(o, updater);
		var renderDelegate = new MultiDelegate();
		if (renderer !== null)
		{
			renderDelegate.add(o, renderer);
		}
		var checkInputDelegate = new MultiDelegate();
		var newThread =
		{
			id: this.nextThreadID,
			updater: updateDelegate,
			renderer: renderDelegate,
			inputHandler: checkInputDelegate,
			priority: priority,
			isUpdating: false
		};
		this.threads.push(newThread);
		this.threads.sort(function(a, b) { return a.priority - b.priority; });
		++this.nextThreadID;
		this.waitOn(newThread.id);
	};
	
	// .isRunning() method
	// Determines whether a thread is still running.
	// Arguments:
	//     threadID: The ID of the thread to check.
	this.isRunning = function(threadID)
	{
		if (threadID === 0)
		{
			return false;
		}
		for (var i = 0; i < this.threads.length; ++i)
		{
			if (this.threads[i].id == threadID)
			{
				return true;
			}
		}
		return false;
	};
	
	// .kill() method
	// Prematurely terminates a thread.
	// Arguments:
	//     threadID: The ID of the thread to terminate.
	this.kill = function(threadID)
	{
		for (var i = 0; i < this.threads.length; ++i)
		{
			if (threadID == this.threads[i].id)
			{
				this.threads.splice(i,1);
				--i;
				continue;
			}
		}
	};
	
	// .renderAll() method
	// Renders the current frame by calling all active threads' renderers.
	this.renderAll = function()
	{
		for (var i = 0; i < this.threads.length; ++i)
		{
			this.threads[i].renderer.invoke();
		}
	};
	
	// .updateAll() method
	// Calls all active threads' updaters to prepare for the next frame.
	this.updateAll = function()
	{
		for (var i = 0; i < this.threads.length; ++i)
		{
			var thread = this.threads[i];
			thread.inputHandler.invoke();
			var stillRunning = true;
			if (!thread.isUpdating)
			{
				thread.isUpdating = true;
				stillRunning = thread.updater.invoke();
				thread.isUpdating = false;
			}
			if (!stillRunning)
			{
				this.threads.splice(i, 1);
				--i;
				continue;
			}
		}
	};
	
	// .waitFor() method
	// Waits for a thread to terminate.
	// Arguments:
	//     threadID: The ID of the thread to wait for.
	this.waitFor = function(threadID)
	{
		while (this.isRunning(threadID))
		{
			this.renderAll();
			FlipScreen();
			this.updateAll();
		}
	};
	
	
	this.nextThreadID = 1;
	this.threads = [];
})();