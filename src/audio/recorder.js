// Records everything coming out of the speakers into a compressed audio file.

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

export function recordingSupported() {
  return typeof window !== 'undefined' && 'MediaRecorder' in window;
}

function pickType() {
  return TYPES.find((t) => window.MediaRecorder.isTypeSupported?.(t)) || '';
}

export function extensionFor(mime) {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export class Recorder {
  constructor(engine) {
    this.engine = engine;
    this.media = null;
    this.chunks = [];
    this.startedAt = 0;
  }

  get recording() {
    return this.media?.state === 'recording';
  }

  start() {
    const stream = this.engine.getRecordStream();
    if (!stream) throw new Error('Recording is not supported in this browser.');
    const mimeType = pickType();
    this.chunks = [];
    this.media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.media.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.media.start(250);
    this.startedAt = performance.now();
  }

  /** Resolves with { blob, url, mime, seconds }. */
  stop() {
    return new Promise((resolve) => {
      const media = this.media;
      if (!media || media.state === 'inactive') {
        resolve(null);
        return;
      }
      media.onstop = () => {
        const mime = media.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mime });
        const seconds = (performance.now() - this.startedAt) / 1000;
        resolve({ blob, url: URL.createObjectURL(blob), mime, seconds });
      };
      media.stop();
    });
  }
}
