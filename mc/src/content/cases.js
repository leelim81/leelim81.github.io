// The four worked cases, in the order the plan uses them.
import c1 from "./case1.js";
import c2 from "./case2.js";
import c3 from "./case3.js";
import c4 from "./case4.js";

export const CASES = [c1, c2, c3, c4];
export const caseById = (id) => CASES.find((c) => c.id === id);
