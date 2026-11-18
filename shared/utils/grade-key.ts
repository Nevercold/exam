// IHK 100-point grade key. Percent is not rounded first: 91.9 % is still a 2.
const IHK_KEY: { min: number, grade: number, label: string }[] = [
  { min: 92, grade: 1, label: 'sehr gut' },
  { min: 81, grade: 2, label: 'gut' },
  { min: 67, grade: 3, label: 'befriedigend' },
  { min: 50, grade: 4, label: 'ausreichend' },
  { min: 30, grade: 5, label: 'mangelhaft' },
  { min: 0, grade: 6, label: 'ungenügend' },
]

/** IHK grade for points out of a maximum; null without a maximum. */
export function ihkGrade(total: number | null | undefined, max: number | null | undefined) {
  if (total == null || !max) return null
  const percent = total / max * 100
  const { grade, label } = IHK_KEY.find(k => percent >= k.min) ?? IHK_KEY.at(-1)!
  return { grade, label }
}
