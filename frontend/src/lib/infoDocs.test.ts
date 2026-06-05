import { describe, expect, it } from 'vitest'
import { docGroup, docTitle, groupDocs } from './infoDocs'

describe('docTitle', () => {
  it('turns a filename into a readable title, keeping NATO codes', () => {
    // Trailing lowercase "ajp" title-cases to "Ajp"; the leading all-caps "AJP" stays "AJP".
    expect(docTitle('AJP_4_6_C1_2018_doctrine_nato_joint_logistic_support_group_ajp.pdf')).toBe(
      'AJP 4 6 C1 2018 Doctrine Nato Joint Logistic Support Group Ajp',
    )
    expect(docTitle('AJP_4_B1_2025_with_UK_NE.pdf')).toBe('AJP 4 B1 2025 With UK NE')
  })
})

describe('docGroup', () => {
  it('groups AJP docs as doctrine and the rest as other', () => {
    expect(docGroup('AJP_4_4_C1_2022_Movement_UK.pdf')).toBe('NATO logistics doctrine (AJP)')
    expect(docGroup('some_other_brief.pdf')).toBe('Other documents')
  })
})

describe('groupDocs', () => {
  it('builds grouped, url-bearing, sorted entries', () => {
    const groups = groupDocs([
      'AJP_4_4_C1_2022_Movement_UK.pdf',
      'some_other_brief.pdf',
      'AJP_4_3_A1_2021_Host_Nation_Support_EDA_V1.pdf',
    ])
    expect(groups.map((g) => g.group)).toEqual([
      'NATO logistics doctrine (AJP)',
      'Other documents',
    ])
    const ajp = groups[0]
    expect(ajp.docs).toHaveLength(2)
    expect(ajp.docs[0].url).toBe('/docs/AJP_4_3_A1_2021_Host_Nation_Support_EDA_V1.pdf')
  })

  it('handles an empty manifest', () => {
    expect(groupDocs([])).toEqual([])
  })
})
