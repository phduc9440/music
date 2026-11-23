class StudioMicCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.stopping = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'stop') {
        this.stopping = true;
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  process(inputs, outputs) {
    for (const channel of outputs[0] || []) channel.fill(0);
    if (!this.stopping) {
      const input = inputs[0] && inputs[0][0];
      if (input && input.length > 0) {
        const samples = input.slice();
        this.port.postMessage(samples, [samples.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('studio-mic-capture', StudioMicCaptureProcessor);
