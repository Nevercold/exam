import { describe, expect, it } from 'vitest'
import { ihkGrade } from '../shared/utils/grade-key'

describe('ihkGrade', () => {
  it('maps the IHK boundaries', () => {
    const grades = [100, 92, 91.9, 81, 80.9, 67, 66.9, 50, 49.9, 30, 29.9, 0].map(p => ihkGrade(p, 100)?.grade)
    expect(grades).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6])
  })

  it('works on points, not only percent', () => {
    expect(ihkGrade(17, 20)).toEqual({ grade: 2, label: 'gut' })
    expect(ihkGrade(23, 25)).toEqual({ grade: 1, label: 'sehr gut' })
  })

  it('has no grade without a maximum', () => {
    expect(ihkGrade(5, 0)).toBeNull()
    expect(ihkGrade(null, 20)).toBeNull()
  })
})
