// Split a chord length (in beats of the meter's denominator) into notatable values.
const VALUES = [
  { len: 16, vex: 'w', type: 'whole', dots: 0 },
  { len: 12, vex: 'h', type: 'half', dots: 1 },
  { len: 8, vex: 'h', type: 'half', dots: 0 },
  { len: 6, vex: 'q', type: 'quarter', dots: 1 },
  { len: 4, vex: 'q', type: 'quarter', dots: 0 },
  { len: 3, vex: '8', type: 'eighth', dots: 1 },
  { len: 2, vex: '8', type: 'eighth', dots: 0 },
  { len: 1, vex: '16', type: '16th', dots: 0 },
];

/** @returns {{len:number, vex:string, type:string, dots:number}[]} lengths in 16th notes */
export function splitDuration(beats, denominator) {
  let remaining = Math.round((beats * 16) / denominator);
  const out = [];
  while (remaining > 0) {
    const v = VALUES.find((x) => x.len <= remaining) || VALUES[VALUES.length - 1];
    out.push(v);
    remaining -= v.len;
  }
  return out;
}
