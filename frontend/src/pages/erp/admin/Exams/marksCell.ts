// Marks-entry cell parsing shared by the teacher and admin exam grids. A cell holds either
// a number or "AB" (absent, case-insensitive).

export const isAbsentText = (value: string) => value.trim().toUpperCase() === "AB";

// Returns an error message for an invalid cell, or null when it can be saved.
export const validateMarksCell = (marks: string, max: string): string | null => {
  const maxNum = Number(max);
  if (max.trim() === "" || !Number.isFinite(maxNum) || maxNum <= 0) return "Max marks must be a number above 0";
  if (isAbsentText(marks)) return null;
  const obtained = Number(marks);
  if (marks.trim() === "" || !Number.isFinite(obtained)) return 'Marks must be a number, or "AB" for absent';
  if (obtained < 0 || obtained > maxNum) return `Marks must be between 0 and ${maxNum}`;
  return null;
};
