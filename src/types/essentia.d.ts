declare module 'essentia.js' {
  export const EssentiaWASM: any
  export class Essentia {
    constructor(wasmModule: any)
    arrayToVector(array: Float32Array): any
    PercivalBpmEstimator(signal: any, ...args: any[]): { bpm: number }
  }
}

declare module 'audio-decode' {
  function decode(buffer: Buffer | ArrayBuffer): Promise<any>
  export default decode
}
