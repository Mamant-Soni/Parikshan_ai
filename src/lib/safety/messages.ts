/**
 * Builds the text a user may copy or open in their own messaging app. The site
 * never sends this text. Coordinates are rounded to 3 decimal places (about
 * 110 m) so the page does not expose a more precise location than needed.
 */

export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function mapsLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${roundCoordinate(lat).toFixed(3)},${roundCoordinate(lng).toFixed(3)}`;
}

export function buildLocationMessage(input: {
  name: string;
  lat: number;
  lng: number;
  fixTime: string; // already-formatted local time, shown to the user
  items: { label: string; value: string }[];
}): string {
  const lines = [
    `Hi, this is ${input.name} (sent by hand from my Parikshan account).`,
    `I may need help. My approximate location at ${input.fixTime}:`,
    mapsLink(input.lat, input.lng),
  ];
  if (input.items.length > 0) {
    lines.push("", "Health details I chose to share:");
    for (const item of input.items) lines.push(`- ${item.label}: ${item.value}`);
  }
  return lines.join("\n");
}
