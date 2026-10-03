declare module 'zzfx' {
  export type ZzfxParams = (number | undefined)[];
  export const ZZFX: {
    volume: number;
    sampleRate: number;
    audioContext: AudioContext;
    buildSamples(...params: ZzfxParams): number[];
    playSamples(
      channels: number[][],
      volumeScale?: number,
      rate?: number,
      pan?: number,
      loop?: boolean,
    ): AudioBufferSourceNode;
  };
  export function zzfx(...params: ZzfxParams): AudioBufferSourceNode;
}
