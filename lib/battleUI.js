/***
 * Specs Engine v6: Spectacles Saga Game Engine
  *           Copyright (C) 2017 Power-Command
***/

import * as prim from 'prim';

export
class HPGauge
{
	constructor(capacity, sectorSize = 100, color = Color.Chartreuse, maxSectors = null)
	{
		this.borderColor = Color.Black.fade(color.a);
		this.capacity = capacity;
		this.colorFadeDuration = 0;
		this.colorFadeTimer = 0;
		this.damage = 0;
		this.damageColor = new Color(0.75, 0.0, 0.0, color.a);
		this.damageFadeness = 1.0;
		this.drainSpeed = 2.0;
		this.emptyColor = new Color(0.125, 0.125, 0.125, color.a);
		this.fadeSpeed = 0.0;
		this.fadeness = 1.0;
		this.hpColor = color.clone();
		this.isVisible = true;
		this.maxSectors = maxSectors;
		this.newColor = color;
		this.newReading = this.capacity;
		this.numCombosRunning = 0;
		this.oldColor = color;
		this.oldReading = this.capacity;
		this.reading = this.capacity;
		this.sectorSize = sectorSize;
	}

	beginCombo()
	{
		++this.numCombosRunning;
	}

	changeColor(color, numFrames = 0)
	{
		this.oldColor = this.hpColor.clone();
		this.newColor = color.clone();
		if (numFrames != 0) {
			this.colorFadeDuration = numFrames;
			this.colorFadeTimer = 0;
		} else {
			this.hpColor = this.newColor;
		}
	}

	draw(x, y, width, height)
	{
		if (this.fadeness >= 1.0)
			return;  // invisible, skip rendering
		var damageShown = Math.max(this.damage - (this.reading - this.newReading), 0);
		var numReserves = Math.ceil(this.capacity / this.sectorSize - 1);
		var numReservesFilled = Math.max(Math.ceil(this.reading / this.sectorSize - 1), 0);
		var numReservesDamaged = Math.ceil((damageShown + this.reading) / this.sectorSize - 1);
		var barInUse;
		if (numReservesFilled == numReserves) {
			barInUse = this.capacity % this.sectorSize;
			if (barInUse == 0) {
				barInUse = this.sectorSize;
			}
		} else {
			barInUse = this.sectorSize;
		}
		var barFilled = this.reading % this.sectorSize;
		if (barFilled == 0 && this.reading > 0) {
			barFilled = barInUse;
		}
		var barDamaged = Math.min(damageShown, this.sectorSize - barFilled);
		var barHeight = Math.ceil(height * 0.5 + 0.5);
		var widthInUse = Math.round((width - 2) * barInUse / this.sectorSize);
		var fillWidth = Math.ceil(widthInUse * barFilled / barInUse);
		var damageWidth = Math.ceil(widthInUse * (barFilled + barDamaged) / barInUse) - fillWidth;
		var emptyWidth = widthInUse - (fillWidth + damageWidth);
		var borderColor = fadeColor(this.borderColor, this.fadeness);
		var fillColor = fadeColor(this.hpColor, this.fadeness);
		var emptyColor = fadeColor(this.emptyColor, this.fadeness);
		var usageColor = Color.mix(emptyColor, fadeColor(this.damageColor, this.fadeness), this.damageFadeness, 1.0 - this.damageFadeness);
		if (barInUse < this.sectorSize && numReservesFilled > 0) {
			prim.lineRect(screen, x, y, width, barHeight, 1, Color.mix(borderColor, Color.Transparent, 25, 75));
			drawSegment(x + 1, y + 1, width - 2, barHeight - 2, Color.mix(fillColor, Color.Transparent, 25, 75));
		}
		var barEdgeX = x + width - 1;
		prim.lineRect(screen, barEdgeX - widthInUse - 1, y, widthInUse + 2, barHeight, 1, borderColor);
		drawSegment(barEdgeX - fillWidth, y + 1, fillWidth, barHeight - 2, fillColor);
		drawSegment(barEdgeX - fillWidth - damageWidth, y + 1, damageWidth, barHeight - 2, usageColor);
		drawSegment(barEdgeX - fillWidth - damageWidth - emptyWidth, y + 1, emptyWidth, barHeight - 2, emptyColor);
		var slotYSize = height - barHeight + 1;
		var slotXSize = this.maxSectors !== null ? Math.ceil(width / (this.maxSectors - 1)) : Math.round(slotYSize * 1.25);
		var slotX;
		var slotY = y + height - slotYSize;
		for (var i = 0; i < numReserves; ++i) {
			var color;
			if (i < numReservesFilled) {
				color = fillColor;
			} else if (i < numReservesDamaged) {
				color = usageColor;
			} else {
				color = emptyColor;
			}
			slotX = x + (width - slotXSize) - i * (slotXSize - 1);
			prim.lineRect(screen, slotX, slotY, slotXSize, slotYSize, 1, borderColor);
			drawSegment(slotX + 1, slotY + 1, slotXSize - 2, slotYSize - 2, color);
		}
	}

	endCombo()
	{
		--this.numCombosRunning;
		if (this.numCombosRunning < 0) {
			this.numCombosRunning = 0;
		}
	}

	hide(duration = 0.0)
	{
		if (duration > 0.0) {
			this.fadeSpeed = 1.0 / duration * (1.0 - this.fadeness);
		} else {
			this.fadeSpeed = 0.0;
			this.fadeness = 1.0;
		}
	}

	set(value)
	{
		value = Math.min(Math.max(Math.round(value), 0), this.capacity);
		if (value != this.reading) {
			if (this.numCombosRunning > 0)
				this.damage += this.reading - value;
			else
				this.damage = this.reading - value;
			this.damageFadeness = 0.0;
			this.oldReading = this.reading;
			this.newReading = value;
			this.drainTimer = 0.0;
		}
	}

	show(duration = 0.0)
	{
		if (duration > 0.0) {
			this.fadeSpeed = 1.0 / duration * (0.0 - this.fadeness);
		} else {
			this.fadeSpeed = 0.0;
			this.fadeness = 0.0;
		}
	}

	update()
	{
		++this.colorFadeTimer;
		if (this.colorFadeDuration != 0 && this.colorFadeTimer < this.colorFadeDuration) {
			this.hpColor.r = tween(this.oldColor.r, this.colorFadeTimer, this.colorFadeDuration, this.newColor.r);
			this.hpColor.g = tween(this.oldColor.g, this.colorFadeTimer, this.colorFadeDuration, this.newColor.g);
			this.hpColor.b = tween(this.oldColor.b, this.colorFadeTimer, this.colorFadeDuration, this.newColor.b);
			this.hpColor.a = tween(this.oldColor.a, this.colorFadeTimer, this.colorFadeDuration, this.newColor.a);
		} else {
			this.hpColor = this.newColor;
			this.colorFadeDuration = 0;
		}
		this.fadeness = Math.min(Math.max(this.fadeness + this.fadeSpeed / screen.frameRate, 0.0), 1.0);
		this.drainTimer += 1.0 / this.drainSpeed / screen.frameRate;
		if (this.newReading != this.reading && this.drainTimer < 0.25) {
			this.reading = Math.round(tween(this.oldReading, this.drainTimer, 0.25, this.newReading));
		} else {
			this.reading = this.newReading;
		}
		if (this.numCombosRunning <= 0 && this.reading == this.newReading) {
			this.damageFadeness += 1.0 / screen.frameRate;
			if (this.damageFadeness >= 1.0) {
				this.damage = 0;
				this.damageFadeness = 1.0;
			}
		}
	}
}

export
class MPGauge
{
	constructor(capacity, color = Color.DodgerBlue, font = Font.Default) {
		this.color = color;
		this.textFont = font;
		
		this.animation = null;
		this.capacity = capacity;
		this.reading = capacity;
		this.usage = 0;
		this.usageColor = Color.Transparent;
		this.value = capacity;
	}

	draw(x, y, size)
	{
		screen.clipTo(x, y, size, size);
		if (this.capacity > 0) {
			var innerFillColor = this.color;
			var outerFillColor = Color.mix(this.color, Color.Black.fade(this.color.a));
			var outerUsageColor = this.usageColor;
			var innerUsageColor = Color.mix(this.usageColor, Color.Black.fade(this.usageColor.a));
			var maxRadius = Math.ceil(size * Math.sqrt(2) / 2);
			prim.circle(screen, x + size / 2, y + size / 2, maxRadius * (this.reading + this.usage) / this.capacity, innerUsageColor, outerUsageColor);
			prim.circle(screen, x + size / 2, y + size / 2, maxRadius * this.reading / this.capacity, innerFillColor, outerFillColor);
			drawText(this.textFont, x + size - 21, y + size / 2 - 8, 1, Color.White, Math.round(this.reading), 'right');
			drawText(this.textFont, x + size - 20, y + size / 2 - 4, 1, new Color(1, 0.75, 0), "MP");
		}
		screen.clipTo(0, 0, screen.width, screen.height);
	}

	set(value)
	{
		value = Math.min(Math.max(value, 0), this.capacity);
		if (value != this.value) {
			if (this.animation != null) {
				this.animation.stop();
			}
			this.animation = new scenes.Scene()
				.fork()
					.tween(this, 15, 'easeInOutSine', { usage: this.reading - value })
				.end()
				.fork()
					.tween(this, 15, 'easeInOutSine', { reading: value })
				.end()
				.tween(this.usageColor, 6, 'easeInOutSine', this.color)
				.tween(this.usageColor, 30, 'easeInOutSine', Color.Transparent)
				.run();
		}
		this.value = value;
	}

	update()
	{
		if (this.animation != null && !this.animation.isRunning()) {
			this.usage = 0;
		}
	}
}

function drawSegment(x, y, width, height, color)
{
	var halfHeight = Math.ceil(height / 2);
	var dimColor = Color.mix(color, Color.Black.fade(color.a), 66, 33);
	var yHalf = y + Math.floor(height / 2);
	prim.rect(screen, x, y, width, halfHeight, dimColor, dimColor, color, color);
	prim.rect(screen, x, yHalf, width, halfHeight, color, color, dimColor, dimColor);
};

function drawText(font, x, y, shadowDistance, color, text, alignment = 'left')
{
	const Align = {
		left(font, x, text) { return x; },
		center(font, x, text) { return x - font.getTextSize(text).width / 2; },
		right(font, x, text) { return x - font.getTextSize(text).width; }
	};

	if (!(alignment in Align))
		throw new Error(`invalid text alignment '${alignment}'.`);
	x = Align[alignment](font, x, text);
	font.drawText(screen, x + shadowDistance, y + shadowDistance, text, Color.Black.fade(color.a));
	font.drawText(screen, x, y, text, color);
}

function fadeColor(color, fadeness)
{
	return color.fade(1.0 - fadeness);
}

function tween(start, time, duration, end)
{
	return -(end - start) / 2 * (Math.cos(Math.PI * time / duration) - 1) + start;
}