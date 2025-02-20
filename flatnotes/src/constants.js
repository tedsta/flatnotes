// Base Paths
export const basePaths = {
  home: `${window.flatnotesRootPath}/`,
  login: `${window.flatnotesRootPath}/login`,
  note: `${window.flatnotesRootPath}/note`,
  search: `${window.flatnotesRootPath}/search`,
  new: `${window.flatnotesRootPath}/new`,
};

// Params
export const params = {
  searchTerm: "term",
  redirect: "redirect",
  showHighlights: "showHighlights",
  sortBy: "sortBy",
};

// Other
export const alphabet = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

export const searchSortOptions = { score: 0, title: 1, lastModified: 2 };

export const authTypes = {
  none: "none",
  readOnly: "read_only",
  password: "password",
  totp: "totp",
};
