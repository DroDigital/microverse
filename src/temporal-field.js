// The modified temporal field. Inside it, one tick of outside time carries
// `dilation` years of inside time. The field can't change rate instantly: it
// slews toward its target by at most `slew` (a multiplicative factor) per
// tick, so the interior sees a smooth acceleration or braking of time.

export const TICKS_PER_SECOND = 60; // outside clock: 60 ticks = 1 second

export class TemporalField {
  constructor({ dilation = 1, slew = 1.25, min = 1e-3, max = 1e10 } = {}) {
    if (!(slew > 1)) throw new RangeError('slew must be greater than 1');
    this.min = min;
    this.max = max;
    this.slew = slew;
    this.dilation = this.clamp(dilation);
    this.target = this.dilation;
    this.ticks = 0;
    this.interiorYears = 0;
  }

  clamp(d) {
    return Math.min(this.max, Math.max(this.min, d));
  }

  setTarget(yearsPerTick) {
    this.target = this.clamp(yearsPerTick);
  }

  get settled() {
    return this.dilation === this.target;
  }

  // Outside time elapsed, in seconds.
  get exteriorSeconds() {
    return this.ticks / TICKS_PER_SECOND;
  }

  // Interior years per exterior second at the current setting.
  get yearsPerSecond() {
    return this.dilation * TICKS_PER_SECOND;
  }

  // Advance one tick. Returns the interior years that elapsed during it.
  tick() {
    const dt = this.dilation;
    this.ticks += 1;
    this.interiorYears += dt;
    if (this.dilation < this.target) {
      this.dilation = Math.min(this.target, this.dilation * this.slew);
    } else if (this.dilation > this.target) {
      this.dilation = Math.max(this.target, this.dilation / this.slew);
    }
    return dt;
  }
}
