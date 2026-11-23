const KEY_LOCK_WORKLET_CODE = `
class ChronixKeyLockProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'active', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'pitchRatio', defaultValue: 1, minValue: 0.4, maxValue: 2.5, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.bufSize = 8192;
    this.bufL = new Float32Array(this.bufSize);
    this.bufR = new Float32Array(this.bufSize);
    this.writeIdx = 0;
    this.phase = 0;
    this.grainLen = 1536;
  }

  readSample(buf, delay) {
    let idx = this.writeIdx - delay;
    while (idx < 0) idx += this.bufSize;
    while (idx >= this.bufSize) idx -= this.bufSize;
    const i0 = Math.floor(idx) % this.bufSize;
    const i1 = (i0 + 1) % this.bufSize;
    const frac = idx - Math.floor(idx);
    return buf[i0] + (buf[i1] - buf[i0]) * frac;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length || !output || !output.length) return true;

    const inL = input[0];
    const inR = input.length > 1 ? input[1] : input[0];
    const outL = output[0];
    const outR = output.length > 1 ? output[1] : null;
    if (!inL || !outL) return true;

    const active = parameters.active[0] > 0.5;
    const ratio = parameters.pitchRatio[0];
    const bypass = !active || Math.abs(ratio - 1) <= 0.002;

    const len = inL.length;
    const grain = this.grainLen;
    const phaseStep = (1 - ratio) / grain;

    for (let i = 0; i < len; i++) {
      const sL = inL[i];
      const sR = inR ? inR[i] : sL;
      this.bufL[this.writeIdx] = sL;
      this.bufR[this.writeIdx] = sR;

      if (bypass) {
        outL[i] = sL;
        if (outR) outR[i] = sR;
      } else {
        const pA = this.phase;
        const pB = (pA + 0.5) % 1;
        const wA = 0.5 - 0.5 * Math.cos(2 * Math.PI * pA);
        const wB = 1 - wA;
        const dA = 32 + pA * grain;
        const dB = 32 + pB * grain;

        outL[i] = this.readSample(this.bufL, dA) * wA + this.readSample(this.bufL, dB) * wB;
        if (outR) {
          outR[i] = this.readSample(this.bufR, dA) * wA + this.readSample(this.bufR, dB) * wB;
        }
        this.phase += phaseStep;
        if (this.phase >= 1) this.phase -= 1;
        if (this.phase < 0) this.phase += 1;
      }

      this.writeIdx = (this.writeIdx + 1) % this.bufSize;
    }

    return true;
  }
}
registerProcessor('chronix-keylock-processor', ChronixKeyLockProcessor);
`;

const registeredContexts = new WeakSet<AudioContext>();
const loadingContexts = new WeakMap<AudioContext, Promise<boolean>>();

export function ensureKeyLockWorkletLoaded(ctx: AudioContext): Promise<boolean> {
  if (registeredContexts.has(ctx)) return Promise.resolve(true);
  const existing = loadingContexts.get(ctx);
  if (existing) return existing;
  if (!ctx.audioWorklet) return Promise.resolve(false);

  const blob = new Blob([KEY_LOCK_WORKLET_CODE], {type: 'application/javascript'});
  const url = URL.createObjectURL(blob);
  const prom = ctx.audioWorklet
    .addModule(url)
    .then(() => {
      registeredContexts.add(ctx);
      URL.revokeObjectURL(url);
      return true;
    })
    .catch(() => {
      URL.revokeObjectURL(url);
      return false;
    });

  loadingContexts.set(ctx, prom);
  return prom;
}

export interface KeyLockInsert {
  input: GainNode;
  output: GainNode;
  setParams: (active: boolean, pitchRatio: number, atTime: number) => void;
}

export function createKeyLockInsert(ctx: AudioContext): KeyLockInsert {
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.connect(output);

  let workletNode: AudioWorkletNode | null = null;
  let desiredActive = false;
  let desiredRatio = 1;

  void ensureKeyLockWorkletLoaded(ctx).then((ok) => {
    if (!ok) return;
    try {
      const node = new AudioWorkletNode(ctx, 'chronix-keylock-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      input.disconnect();
      input.connect(node);
      node.connect(output);
      workletNode = node;
      applyNow(desiredActive, desiredRatio, ctx.currentTime);
    } catch {
      // Safe fallback remains wired via input -> output
    }
  });

  const applyNow = (active: boolean, pitchRatio: number, atTime: number) => {
    desiredActive = active;
    desiredRatio = Math.max(0.4, Math.min(2.5, pitchRatio));
    if (!workletNode) return;
    const pActive = workletNode.parameters.get('active');
    const pRatio = workletNode.parameters.get('pitchRatio');
    pActive?.setValueAtTime(active ? 1 : 0, atTime);
    pRatio?.setValueAtTime(desiredRatio, atTime);
  };

  return {
    input,
    output,
    setParams: applyNow,
  };
}
