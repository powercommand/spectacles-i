/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *           Copyright (c) 2015 Power-Command
***/

function SpecsClient(hostname, person)
{
	this.socket = new Socket(hostname, 812);
	this.person = person;
	this.isReady = false;
	terminal.log("Connecting to person server at " + hostname + ":812");
	threads.create(this);
}

SpecsClient.prototype.update = function()
{
	if (!this.socket.connected)
		return true;
	
	var pendingBytes = this.socket.getPendingReadSize();
	if (pendingBytes > 0) {
		lines = this.socket.readString(pendingBytes).split('\n');
		for (var i = 0; i < lines.length; ++i) {
			if (lines[i] == 'specs client?') {
				this.socket.write('specs client.\nperson-id ' + this.person);
				terminal.log("Successfully connected to person server");
				terminal.log("Now controlling '" + this.person + "' remotely");
				this.isReady = true;
				this.lastX = GetPersonX(this.person);
				this.lastY = GetPersonY(this.person);
			}
		}
	}
	if (this.isReady) {
		if (GetPersonY(this.person) < this.lastY)
			this.socket.write('n\n');
		if (GetPersonX(this.person) > this.lastX)
			this.socket.write('e\n');
		if (GetPersonY(this.person) > this.lastY)
			this.socket.write('s\n');
		if (GetPersonX(this.person) < this.lastX)
			this.socket.write('w\n');
		this.lastX = GetPersonX(this.person);
		this.lastY = GetPersonY(this.person);
	}
	return true;
}
