// Quick-pick emoji built with String.fromCodePoint so this file stays
// pure ASCII (unicode escapes and literals do not survive the toolchain).
// thumbs-up, red heart, laugh, surprised, crying, pray, party, thumbs-down.

export const QUICK_REACTIONS = [
  String.fromCodePoint(0x1f44d),
  String.fromCodePoint(0x2764, 0xfe0f),
  String.fromCodePoint(0x1f602),
  String.fromCodePoint(0x1f62e),
  String.fromCodePoint(0x1f622),
  String.fromCodePoint(0x1f64f),
  String.fromCodePoint(0x1f389),
  String.fromCodePoint(0x1f44e),
]
