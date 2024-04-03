import type { ProblemData } from './ProblemData'
import { Request, Response } from 'express'
import { doc, setDoc } from 'firebase/firestore'
import { db } from './util'

export async function updateProblemData(req: Request, res: Response) {
  try {
    const problemData: ProblemData[] = req.body
    await Promise.all(
      problemData.map((data) =>
        setDoc(doc(db, 'ProblemData', data.problemID), data, {
          merge: true,
        }),
      ),
    )
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update problem data' })
  }

  return res.status(200).json({ status: 'Successfully updated problem data' })
}
