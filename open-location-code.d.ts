declare module 'open-location-code' {
  export class OpenLocationCode {
    decode(code: string): { latitudeCenter: number; longitudeCenter: number };
    recoverNearest(
      shortCode: string,
      latitude: number,
      longitude: number
    ): string;
  }
}
