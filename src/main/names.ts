const WORDS = [
  "otter", "lynx", "heron", "marlin", "falcon", "bison", "corgi", "gecko", "ibis", "koala",
  "lemur", "manta", "narwhal", "ocelot", "puffin", "quokka", "raven", "seal", "tapir", "urchin",
  "viper", "walrus", "yak", "zebra", "badger", "cobra", "dingo", "egret", "ferret", "gopher",
  "hare", "jackal", "kestrel", "loris", "moose", "newt", "osprey", "panda", "robin", "shrew",
  "toucan", "vole", "wren", "beaver", "crane", "dolphin", "finch", "gull", "hawk", "iguana",
  "basil", "cedar", "clover", "fennel", "ginger", "hazel", "ivy", "juniper", "laurel", "maple",
  "nettle", "olive", "poppy", "reed", "sage", "thistle", "willow", "aspen", "birch", "fern",
  "lotus", "myrtle", "orchid", "pine", "rose", "spruce", "teak", "violet", "yarrow", "acacia",
  "amber", "beryl", "citrine", "coral", "garnet", "indigo", "jade", "jasper", "lapis", "onyx",
  "opal", "pearl", "quartz", "ruby", "sable", "topaz", "zircon", "agate", "flint", "slate",
  "cobalt", "copper", "nickel", "carbon", "argon", "helium", "neon", "xenon", "iron", "zinc",
  "basalt", "granite", "marble", "pumice", "gypsum", "chalk", "shale", "ember", "cinder", "ash",
  "delta", "dune", "fjord", "glacier", "harbor", "isle", "lagoon", "mesa", "oasis", "prairie",
  "reef", "summit", "tundra", "valley", "canyon", "cove", "geyser", "ridge", "brook", "meadow",
  "comet", "nova", "orbit", "pulsar", "quasar", "nebula", "cosmos", "zenith", "aurora", "eclipse",
  "anchor", "beacon", "compass", "torch", "lantern", "prism", "quill", "ripple", "signal", "vector",
];

export function generateWorktreeName(taken: (name: string) => boolean): string {
  const pool = WORDS.filter((w) => !taken(w));
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)]!;
  for (let n = 2; ; n++) {
    for (const w of WORDS) {
      const candidate = `${w}-${n}`;
      if (!taken(candidate)) return candidate;
    }
  }
}
